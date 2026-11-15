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
