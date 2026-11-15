# Runtime implementation status

Date: 2026-11-15
Branch: source-import/v0.1.2
Status: CORE PROTOTYPE IMPLEMENTED; CLOUD/PRODUCTION RUNTIME NOT IMPLEMENTED

## Implemented

- Single-process JSON runtime with explicit single-process-only safety boundary.
- Task enqueue, idempotency, priority ordering and durable local state.
- 256-bit per-claim lease tokens, constant-time token comparison and stale-claim rejection.
- Orchestrator propagates the claim token into handler context.
- Bounded exponential retry scheduling with full jitter, configurable base/cap, and availability-time filtering.
- Lease expiry invalidates the old token, records expiry, schedules a jittered retry, or dead-letters at attempt exhaustion.
- Runtime tests cover restart persistence, idempotency, handler execution, retry exhaustion, lease recovery delay, worker ownership, priority, stale-token fencing, missing tokens, exponential cap and jitter.
- PostgreSQL queue is applied to the dedicated project with explicit deny-all client policies and default privilege revocations for future objects; a Pool-compatible adapter (`runtime/postgres-queue.js`), PostgreSQL runtime factory, and generic graceful polling loop (`runtime/worker-loop.js`) are now committed. The adapter uses transactional enqueue plus an audit event and database functions for claim/heartbeat/complete/fail.

## Verification

- Previous CI run #43735742707 passed before the recent fencing and retry commits.
- New fencing/retry changes are committed to this branch; latest CI result must be independently confirmed before claiming PASS.
- PostgreSQL migration is applied to the dedicated Supabase project `vpuuotssufznyjgtubuz` (Postgres 17.11, ap-south-1). A rollback-scoped live SQL integration test passed claim, completion, stale-token rejection, explicit retry, expired-lease retry events, reclaim, and client privilege assertions.
- Live stale-token and privilege integration checks passed. Parallel independent-session concurrency testing remains pending.

## Critical limitations

- JSON state transactions are single-process only and are not safe for multiple cloud workers.
- PostgreSQL queue schema, private grants, fencing functions and targeted SQL lifecycle tests are live-verified on the dedicated Supabase project. The Node adapter has contract tests only; it has not yet been exercised through a live Node-to-Postgres connection.
- SQL retry scheduling uses database random jitter; actual database semantics and concurrency need live integration tests.
- No live DB adapter, distributed worker, cloud scheduler, worker supervisor, watchdog, monitoring, alert delivery, kill switch, agent sandbox, provider adapter, or budget enforcement.
- External side effects require provider-side idempotency and reconciliation; exactly-once effects are not guaranteed.

## Next engineering gate

1. Confirm GitHub CI for the latest commits (connector currently exposes no push-run record; status remains pending).
2. Configure protected GitHub Actions secrets and run the authenticated cloud smoke test.
3. Reconcile the returned task ID against PostgreSQL task state and audit events.
4. Run independent-session concurrency/load and worker crash/restart tests.
5. Add scheduler, worker supervisor, watchdog, alerting, kill switch and failure-injection tests.
6. Only then activate agent swarm and product-to-payment pipeline.

## Mission status

- Runtime prototype: implemented; latest CI verification pending.
- Two independent simultaneous SQL sessions claimed different tasks during a lock-hold probe, supporting `SKIP LOCKED` behavior for that test case. Broader stress/race testing remains NOT VERIFIED.
- Cloud 24x7 execution: NOT IMPLEMENTED.
- Product public release: NOT READY.
- Demand validation: NOT STARTED.
- Verified revenue: INR 0.

## Long-running task lease protection

- Orchestrator now renews leases automatically while a registered handler is executing; heartbeat interval defaults to one-third of configured lease duration.
- A runtime test was added using a 30ms lease and 75ms handler, asserting at least one heartbeat and successful completion.
- Live PostgreSQL heartbeat test initially exposed an ambiguous attempt reference in the heartbeat audit insert. The SQL was corrected to qualify t.attempts, the function was replaced in the dedicated database, and the same live transaction test then passed.
- Live heartbeat test also verified stale-token heartbeat rejection, max-attempt dead-letter transition, dead-letter event and lease-token clearing. The test transaction rolled back.
- Project-wide PostgreSQL default function privileges were restored after review found that globally revoking PUBLIC EXECUTE would have changed defaults outside the private runtime schema. Canonical migration now limits default privilege changes to the private schema and relies on revoked schema usage plus explicit function grants.

## Deployed cloud worker entrypoint

- Supabase Edge Function slug: runtime-worker; deployed ACTIVE at version 3 with verify_jwt=true.
- Worker accepts POST execution only when the verified JWT role is service_role. Ordinary authenticated users cannot consume internal queue work.
- It connects to the private revenue_runtime schema through SUPABASE_DB_URL and a one-connection Deno Postgres pool, rather than exposing the schema through the Data API.
- Only runtime.health_check is currently registered. Unknown task types are failed through the queue's normal retry/dead-letter path.
- Function source and deno.json are versioned under supabase/functions/runtime-worker in the active branch. Driver pinned to jsr:@db/postgres@0.19.5.
- Deployment is confirmed ACTIVE and source was read back from the project. No authenticated invocation has yet been executed; therefore function boot, direct DB connectivity and end-to-end queue processing remain NOT VERIFIED.
- No scheduler invokes this worker automatically yet. It is an on-demand cloud execution endpoint, not a 24x7 supervisor.

## Strict lease-expiry fencing

- All PostgreSQL heartbeat, complete and fail functions now require the lease expiry timestamp to be in the future, in addition to matching worker ID and per-claim token.
- In-memory queue applies the same expiry rule. A worker cannot revive or mutate an expired lease even if no replacement worker has claimed it yet.
- Added regression tests for expired heartbeat, completion and failure attempts.
- Live rollback-scoped PostgreSQL test confirmed expired heartbeat=false, expired completion=false and expired failure=lease_not_owned.


## 15 Nov 2026 authenticated smoke-test pathway

- Added a restricted POST mode `smoke_test` to the Edge Function. It accepts only a fixed `runtime.health_check` task and a bounded idempotency key; arbitrary task types and executable payloads are not accepted.
- Enqueue and audit-event insertion are transactional. Failed enqueue transactions attempt rollback before the connection is released.
- Deployed the updated function as version 4; deployment read-back confirms ACTIVE and `verify_jwt=true`.
- Added a manual-only GitHub Actions workflow at `.github/workflows/runtime-smoke-test.yml`. It reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only from protected repository secrets and requires a successful task result.
- Added an operator runbook at `docs/AUTHENTICATED_RUNTIME_SMOKE_TEST.md`.
- GitHub Actions CI run 94, commit `4044026307ab52218e6c6b4241532073c7202dd3`, completed SUCCESS: 62 tests passed, 0 failed; both JavaScript syntax checks passed.
- The first CI attempts exposed an incorrectly escaped whitespace regex in the SQL contract test. The test regex was corrected, then the full suite passed. Earlier failed runs are retained as evidence and not hidden.
- No authenticated invocation has yet been run. The manual workflow requires the two protected GitHub repository secrets to be configured. Database task count remains zero and no Edge invocation logs exist.
- The smoke-test workflow is manual only. It does not provide scheduling, a continuous worker supervisor or 24x7 operation.


## 15 Nov 2026 duplicate-safe smoke execution hardening

- A source audit identified that the prior smoke-test endpoint inserted idempotently but then called the generic queue claim function. On a repeated idempotency key, that could claim an unrelated queued task.
- Replaced generic queue claiming in the smoke-test path with a transactionally locked lookup by the exact idempotency key and a targeted update of that same task.
- Completed tasks now return their stored result as an idempotent replay. Running tasks return an in-progress response without starting another task. Failed/cancelled tasks return a terminal response. Expired leases for the same task are recovered with attempt-limit enforcement.
- Added contract tests for exact-key locking, targeted claim, completed/in-progress replay and expired-lease recovery.
- GitHub CI run #98, commit `3e1161820e1e19c022c660ff30731afce7c092ae`, completed SUCCESS. Run #97 failed because an older contract assertion still expected the removed generic claim call; that assertion was corrected in the next commit. The failed run is retained in history.
- Deployed the corrected Edge Function as version 5, status ACTIVE, with `verify_jwt=true`. Deployment SHA: `be45c6a301e717a8374c5ce2bb4ecedeef55dcecb247b8be6d55248d517bf25c`.
- This is a code/deployment verification only. No authenticated invocation or live duplicate replay has yet been executed. Database task count, event reconciliation and function execution remain pending.


## Authenticated smoke workflow replay assertion and release review

- Updated the manual smoke workflow to invoke the same idempotency key twice. The second response must return the original task ID and stored result with `idempotent_replay=true`; it must not create or execute another task.
- Replay assertions compare stable result fields rather than serialized JSON text because PostgreSQL JSONB does not promise object-key order.
- Updated the operator runbook to describe the two-call proof.
- Opened draft PR #1 against `main` for review; it is intentionally not merged. The PR contains the runtime source import and related runtime implementation files, 22 changed files / 89 commits in the branch history. Review the full diff before merge.
- PR link: https://github.com/manish91082-coder/daily1000-autonomous-revenue-engine/pull/1
- The workflow remains `workflow_dispatch` only. GitHub requires the workflow to exist on the default branch for manual dispatch, so the authenticated smoke test cannot be triggered until the reviewed PR is merged. No merge was performed.
- Current live evidence remains: Edge Function version 5 ACTIVE; no function invocation logs; no queue task rows. Authenticated execution and replay remain NOT VERIFIED.


## 15 Nov 2026 database audit reconciliation enhancement

- The Edge Function now queries PostgreSQL `task_events` for the exact task after completion and on idempotent replay.
- Both responses expose event counts for `task.queued`, `task.claimed`, and `task.succeeded`.
- The manual GitHub smoke workflow now requires exactly one of each event on the first execution and the same counts on replay, alongside stable task ID and result assertions.
- Added source contract coverage for the audit query and response.
- These are source-level and CI gates. They do not represent a live authenticated execution; the live queue remains empty until the protected workflow is actually invoked.
