# Routes & forms

## React Router v7

Routes live in `app/routes/` but are registered explicitly in `app/routes.ts` (not file-based discovery) — a new route file does nothing until it's added there. Each file may export `loader`, `action`, `default` (component), `meta`, and `ErrorBoundary`.

Don't put business logic directly in routes — call into services.

## Form / param validation

Use these helpers from `~/lib/validation`:

- `parseFormData(formData, zodSchema)` — for route `action` form submissions. Returns `{ success: true, data } | { success: false, errors }`.
- `parseJsonBody(request, zodSchema)` — for JSON request bodies. Same result shape as `parseFormData`.
- `parseParams(params, zodSchema)` — for route params. Returns the parsed data directly and throws a 400 on failure.

## Multiple intents in one action

When a route action handles multiple submissions (e.g. "mark complete" and "delete comment" buttons on the same page), use a Zod discriminated union on an `intent` field:

```ts
const schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("mark-complete") }),
  z.object({
    intent: z.literal("delete-comment"),
    commentId: z.coerce.number(),
  }),
]);
```

## Auth

Cookie-based via `~/lib/session`. In loaders and actions, use `getCurrentUserId(request)` — returns `number | null`. Redirect to `/login` if `null`.
