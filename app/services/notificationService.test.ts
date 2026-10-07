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
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "./notificationService";
import { enrollUser } from "./enrollmentService";

function notify(recipientUserId: number, title = "Hello") {
  return createNotification({
    recipientUserId,
    type: schema.NotificationType.Enrollment,
    title,
    message: "Someone enrolled",
    linkUrl: "/instructor/1/students",
  });
}

function insertAt(recipientUserId: number, title: string, createdAt: string) {
  return testDb
    .insert(schema.notifications)
    .values({
      recipientUserId,
      type: schema.NotificationType.Enrollment,
      title,
      message: "m",
      linkUrl: "/",
      createdAt,
    })
    .returning()
    .get();
}

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createNotification", () => {
    it("creates an unread notification with all fields", () => {
      const notification = createNotification({
        recipientUserId: base.instructor.id,
        type: schema.NotificationType.Enrollment,
        title: "New Enrollment",
        message: "Test User enrolled in Test Course",
        linkUrl: "/instructor/1/students",
      });

      expect(notification.id).toBeDefined();
      expect(notification.recipientUserId).toBe(base.instructor.id);
      expect(notification.type).toBe(schema.NotificationType.Enrollment);
      expect(notification.title).toBe("New Enrollment");
      expect(notification.message).toBe("Test User enrolled in Test Course");
      expect(notification.linkUrl).toBe("/instructor/1/students");
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeDefined();
    });
  });

  describe("getNotifications", () => {
    it("returns notifications newest first", () => {
      insertAt(base.instructor.id, "oldest", "2026-01-01T00:00:00.000Z");
      insertAt(base.instructor.id, "newest", "2026-01-03T00:00:00.000Z");
      insertAt(base.instructor.id, "middle", "2026-01-02T00:00:00.000Z");

      const result = getNotifications(base.instructor.id, 10, 0);

      expect(result.map((n) => n.title)).toEqual(["newest", "middle", "oldest"]);
    });

    it("respects limit and offset", () => {
      for (let day = 1; day <= 7; day++) {
        insertAt(base.instructor.id, `n${day}`, `2026-01-0${day}T00:00:00.000Z`);
      }

      expect(
        getNotifications(base.instructor.id, 5, 0).map((n) => n.title)
      ).toEqual(["n7", "n6", "n5", "n4", "n3"]);
      expect(
        getNotifications(base.instructor.id, 5, 5).map((n) => n.title)
      ).toEqual(["n2", "n1"]);
    });

    it("returns an empty list when the user has no notifications", () => {
      expect(getNotifications(base.instructor.id, 5, 0)).toEqual([]);
    });

    it("only returns the user's own notifications", () => {
      notify(base.instructor.id, "for instructor");
      notify(base.user.id, "for student");

      const result = getNotifications(base.instructor.id, 10, 0);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("for instructor");
    });
  });

  describe("getUnreadCount", () => {
    it("counts only unread notifications for the user", () => {
      const first = notify(base.instructor.id);
      notify(base.instructor.id);
      notify(base.user.id);
      markAsRead({ notificationId: first.id, userId: base.instructor.id });

      expect(getUnreadCount(base.instructor.id)).toBe(1);
      expect(getUnreadCount(base.user.id)).toBe(1);
    });

    it("returns 0 when the user has no notifications", () => {
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });
  });

  describe("markAsRead", () => {
    it("marks a single notification as read", () => {
      const first = notify(base.instructor.id);
      const second = notify(base.instructor.id);

      const updated = markAsRead({
        notificationId: first.id,
        userId: base.instructor.id,
      });

      expect(updated?.isRead).toBe(true);
      const all = getNotifications(base.instructor.id, 10, 0);
      expect(all.find((n) => n.id === second.id)?.isRead).toBe(false);
    });

    it("does not mark another user's notification", () => {
      const notification = notify(base.instructor.id);

      const updated = markAsRead({
        notificationId: notification.id,
        userId: base.user.id,
      });

      expect(updated).toBeUndefined();
      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });
  });

  describe("markAllAsRead", () => {
    it("marks all of the user's notifications as read", () => {
      notify(base.instructor.id);
      notify(base.instructor.id);

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("does not affect other users' notifications", () => {
      notify(base.instructor.id);
      notify(base.user.id);

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.user.id)).toBe(1);
    });
  });

  describe("enrollment integration", () => {
    it("notifies the course instructor when a student enrolls", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      const result = getNotifications(base.instructor.id, 10, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        recipientUserId: base.instructor.id,
        type: schema.NotificationType.Enrollment,
        title: "New Enrollment",
        message: "Test User enrolled in Test Course",
        linkUrl: `/instructor/${base.course.id}/students`,
        isRead: false,
      });
    });

    it("does not notify the enrolling student", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      expect(getNotifications(base.user.id, 10, 0)).toEqual([]);
    });
  });
});
