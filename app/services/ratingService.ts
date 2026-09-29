import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";
import { isUserEnrolled } from "~/services/enrollmentService";

// ─── Rating Service ───
// Star ratings (1–5) for courses. One rating per student per course, and a
// rating cannot be changed once submitted. Only enrolled students can rate.
// Uses positional parameters (project convention).

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export type RatingSummary = {
  average: number | null;
  count: number;
};

export function getUserRatingForCourse(userId: number, courseId: number) {
  return db
    .select()
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();
}

export function rateCourse(userId: number, courseId: number, rating: number) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new Error(
      `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`
    );
  }

  if (!isUserEnrolled(userId, courseId)) {
    throw new Error("You must be enrolled in this course to rate it");
  }

  if (getUserRatingForCourse(userId, courseId)) {
    throw new Error("You have already rated this course");
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

export function getCourseRatingSummary(courseId: number): RatingSummary {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

export function getRatingSummariesForCourses(
  courseIds: number[]
): Map<number, RatingSummary> {
  const summaries = new Map<number, RatingSummary>();
  if (courseIds.length === 0) return summaries;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const courseId of courseIds) {
    summaries.set(courseId, { average: null, count: 0 });
  }
  for (const row of rows) {
    summaries.set(row.courseId, { average: row.average, count: row.count });
  }

  return summaries;
}
