# API Contract — FROZEN

Do not edit after Phase 0 merge without sign-off from Dev A, Dev B, and Dev C.

All responses use the `ApiResponse<T>` shape from [`types.ts`](./types.ts):
`{ data?: T; error?: string }`.

Unless noted otherwise, every endpoint requires a valid Clerk session
(`Authorization` handled via Clerk middleware). An unauthenticated request to
any endpoint below returns `401` with `error: "Unauthorized."`.

---

## `GET /api/ideas`

- **Auth:** any authenticated user
- **Request body:** none
- **Response:** `ApiResponse<Idea[]>`, sorted by `voteCount` descending
- **Errors:** none beyond the global 401

## `POST /api/ideas`

- **Auth:** any authenticated user
- **Request body:** `{ text: string }`
- **Response:** `ApiResponse<Idea>` — the created idea
- **Errors (400):**
  - Empty text → `"Idea text cannot be empty."`
  - Text over 200 characters → `"Idea text must be 200 characters or fewer."`

## `POST /api/ideas/:id/vote`

- **Auth:** any authenticated user
- **Request body:** none
- **Response:** `ApiResponse<Idea>` — the updated idea
- **Errors:**
  - Idea does not exist (404) → `"Idea not found."`
  - Voting on your own idea (400) → `"You cannot vote on your own idea."`
  - Voting twice on the same idea (400) → `"You have already voted on this idea."`

## `POST /api/ideas/:id/done`

- **Auth:** admin only
- **Request body:** none
- **Response:** `ApiResponse<Idea>` — the updated idea
- **Errors:**
  - Idea does not exist (404) → `"Idea not found."`
  - Caller is not an admin (403) → `"Only admins can perform this action."`

## `GET /api/health`

- **Auth:** none
- **Request body:** none
- **Response:** `{ ok: true }` (not wrapped in `ApiResponse`)
- **Errors:** none
