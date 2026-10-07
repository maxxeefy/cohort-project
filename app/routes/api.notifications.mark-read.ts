import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.mark-read";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { markAsRead } from "~/services/notificationService";

const markReadSchema = z.object({
  notificationId: z.coerce.number().int(),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = parseFormData(await request.formData(), markReadSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const notification = markAsRead({
    notificationId: parsed.data.notificationId,
    userId: currentUserId,
  });
  if (!notification) {
    throw data("Notification not found", { status: 404 });
  }

  return { success: true };
}
