import { useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Popover } from "radix-ui";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  unreadCount: number;
  notifications: NotificationItem[];
}

function formatTimeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

export function NotificationBell({
  unreadCount,
  notifications,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const markReadFetcher = useFetcher();
  const markAllFetcher = useFetcher();

  // Optimistic: once "mark all" is in flight, treat everything as read
  const allMarkedRead = markAllFetcher.state !== "idle";
  const displayedUnreadCount = allMarkedRead ? 0 : unreadCount;

  function handleNotificationClick(notification: NotificationItem) {
    if (!notification.isRead) {
      markReadFetcher.submit(
        { notificationId: notification.id },
        { method: "post", action: "/api/notifications/mark-read" }
      );
    }
    setOpen(false);
    navigate(notification.linkUrl);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            displayedUnreadCount > 0
              ? `Notifications (${displayedUnreadCount} unread)`
              : "Notifications"
          }
          className="relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="size-4" />
          {displayedUnreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
              {displayedUnreadCount > 99 ? "99+" : displayedUnreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-80 rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b px-4 py-3 text-sm font-semibold">
            Notifications
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => {
                const isUnread = !notification.isRead && !allMarkedRead;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                        isUnread && "bg-accent/50"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          isUnread ? "bg-blue-500" : "bg-transparent"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm",
                            isUnread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {notification.title}
                          {isUnread && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {notification.message}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t px-4 py-2">
            <markAllFetcher.Form
              method="post"
              action="/api/notifications/mark-all-read"
            >
              <button
                type="submit"
                disabled={displayedUnreadCount === 0}
                className="w-full rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                Mark all as read
              </button>
            </markAllFetcher.Form>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
