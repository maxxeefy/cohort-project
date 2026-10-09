import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  courseRatings,
  courses,
  CourseStatus,
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  quizAttempts,
  quizzes,
  users,
} from "~/db/schema";
import {
  getRatingSummariesForCourses,
  MAX_RATING,
  MIN_RATING,
} from "~/services/ratingService";

// ─── Analytics Service ───
// Aggregations for the instructor analytics dashboard.
// Uses positional parameters (project convention).

export type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all";

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "12m" | "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getRangeStartDate(range: AnalyticsRange, now: Date) {
  if (range === "all") return null;
  if (range === "12m") {
    const start = new Date(now);
    start.setUTCMonth(start.getUTCMonth() - 12);
    return start;
  }
  return new Date(now.getTime() - RANGE_DAYS[range] * MS_PER_DAY);
}

// ─── Revenue ───

export function getRevenueForCourses(courseIds: number[], since: Date | null) {
  if (courseIds.length === 0) {
    return { totalCents: 0, byCourse: new Map<number, number>() };
  }

  const conditions = [inArray(purchases.courseId, courseIds)];
  if (since) {
    conditions.push(gte(purchases.createdAt, since.toISOString()));
  }

  const rows = db
    .select({
      courseId: purchases.courseId,
      revenueCents: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(and(...conditions))
    .groupBy(purchases.courseId)
    .all();

  const byCourse = new Map<number, number>(courseIds.map((id) => [id, 0]));
  let totalCents = 0;
  for (const row of rows) {
    byCourse.set(row.courseId, row.revenueCents);
    totalCents += row.revenueCents;
  }

  return { totalCents, byCourse };
}

// ─── Revenue Over Time ───

export type RevenueGranularity = "day" | "week" | "month";

export type RevenuePoint = {
  /** Bucket start as a UTC date, YYYY-MM-DD (weeks start on Monday). */
  date: string;
  revenueCents: number;
};

function bucketStart(date: Date, granularity: RevenueGranularity) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  if (granularity === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  } else if (granularity === "month") {
    d.setUTCDate(1);
  }
  return d;
}

function nextBucket(date: Date, granularity: RevenueGranularity) {
  const d = new Date(date);
  if (granularity === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (granularity === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function pickGranularity(spanDays: number): RevenueGranularity {
  if (spanDays <= 90) return "day";
  if (spanDays <= 730) return "week";
  return "month";
}

/** Sums purchases into buckets from `start` to `until`, filling empty buckets with zero. */
function bucketRevenue(
  rows: { createdAt: string; pricePaid: number }[],
  period: { start: Date; until: Date },
  granularity: RevenueGranularity
): RevenuePoint[] {
  const totals = new Map<string, number>();
  for (
    let bucket = bucketStart(period.start, granularity);
    bucket <= period.until;
    bucket = nextBucket(bucket, granularity)
  ) {
    totals.set(bucket.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = bucketStart(new Date(row.createdAt), granularity)
      .toISOString()
      .slice(0, 10);
    if (totals.has(key)) totals.set(key, totals.get(key)! + row.pricePaid);
  }

  return [...totals].map(([date, revenueCents]) => ({ date, revenueCents }));
}

/**
 * Revenue per day/week/month (picked from the span) between `since` and
 * `until`, with empty buckets filled in as zero. With `since: null` the
 * series starts at the first purchase. Buckets are UTC.
 */
export function getRevenueTimeSeries(
  courseIds: number[],
  period: { since: Date | null; until: Date }
): { granularity: RevenueGranularity; points: RevenuePoint[] } {
  if (courseIds.length === 0) return { granularity: "day", points: [] };

  const conditions = [inArray(purchases.courseId, courseIds)];
  if (period.since) {
    conditions.push(gte(purchases.createdAt, period.since.toISOString()));
  }

  const rows = db
    .select({ createdAt: purchases.createdAt, pricePaid: purchases.pricePaid })
    .from(purchases)
    .where(and(...conditions))
    .orderBy(asc(purchases.createdAt))
    .all();

  const start =
    period.since ?? (rows.length > 0 ? new Date(rows[0].createdAt) : null);
  if (!start) return { granularity: "day", points: [] };

  const granularity = pickGranularity(
    (period.until.getTime() - start.getTime()) / MS_PER_DAY
  );

  return {
    granularity,
    points: bucketRevenue(rows, { start, until: period.until }, granularity),
  };
}

// ─── Course Summary ───

export type CourseSummary = {
  studentCount: number;
  completedCount: number;
  completionRate: number | null;
  averageRating: number | null;
  ratingCount: number;
  medianDaysToComplete: number | null;
};

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getCourseSummaries(
  courseIds: number[]
): Map<number, CourseSummary> {
  const summaries = new Map<number, CourseSummary>();
  if (courseIds.length === 0) return summaries;

  const enrollmentRows = db
    .select({
      courseId: enrollments.courseId,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .where(inArray(enrollments.courseId, courseIds))
    .all();

  const ratings = getRatingSummariesForCourses(courseIds);

  for (const courseId of courseIds) {
    const courseEnrollments = enrollmentRows.filter(
      (row) => row.courseId === courseId
    );
    const daysToComplete = courseEnrollments.flatMap((row) =>
      row.completedAt
        ? [
            Math.floor(
              (Date.parse(row.completedAt) - Date.parse(row.enrolledAt)) /
                MS_PER_DAY
            ),
          ]
        : []
    );
    const studentCount = courseEnrollments.length;
    const completedCount = daysToComplete.length;
    const rating = ratings.get(courseId) ?? { average: null, count: 0 };

    summaries.set(courseId, {
      studentCount,
      completedCount,
      completionRate: studentCount > 0 ? completedCount / studentCount : null,
      averageRating: rating.average,
      ratingCount: rating.count,
      medianDaysToComplete: median(daysToComplete),
    });
  }

  return summaries;
}

// ─── Average Rating ───

/** Average over every individual rating, so courses are weighted by rating count. */
export function getAverageRatingForCourses(courseIds: number[]) {
  if (courseIds.length === 0) return { average: null, count: 0 };

  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .get();

  return { average: result?.average ?? null, count: result?.count ?? 0 };
}

// ─── Lesson Drop-off ───

export type LessonDropOff = {
  lessonId: number;
  lessonTitle: string;
  moduleId: number;
  moduleTitle: string;
  completedCount: number;
  enrolledCount: number;
  /** Share of enrolled students who completed the lesson (0–1); null with no students. */
  completionRate: number | null;
  /** Previous lesson's rate minus this one's; the first lesson is compared to 100%. */
  drop: number | null;
  isTopDrop: boolean;
};

const TOP_DROP_COUNT = 3;

export function getLessonDropOff(courseId: number): LessonDropOff[] {
  const courseLessons = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleId: modules.id,
      moduleTitle: modules.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(lessons.position))
    .all();

  const enrolledCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId))
      .get()?.count ?? 0;

  // Only progress from students enrolled in this course counts.
  const completedRows =
    courseLessons.length === 0
      ? []
      : db
          .select({
            lessonId: lessonProgress.lessonId,
            count: sql<number>`count(distinct ${lessonProgress.userId})`,
          })
          .from(lessonProgress)
          .innerJoin(
            enrollments,
            and(
              eq(enrollments.userId, lessonProgress.userId),
              eq(enrollments.courseId, courseId)
            )
          )
          .where(
            and(
              inArray(
                lessonProgress.lessonId,
                courseLessons.map((lesson) => lesson.lessonId)
              ),
              eq(lessonProgress.status, LessonProgressStatus.Completed)
            )
          )
          .groupBy(lessonProgress.lessonId)
          .all();

  const completedByLesson = new Map(
    completedRows.map((row) => [row.lessonId, row.count])
  );

  let previousRate = 1;
  const result: LessonDropOff[] = courseLessons.map((lesson) => {
    const completedCount = completedByLesson.get(lesson.lessonId) ?? 0;
    const completionRate =
      enrolledCount > 0 ? completedCount / enrolledCount : null;
    const drop = completionRate === null ? null : previousRate - completionRate;
    if (completionRate !== null) previousRate = completionRate;

    return {
      ...lesson,
      completedCount,
      enrolledCount,
      completionRate,
      drop,
      isTopDrop: false,
    };
  });

  // Highlight the biggest positive drops; ties go to the earlier lesson.
  result
    .filter((lesson) => lesson.drop !== null && lesson.drop > 0)
    .sort((a, b) => b.drop! - a.drop!)
    .slice(0, TOP_DROP_COUNT)
    .forEach((lesson) => {
      lesson.isTopDrop = true;
    });

  return result;
}

// ─── Quiz Stats ───

export type QuizStats = {
  quizId: number;
  quizTitle: string;
  lessonTitle: string;
  attemptedCount: number;
  passedCount: number;
  /** Students who passed at least once / students who attempted; null with no attempts. */
  passRate: number | null;
  /** Mean of each student's best score (0–1); null with no attempts. */
  averageBestScore: number | null;
  averageAttempts: number | null;
};

export function getQuizStats(courseId: number): QuizStats[] {
  const courseQuizzes = db
    .select({
      quizId: quizzes.id,
      quizTitle: quizzes.title,
      lessonTitle: lessons.title,
    })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(lessons.position), asc(quizzes.id))
    .all();

  if (courseQuizzes.length === 0) return [];

  // One row per quiz per student.
  const perStudent = db
    .select({
      quizId: quizAttempts.quizId,
      bestScore: sql<number>`max(${quizAttempts.score})`,
      everPassed: sql<number>`max(${quizAttempts.passed})`,
      attempts: sql<number>`count(*)`,
    })
    .from(quizAttempts)
    .where(
      inArray(
        quizAttempts.quizId,
        courseQuizzes.map((quiz) => quiz.quizId)
      )
    )
    .groupBy(quizAttempts.quizId, quizAttempts.userId)
    .all();

  return courseQuizzes.map((quiz) => {
    const students = perStudent.filter((row) => row.quizId === quiz.quizId);
    const attemptedCount = students.length;
    const passedCount = students.filter((row) => row.everPassed === 1).length;

    return {
      ...quiz,
      attemptedCount,
      passedCount,
      passRate: attemptedCount > 0 ? passedCount / attemptedCount : null,
      averageBestScore:
        attemptedCount > 0
          ? sum(students.map((row) => row.bestScore)) / attemptedCount
          : null,
      averageAttempts:
        attemptedCount > 0
          ? sum(students.map((row) => row.attempts)) / attemptedCount
          : null,
    };
  });
}

// ─── Rating Distribution ───

/** Counts per star from 5 down to 1, with stars nobody gave filled in as zero. */
export function getRatingDistribution(courseId: number) {
  const rows = db
    .select({
      rating: courseRatings.rating,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .groupBy(courseRatings.rating)
    .all();

  const counts = new Map(rows.map((row) => [row.rating, row.count]));
  const distribution: { stars: number; count: number }[] = [];
  for (let stars = MAX_RATING; stars >= MIN_RATING; stars--) {
    distribution.push({ stars, count: counts.get(stars) ?? 0 });
  }
  return distribution;
}

// ─── Platform-wide Admin Analytics ───

export type PlatformSummary = {
  totalRevenueCents: number;
  totalEnrollments: number;
  topCourse: { title: string; revenueCents: number } | null;
};

export function getPlatformSummary(since: Date | null): PlatformSummary {
  const revenueConditions = since
    ? [gte(purchases.createdAt, since.toISOString())]
    : [];

  const revenueRows = db
    .select({
      courseId: purchases.courseId,
      revenueCents: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(revenueConditions.length > 0 ? and(...revenueConditions) : undefined)
    .groupBy(purchases.courseId)
    .all();

  let totalRevenueCents = 0;
  let topCourseId: number | null = null;
  let topRevenue = 0;
  for (const row of revenueRows) {
    totalRevenueCents += row.revenueCents;
    if (row.revenueCents > topRevenue) {
      topRevenue = row.revenueCents;
      topCourseId = row.courseId;
    }
  }

  let topCourse: PlatformSummary["topCourse"] = null;
  if (topCourseId !== null) {
    const course = db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, topCourseId))
      .get();
    if (course) {
      topCourse = { title: course.title, revenueCents: topRevenue };
    }
  }

  const enrollmentConditions = since
    ? [gte(enrollments.enrolledAt, since.toISOString())]
    : [];

  const enrollmentResult = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(
      enrollmentConditions.length > 0 ? and(...enrollmentConditions) : undefined
    )
    .get();

  return {
    totalRevenueCents,
    totalEnrollments: enrollmentResult?.count ?? 0,
    topCourse,
  };
}

/**
 * Combined revenue across all courses for the range ending at `now`: daily
 * buckets for 7d/30d/90d, monthly for 12m/all. Empty buckets are zero; the
 * all-time series starts at the first purchase. Buckets are UTC.
 */
export function getPlatformRevenueTimeSeries(
  range: AnalyticsRange,
  now: Date
): { granularity: RevenueGranularity; points: RevenuePoint[] } {
  const since = getRangeStartDate(range, now);
  const granularity: RevenueGranularity =
    range === "12m" || range === "all" ? "month" : "day";

  const conditions = since
    ? [gte(purchases.createdAt, since.toISOString())]
    : [];

  const rows = db
    .select({ createdAt: purchases.createdAt, pricePaid: purchases.pricePaid })
    .from(purchases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(purchases.createdAt))
    .all();

  const start = since ?? (rows.length > 0 ? new Date(rows[0].createdAt) : null);
  if (!start) return { granularity, points: [] };

  return {
    granularity,
    points: bucketRevenue(rows, { start, until: now }, granularity),
  };
}

export function getInstructorsWithCourses() {
  const rows = db
    .select({
      id: users.id,
      name: users.name,
    })
    .from(users)
    .innerJoin(courses, eq(courses.instructorId, users.id))
    .where(
      inArray(courses.status, [CourseStatus.Published, CourseStatus.Archived])
    )
    .groupBy(users.id)
    .orderBy(asc(users.name))
    .all();
  return rows;
}
