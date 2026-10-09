import {
  Link,
  data,
  isRouteErrorResponse,
  useSearchParams,
} from "react-router";
import { z } from "zod";
import type { Route } from "./+types/admin.analytics";
import { getCurrentUserId } from "~/lib/session";
import { parseParams } from "~/lib/validation";
import { cn, formatPrice } from "~/lib/utils";
import { getUserById } from "~/services/userService";
import {
  getPlatformRevenueTimeSeries,
  getPlatformSummary,
  getRangeStartDate,
  type AnalyticsRange,
} from "~/services/analyticsService";
import { UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { RevenueChart } from "~/components/revenue-chart";
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

const searchSchema = z.object({
  range: z.enum(["7d", "30d", "12m", "all"]).default("30d"),
});

function formatRevenue(cents: number) {
  return cents === 0 ? "$0.00" : formatPrice(cents);
}

export function meta() {
  return [
    { title: "Admin Analytics — Cadence" },
    { name: "description", content: "Platform-wide analytics" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const url = new URL(request.url);
  const { range } = parseParams(
    Object.fromEntries(url.searchParams),
    searchSchema
  );

  const now = new Date();
  const since = getRangeStartDate(range, now);
  const summary = getPlatformSummary(since);
  const revenueSeries = getPlatformRevenueTimeSeries(range, now);

  return { range, summary, revenueSeries };
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-5 w-72" />
      <Skeleton className="mt-8 h-10 w-80" />
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}

export default function AdminAnalytics({ loaderData }: Route.ComponentProps) {
  const { range, summary, revenueSeries } = loaderData;
  const [searchParams] = useSearchParams();

  function rangeHref(value: AnalyticsRange) {
    const next = new URLSearchParams(searchParams);
    next.set("range", value);
    return `?${next.toString()}`;
  }

  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label;
  const hasData = summary.totalRevenueCents > 0 || summary.totalEnrollments > 0;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Admin Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Platform-wide revenue and enrollment overview
        </p>
      </div>

      <div
        role="group"
        aria-label="Time period"
        className="mb-6 inline-flex rounded-md border bg-muted p-1"
      >
        {RANGE_OPTIONS.map((option) => (
          <Link
            key={option.value}
            to={rangeHref(option.value)}
            aria-current={option.value === range ? "true" : undefined}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              option.value === range
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No data yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Analytics will appear once courses have enrollments or purchases.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Revenue
                </CardTitle>
                <DollarSign className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatRevenue(summary.totalRevenueCents)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {range === "all" ? "All time" : `Last ${rangeLabel}`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Enrollments
                </CardTitle>
                <Users className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summary.totalEnrollments}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {range === "all" ? "All time" : `Last ${rangeLabel}`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Top Earning Course
                </CardTitle>
                <TrendingUp className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {summary.topCourse ? (
                  <>
                    <div className="truncate text-lg font-bold">
                      {summary.topCourse.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatRevenue(summary.topCourse.revenueCents)}
                    </p>
                  </>
                ) : (
                  <div className="text-lg text-muted-foreground">—</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Revenue over time</CardTitle>
              <p className="text-sm text-muted-foreground">
                {range === "all" ? "All time" : `Last ${rangeLabel}`}, per{" "}
                {revenueSeries.granularity} (UTC).
              </p>
            </CardHeader>
            <CardContent>
              <RevenueChart
                points={revenueSeries.points}
                granularity={revenueSeries.granularity}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
