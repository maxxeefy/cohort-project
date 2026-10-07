import {
  Link,
  data,
  isRouteErrorResponse,
  useNavigate,
  useSearchParams,
} from "react-router";
import { Fragment } from "react";
import { z } from "zod";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { parseParams } from "~/lib/validation";
import { cn, formatPrice } from "~/lib/utils";
import { getUserById, getUsersByRole } from "~/services/userService";
import { getCoursesByInstructor } from "~/services/courseService";
import {
  getAverageRatingForCourses,
  getCourseSummaries,
  getLessonDropOff,
  getQuizStats,
  getRangeStartDate,
  getRatingDistribution,
  getRevenueForCourses,
  getRevenueTimeSeries,
  type AnalyticsRange,
} from "~/services/analyticsService";
import { CourseStatus, UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { LessonDropOffChart } from "~/components/lesson-drop-off-chart";
import { RevenueChart } from "~/components/revenue-chart";
import { QuizStatsTable } from "~/components/quiz-stats-table";
import { RatingDistributionChart } from "~/components/rating-distribution-chart";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Plus,
  Star,
} from "lucide-react";

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

const analyticsSearchSchema = z.object({
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  courseId: z.coerce.number().int().positive().optional(),
  instructorId: z.coerce.number().int().positive().optional(),
});

const EM_DASH = "—";

// formatPrice renders 0 as "Free", which reads wrong for revenue.
function formatRevenue(cents: number) {
  return cents === 0 ? "$0.00" : formatPrice(cents);
}

function formatPercent(rate: number | null) {
  return rate === null ? EM_DASH : `${Math.round(rate * 100)}%`;
}

function formatRating(average: number | null) {
  return average === null ? EM_DASH : `★ ${average.toFixed(1)}`;
}

function statusBadge(status: string) {
  return status === CourseStatus.Published ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
      Published
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
      Archived
    </span>
  );
}

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Course performance analytics" },
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

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const { range, courseId, instructorId } = parseParams(
    Object.fromEntries(url.searchParams),
    analyticsSearchSchema
  );

  const isAdmin = user.role === UserRole.Admin;

  // Admins pick an instructor (default: the first one). Instructors always
  // see themselves, so `instructorId` is ignored for them.
  const instructors = isAdmin
    ? getUsersByRole(UserRole.Instructor).sort((a, b) => a.id - b.id)
    : [];
  const instructor = !isAdmin
    ? user
    : instructorId === undefined
      ? instructors[0]
      : instructors.find((i) => i.id === instructorId);

  if (isAdmin && instructorId !== undefined && !instructor) {
    throw data("Instructor not found.", { status: 404 });
  }

  const courses = instructor
    ? getCoursesByInstructor(instructor.id).filter(
        (course) =>
          course.status === CourseStatus.Published ||
          course.status === CourseStatus.Archived
      )
    : [];

  const courseIds = courses.map((course) => course.id);

  if (courseId !== undefined && !courseIds.includes(courseId)) {
    throw data("Course not found.", { status: 404 });
  }

  const now = new Date();
  const since = getRangeStartDate(range, now);
  const revenue = getRevenueForCourses(courseIds, since);
  const revenueSeries = getRevenueTimeSeries(courseIds, { since, until: now });
  const summaries = getCourseSummaries(courseIds);

  const courseRows = courses
    .map((course) => ({
      id: course.id,
      title: course.title,
      status: course.status,
      revenueCents: revenue.byCourse.get(course.id) ?? 0,
      ...summaries.get(course.id)!,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  return {
    range,
    isAdmin,
    instructors: instructors.map((i) => ({ id: i.id, name: i.name })),
    selectedInstructorId: instructor?.id ?? null,
    revenueCents: revenue.totalCents,
    revenueSeries,
    rating: getAverageRatingForCourses(courseIds),
    courses: courseRows,
    selectedCourse:
      courseId === undefined
        ? null
        : {
            id: courseId,
            dropOff: getLessonDropOff(courseId),
            quizzes: getQuizStats(courseId),
            ratingDistribution: getRatingDistribution(courseId),
          },
  };
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-5 w-72" />
      <Skeleton className="mt-8 h-10 w-80" />
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const {
    range,
    isAdmin,
    instructors,
    selectedInstructorId,
    revenueCents,
    revenueSeries,
    rating,
    courses,
    selectedCourse,
  } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Toggles the expanded course: clicking the open row collapses it.
  function courseHref(id: number) {
    const next = new URLSearchParams(searchParams);
    if (selectedCourse?.id === id) {
      next.delete("courseId");
    } else {
      next.set("courseId", String(id));
    }
    return `?${next.toString()}`;
  }

  function rangeHref(value: AnalyticsRange) {
    const next = new URLSearchParams(searchParams);
    next.set("range", value);
    return `?${next.toString()}`;
  }

  // Switching instructor drops `courseId`: it belongs to the previous instructor.
  function selectInstructor(value: string) {
    const next = new URLSearchParams(searchParams);
    next.set("instructorId", value);
    next.delete("courseId");
    navigate(`?${next.toString()}`);
  }

  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            {isAdmin
              ? "Course performance for the selected instructor"
              : "How your courses are performing"}
          </p>
        </div>
        {isAdmin && instructors.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Instructor</span>
            <Select
              value={String(selectedInstructorId)}
              onValueChange={selectInstructor}
            >
              <SelectTrigger className="w-56" aria-label="Instructor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No courses to analyze yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin && instructors.length === 0
              ? "There are no instructors yet."
              : "Analytics appear once a course is published."}
          </p>
          {!isAdmin && (
            <Link to="/instructor/new" className="mt-4">
              <Button>
                <Plus className="mr-2 size-4" />
                Create Course
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Revenue period"
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

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue
                </CardTitle>
                <DollarSign className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatRevenue(revenueCents)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {range === "all" ? "All time" : `Last ${rangeLabel}`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average rating
                </CardTitle>
                <Star className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatRating(rating.average)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rating.count} {rating.count === 1 ? "rating" : "ratings"} ·
                  All time
                </p>
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

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Courses</CardTitle>
              <p className="text-sm text-muted-foreground">
                Revenue for the selected period; other columns are all time.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Course</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Revenue
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Students
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Completion
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">Rating</th>
                    <th className="pb-2 text-right font-medium">
                      Median days to complete
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => {
                    const isExpanded = selectedCourse?.id === course.id;
                    return (
                      <Fragment key={course.id}>
                        <tr
                          className={cn(
                            "cursor-pointer border-b last:border-0 hover:bg-muted/50",
                            isExpanded && "bg-muted/50"
                          )}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("a"))
                              return;
                            navigate(courseHref(course.id), {
                              preventScrollReset: true,
                            });
                          }}
                        >
                          <td className="py-3 pr-4 font-medium">
                            <Link
                              to={courseHref(course.id)}
                              preventScrollReset
                              aria-expanded={isExpanded}
                              className="inline-flex items-center gap-1.5 hover:text-primary"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4 shrink-0" />
                              ) : (
                                <ChevronRight className="size-4 shrink-0" />
                              )}
                              {course.title}
                            </Link>
                          </td>
                          <td className="py-3 pr-4">
                            {statusBadge(course.status)}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {formatRevenue(course.revenueCents)}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {course.studentCount}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {formatPercent(course.completionRate)}{" "}
                            <span className="text-muted-foreground">
                              ({course.completedCount} of {course.studentCount})
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {formatRating(course.averageRating)}{" "}
                            <span className="text-muted-foreground">
                              ({course.ratingCount})
                            </span>
                          </td>
                          <td className="py-3 text-right tabular-nums">
                            {course.medianDaysToComplete === null
                              ? EM_DASH
                              : course.medianDaysToComplete}
                          </td>
                        </tr>
                        {isExpanded && selectedCourse && (
                          <tr className="border-b last:border-0">
                            <td colSpan={7} className="px-2 py-5">
                              <h3 className="mb-1 font-semibold">
                                Lesson drop-off
                              </h3>
                              <p className="mb-4 text-sm text-muted-foreground">
                                Share of enrolled students who completed each
                                lesson (all time). The three biggest drops are
                                highlighted.
                              </p>
                              <LessonDropOffChart
                                lessons={selectedCourse.dropOff}
                              />

                              <h3 className="mb-1 mt-8 font-semibold">
                                Quizzes
                              </h3>
                              <p className="mb-4 text-sm text-muted-foreground">
                                Pass rate counts students who passed at least
                                once; scores and attempts are averaged per
                                student (all time).
                              </p>
                              <QuizStatsTable
                                quizzes={selectedCourse.quizzes}
                              />

                              <h3 className="mb-1 mt-8 font-semibold">
                                Ratings
                              </h3>
                              <p className="mb-4 text-sm text-muted-foreground">
                                Distribution of star ratings (all time).
                              </p>
                              <RatingDistributionChart
                                distribution={selectedCourse.ratingDistribution}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
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
          : "You don't have permission to access this page.";
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
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
