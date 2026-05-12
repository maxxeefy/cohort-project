# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cadence" — a full-stack course platform (mini Udemy) built with React Router v7 (SSR, framework mode), TypeScript, SQLite (better-sqlite3) + Drizzle ORM, Tailwind CSS 4 + shadcn/ui, Vitest. Used as the playground codebase for an AI-assisted development cohort. Package manager is npm (`package-lock.json`); don't use pnpm/yarn.

Lesson navigation (cohort tooling): `npm run reset <commit>` / `npm run cherry-pick <commit>` (via `ai-hero-cli`).

A project skill in `.claude/skills/` handles `better-sqlite3` native module version mismatches (`npm rebuild better-sqlite3`).

## Architecture

- **Routes** are registered explicitly in `app/routes.ts` (not file-based discovery) — adding a route file requires adding it there. Most pages are nested under the `routes/layout.app.tsx` layout (sidebar, user switcher, dev UI); `login`, `signup`, and `api/*` routes are outside it. Route type imports come from generated `./+types/<route-name>` files.
- **Route modules** do data access in `loader`/`action` by calling service functions directly (no separate API layer). Multi-action forms use a hidden `intent` field validated with a Zod `discriminatedUnion("intent", ...)`; use `parseFormData` / param helpers from `app/lib/validation.ts`. Errors are thrown as `data(message, { status })`.
- **Services** (`app/services/*Service.ts`) contain all DB logic, are synchronous (better-sqlite3), and import the singleton `db` from `~/db`. Convention: service functions take **positional parameters**, not option objects.
- **Schema**: `app/db/schema.ts` defines all tables plus TS enums (`UserRole`, `CourseStatus`, `LessonProgressStatus`, `QuestionType`, `TeamMemberRole`). Domain: courses → modules → lessons (+ quizzes), enrollments, lesson progress, purchases, teams, coupons, video watch events.
- **Auth** is dev-style: a cookie session (`app/lib/session.ts`) stores `userId`; users are switched via `api/switch-user`. Authorization is done inline in each loader/action by checking `user.role` (Instructor/Admin) and course ownership (`course.instructorId`).
- **Pricing/PPP**: `app/lib/ppp.ts` maps countries to purchasing-power tiers; `app/lib/country.server.ts` resolves country from a dev session override → `CF-IPCountry` header → ip-api.com. `*.server.ts` files are server-only.
- Path alias `~/*` → `app/*`.

## Testing

Tests live next to services (`*.test.ts`). Each test file mocks `~/db` with a getter pointing to a fresh in-memory DB built by `createTestDb()` from `app/test/setup.ts` (runs the real Drizzle migrations), and `seedBaseData()` inserts a student, instructor, category, and published course:

```ts
let testDb: ReturnType<typeof createTestDb>;
vi.mock("~/db", () => ({ get db() { return testDb; } }));
beforeEach(() => { testDb = createTestDb(); base = seedBaseData(testDb); });
```

Because tests use the migrations, schema changes must have a generated migration (`npm run db:generate`) before tests will see them.

## Sandcastle

`.sandcastle/` runs Claude Code autonomously in Docker (`@ai-hero/sandcastle`): `main.ts <prd> <plan>` loops through a PRD's multi-phase plan using `prompt.md`. Requires `.sandcastle/.env` (see `.env.example`).

## Coding standards

All coding standards for this project live in the `coding-standards` skill at `.claude/skills/coding-standards/`.

**Load that skill** before writing code, reviewing changes, or answering questions about conventions.
