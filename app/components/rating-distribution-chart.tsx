import { Star } from "lucide-react";

/** Horizontal CSS bars, one per star level, sized by share of all ratings. */
export function RatingDistributionChart({
  distribution,
}: {
  distribution: { stars: number; count: number }[];
}) {
  const total = distribution.reduce((sum, row) => sum + row.count, 0);

  return (
    <div>
      <ul className="max-w-md space-y-2">
        {distribution.map((row) => (
          <li
            key={row.stars}
            className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm"
          >
            <span className="flex items-center gap-1 tabular-nums">
              {row.stars}
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
            </span>
            <div className="h-3 rounded-full bg-muted">
              <div
                className="h-3 rounded-full bg-amber-400"
                style={{
                  width: `${total > 0 ? (row.count / total) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-right tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
      {total === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No ratings yet.</p>
      )}
    </div>
  );
}
