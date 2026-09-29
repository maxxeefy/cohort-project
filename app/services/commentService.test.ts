import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  canAccessComments,
  canDeleteComment,
  createComment,
  getCommentById,
  getCommentsForLesson,
  softDeleteComment,
  MAX_COMMENT_LENGTH,
} from "./commentService";

function createUser(email: string, role: schema.UserRole) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role })
    .returning()
    .get();
}

function createLesson() {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get();
}

describe("commentService", () => {
  let lesson: ReturnType<typeof createLesson>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = createLesson();
  });

  describe("createComment", () => {
    it("saves a trimmed comment", () => {
      const comment = createComment(lesson.id, base.user.id, "  Hello!  ");

      expect(comment.content).toBe("Hello!");
      expect(comment.lessonId).toBe(lesson.id);
      expect(comment.userId).toBe(base.user.id);
      expect(comment.deletedAt).toBeNull();
    });

    it("rejects empty comments", () => {
      expect(() => createComment(lesson.id, base.user.id, "   ")).toThrow();
    });

    it("rejects comments over the length limit", () => {
      const tooLong = "a".repeat(MAX_COMMENT_LENGTH + 1);
      expect(() => createComment(lesson.id, base.user.id, tooLong)).toThrow();
    });
  });

  describe("getCommentsForLesson", () => {
    it("returns comments oldest first with author details", () => {
      createComment(lesson.id, base.user.id, "First");
      createComment(lesson.id, base.instructor.id, "Second");

      const comments = getCommentsForLesson(lesson.id);

      expect(comments.map((c) => c.content)).toEqual(["First", "Second"]);
      expect(comments[0].userName).toBe("Test User");
      expect(comments[1].userRole).toBe(schema.UserRole.Instructor);
    });

    it("only returns comments for the given lesson", () => {
      const other = testDb
        .insert(schema.lessons)
        .values({ moduleId: lesson.moduleId, title: "Lesson 2", position: 2 })
        .returning()
        .get();
      createComment(other.id, base.user.id, "Elsewhere");

      expect(getCommentsForLesson(lesson.id)).toEqual([]);
    });
  });

  describe("softDeleteComment", () => {
    it("hides the comment but keeps the row with deletion metadata", () => {
      const comment = createComment(lesson.id, base.user.id, "Oops");

      softDeleteComment(comment.id, base.instructor.id);

      expect(getCommentsForLesson(lesson.id)).toEqual([]);
      const stored = getCommentById(comment.id);
      expect(stored?.content).toBe("Oops");
      expect(stored?.deletedAt).not.toBeNull();
      expect(stored?.deletedByUserId).toBe(base.instructor.id);
    });
  });

  describe("canDeleteComment", () => {
    it("allows the author, course instructor and admins only", () => {
      const comment = { userId: base.user.id };
      const otherStudent = createUser(
        "s2@example.com",
        schema.UserRole.Student
      );
      const otherInstructor = createUser(
        "i2@example.com",
        schema.UserRole.Instructor
      );
      const admin = createUser("admin@example.com", schema.UserRole.Admin);

      expect(canDeleteComment(base.user, comment, base.course)).toBe(true);
      expect(canDeleteComment(base.instructor, comment, base.course)).toBe(
        true
      );
      expect(canDeleteComment(admin, comment, base.course)).toBe(true);
      expect(canDeleteComment(otherStudent, comment, base.course)).toBe(false);
      expect(canDeleteComment(otherInstructor, comment, base.course)).toBe(
        false
      );
    });
  });

  describe("canAccessComments", () => {
    it("allows enrolled students, the course instructor and admins", () => {
      const admin = createUser("admin@example.com", schema.UserRole.Admin);
      const otherInstructor = createUser(
        "i2@example.com",
        schema.UserRole.Instructor
      );

      expect(canAccessComments(base.user, base.course, true)).toBe(true);
      expect(canAccessComments(base.user, base.course, false)).toBe(false);
      expect(canAccessComments(base.instructor, base.course, false)).toBe(true);
      expect(canAccessComments(admin, base.course, false)).toBe(true);
      expect(canAccessComments(otherInstructor, base.course, false)).toBe(
        false
      );
    });
  });

  it("removes comments when their lesson is deleted", () => {
    const comment = createComment(lesson.id, base.user.id, "Bye");

    testDb.delete(schema.lessons).where(eq(schema.lessons.id, lesson.id)).run();

    expect(getCommentById(comment.id)).toBeUndefined();
  });
});
