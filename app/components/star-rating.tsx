import { useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

const STARS = [1, 2, 3, 4, 5];

/** Row of five stars; `value` may be fractional (e.g. an average of 4.3). */
export function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className="flex items-center gap-0.5">
      {STARS.map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        return (
          <span key={star} className={cn("relative inline-block size-4", className)}>
            <Star className="absolute inset-0 size-full text-muted-foreground/30" />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className={cn("size-4 fill-amber-400 text-amber-400", className)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function StarRatingDisplay({
  average,
  count,
  size = "md",
}: {
  average: number | null;
  count: number;
  size?: "sm" | "md";
}) {
  const starClass = size === "sm" ? "size-3.5" : "size-4";

  if (count === 0 || average === null) {
    return (
      <span className="text-xs text-muted-foreground">No ratings yet</span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        size === "sm" ? "text-xs" : "text-sm"
      )}
      aria-label={`Rated ${average.toFixed(1)} out of 5 by ${count} ${count === 1 ? "student" : "students"}`}
    >
      <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
      <Stars value={average} className={starClass} />
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}

/** One-time star rating form. Each star submits the "rate" intent to the current route. */
export function StarRatingInput() {
  const fetcher = useFetcher<{ error?: string }>();
  const [hovered, setHovered] = useState(0);
  const pending = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <div>
      <fetcher.Form
        method="post"
        className="flex items-center gap-1"
        onMouseLeave={() => setHovered(0)}
      >
        <input type="hidden" name="intent" value="rate" />
        {STARS.map((star) => (
          <button
            key={star}
            type="submit"
            name="rating"
            value={star}
            disabled={pending}
            aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Star
              className={cn(
                "size-6",
                star <= hovered
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </fetcher.Form>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
