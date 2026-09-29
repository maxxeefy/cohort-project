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
  toggleBookmark,
  isLessonBookmarked,
  getBookmarkedLessonIds,
} from "./bookmarkService";

function createCourse(slug: string) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "Another course",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function createLesson(courseId: number, title: string) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: `${title} module`, position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position: 1 })
    .returning()
    .get();
}

describe("bookmarkService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("toggleBookmark", () => {
    it("bookmarks an unbookmarked lesson", () => {
      const lesson = createLesson(base.course.id, "L1");

      const result = toggleBookmark({
        userId: base.user.id,
        lessonId: lesson.id,
      });

      expect(result).toEqual({ bookmarked: true });
      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(true);
    });

    it("removes an existing bookmark", () => {
      const lesson = createLesson(base.course.id, "L1");
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      const result = toggleBookmark({
        userId: base.user.id,
        lessonId: lesson.id,
      });

      expect(result).toEqual({ bookmarked: false });
      expect(
        isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })
      ).toBe(false);
    });

    it("keeps bookmarks private to each user", () => {
      const lesson = createLesson(base.course.id, "L1");
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(
        isLessonBookmarked({ userId: base.instructor.id, lessonId: lesson.id })
      ).toBe(false);
    });
  });

  describe("getBookmarkedLessonIds", () => {
    it("returns an empty array when nothing is bookmarked", () => {
      createLesson(base.course.id, "L1");

      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        })
      ).toEqual([]);
    });

    it("returns only bookmarks from the given course", () => {
      const l1 = createLesson(base.course.id, "L1");
      const l2 = createLesson(base.course.id, "L2");
      const other = createCourse("other-course");
      const otherLesson = createLesson(other.id, "Other");

      toggleBookmark({ userId: base.user.id, lessonId: l1.id });
      toggleBookmark({ userId: base.user.id, lessonId: l2.id });
      toggleBookmark({ userId: base.user.id, lessonId: otherLesson.id });

      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        }).sort()
      ).toEqual([l1.id, l2.id].sort());
    });

    it("removes bookmarks when the lesson is deleted", () => {
      const lesson = createLesson(base.course.id, "L1");
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      testDb
        .delete(schema.lessons)
        .where(eq(schema.lessons.id, lesson.id))
        .run();

      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        })
      ).toEqual([]);
    });
  });
});
