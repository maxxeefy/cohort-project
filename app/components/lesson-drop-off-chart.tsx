import { cn } from "~/lib/utils";
import type { LessonDropOff } from "~/services/analyticsService";

function formatShare(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Horizontal CSS bars, one per lesson, grouped under module headings. */
export function LessonDropOffChart({ lessons }: { lessons: LessonDropOff[] }) {
  if (lessons.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This course has no lessons yet.
      </p>
    );
  }

  const groups: {
    moduleId: number;
    moduleTitle: string;
    lessons: LessonDropOff[];
  }[] = [];
  for (const lesson of lessons) {
    const last = groups[groups.length - 1];
    if (last?.moduleId === lesson.moduleId) {
      last.lessons.push(lesson);
    } else {
      groups.push({
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessons: [lesson],
      });
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.moduleId}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.moduleTitle}
          </h4>
          <ul className="space-y-2">
            {group.lessons.map((lesson) => (
              <li
                key={lesson.lessonId}
                // Fixed side columns keep every bar the same width across rows and modules.
                className="grid grid-cols-[14rem_1fr_13rem] items-center gap-3 text-sm"
              >
                <span className="truncate" title={lesson.lessonTitle}>
                  {lesson.lessonTitle}
                </span>
                <div className="h-3 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-3 rounded-full",
                      lesson.isTopDrop ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${(lesson.completionRate ?? 0) * 100}%` }}
                  />
                </div>
                <span className="flex items-center gap-2 tabular-nums">
                  {formatShare(lesson.completionRate)}{" "}
                  <span className="text-muted-foreground">
                    ({lesson.completedCount} of {lesson.enrolledCount})
                  </span>
                  {lesson.isTopDrop && lesson.drop !== null && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      −{Math.round(lesson.drop * 100)} pts
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
