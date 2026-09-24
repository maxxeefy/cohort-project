This is a full-stack course platform (think a mini Udemy) built with React Router, TypeScript, SQLite, and Drizzle ORM. Throughout the cohort, you'll use Claude Code to explore, extend, and refactor this codebase — learning real engineering workflows for AI-assisted development along the way.

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9+ (enabled via `corepack enable`)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- A Claude Pro or Max subscription

## Getting Started

```bash
# Install dependencies
pnpm install

# Run database migrations and seed data
pnpm db:migrate
pnpm db:seed

# Start the dev server
pnpm dev
```

The app will be running at `http://localhost:5173`.

## Scripts

| Command                     | Description                            |
| --------------------------- | -------------------------------------- |
| `pnpm dev`                  | Start the development server           |
| `pnpm build`                | Build for production                   |
| `pnpm test`                 | Run tests with Vitest                  |
| `pnpm test:watch`           | Run tests in watch mode                |
| `pnpm typecheck`            | Type-check the project                 |
| `pnpm db:migrate`           | Run database migrations                |
| `pnpm db:seed`              | Seed the database                      |
| `pnpm reset <commit>`       | Reset your repo to a lesson checkpoint |
| `pnpm cherry-pick <commit>` | Cherry-pick a lesson's solution        |

## Course Structure

The cohort is split across 6 days of content:

1. **Before We Start** — Repo setup, playground walkthrough, model recommendations
2. **Getting to Know Claude Code** — Sessions, prompting, IDE integration, permissions
3. **Day 1: Fundamentals** — LLM constraints, subagents, codebase exploration, building features
4. **Day 2: Steering** — Agent files (CLAUDE.md), skills, memory, custom workflows
5. **Day 3: Planning** — Writing PRDs, multi-phase plans, tracer bullet development
6. **Day 4: Feedback Loops** — Test-driven development, red-green-refactor with AI
7. **Day 5: Ralph** — Agent automation, loops, background tasks
8. **Day 6: Human in the Loop** — Kanban workflows, research, prototyping, architecture improvement

## Navigating Lessons

Each lesson that involves code has a starting commit and solution commits. To jump to any point:

```bash
# Reset to a lesson's starting point
pnpm reset 03.04.01

# Example: reset to the start of "Build a Feature"
pnpm reset main

# Cherry-pick a solution if you want to skip ahead
pnpm cherry-pick 03.04.01
```

## Tech Stack

- **Framework:** [React Router](https://reactrouter.com/) v7 with SSR
- **Language:** TypeScript 5.9
- **Database:** SQLite via [Drizzle ORM](https://orm.drizzle.team/)
- **Styling:** Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com/)
- **Testing:** [Vitest](https://vitest.dev/)
- **Build:** [Vite](https://vite.dev/) 7
- **Real-time:** [Ably](https://ably.com/) for live presence
