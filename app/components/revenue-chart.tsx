import { useEffect, useRef, useState } from "react";
import { formatPrice } from "~/lib/utils";
import type {
  RevenueGranularity,
  RevenuePoint,
} from "~/services/analyticsService";

const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 64 };
const X_LABEL_COUNT = 6;
const Y_TICK_COUNT = 4;

function formatRevenue(cents: number) {
  return cents === 0 ? "$0.00" : formatPrice(cents);
}

function formatAxisDollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function formatBucket(date: string, granularity: RevenueGranularity) {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const label = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return granularity === "week" ? `Week of ${label}` : label;
}

function formatAxisLabel(date: string, granularity: RevenueGranularity) {
  return formatBucket(date, granularity).replace("Week of ", "");
}

/** Rounds the max up to a clean step so ticks land on round dollar amounts. */
function niceScale(maxCents: number) {
  const maxDollars = Math.max(maxCents / 100, 1);
  const rawStep = maxDollars / Y_TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ??
    10 * magnitude;
  const ticks = Array.from(
    { length: Y_TICK_COUNT + 1 },
    (_, i) => i * step * 100
  );
  return { max: ticks[ticks.length - 1], ticks };
}

function sign(value: number) {
  return value < 0 ? -1 : 1;
}

/**
 * Smooth path through the points using monotone cubic interpolation
 * (Fritsch–Carlson, same as d3's curveMonotoneX). Unlike Catmull-Rom it never
 * overshoots between points, so the curve can't dip below $0 or above a peak.
 */
function monotonePath(coords: (readonly [number, number])[]) {
  if (coords.length === 1) return `M${coords[0][0]},${coords[0][1]}`;

  const n = coords.length;
  const secants = coords.slice(1).map(([x1, y1], i) => {
    const [x0, y0] = coords[i];
    return (y1 - y0) / (x1 - x0);
  });

  const tangents = coords.map(([x], i) => {
    if (i === 0 || i === n - 1) return 0;
    const s0 = secants[i - 1];
    const s1 = secants[i];
    const h0 = x - coords[i - 1][0];
    const h1 = coords[i + 1][0] - x;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (
      (sign(s0) + sign(s1)) *
        Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
    );
  });
  // End tangents follow the first/last segment so the curve leaves straight.
  tangents[0] = (3 * secants[0] - tangents[1]) / 2;
  tangents[n - 1] = (3 * secants[n - 2] - tangents[n - 2]) / 2;

  let path = `M${coords[0][0]},${coords[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const h = (x1 - x0) / 3;
    path += ` C${x0 + h},${y0 + h * tangents[i]} ${x1 - h},${y1 - h * tangents[i + 1]} ${x1},${y1}`;
  }
  return path;
}

/** Single-series SVG spline chart with a crosshair tooltip. No chart library. */
export function RevenueChart({
  points,
  granularity,
}: {
  points: RevenuePoint[];
  granularity: RevenueGranularity;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(entry.contentRect.width, 280));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No sales yet.
      </p>
    );
  }

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxCents = Math.max(...points.map((p) => p.revenueCents));
  const scale = niceScale(maxCents);
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const x = (i: number) =>
    MARGIN.left + (points.length > 1 ? i * step : innerWidth / 2);
  const y = (cents: number) =>
    MARGIN.top + innerHeight - (cents / scale.max) * innerHeight;

  const linePath = monotonePath(
    points.map((p, i) => [x(i), y(p.revenueCents)] as const)
  );
  const areaPath = `${linePath} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const labelIndexes = new Set(
    points.length <= X_LABEL_COUNT
      ? points.map((_, i) => i)
      : Array.from({ length: X_LABEL_COUNT }, (_, i) =>
          Math.round((i * (points.length - 1)) / (X_LABEL_COUNT - 1))
        )
  );

  function handlePointerMove(event: React.PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    const index = points.length > 1 ? Math.round(offset / step) : 0;
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  const hovered = hoverIndex === null ? null : points[hoverIndex];
  const total = points.reduce((sum, p) => sum + p.revenueCents, 0);

  return (
    <div>
      <div ref={containerRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Revenue over time, ${formatRevenue(total)} in total`}
          className="block max-w-full"
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-xs tabular-nums"
              >
                {formatAxisDollars(tick)}
              </text>
            </g>
          ))}

          {points.map(
            (p, i) =>
              labelIndexes.has(i) && (
                <text
                  key={p.date}
                  x={x(i)}
                  y={HEIGHT - 8}
                  textAnchor={
                    i === 0 && points.length > 1
                      ? "start"
                      : i === points.length - 1 && points.length > 1
                        ? "end"
                        : "middle"
                  }
                  className="fill-muted-foreground text-xs"
                >
                  {formatAxisLabel(p.date, granularity)}
                </text>
              )
          )}

          <path d={areaPath} className="fill-primary/10" />
          <path
            d={linePath}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hovered && hoverIndex !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hoverIndex)}
                x2={x(hoverIndex)}
                y1={MARGIN.top}
                y2={MARGIN.top + innerHeight}
                className="stroke-muted-foreground/50"
                strokeWidth={1}
              />
              <circle
                cx={x(hoverIndex)}
                cy={y(hovered.revenueCents)}
                r={4}
                className="fill-primary stroke-card"
                strokeWidth={2}
              />
            </g>
          )}

          <rect
            x={MARGIN.left - step / 2}
            y={MARGIN.top}
            width={innerWidth + step}
            height={innerHeight}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>

        {hovered && hoverIndex !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border bg-popover px-3 py-2 text-sm shadow-md"
            style={
              x(hoverIndex) > width / 2
                ? { right: width - x(hoverIndex) + 12 }
                : { left: x(hoverIndex) + 12 }
            }
          >
            <div className="text-muted-foreground">
              {formatBucket(hovered.date, granularity)}
            </div>
            <div className="font-semibold tabular-nums">
              {formatRevenue(hovered.revenueCents)}
            </div>
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full max-w-sm">
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-b last:border-0">
                  <td className="py-1 pr-4 text-muted-foreground">
                    {formatBucket(p.date, granularity)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatRevenue(p.revenueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
