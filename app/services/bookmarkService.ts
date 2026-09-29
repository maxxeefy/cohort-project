import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

// ─── Bookmark Service ───
// Private per-student lesson bookmarks. A bookmark persists until the student
// removes it (it is not cleared on lesson completion). Enrollment checks are
// done by the caller (route action).

export function isLessonBookmarked(opts: { userId: number; lessonId: number }) {
  const row = db
    .select({ id: lessonBookmarks.id })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(lessonBookmarks.lessonId, opts.lessonId)
      )
    )
    .get();
  return row !== undefined;
}

export function toggleBookmark(opts: { userId: number; lessonId: number }) {
  const { userId, lessonId } = opts;
  if (isLessonBookmarked({ userId, lessonId })) {
    db.delete(lessonBookmarks)
      .where(
        and(
          eq(lessonBookmarks.userId, userId),
          eq(lessonBookmarks.lessonId, lessonId)
        )
      )
      .run();
    return { bookmarked: false };
  }

  db.insert(lessonBookmarks)
    .values({ userId, lessonId })
    .onConflictDoNothing()
    .run();
  return { bookmarked: true };
}

export function getBookmarkedLessonIds(opts: {
  userId: number;
  courseId: number;
}): number[] {
  return db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .innerJoin(lessons, eq(lessonBookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(lessonBookmarks.userId, opts.userId),
        eq(modules.courseId, opts.courseId)
      )
    )
    .all()
    .map((row) => row.lessonId);
}
