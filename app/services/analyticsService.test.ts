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

import {
  getAverageRatingForCourses,
  getCourseSummaries,
  getInstructorsWithCourses,
  getLessonDropOff,
  getPlatformCourseBreakdown,
  getPlatformRevenueTimeSeries,
  getPlatformSummary,
  getQuizStats,
  getRangeStartDate,
  getRatingDistribution,
  getRevenueTimeSeries,
  getRevenueForCourses,
} from "./analyticsService";
import { createTeamPurchase } from "./purchaseService";

function insertPurchase(
  courseId: number,
  pricePaid: number,
  createdAt: string
) {
  return testDb
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId,
      pricePaid,
      country: null,
      createdAt,
    })
    .returning()
    .get();
}

function insertCourse(slug: string, instructorId: number) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "Another course",
      instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

let studentCounter = 0;

function insertStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function insertEnrollment(
  courseId: number,
  enrolledAt: string,
  completedAt: string | null
) {
  const student = insertStudent(`student-${++studentCounter}@example.com`);
  testDb
    .insert(schema.enrollments)
    .values({ userId: student.id, courseId, enrolledAt, completedAt })
    .run();
  return student;
}

function insertRating(courseId: number, rating: number) {
  const student = insertStudent(`rater-${++studentCounter}@example.com`);
  testDb
    .insert(schema.courseRatings)
    .values({ userId: student.id, courseId, rating })
    .run();
}

function insertModule(courseId: number, title: string, position: number) {
  return testDb
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

function insertLesson(moduleId: number, title: string, position: number) {
  return testDb
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

function insertProgress(
  userId: number,
  lessonId: number,
  status: schema.LessonProgressStatus
) {
  testDb
    .insert(schema.lessonProgress)
    .values({ userId, lessonId, status })
    .run();
}

function enrollStudents(courseId: number, count: number) {
  return Array.from({ length: count }, () =>
    insertEnrollment(courseId, "2026-09-01T00:00:00.000Z", null)
  );
}

function completeLesson(
  students: { id: number }[],
  lessonId: number,
  count: number
) {
  for (const student of students.slice(0, count)) {
    insertProgress(student.id, lessonId, schema.LessonProgressStatus.Completed);
  }
}

function insertQuiz(lessonId: number, title: string) {
  return testDb
    .insert(schema.quizzes)
    .values({ lessonId, title, passingScore: 0.7 })
    .returning()
    .get();
}

function insertAttempt(
  userId: number,
  quizId: number,
  score: number,
  passed: boolean
) {
  testDb
    .insert(schema.quizAttempts)
    .values({ userId, quizId, score, passed })
    .run();
}

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── Range Start Date ───

  describe("getRangeStartDate", () => {
    const now = new Date("2026-10-07T12:00:00.000Z");

    it("returns null for all time", () => {
      expect(getRangeStartDate("all", now)).toBeNull();
    });

    it("subtracts the number of days in the range", () => {
      expect(getRangeStartDate("7d", now)?.toISOString()).toBe(
        "2026-09-30T12:00:00.000Z"
      );
      expect(getRangeStartDate("30d", now)?.toISOString()).toBe(
        "2026-09-07T12:00:00.000Z"
      );
      expect(getRangeStartDate("90d", now)?.toISOString()).toBe(
        "2026-07-09T12:00:00.000Z"
      );
    });

    it("subtracts twelve calendar months for 12m", () => {
      expect(getRangeStartDate("12m", now)?.toISOString()).toBe(
        "2025-10-07T12:00:00.000Z"
      );
    });
  });

  // ─── Revenue ───

  describe("getRevenueForCourses", () => {
    it("returns zero for an empty course set", () => {
      const result = getRevenueForCourses([], null);
      expect(result.totalCents).toBe(0);
      expect(result.byCourse.size).toBe(0);
    });

    it("returns zero for courses without purchases", () => {
      const result = getRevenueForCourses([base.course.id], null);
      expect(result.totalCents).toBe(0);
      expect(result.byCourse.get(base.course.id)).toBe(0);
    });

    it("sums the amount actually paid, including PPP discounts", () => {
      insertPurchase(base.course.id, 4999, "2026-10-01T00:00:00.000Z");
      insertPurchase(base.course.id, 1500, "2026-10-02T00:00:00.000Z");

      const result = getRevenueForCourses([base.course.id], null);
      expect(result.totalCents).toBe(6499);
    });

    it("respects the start date", () => {
      insertPurchase(base.course.id, 1000, "2026-09-01T00:00:00.000Z");
      insertPurchase(base.course.id, 2000, "2026-10-05T00:00:00.000Z");

      const since = new Date("2026-10-01T00:00:00.000Z");
      expect(getRevenueForCourses([base.course.id], since).totalCents).toBe(
        2000
      );
      expect(getRevenueForCourses([base.course.id], null).totalCents).toBe(
        3000
      );
    });

    it("includes team purchases at their full paid amount", () => {
      createTeamPurchase(base.user.id, base.course.id, 25000, "US", 5);

      const result = getRevenueForCourses([base.course.id], null);
      expect(result.totalCents).toBe(25000);
    });

    it("excludes courses outside the given set", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const otherCourse = insertCourse("other-course", otherInstructor.id);

      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(otherCourse.id, 9000, "2026-10-01T00:00:00.000Z");

      const result = getRevenueForCourses([base.course.id], null);
      expect(result.totalCents).toBe(1000);
      expect(result.byCourse.has(otherCourse.id)).toBe(false);
    });

    it("returns a correct per-course breakdown", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);

      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(base.course.id, 500, "2026-10-02T00:00:00.000Z");
      insertPurchase(secondCourse.id, 3000, "2026-10-03T00:00:00.000Z");

      const result = getRevenueForCourses(
        [base.course.id, secondCourse.id],
        null
      );
      expect(result.totalCents).toBe(4500);
      expect(result.byCourse.get(base.course.id)).toBe(1500);
      expect(result.byCourse.get(secondCourse.id)).toBe(3000);
    });
  });

  // ─── Course Summaries ───

  describe("getCourseSummaries", () => {
    it("returns an empty map for an empty course set", () => {
      expect(getCourseSummaries([]).size).toBe(0);
    });

    it("returns zeros and nulls for a course with no enrollments", () => {
      const summary = getCourseSummaries([base.course.id]).get(base.course.id);
      expect(summary).toEqual({
        studentCount: 0,
        completedCount: 0,
        completionRate: null,
        averageRating: null,
        ratingCount: 0,
        medianDaysToComplete: null,
      });
    });

    it("computes completion rate and median for mixed enrollments", () => {
      insertEnrollment(
        base.course.id,
        "2026-09-01T00:00:00.000Z",
        "2026-09-03T00:00:00.000Z"
      ); // 2 days
      insertEnrollment(
        base.course.id,
        "2026-09-01T00:00:00.000Z",
        "2026-09-11T12:00:00.000Z"
      ); // 10.5 → 10 days
      insertEnrollment(
        base.course.id,
        "2026-09-01T00:00:00.000Z",
        "2026-09-05T00:00:00.000Z"
      ); // 4 days
      insertEnrollment(base.course.id, "2026-09-01T00:00:00.000Z", null);

      const summary = getCourseSummaries([base.course.id]).get(base.course.id)!;
      expect(summary.studentCount).toBe(4);
      expect(summary.completedCount).toBe(3);
      expect(summary.completionRate).toBe(0.75);
      expect(summary.medianDaysToComplete).toBe(4);
    });

    it("averages the two middle values for an even number of completions", () => {
      insertEnrollment(
        base.course.id,
        "2026-09-01T00:00:00.000Z",
        "2026-09-03T00:00:00.000Z"
      ); // 2 days
      insertEnrollment(
        base.course.id,
        "2026-09-01T00:00:00.000Z",
        "2026-09-06T00:00:00.000Z"
      ); // 5 days

      const summary = getCourseSummaries([base.course.id]).get(base.course.id)!;
      expect(summary.medianDaysToComplete).toBe(3.5);
    });

    it("returns null median when nobody has completed", () => {
      insertEnrollment(base.course.id, "2026-09-01T00:00:00.000Z", null);

      const summary = getCourseSummaries([base.course.id]).get(base.course.id)!;
      expect(summary.completionRate).toBe(0);
      expect(summary.medianDaysToComplete).toBeNull();
    });

    it("keeps metrics separate per course and includes ratings", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertEnrollment(base.course.id, "2026-09-01T00:00:00.000Z", null);
      insertEnrollment(
        secondCourse.id,
        "2026-09-01T00:00:00.000Z",
        "2026-09-02T00:00:00.000Z"
      );
      insertRating(base.course.id, 4);
      insertRating(base.course.id, 5);

      const summaries = getCourseSummaries([base.course.id, secondCourse.id]);
      expect(summaries.get(base.course.id)).toMatchObject({
        studentCount: 1,
        completedCount: 0,
        averageRating: 4.5,
        ratingCount: 2,
      });
      expect(summaries.get(secondCourse.id)).toMatchObject({
        studentCount: 1,
        completedCount: 1,
        averageRating: null,
        ratingCount: 0,
      });
    });
  });

  // ─── Average Rating ───

  describe("getAverageRatingForCourses", () => {
    it("returns null for courses without ratings", () => {
      expect(getAverageRatingForCourses([base.course.id])).toEqual({
        average: null,
        count: 0,
      });
      expect(getAverageRatingForCourses([])).toEqual({
        average: null,
        count: 0,
      });
    });

    it("weights courses by their number of ratings", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertRating(base.course.id, 5);
      insertRating(base.course.id, 5);
      insertRating(base.course.id, 5);
      insertRating(secondCourse.id, 1);

      // Unweighted mean of course averages would be 3; weighted is 16 / 4.
      expect(
        getAverageRatingForCourses([base.course.id, secondCourse.id])
      ).toEqual({ average: 4, count: 4 });
    });

    it("excludes courses outside the given set", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertRating(base.course.id, 2);
      insertRating(secondCourse.id, 5);

      expect(getAverageRatingForCourses([base.course.id])).toEqual({
        average: 2,
        count: 1,
      });
    });
  });

  // ─── Lesson Drop-off ───

  describe("getLessonDropOff", () => {
    it("returns an empty list for a course without lessons", () => {
      expect(getLessonDropOff(base.course.id)).toEqual([]);
    });

    it("orders lessons by module position, then lesson position", () => {
      // Inserted out of order on purpose.
      const second = insertModule(base.course.id, "Module B", 2);
      const first = insertModule(base.course.id, "Module A", 1);
      insertLesson(second.id, "B2", 2);
      insertLesson(first.id, "A2", 2);
      insertLesson(second.id, "B1", 1);
      insertLesson(first.id, "A1", 1);

      const result = getLessonDropOff(base.course.id);
      expect(result.map((l) => l.lessonTitle)).toEqual([
        "A1",
        "A2",
        "B1",
        "B2",
      ]);
      expect(result.map((l) => l.moduleTitle)).toEqual([
        "Module A",
        "Module A",
        "Module B",
        "Module B",
      ]);
    });

    it("returns null rates and no highlights when nobody is enrolled", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      insertLesson(mod.id, "L1", 1);

      const [lesson] = getLessonDropOff(base.course.id);
      expect(lesson).toMatchObject({
        completedCount: 0,
        enrolledCount: 0,
        completionRate: null,
        drop: null,
        isTopDrop: false,
      });
    });

    it("counts only Completed progress from enrolled students", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      const lesson = insertLesson(mod.id, "L1", 1);
      const students = enrollStudents(base.course.id, 4);

      insertProgress(
        students[0].id,
        lesson.id,
        schema.LessonProgressStatus.Completed
      );
      insertProgress(
        students[1].id,
        lesson.id,
        schema.LessonProgressStatus.InProgress
      );
      insertProgress(
        students[2].id,
        lesson.id,
        schema.LessonProgressStatus.NotStarted
      );
      // Not enrolled in the course, so it doesn't count.
      insertProgress(
        base.user.id,
        lesson.id,
        schema.LessonProgressStatus.Completed
      );

      const [result] = getLessonDropOff(base.course.id);
      expect(result.completedCount).toBe(1);
      expect(result.enrolledCount).toBe(4);
      expect(result.completionRate).toBe(0.25);
    });

    it("compares the first lesson against 100% and later lessons against the previous one", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      const l1 = insertLesson(mod.id, "L1", 1);
      const l2 = insertLesson(mod.id, "L2", 2);
      const students = enrollStudents(base.course.id, 4);
      completeLesson(students, l1.id, 3);
      completeLesson(students, l2.id, 1);

      const result = getLessonDropOff(base.course.id);
      expect(result[0].drop).toBeCloseTo(0.25);
      expect(result[1].drop).toBeCloseTo(0.5);
    });

    it("flags the three biggest positive drops", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      const students = enrollStudents(base.course.id, 10);
      // Completed counts per lesson → drops (in tenths): 1, 3, 0, 2, 4, -1
      const counts = [9, 6, 6, 4, 0, 1];
      counts.forEach((count, i) => {
        const lesson = insertLesson(mod.id, `L${i + 1}`, i + 1);
        completeLesson(students, lesson.id, count);
      });

      const result = getLessonDropOff(base.course.id);
      expect(
        result.filter((l) => l.isTopDrop).map((l) => l.lessonTitle)
      ).toEqual(["L2", "L4", "L5"]);
      expect(result[5].drop).toBeCloseTo(-0.1);
    });

    it("flags fewer than three lessons when there are fewer positive drops", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      const students = enrollStudents(base.course.id, 2);
      const l1 = insertLesson(mod.id, "L1", 1);
      const l2 = insertLesson(mod.id, "L2", 2);
      completeLesson(students, l1.id, 2);
      completeLesson(students, l2.id, 1);

      const result = getLessonDropOff(base.course.id);
      expect(result.map((l) => l.isTopDrop)).toEqual([false, true]);
    });
  });

  // ─── Quiz Stats ───

  describe("getQuizStats", () => {
    it("returns an empty list for a course without quizzes", () => {
      expect(getQuizStats(base.course.id)).toEqual([]);
    });

    it("lists every quiz with its lesson in course order", () => {
      const second = insertModule(base.course.id, "Module B", 2);
      const first = insertModule(base.course.id, "Module A", 1);
      insertQuiz(insertLesson(second.id, "B1", 1).id, "Quiz B");
      insertQuiz(insertLesson(first.id, "A1", 1).id, "Quiz A");

      const result = getQuizStats(base.course.id);
      expect(result.map((q) => [q.quizTitle, q.lessonTitle])).toEqual([
        ["Quiz A", "A1"],
        ["Quiz B", "B1"],
      ]);
    });

    it("returns nulls for a quiz with no attempts", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      insertQuiz(insertLesson(mod.id, "L1", 1).id, "Quiz");

      const [quiz] = getQuizStats(base.course.id);
      expect(quiz).toMatchObject({
        attemptedCount: 0,
        passedCount: 0,
        passRate: null,
        averageBestScore: null,
        averageAttempts: null,
      });
    });

    it("aggregates multiple attempts per student", () => {
      const mod = insertModule(base.course.id, "Module", 1);
      const quiz = insertQuiz(insertLesson(mod.id, "L1", 1).id, "Quiz");
      const [alice, bob] = enrollStudents(base.course.id, 2);

      // Alice fails, then passes: best 0.9, 2 attempts, passed once.
      insertAttempt(alice.id, quiz.id, 0.4, false);
      insertAttempt(alice.id, quiz.id, 0.9, true);
      // Bob fails three times: best 0.5, 3 attempts, never passed.
      insertAttempt(bob.id, quiz.id, 0.3, false);
      insertAttempt(bob.id, quiz.id, 0.5, false);
      insertAttempt(bob.id, quiz.id, 0.2, false);

      const [stats] = getQuizStats(base.course.id);
      expect(stats.attemptedCount).toBe(2);
      expect(stats.passedCount).toBe(1);
      expect(stats.passRate).toBe(0.5);
      expect(stats.averageBestScore).toBeCloseTo(0.7);
      expect(stats.averageAttempts).toBe(2.5);
    });

    it("excludes quizzes from other courses", () => {
      const otherCourse = insertCourse("other-course", base.instructor.id);
      const mod = insertModule(otherCourse.id, "Module", 1);
      insertQuiz(insertLesson(mod.id, "L1", 1).id, "Other quiz");

      expect(getQuizStats(base.course.id)).toEqual([]);
    });
  });

  // ─── Rating Distribution ───

  describe("getRatingDistribution", () => {
    it("returns all five stars with zeros when there are no ratings", () => {
      expect(getRatingDistribution(base.course.id)).toEqual([
        { stars: 5, count: 0 },
        { stars: 4, count: 0 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 0 },
      ]);
    });

    it("counts ratings per star and fills missing stars with zero", () => {
      const otherCourse = insertCourse("other-course", base.instructor.id);
      insertRating(base.course.id, 5);
      insertRating(base.course.id, 5);
      insertRating(base.course.id, 1);
      insertRating(otherCourse.id, 3);

      expect(getRatingDistribution(base.course.id)).toEqual([
        { stars: 5, count: 2 },
        { stars: 4, count: 0 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 1 },
      ]);
    });
  });

  // ─── Revenue Over Time ───

  describe("getRevenueTimeSeries", () => {
    const until = new Date("2026-10-07T12:00:00.000Z");

    it("returns no points for an empty course set", () => {
      expect(getRevenueTimeSeries([], { since: null, until }).points).toEqual(
        []
      );
    });

    it("returns no points for all time when there are no purchases", () => {
      expect(
        getRevenueTimeSeries([base.course.id], { since: null, until }).points
      ).toEqual([]);
    });

    it("buckets by day and fills empty days with zero", () => {
      insertPurchase(base.course.id, 1000, "2026-10-02T08:00:00.000Z");
      insertPurchase(base.course.id, 500, "2026-10-02T20:00:00.000Z");
      insertPurchase(base.course.id, 2000, "2026-10-05T10:00:00.000Z");
      // Before the period: excluded.
      insertPurchase(base.course.id, 9999, "2026-09-29T10:00:00.000Z");

      const result = getRevenueTimeSeries([base.course.id], {
        since: getRangeStartDate("7d", until),
        until,
      });
      expect(result.granularity).toBe("day");
      expect(result.points).toEqual([
        { date: "2026-09-30", revenueCents: 0 },
        { date: "2026-10-01", revenueCents: 0 },
        { date: "2026-10-02", revenueCents: 1500 },
        { date: "2026-10-03", revenueCents: 0 },
        { date: "2026-10-04", revenueCents: 0 },
        { date: "2026-10-05", revenueCents: 2000 },
        { date: "2026-10-06", revenueCents: 0 },
        { date: "2026-10-07", revenueCents: 0 },
      ]);
    });

    it("sums to the same total as the revenue KPI for the period", () => {
      insertPurchase(base.course.id, 1000, "2026-09-10T00:00:00.000Z");
      insertPurchase(base.course.id, 2500, "2026-10-01T00:00:00.000Z");
      insertPurchase(base.course.id, 700, "2026-08-01T00:00:00.000Z");

      for (const range of ["7d", "30d", "90d", "all"] as const) {
        const since = getRangeStartDate(range, until);
        const series = getRevenueTimeSeries([base.course.id], { since, until });
        const total = series.points.reduce((sum, p) => sum + p.revenueCents, 0);
        expect(total).toBe(
          getRevenueForCourses([base.course.id], since).totalCents
        );
      }
    });

    it("starts all-time series at the first purchase", () => {
      insertPurchase(base.course.id, 1000, "2026-10-05T10:00:00.000Z");

      const result = getRevenueTimeSeries([base.course.id], {
        since: null,
        until,
      });
      expect(result.points.map((p) => p.date)).toEqual([
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
      ]);
    });

    it("switches to weekly buckets (starting Monday) for long spans", () => {
      insertPurchase(base.course.id, 1000, "2026-03-04T10:00:00.000Z"); // Wed
      insertPurchase(base.course.id, 500, "2026-03-08T10:00:00.000Z"); // Sun, same week

      const result = getRevenueTimeSeries([base.course.id], {
        since: null,
        until,
      });
      expect(result.granularity).toBe("week");
      expect(result.points[0]).toEqual({
        date: "2026-03-02",
        revenueCents: 1500,
      });
    });

    it("switches to monthly buckets for spans over two years", () => {
      insertPurchase(base.course.id, 1000, "2024-01-15T10:00:00.000Z");

      const result = getRevenueTimeSeries([base.course.id], {
        since: null,
        until,
      });
      expect(result.granularity).toBe("month");
      expect(result.points[0]).toEqual({
        date: "2024-01-01",
        revenueCents: 1000,
      });
      expect(result.points.at(-1)?.date).toBe("2026-10-01");
    });

    it("excludes courses outside the given set", () => {
      const otherCourse = insertCourse("other-course", base.instructor.id);
      insertPurchase(otherCourse.id, 5000, "2026-10-05T10:00:00.000Z");
      insertPurchase(base.course.id, 1000, "2026-10-05T10:00:00.000Z");

      const result = getRevenueTimeSeries([base.course.id], {
        since: getRangeStartDate("7d", until),
        until,
      });
      expect(
        result.points.find((p) => p.date === "2026-10-05")?.revenueCents
      ).toBe(1000);
    });
  });

  // ─── Platform Summary ───

  describe("getPlatformSummary", () => {
    it("returns zeros and null when there is no data", () => {
      const result = getPlatformSummary(null);
      expect(result).toEqual({
        totalRevenueCents: 0,
        totalEnrollments: 0,
        topCourse: null,
      });
    });

    it("aggregates revenue across all courses", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(secondCourse.id, 3000, "2026-10-02T00:00:00.000Z");

      const result = getPlatformSummary(null);
      expect(result.totalRevenueCents).toBe(4000);
    });

    it("identifies the top earning course", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(secondCourse.id, 3000, "2026-10-02T00:00:00.000Z");

      const result = getPlatformSummary(null);
      expect(result.topCourse).toEqual({
        title: "second-course",
        revenueCents: 3000,
      });
    });

    it("counts enrollments across all courses", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertEnrollment(base.course.id, "2026-10-01T00:00:00.000Z", null);
      insertEnrollment(base.course.id, "2026-10-02T00:00:00.000Z", null);
      insertEnrollment(secondCourse.id, "2026-10-03T00:00:00.000Z", null);

      const result = getPlatformSummary(null);
      expect(result.totalEnrollments).toBe(3);
    });

    it("respects the since date for revenue and enrollments", () => {
      insertPurchase(base.course.id, 1000, "2026-09-01T00:00:00.000Z");
      insertPurchase(base.course.id, 2000, "2026-10-05T00:00:00.000Z");
      insertEnrollment(base.course.id, "2026-09-01T00:00:00.000Z", null);
      insertEnrollment(base.course.id, "2026-10-05T00:00:00.000Z", null);

      const since = new Date("2026-10-01T00:00:00.000Z");
      const result = getPlatformSummary(since);
      expect(result.totalRevenueCents).toBe(2000);
      expect(result.totalEnrollments).toBe(1);
    });

    it("aggregates across instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other-inst@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const otherCourse = insertCourse("other-course", otherInstructor.id);
      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(otherCourse.id, 5000, "2026-10-02T00:00:00.000Z");

      const result = getPlatformSummary(null);
      expect(result.totalRevenueCents).toBe(6000);
      expect(result.topCourse?.title).toBe("other-course");
    });
  });

  // ─── Platform Revenue Time Series ───

  describe("getPlatformRevenueTimeSeries", () => {
    const now = new Date("2026-10-07T12:00:00.000Z");

    function total(points: { revenueCents: number }[]) {
      return points.reduce((sum, p) => sum + p.revenueCents, 0);
    }

    it("returns no points for all time when there are no purchases", () => {
      const result = getPlatformRevenueTimeSeries("all", now);
      expect(result).toEqual({ granularity: "month", points: [] });
    });

    it("returns zero-filled daily points for a range without purchases", () => {
      const result = getPlatformRevenueTimeSeries("7d", now);
      expect(result.granularity).toBe("day");
      expect(result.points).toHaveLength(8);
      expect(result.points.every((p) => p.revenueCents === 0)).toBe(true);
    });

    it("combines revenue from all courses and instructors into one series", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other-instructor@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const secondCourse = insertCourse("second-course", otherInstructor.id);
      insertPurchase(base.course.id, 1000, "2026-10-02T08:00:00.000Z");
      insertPurchase(secondCourse.id, 2000, "2026-10-02T12:00:00.000Z");
      insertPurchase(base.course.id, 500, "2026-10-05T10:00:00.000Z");

      const result = getPlatformRevenueTimeSeries("7d", now);

      expect(result.points).toEqual([
        { date: "2026-09-30", revenueCents: 0 },
        { date: "2026-10-01", revenueCents: 0 },
        { date: "2026-10-02", revenueCents: 3000 },
        { date: "2026-10-03", revenueCents: 0 },
        { date: "2026-10-04", revenueCents: 0 },
        { date: "2026-10-05", revenueCents: 500 },
        { date: "2026-10-06", revenueCents: 0 },
        { date: "2026-10-07", revenueCents: 0 },
      ]);
    });

    it("uses daily buckets for 30d", () => {
      insertPurchase(base.course.id, 1000, "2026-09-10T10:00:00.000Z");

      const result = getPlatformRevenueTimeSeries("30d", now);

      expect(result.granularity).toBe("day");
      expect(result.points).toHaveLength(31);
      expect(result.points[0].date).toBe("2026-09-07");
      expect(result.points.at(-1)?.date).toBe("2026-10-07");
      expect(
        result.points.find((p) => p.date === "2026-09-10")?.revenueCents
      ).toBe(1000);
    });

    it("uses monthly buckets for 12m and fills empty months with zero", () => {
      insertPurchase(base.course.id, 1000, "2026-01-15T10:00:00.000Z");
      insertPurchase(base.course.id, 2500, "2026-01-20T10:00:00.000Z");
      insertPurchase(base.course.id, 700, "2026-10-01T10:00:00.000Z");

      const result = getPlatformRevenueTimeSeries("12m", now);

      expect(result.granularity).toBe("month");
      expect(result.points).toHaveLength(13);
      expect(result.points[0]).toEqual({ date: "2025-10-01", revenueCents: 0 });
      expect(result.points.find((p) => p.date === "2026-01-01")).toEqual({
        date: "2026-01-01",
        revenueCents: 3500,
      });
      expect(result.points.at(-1)).toEqual({
        date: "2026-10-01",
        revenueCents: 700,
      });
    });

    it("uses monthly buckets for all time, starting at the first purchase", () => {
      insertPurchase(base.course.id, 1000, "2026-08-20T10:00:00.000Z");
      insertPurchase(base.course.id, 400, "2026-10-03T10:00:00.000Z");

      const result = getPlatformRevenueTimeSeries("all", now);

      expect(result).toEqual({
        granularity: "month",
        points: [
          { date: "2026-08-01", revenueCents: 1000 },
          { date: "2026-09-01", revenueCents: 0 },
          { date: "2026-10-01", revenueCents: 400 },
        ],
      });
    });

    it("excludes purchases before the range", () => {
      insertPurchase(base.course.id, 9999, "2026-09-29T10:00:00.000Z");
      insertPurchase(base.course.id, 1000, "2026-10-05T10:00:00.000Z");

      expect(total(getPlatformRevenueTimeSeries("7d", now).points)).toBe(1000);
    });

    it("sums to the same total as the summary revenue for every range", () => {
      insertPurchase(base.course.id, 1000, "2024-03-01T10:00:00.000Z");
      insertPurchase(base.course.id, 2000, "2026-02-01T10:00:00.000Z");
      insertPurchase(base.course.id, 3000, "2026-09-20T10:00:00.000Z");
      insertPurchase(base.course.id, 4000, "2026-10-06T10:00:00.000Z");

      for (const range of ["7d", "30d", "12m", "all"] as const) {
        const summary = getPlatformSummary(getRangeStartDate(range, now));
        expect(total(getPlatformRevenueTimeSeries(range, now).points)).toBe(
          summary.totalRevenueCents
        );
      }
    });
  });

  // ─── Instructors With Courses ───

  describe("getInstructorsWithCourses", () => {
    it("returns instructors who have published or archived courses", () => {
      const result = getInstructorsWithCourses();
      expect(result).toEqual([
        { id: base.instructor.id, name: "Test Instructor" },
      ]);
    });

    it("excludes instructors with only draft courses", () => {
      const draftInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Draft Instructor",
          email: "draft@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      testDb
        .insert(schema.courses)
        .values({
          title: "Draft Course",
          slug: "draft-course",
          description: "A draft",
          instructorId: draftInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Draft,
        })
        .run();

      const result = getInstructorsWithCourses();
      expect(result.map((r) => r.id)).not.toContain(draftInstructor.id);
    });

    it("does not duplicate instructors with multiple courses", () => {
      insertCourse("another-course", base.instructor.id);
      const result = getInstructorsWithCourses();
      expect(result.filter((r) => r.id === base.instructor.id)).toHaveLength(1);
    });

    it("sorts by name", () => {
      const alphaInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Alpha Instructor",
          email: "alpha@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      insertCourse("alpha-course", alphaInstructor.id);

      const result = getInstructorsWithCourses();
      expect(result[0].name).toBe("Alpha Instructor");
      expect(result[1].name).toBe("Test Instructor");
    });
  });

  // ─── Platform Course Breakdown ───

  describe("getPlatformCourseBreakdown", () => {
    function insertInstructor(name: string) {
      return testDb
        .insert(schema.users)
        .values({
          name,
          email: `${name.toLowerCase().replace(/ /g, "-")}@example.com`,
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
    }

    it("returns a zeroed row for a course without activity", () => {
      expect(getPlatformCourseBreakdown(null, null)).toEqual([
        {
          courseId: base.course.id,
          title: "Test Course",
          instructorId: base.instructor.id,
          instructorName: "Test Instructor",
          listPriceCents: base.course.price,
          revenueCents: 0,
          salesCount: 0,
          enrollmentCount: 0,
          averageRating: null,
          ratingCount: 0,
        },
      ]);
    });

    it("aggregates revenue, sales, enrollments and ratings per course", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(base.course.id, 1500, "2026-10-02T00:00:00.000Z");
      insertPurchase(secondCourse.id, 4000, "2026-10-03T00:00:00.000Z");
      insertEnrollment(base.course.id, "2026-10-01T00:00:00.000Z", null);
      insertEnrollment(base.course.id, "2026-10-02T00:00:00.000Z", null);
      insertEnrollment(secondCourse.id, "2026-10-03T00:00:00.000Z", null);
      insertRating(base.course.id, 4);
      insertRating(base.course.id, 5);

      const result = getPlatformCourseBreakdown(null, null);
      const first = result.find((r) => r.courseId === base.course.id)!;
      const second = result.find((r) => r.courseId === secondCourse.id)!;

      expect(first).toMatchObject({
        revenueCents: 2500,
        salesCount: 2,
        enrollmentCount: 2,
        averageRating: 4.5,
        ratingCount: 2,
      });
      expect(second).toMatchObject({
        revenueCents: 4000,
        salesCount: 1,
        enrollmentCount: 1,
        averageRating: null,
        ratingCount: 0,
      });
    });

    it("sorts by revenue, highest first", () => {
      const secondCourse = insertCourse("second-course", base.instructor.id);
      insertPurchase(secondCourse.id, 4000, "2026-10-03T00:00:00.000Z");

      expect(
        getPlatformCourseBreakdown(null, null).map((r) => r.courseId)
      ).toEqual([secondCourse.id, base.course.id]);
    });

    it("includes the instructor name for courses from every instructor", () => {
      const other = insertInstructor("Other Instructor");
      const otherCourse = insertCourse("other-course", other.id);

      const result = getPlatformCourseBreakdown(null, null);
      expect(result.find((r) => r.courseId === otherCourse.id)).toMatchObject({
        instructorId: other.id,
        instructorName: "Other Instructor",
      });
      expect(result).toHaveLength(2);
    });

    it("filters to a single instructor's courses", () => {
      const other = insertInstructor("Other Instructor");
      const otherCourse = insertCourse("other-course", other.id);
      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(otherCourse.id, 2000, "2026-10-01T00:00:00.000Z");

      const result = getPlatformCourseBreakdown(null, other.id);
      expect(result.map((r) => r.courseId)).toEqual([otherCourse.id]);
      expect(result[0].revenueCents).toBe(2000);
    });

    it("returns no rows for an instructor without courses", () => {
      const other = insertInstructor("Other Instructor");
      expect(getPlatformCourseBreakdown(null, other.id)).toEqual([]);
    });

    it("excludes draft courses", () => {
      testDb
        .insert(schema.courses)
        .values({
          title: "Draft Course",
          slug: "draft-course",
          description: "A draft",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Draft,
        })
        .run();

      expect(
        getPlatformCourseBreakdown(null, null).map((r) => r.title)
      ).toEqual(["Test Course"]);
    });

    it("counts revenue, sales and enrollments from the since date only", () => {
      insertPurchase(base.course.id, 9999, "2026-09-01T00:00:00.000Z");
      insertPurchase(base.course.id, 1000, "2026-10-05T00:00:00.000Z");
      insertEnrollment(base.course.id, "2026-09-01T00:00:00.000Z", null);
      insertEnrollment(base.course.id, "2026-10-05T00:00:00.000Z", null);
      insertRating(base.course.id, 3);

      const [row] = getPlatformCourseBreakdown(
        new Date("2026-10-01T00:00:00.000Z"),
        null
      );
      expect(row).toMatchObject({
        revenueCents: 1000,
        salesCount: 1,
        enrollmentCount: 1,
        averageRating: 3,
        ratingCount: 1,
      });
    });

    it("sums to the summary revenue when unfiltered", () => {
      const other = insertInstructor("Other Instructor");
      const otherCourse = insertCourse("other-course", other.id);
      insertPurchase(base.course.id, 1000, "2026-10-01T00:00:00.000Z");
      insertPurchase(otherCourse.id, 2500, "2026-10-02T00:00:00.000Z");

      const total = getPlatformCourseBreakdown(null, null).reduce(
        (sum, r) => sum + r.revenueCents,
        0
      );
      expect(total).toBe(getPlatformSummary(null).totalRevenueCents);
    });
  });
});
