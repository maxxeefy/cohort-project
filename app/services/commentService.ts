import { eq, and, asc, isNull } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users, UserRole } from "~/db/schema";

// ─── Comment Service ───
// Flat, plain-text comments on lessons. Deletion is soft (deletedAt +
// deletedByUserId) so threads can be layered on later without losing history.
// Uses positional parameters (project convention).

export const MAX_COMMENT_LENGTH = 2000;

type Actor = { id: number; role: UserRole };

export function canAccessComments(
  user: Actor,
  course: { instructorId: number },
  enrolled: boolean
) {
  return (
    enrolled || course.instructorId === user.id || user.role === UserRole.Admin
  );
}

export function canDeleteComment(
  user: Actor,
  comment: { userId: number },
  course: { instructorId: number }
) {
  return (
    comment.userId === user.id ||
    course.instructorId === user.id ||
    user.role === UserRole.Admin
  );
}

export function getCommentById(id: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, id))
    .get();
}

export function getCommentsForLesson(lessonId: number) {
  return db
    .select({
      id: lessonComments.id,
      content: lessonComments.content,
      createdAt: lessonComments.createdAt,
      userId: lessonComments.userId,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      userRole: users.role,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.deletedAt)
      )
    )
    .orderBy(asc(lessonComments.createdAt), asc(lessonComments.id))
    .all();
}

export function createComment(
  lessonId: number,
  userId: number,
  content: string
) {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`
    );
  }

  return db
    .insert(lessonComments)
    .values({ lessonId, userId, content: trimmed })
    .returning()
    .get();
}

export function softDeleteComment(id: number, deletedByUserId: number) {
  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString(), deletedByUserId })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}
