import { describe, it, expect, beforeEach, vi } from "vitest";
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
  rateCourse,
  getUserRatingForCourse,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number) {
  testDb.insert(schema.enrollments).values({ userId, courseId }).run();
}

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

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("rateCourse", () => {
    it("saves a rating from an enrolled student", () => {
      enroll(base.user.id, base.course.id);

      const rating = rateCourse(base.user.id, base.course.id, 4);

      expect(rating.rating).toBe(4);
      expect(getUserRatingForCourse(base.user.id, base.course.id)?.rating).toBe(4);
    });

    it("rejects a student who is not enrolled", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 5)).toThrow(
        "You must be enrolled in this course to rate it"
      );
    });

    it("does not allow changing an existing rating", () => {
      enroll(base.user.id, base.course.id);
      rateCourse(base.user.id, base.course.id, 2);

      expect(() => rateCourse(base.user.id, base.course.id, 5)).toThrow(
        "You have already rated this course"
      );
      expect(getUserRatingForCourse(base.user.id, base.course.id)?.rating).toBe(2);
    });

    it.each([0, 6, 3.5, -1])("rejects invalid rating %s", (value) => {
      enroll(base.user.id, base.course.id);

      expect(() => rateCourse(base.user.id, base.course.id, value)).toThrow(
        "Rating must be a whole number between 1 and 5"
      );
    });
  });

  describe("getUserRatingForCourse", () => {
    it("returns undefined when the user has not rated", () => {
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBeUndefined();
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns null average and zero count with no ratings", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages all ratings for the course", () => {
      const other = createStudent("other@example.com");
      enroll(base.user.id, base.course.id);
      enroll(other.id, base.course.id);
      rateCourse(base.user.id, base.course.id, 5);
      rateCourse(other.id, base.course.id, 2);

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 3.5,
        count: 2,
      });
    });
  });

  describe("getRatingSummariesForCourses", () => {
    it("returns a summary per course, including unrated ones", () => {
      const rated = createCourse("rated-course");
      const unrated = createCourse("unrated-course");
      enroll(base.user.id, base.course.id);
      enroll(base.user.id, rated.id);
      rateCourse(base.user.id, base.course.id, 4);
      rateCourse(base.user.id, rated.id, 1);

      const summaries = getRatingSummariesForCourses([
        base.course.id,
        rated.id,
        unrated.id,
      ]);

      expect(summaries.get(base.course.id)).toEqual({ average: 4, count: 1 });
      expect(summaries.get(rated.id)).toEqual({ average: 1, count: 1 });
      expect(summaries.get(unrated.id)).toEqual({ average: null, count: 0 });
    });

    it("returns an empty map for an empty list", () => {
      expect(getRatingSummariesForCourses([]).size).toBe(0);
    });
  });
});
