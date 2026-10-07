# PRD: Instructor Analytics Dashboard

## Problem Statement

Instructors on Cadence have no visibility into how their courses are performing. The instructor area only lists their courses ("My Courses") and lets them edit content and view a student roster. An instructor cannot answer basic questions such as "How much money have my courses made this month?", "What share of students actually finish my course?", "Where in the course do students give up?", "Are my quizzes too hard?" or "How do students rate my course?" without asking an admin or querying the database. Admins have the same blind spot when supporting a specific instructor.

## Solution

A single Analytics page in the instructor area, reachable from the sidebar by Instructors and Admins.

- At the top, a period selector (7 days / 30 days / 90 days / All time) and two KPI tiles: **Revenue** for the selected period and **Average rating** across all of the instructor's courses.
- Below, a **course table** comparing all of the instructor's published and archived courses: revenue for the period, number of students, completion rate, rating, and median time to complete.
- Clicking a course row expands a **course detail block** beneath it with three sections:
  1. **Lesson drop-off**: a bar per lesson, in course order and grouped by module, showing the share of enrolled students who completed that lesson. The three biggest drops are highlighted.
  2. **Quizzes**: for each quiz, the share of attempting students who ever passed, the average best score, and the average number of attempts.
  3. **Ratings**: the distribution of 1–5 star ratings.
- Admins see an instructor selector and get exactly the view that instructor would see.

Every percentage is shown with its absolute numbers (e.g. "12% (3 of 25)") so small samples aren't misleading. Metrics other than revenue are all-time, and the page labels them that way.

## User Stories

1. As an instructor, I want an "Analytics" item in the sidebar, so that I can reach my course analytics in one click.
2. As an instructor, I want the analytics page to include only my own courses, so that I see numbers relevant to me.
3. As an instructor, I want my published and archived courses included, so that historical earnings from retired courses still count.
4. As an instructor, I want draft courses excluded, so that the table isn't cluttered with courses that have no students.
5. As an instructor, I want to see total revenue as a single KPI number, so that I know how much my courses earned at a glance.
6. As an instructor, I want to pick a period of 7 days, 30 days, 90 days or all time for revenue, so that I can track recent sales performance.
7. As an instructor, I want the selected period kept in the URL, so that I can bookmark or share a specific view and the browser back button works.
8. As an instructor, I want revenue shown in dollars formatted the same way as prices elsewhere in the app, so that the numbers are familiar.
9. As an instructor, I want team (bulk) purchases counted in revenue at their full paid amount on the purchase date, so that revenue reflects real money received.
10. As an instructor, I want PPP-discounted purchases counted at the amount actually paid, so that revenue is accurate.
11. As an instructor, I want to see my average rating across all courses as a KPI, weighted by the number of ratings, so that I understand my overall reputation.
12. As an instructor, I want metrics other than revenue clearly labeled as all-time, so that I don't think the period selector applies to them.
13. As an instructor, I want a table with one row per course, so that I can compare my courses side by side.
14. As an instructor, I want the table sorted by revenue in the selected period, highest first, so that my best sellers come first.
15. As an instructor, I want to see each course's status (Published / Archived) in the table, so that I know which courses are still live.
16. As an instructor, I want to see each course's revenue for the selected period, so that I know which courses drive income.
17. As an instructor, I want to see the number of enrolled students per course, so that I understand the course's reach.
18. As an instructor, I want each course's completion rate (students who completed the course divided by all enrolled students), so that I know how many students finish.
19. As an instructor, I want completion rate shown alongside absolute counts, so that I can judge whether the percentage is meaningful.
20. As an instructor, I want each course's average rating and number of ratings, so that I know how students feel about it.
21. As an instructor, I want the median time from enrollment to completion in days, so that I understand how long the course realistically takes.
22. As an instructor, I want a dash shown when a course has no completions or no ratings, so that missing data isn't mistaken for zero.
23. As an instructor, I want to click a course row to expand its detailed analytics beneath it, so that I can drill in without leaving the page.
24. As an instructor, I want the expanded course kept in the URL, so that I can link straight to a course's details.
25. As an instructor, I want clicking the expanded row again to collapse it, so that I can return to the overview.
26. As an instructor, I want a lesson drop-off chart listing every lesson in course order, grouped by module, so that I can see the student journey through the course.
27. As an instructor, I want each lesson bar to show the percentage and count of enrolled students who completed that lesson, so that I see how far students get.
28. As an instructor, I want the three lessons with the biggest drop from the previous lesson highlighted, so that I immediately know which lessons to improve.
29. As an instructor, I want only completed lessons to count toward drop-off, so that students who merely opened a lesson don't inflate the numbers.
30. As an instructor, I want a quiz table listing each quiz with its lesson, so that I can see how students do on assessments.
31. As an instructor, I want each quiz's pass rate defined as the share of attempting students who passed at least once, so that retries don't distort the picture.
32. As an instructor, I want the average best score per student for each quiz, so that I know how well students eventually perform.
33. As an instructor, I want the average number of attempts per student for each quiz, so that I can spot quizzes that are too hard or confusing.
34. As an instructor, I want quizzes with no attempts shown with dashes, so that I know they haven't been taken yet.
35. As an instructor, I want a 1–5 star rating distribution for the course, so that I understand whether the average hides polarized opinions.
36. As an instructor with no courses, I want an empty state with a link to create a course, so that I know what to do next.
37. As an instructor with a course that has no students, I want the course to show zeros and dashes rather than errors, so that the page always renders.
38. As an instructor, I want charts rendered without heavy client-side libraries, so that the page loads fast.
39. As an admin, I want an "Analytics" item in the sidebar, so that I can access instructor analytics.
40. As an admin, I want to choose an instructor from a selector, so that I can see that instructor's analytics when supporting them.
41. As an admin, I want the first instructor selected by default, so that the page shows data right away.
42. As an admin, I want the selected instructor kept in the URL, so that I can share or bookmark a specific instructor's view.
43. As an admin, I want to see exactly what the instructor sees, so that we talk about the same numbers.
44. As a student, I want to be blocked from the analytics page, so that instructor business data stays private.
45. As an instructor, I want to be unable to view another instructor's analytics, even by editing URL parameters, so that my data stays private.
46. As an unauthenticated visitor, I want a clear message that I need to select a user, consistent with other protected pages.

## Implementation Decisions

- **No schema changes.** All metrics come from existing tables: purchases (price paid in cents, country, created date), enrollments (enrolled and completed dates), lesson progress (status per user per lesson), quizzes and quiz attempts (score, passed, attempted date), course ratings, modules, lessons and courses. No migrations needed.
- **New analytics service module** containing all aggregation logic. It is synchronous like other services and uses the shared database singleton. Proposed functions:
  - Revenue for a set of courses since an optional start date. Returns the total and a per-course breakdown, in cents.
  - Course summary metrics for a set of courses: student count, completed count, completion rate, average rating, rating count, median days to complete.
  - Average rating across a set of courses, weighted by the number of ratings.
  - Lesson drop-off for one course: an ordered list of lessons with module info, completed count, enrolled count, percentage, and drop from the previous lesson. Also flags the top 3 drops.
  - Quiz stats for one course: per quiz, the number of students who attempted, the number who passed at least once, the average best score, and the average attempts per student.
  - Rating distribution for one course: counts for stars 1–5, with zeros filled in.
  - Service functions follow the project parameter convention: positional parameters, except when two or more parameters share a type, in which case a single object parameter is used.
- **Course set selection** reuses the existing "courses by instructor" lookup, filtered to Published and Archived status.
- **Period handling:** the `range` query parameter accepts `7d`, `30d`, `90d` or `all` (default `30d`). Invalid values are rejected through the existing validation helpers. The range becomes a start date for the revenue query only.
- **Course detail selection:** the `courseId` query parameter selects the expanded course. The loader computes the drop-off, quiz and rating distribution data only for that course. A `courseId` that isn't in the current instructor's course set is rejected (404).
- **Admin instructor selection:** the `instructorId` query parameter is honored only for admins and must reference a user with the Instructor role. It defaults to the first instructor. Instructors cannot use it and always see themselves.
- **Authorization** is done inline in the loader, consistent with the existing instructor pages. Missing user → 401. Role other than Instructor/Admin → 403.
- **Definitions:**
  - Revenue: sum of the amount actually paid per purchase, on the purchase date. Team purchases count in full.
  - Completion rate: enrollments with a completion date divided by all enrollments for the course.
  - Lesson reached: the student has a lesson-progress row with status Completed for that lesson. The denominator is all students enrolled in the course.
  - Lesson order: module position, then lesson position.
  - Drop: the previous lesson's completion percentage minus the current one's. The first lesson is compared against 100%.
  - Median time to complete: median of whole days between enrollment and completion, over completed enrollments only.
- **New route** for the analytics page, registered in the explicit route config and nested under the app layout. It's a read-only page with a loader only and no actions.
- **Sidebar:** add an "Analytics" item visible to the Instructor and Admin roles.
- **Charts** are built with plain CSS/SVG (horizontal bars). No charting dependency is added. Existing shadcn primitives (card, select, skeleton) are used for layout.
- **Formatting:** money uses the existing price formatter. Percentages are shown with "n of N". Missing values are shown as an em dash.

## Testing Decisions

- Good tests check the observable output of service functions against a known seeded database, not internal query structure.
- The analytics service gets a colocated test file using the project's standard pattern: mock the database module with a fresh in-memory test DB built from the real migrations, then seed the base data.
- Cases to cover:
  - Revenue respects the period start date.
  - Revenue includes team purchases and excludes other instructors' courses.
  - Completion rate and the median are correct for mixed completed and incomplete enrollments.
  - A course with no enrollments returns zeros or nulls, not NaN.
  - Drop-off is ordered by module and lesson position and counts only Completed progress.
  - The top-3 drop flags are correct.
  - Quiz stats with multiple attempts per student: passed-at-least-once, best score and average attempts.
  - The rating distribution fills in missing stars with zero.
  - The weighted average rating across courses.
- Prior art: existing service tests such as those for the progress, rating and purchase services.
- The route loader's authorization and parameter handling are verified manually through the dev user switcher, consistent with how other routes are handled today.

## Out of Scope

- Sales counts, enrollment counts over time, and revenue time-series charts.
- Applying the period selector to non-revenue metrics, e.g. cohort-based completion.
- In-lesson video drop-off from video watch events.
- Activity metrics (comments, recently active students) and bookmark popularity.
- View → purchase conversion (needs page-view tracking that doesn't exist).
- A global admin view aggregating all courses across all instructors.
- Revenue breakdown by country or PPP tier.
- Interactive table sorting, CSV export and minimum sample-size thresholds.
- Analytics for draft courses.

## Further Notes

- All prices are stored in cents. Aggregations must stay in integer cents until formatting.
- With seed data, many courses will have few students, so showing absolute counts next to every percentage is a deliberate choice instead of hiding small samples.
- Later iterations could add a revenue time-series chart, period-scoped cohort metrics and in-video drop-off without schema changes. Conversion tracking would need a new table.
