# Plan: Instructor Analytics Dashboard

> Source PRD: `prd/instructor-analytics.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: a single read-only page at `/instructor/analytics`, registered in `app/routes.ts` and nested under the app layout. It has a loader only, with no actions. The static segment takes precedence over `instructor/:courseId`.
- **Query parameters** (all state lives in the URL):
  - `range`: `7d` | `30d` | `90d` | `all`, default `30d`. Validated with the existing validation helpers and applied to revenue only.
  - `courseId`: the expanded course. Detail data is computed only for this course. A course outside the current instructor's course set → 404.
  - `instructorId`: honored for admins only. It must reference a user with the Instructor role and defaults to the first instructor. Instructors always see themselves.
- **Authorization**: inline in the loader, like the existing instructor pages. No user → 401 ("select a user" message); a role other than Instructor or Admin → 403.
- **Schema**: no changes and no migrations. Data comes from purchases, enrollments, lesson progress, quizzes and quiz attempts, course ratings, modules, lessons and courses.
- **Course set**: the instructor's courses with status Published or Archived, via the existing "courses by instructor" lookup. Drafts are excluded.
- **Service**: a new analytics service module holds all aggregation logic. It is synchronous, uses the shared `db` singleton and follows the project parameter convention. Each phase adds the functions it needs, with colocated tests that use the standard `createTestDb()` + `seedBaseData()` mock pattern.
- **Definitions**:
  - Revenue: the sum of the amount actually paid per purchase, dated by purchase date. Team purchases count in full and PPP purchases at the price paid. Values stay in integer cents until formatting.
  - Completion rate: enrollments with a completion date divided by all enrollments.
  - Median time to complete: the median of whole days from enrollment to completion, over completed enrollments only.
  - Lesson reached: a lesson-progress row with status Completed. The denominator is all enrolled students.
  - Lesson order: module position, then lesson position.
  - Drop: the previous lesson's percentage minus the current one's. The first lesson is compared against 100%.
- **Presentation**: money uses the existing price formatter. Every percentage is shown as "x% (n of N)", and missing values as an em dash. Non-revenue metrics are labeled "all time". Charts use plain CSS/SVG with no charting dependency, and layout uses the existing shadcn primitives.

---

## Phase 1: Page skeleton, access control and revenue KPI with period selector

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 36, 39, 44, 46

### What to build

Add an "Analytics" sidebar item, visible to Instructors and Admins, linking to `/instructor/analytics`. The loader authorizes the user, resolves the instructor's Published and Archived courses, and computes total revenue for those courses since the start date derived from `range`. The page shows a period selector (7 days / 30 days / 90 days / All time) that updates `range` in the URL, plus a Revenue KPI tile formatted like prices elsewhere. An instructor with no courses in the set sees an empty state that links to course creation. For now, an admin sees the first instructor's data; the selector arrives in Phase 5.

The service gains a revenue function: given a set of course ids and an optional start date, it returns the total and a per-course breakdown in cents.

### Acceptance criteria

- [ ] "Analytics" appears in the sidebar for Instructors and Admins only
- [ ] Unauthenticated → 401 with a "select a user" message; Student → 403
- [ ] Revenue KPI shows the sum paid for the instructor's Published and Archived courses in the selected period; drafts and other instructors' courses are excluded
- [ ] Team purchases count at their full paid amount and PPP purchases at the amount paid
- [ ] `range` is kept in the URL, defaults to `30d`, and is rejected if invalid; browser back/forward works
- [ ] An instructor with no courses sees an empty state with a link to create a course
- [ ] Service tests: revenue respects the start date; includes team purchases; excludes other instructors' courses; the per-course breakdown is correct

---

## Phase 2: Course table and ratings overview

**User stories**: 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 37

### What to build

Below the KPIs, add a table with one row per course in the set. Columns: title, status (Published / Archived), revenue for the selected period, enrolled students, completion rate shown as "x% (n of N)", average rating with rating count, and median days to complete. Rows are sorted by period revenue, highest first. Add an "Average rating" KPI tile, weighted by the number of ratings across all courses. Non-revenue metrics carry an "all time" label. A course with no students shows zeros and dashes without errors.

The service gains a course summary function (student count, completed count, completion rate, average rating, rating count, median days to complete) and a weighted average rating function across a set of courses.

### Acceptance criteria

- [ ] One row per Published or Archived course, with status shown
- [ ] Sorted by revenue for the selected period, descending; changing `range` updates the revenue column and the order
- [ ] Completion rate is shown with absolute counts; median days covers completed enrollments only
- [ ] Dashes appear where there are no completions or no ratings; a course with no enrollments renders zeros and dashes, never NaN
- [ ] The Average rating KPI is weighted by rating count; non-revenue metrics are labeled "all time"
- [ ] Service tests: completion rate and median for mixed completed and incomplete enrollments; a course with no enrollments returns zeros or nulls; weighted average rating across courses

---

## Phase 3: Expandable course detail with lesson drop-off

**User stories**: 23, 24, 25, 26, 27, 28, 29, 38

### What to build

Clicking a course row sets `courseId` in the URL and expands a detail block beneath that row. Clicking it again removes the parameter and collapses the block. The loader computes detail data only for the selected course and returns 404 if the course isn't in the current instructor's set. The first section is a lesson drop-off chart: one horizontal CSS/SVG bar per lesson, in course order and grouped by module headings. Each bar shows the percentage and count of enrolled students who completed that lesson. The three lessons with the biggest drop from the previous lesson are highlighted.

The service gains a drop-off function for one course. It returns ordered lessons with module info, completed count, enrolled count, percentage, drop from the previous lesson, and a top-3 drop flag.

### Acceptance criteria

- [ ] Clicking a row expands its detail block, and clicking it again collapses it; `courseId` is reflected in the URL and is linkable
- [ ] A `courseId` outside the instructor's course set → 404
- [ ] Lessons are ordered by module position, then lesson position, and grouped by module
- [ ] Only Completed lesson progress counts; the denominator is all enrolled students; each bar shows "x% (n of N)"
- [ ] The three biggest drops are highlighted, with the first lesson compared against 100%
- [ ] No charting library is added
- [ ] Service tests: ordering by module and lesson position; only Completed progress counts; top-3 drop flags are correct

---

## Phase 4: Quiz stats and rating distribution in course detail

**User stories**: 30, 31, 32, 33, 34, 35

### What to build

Add two sections to the expanded course detail block. **Quizzes**: a table listing each quiz in the course with its lesson, the pass rate (students who passed at least once divided by students who attempted, shown with counts), the average best score per student, and the average number of attempts per student. Quizzes with no attempts show dashes. **Ratings**: a 1–5 star distribution drawn as CSS bars with counts, where stars without ratings show zero.

The service gains a quiz stats function and a rating distribution function, both scoped to one course.

### Acceptance criteria

- [ ] Every quiz in the course is listed with its lesson
- [ ] Pass rate = students passed at least once / students who attempted, shown with absolute counts
- [ ] The average best score and average attempts are computed per student
- [ ] Quizzes with no attempts show dashes
- [ ] The rating distribution always shows all five stars, with zeros filled in
- [ ] Service tests: multiple attempts per student (passed at least once, best score, average attempts); a quiz with no attempts; the rating distribution fills in missing stars with zero

---

## Phase 5: Admin instructor selector

**User stories**: 40, 41, 42, 43, 45

### What to build

Admins get an instructor selector at the top of the page that sets `instructorId` in the URL. It defaults to the first instructor when the parameter is absent. The loader validates that the id references a user with the Instructor role. Everything below the selector (KPIs, table, course detail and the `courseId` ownership check) is computed exactly as that instructor would see it. For instructors, `instructorId` is ignored and they always see their own data, so editing the URL cannot expose another instructor's analytics.

### Acceptance criteria

- [ ] Admins see an instructor selector; the first instructor is selected by default
- [ ] `instructorId` is kept in the URL and combines with `range` and `courseId`
- [ ] An `instructorId` that isn't an Instructor is rejected
- [ ] The admin view matches what the selected instructor sees
- [ ] An instructor who sets `instructorId` (or another instructor's `courseId`) cannot see another instructor's data
- [ ] Verified manually via the dev user switcher for Student, Instructor and Admin
