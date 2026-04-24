# Solution Documentation

## Part 1: Performance Issues Fixed

### Issue 1 — `GET /tasks` response time grows linearly with the number of tasks

**Problem Identified:**
`TasksService.findAll` in `src/tasks/tasks.service.ts` had four compounding problems:

1. **N+1 queries.** After `prisma.task.findMany()` returned every row, the handler iterated each task and issued three extra queries per row (`user.findUnique` for the assignee, `project.findUnique`, and `tag.findMany`). For N tasks this is `1 + 3N` round-trips — 301 queries for 100 tasks, 1501 for 500.
2. **No pagination.** The endpoint returned every row on every request, so payload size, JSON serialization and network time all scaled with the table.
3. **Filtering in application memory.** `status`, `priority`, `assigneeId`, `projectId` and the `dueDate` range were applied with `Array.filter` *after* loading the full table, so PostgreSQL kept returning rows that were immediately discarded.
4. **No indexes on filter columns.** The `Task` model had no indexes on the fields used for filtering, so even after pushing predicates to SQL the planner would fall back to sequential scans as the table grew.

**Solution Implemented:**

- Rewrote `findAll` to build a single `Prisma.TaskWhereInput` from the filter DTO (including a `gte`/`lte` range on `dueDate`), load all relations in one query via `include: { assignee, project, tags }`, and paginate with `skip` / `take` plus a deterministic `orderBy: { createdAt: 'desc' }`. The page query and `task.count` run inside a single `$transaction` for a consistent snapshot, and the response is `{ data, meta: { total, page, perPage } }` (the envelope is shared with `/activities` via `paginated()` in `src/common/dto/paginated.ts`).
- Added `page` (default `1`) and `perPage` (default `20`, max `100`) to a shared `PaginationQueryDto` that `TaskFilterDto` and `ActivityFilterDto` extend. Validated with `class-validator` and coerced from query strings via `@Type(() => Number)` (the app already enables `ValidationPipe({ transform: true })`).
- Added five `@@index` entries to the `Task` model in `prisma/schema.prisma` — `status`, `priority`, `assigneeId`, `projectId`, `dueDate` — and applied them via a new migration (`prisma/migrations/20260422183915_add_task_indexes`).

**Performance Impact:**

- Query count per request drops from `1 + 3N` to `2` (page + count). For N = 500 that is ~750× fewer round-trips.
- Payload and per-request work are now bounded by `pageSize`, not by total table size — response time no longer grows with the number of rows.
- Filter predicates run in PostgreSQL using indexes, turning sequential scans into index scans on the hot filter columns. This also directly addresses the "Search Performance" report (issue 4) and a large share of the "Database Load" report (issue 2).

### Issue 2 — Task Assignment Delays (synchronous email)

**Problem Identified:**
`TasksService.create` and `TasksService.update` `await`ed `emailService.sendTaskAssignmentNotification(...)` inline. The mocked mailer sleeps 2s on purpose (`src/email/email.service.ts:9`), which blocked the HTTP response by the full delay on every create/update with an assignee — matching the "creating or updating tasks with assignees takes longer than expected" report and the README note "The email service is mocked — just ensure it's called asynchronously".

**Solution Implemented:**
Introduced a private `notifyAssignee` helper that dispatches the email as fire-and-forget (no `await`) with a `.catch()` that logs the failure. The notification runs after the `prisma.$transaction` commits, so it can never prevent the response from returning or roll the task write back.

**Performance Impact:**
Create and update responses return as soon as the DB write commits — the mailer's 2s simulated delay is no longer on the critical path. Mailer failures are logged instead of propagating as HTTP errors.

## Part 2: Activity Log Feature

### Implementation Approach

- New `ActivitiesModule` (`src/activities/`) with `ActivitiesService` (reads), `ActivitiesController` (`GET /activities`), and `ActivityListener` (writes).
- `GET /tasks/:id/activities` lives on `TasksController` and delegates to `ActivitiesService.findByTask` via `TasksService.findActivities`, so the task-existence check (`findOne`) runs first and returns 404 for unknown tasks instead of an empty page.
- **Writes are driven by domain events**, not inline coupling. `TasksService` opens a `prisma.$transaction`, performs the task mutation, then emits `task.created` / `task.updated` via `@nestjs/event-emitter` (`EventEmitter2.emitAsync`). The transaction client (`tx`) is included in the payload so the listener's `activity.create` writes in the **same** transaction as the task mutation — atomicity preserved, coupling removed. Event handlers are registered with `{ suppressErrors: false }` so that if the listener throws, `emitAsync` rejects and the whole transaction rolls back. **There's no `task.deleted` event**: the schema cascades, so emitting a DELETED activity would be wiped by the same transaction (see schema section).
- `ActivityListener` (`src/activities/activity.listener.ts`) owns all activity-writing logic. It consumes the two events and uses the pure helpers in `activity-diff.ts`:
  - `buildCreatedChanges(task, tagIds)` for `CREATED`.
  - `diffTask(before, dto, tagIdsBefore, tagIdsAfter)` for `UPDATED`, with tag adds/removes folded into the same payload as `{ tags: { added, removed } }` — one activity per mutation, not one per tag. Empty diffs are skipped so the log stays noise-free.
- **Why events over explicit calls:** `TasksService` doesn't know `Activity` exists. New listeners (notifications, webhooks, cache invalidation) can plug into the same events without touching task logic. **Why not Prisma `$extends`:** we considered it, but extensions can't easily share the caller's transaction client or pull the request-scoped `userId` out of CLS, and updates would need a duplicate pre-fetch to compute the diff.

### Database Schema Design

```prisma
model Activity {
  id        String         @id @default(uuid())
  taskId    String
  task      Task           @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    String
  user      User           @relation(fields: [userId], references: [id])
  action    ActivityAction
  changes   Json
  taskTitle String
  createdAt DateTime       @default(now())

  @@index([taskId, createdAt])
  @@index([userId, createdAt])
  @@index([action])
  @@index([createdAt])
}

enum ActivityAction { CREATED UPDATED DELETED }
```

Rationale for the key decisions:

- **`changes Json`** keeps the schema flexible for arbitrary field diffs without a column-per-field explosion, and matches the shape in the task spec (`{ field: { old, new } }`).
- **`taskTitle` denormalized** avoids a join when rendering a timeline for a task that was subsequently renamed — the activity shows the title at the moment the event happened.
- **`onDelete: Cascade`, `taskId` non-nullable.** When a task is deleted, its activities go with it. `Restrict` would make any task with history undeletable, and `SetNull` would orphan activities pointing at non-existent tasks. Cascade is the direct consequence of treating activities as part of the task's own state. Because a `DELETED` activity would be cascaded out by its own emitting transaction, we simply don't emit one — there's no `task.deleted` event and no `DELETED` activity row is ever written by the current code path (the enum value stays in the schema for forward compatibility).
- **Composite indexes `(taskId, createdAt)` and `(userId, createdAt)`** match the two dominant access patterns (task timeline, user timeline) and let Postgres answer `ORDER BY createdAt DESC LIMIT N` from the index without a sort step. Standalone indexes on `action` and `createdAt` back the `GET /activities` filter combinations.

Applied via two migrations: `20260422194905_add_activity_log` (initial model) and `20260423_activity_cascade` (switched FK from `SetNull`-nullable to `Cascade`-required after deciding audit preservation across deletions wasn't a product requirement).

### API Design Decisions

- **Authentication** — all task mutation endpoints require an `X-User-Id` header. Split into two responsibilities: the `ClsModule` middleware (AsyncLocalStorage via `nestjs-cls`, configured in `AppModule`) extracts and validates the header once per request and stashes the userId in the per-request store; `UserRequiredGuard` (applied with `@UseGuards` on `POST`/`PUT`/`DELETE` only) rejects unauthenticated requests with `401` *before* any DB work. `TasksService` reads the userId from CLS via a private `currentUserId()` helper when it needs it (create/update). Controllers stay clean — no `@CurrentUser()` plumbing through method signatures. No full auth stack was in scope for this assignment, so the header stands in for an authenticated principal and the FK on `Activity.userId` relies on PostgreSQL to reject unknown IDs.
- **Unified pagination envelope** — every list endpoint (`GET /tasks`, `GET /activities`, `GET /tasks/:id/activities`) returns `{ data: [...], meta: { total, page, perPage } }` per the spec example, built by `paginated()` in `src/common/dto/paginated.ts`. Activity `action` is serialized lowercase (`"created" | "updated"`) and `userName` is included via `include: { user: { select: { id, name } } }` so clients don't need a second round trip.
- **Filters on `GET /activities`**: `userId`, `action`, `dateFrom`, `dateTo`. All optional, all validated via `class-validator`, all pushed into `Prisma.ActivityWhereInput` — nothing is filtered in memory.
- **Global Prisma exception filter** — `PrismaExceptionFilter` (wired as `APP_FILTER`) maps `PrismaClientKnownRequestError` codes to proper HTTP statuses: `P2002` → 409 (unique violation), `P2003` → 400 (FK violation), `P2025` → 404 (record not found). Unknown codes are logged and return 500. Without this, an unknown `X-User-Id` would crash as an unhandled 500 instead of a readable 400.

### Performance Considerations

- Every list endpoint is paginated and filtered in SQL; no activity reads ever materialize full history in memory.
- Activity inserts are a single `INSERT` piggybacked on the existing mutation's transaction — one extra round-trip on the hot path.
- Indexes chosen deliberately for the access patterns described above, not speculative combinations.
- `Activity.changes` as `Json` avoids per-field schema churn. If analytics ever needs to query specific change fields, a generated column or materialized projection can be layered on later.

### Trade-offs and Assumptions

- **Cascade on task deletion erases the task's activity history.** That's the product decision: activities describe a task's lifecycle, and when the task is gone they go with it. Clean reads, clean cleanup, no orphan rows. If audit preservation across deletions ever becomes a requirement, the right answer is soft-delete on `Task` (mark `deletedAt`, filter reads, never physically delete) — not reverting the FK.
- **`changes` as JSON** is easy to write and read but hard to query by field — a deliberate trade-off given the primary use case is audit display, not analytics.
- **Tag adds/removes are embedded in the `UPDATED` activity**'s `changes.tags` instead of being separate rows. This keeps the timeline readable (one mutation → one row) and matches the semantic the spec asks for ("field updates… tag additions/removals" as *part of* tracking, not as a separate action type).
- **No user-existence validation at request time** — the FK on `Activity.userId` surfaces unknown IDs as a DB error, which the Prisma exception filter maps to 400. Validating presence per request would add a lookup on every mutation; an auth layer would handle it more cleanly.
- **`X-User-Id` header** is a stand-in for a proper authenticated principal and is trivially spoofable. Acceptable for this assignment; unacceptable for production.

### Collateral fix discovered during testing — Redis cache client leak

While running the e2e suite I found that Jest could not exit on its own. `@nestjs/cache-manager@2.3.0` does not close the underlying Redis client in `onModuleDestroy`, and `pingInterval: 5000` in `redisStore(...)` registers a timer that keeps the Node event loop alive indefinitely after `app.close()`. I added `CacheShutdownService` (`src/common/cache-shutdown.service.ts`) as a provider in `AppModule` that reads `CACHE_MANAGER` and calls `client.disconnect()` / `client.quit()` on `onModuleDestroy`. The e2e suite now exits in ~3s with no `--forceExit` and no open-handle warnings. This also makes production shutdowns (`SIGTERM` in containers, with `app.enableShutdownHooks()`) release the Redis connection gracefully.

## Tests

Layout (tests separated from source):

```
test/
  jest.unit.json        ← config for `npm test`
  jest.e2e.json         ← config for `npm run test:e2e`
  unit/                 ← fast, no DB (10 suites / 69 tests)
    activities/
    common/
    tasks/
  e2e/                  ← full stack against Postgres + Redis + Mailpit (5 suites / 35 tests)
    tasks.e2e-spec.ts
    activities.e2e-spec.ts
    users.e2e-spec.ts
    projects.e2e-spec.ts
    email.e2e-spec.ts
```

- **Unit** — `TasksService` (all branches, including CLS guard invariant and fire-and-forget email with both Error and string rejection paths), `TasksRepository` (all build helpers, connect/disconnect branches), `ActivitiesService` (filter variants, skip/take math), `ActivityListener` (tag changes, date coercion, empty-diff skip), `PrismaExceptionFilter` (all mapped codes + unknown fallback), `UserRequiredGuard`, and pure mappers/helpers. All focused production code is at 100% or very near.
- **E2E** — boots the real `AppModule` against the local Postgres/Redis. Covers the paginated envelope and filter combinations on `GET /tasks` and `GET /activities`, auth on mutations (missing and malformed header → 401), validation (invalid enum/UUID/date → 400), the full create→update→delete flow with activity assertions (including cascade proof — after the task is deleted, `prisma.activity.count({ where: { taskId } })` is `0`), and the **transaction rollback test** that stubs the listener to throw and verifies the task was never persisted (proving the `emitAsync` atomicity claim is empirically true — this is what caught that `@nestjs/event-emitter` defaults `suppressErrors: true` and would silently commit the task without the activity).

Run with `npm test` (unit) and `npm run test:e2e` (integration — requires the Docker stack up and `npm run seed` first).

## Extra — Real email delivery via Mailpit

The original `EmailService` was a console-logging stub with a hard-coded 2s `setTimeout` simulating "SMTP latency". Replaced with a real SMTP loop backed by **Mailpit** (modern successor to MailHog) running in `docker-compose`. The fire-and-forget pattern from Part 1 is preserved — the user-visible change is only that emails now actually exist and are inspectable.

- **`docker-compose.yml`** — added the `mailpit` service exposing `1025` (SMTP in) and `8025` (Web UI + HTTP API). Configured with `MP_SMTP_AUTH_ACCEPT_ANY=1` so dev flow needs no auth setup.
- **`src/email/email.service.ts`** — rewritten around `nodemailer`. Single `Transporter` instance created in `onModuleInit` (reading `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` from `ConfigService`), closed in `onModuleDestroy`. The `sendEmail` / `sendTaskAssignmentNotification` signatures didn't change — `TasksService` required zero edits.
- **`env.validation.ts`** — three new required vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`). Joi's `.email()` rule uses `tlds: { allow: false }` so the dev default `noreply@taskapp.local` is accepted (strict TLD validation would reject `.local`).
- **Web UI** at http://localhost:8025 — every email the app sends is immediately visible with full subject / body / headers. Useful for manual QA of assignment flows.
- **New e2e suite** — `test/e2e/email.e2e-spec.ts` talks directly to Mailpit's HTTP API (`GET /api/v1/messages`, `DELETE /api/v1/messages`) to assert the full loop end-to-end:
  - Creating a task with an assignee delivers one email with the assignee's address in `To` and a subject containing "assigned".
  - Creating without an assignee delivers **zero** emails (proves the `if (task.assignee)` guard works).
  - Updating the assignee delivers an email to the new assignee.
- **Production path** — swap `SMTP_HOST`/`SMTP_PORT` to a real relay (Mailgun, SES, Postmark) via env vars; no code changes required. A proper queue (BullMQ on the existing Redis) remains listed under Future Improvements for retries/dead-lettering — that's orthogonal to the transport choice.

## Extra — OpenAPI / Swagger documentation

Not required by the assignment, but cheap to add given NestJS first-class support: `@nestjs/swagger` wired in `main.ts` serves an interactive UI at `GET /docs` and the raw OpenAPI spec at `GET /docs-json` once `npm run start:dev` is running.

- Controllers carry `@ApiTags('tasks' | 'activities' | ...)` so the UI groups endpoints sensibly.
- Mutation routes carry `@ApiSecurity('user-id')` paired with `addApiKey({ type: 'apiKey', name: 'X-User-Id', in: 'header' }, 'user-id')` in the `DocumentBuilder`, so the UI exposes an **Authorize** button that injects the header — try-it-out works end-to-end for `POST` / `PUT` / `DELETE`.
- `CreateTaskDto` decorated with `@ApiProperty` / `@ApiPropertyOptional` (enum, format, defaults). `UpdateTaskDto` uses `PartialType(CreateTaskDto)` from `@nestjs/swagger` so it inherits decorators without duplication.
- `PaginationQueryDto` contributes `page` / `perPage` to every list endpoint automatically via DTO inheritance.
- `app.enableShutdownHooks()` was added in `main.ts` in the same pass, so `SIGTERM` in containers triggers `onModuleDestroy` cleanly (complements the `CacheShutdownService`).

## Future Improvements

- Add composite indexes on `Task` if traffic shows combined filters dominating (e.g. `@@index([projectId, status])`).
- Consider cursor-based pagination for very large activity timelines where deep `OFFSET` becomes expensive.
- Cache hot `GET /tasks` pages in Redis (the dependency is already present) keyed by the normalized filter + page tuple, with invalidation on task mutations.
- Audit `GET /projects` and `GET /users` for the same N+1 / pagination / index issues.
- Move mailer dispatch onto a proper queue (BullMQ on the existing Redis) for retries, dead-lettering, and observability — the current fire-and-forget is fast but silently drops failures after logging them.
- Replace the `X-User-Id` header with real authentication (JWT or session) and drop the manual UUID validation in the CLS middleware.
