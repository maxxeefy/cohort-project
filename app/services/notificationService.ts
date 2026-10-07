import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "~/db";
import { notifications, NotificationType } from "~/db/schema";

// ─── Notification Service ───
// In-app notifications (currently: instructor enrollment alerts).

export function createNotification(opts: {
  recipientUserId: number;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl: string;
}) {
  return db.insert(notifications).values(opts).returning().get();
}

export function getNotifications(userId: number, limit: number, offset: number) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function getUnreadCount(userId: number) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, userId),
        eq(notifications.isRead, false)
      )
    )
    .get();

  return result?.count ?? 0;
}

/**
 * Marks a single notification as read. Scoped to the recipient, so a user
 * can't mark someone else's notification. Returns undefined if not found.
 */
export function markAsRead(opts: { notificationId: number; userId: number }) {
  return db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, opts.notificationId),
        eq(notifications.recipientUserId, opts.userId)
      )
    )
    .returning()
    .get();
}

export function markAllAsRead(userId: number) {
  return db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.recipientUserId, userId),
        eq(notifications.isRead, false)
      )
    )
    .run();
}
