# PostgreSQL Queue Security and Reliability Audit

Date: 2026-11-15
Branch: source-import/v0.1.2
Target: database/postgres_queue.sql
Audit type: static source review only; no live database execution

## Decision

**NOT APPROVED for production or multi-worker activation.** The SQL is a useful draft, but static contract tests do not establish runtime correctness, access control, or concurrency safety.

## Findings

### P0 - Claim fencing is insufficient
The queue identifies a lease by `lease_owner` only. If a worker process reuses the same worker ID, an old/stale execution may be able to heartbeat or complete a task after the task has expired and been reclaimed by that same worker identity. A worker identity is not a per-claim fencing token.

Required correction:
- Generate a fresh, unpredictable lease token for every successful claim.
- Store it on the task row and require the exact token for heartbeat, completion, and failure.
- Clear the token on lease release/expiry.
- Test stale-token heartbeat/complete/fail after re-claim, including the same worker ID.

### P1 - Heartbeat input validation is incomplete
`claim_task` bounds lease duration, but `heartbeat_task` does not. A caller may request a negative or excessively long lease duration.

Required correction:
- Apply the same 5..3600 second bound in heartbeat.
- Reject null task IDs, blank worker identities/tokens, and invalid lease durations explicitly.
- Add SQL integration tests for boundary and invalid values.

### P1 - Function execution and privilege model is unspecified
The draft enables RLS on the two tables but does not define grants, function execute privileges, or an explicit caller model. RLS alone is not a complete authorization design. The functions are not declared SECURITY DEFINER, which may be correct for a tightly controlled backend role, but the required schema/table/function privileges have not been specified or verified.

Required correction:
- Keep the schema outside exposed Data API schemas.
- Define a dedicated backend role and least-privilege grants.
- Revoke default PUBLIC execute on queue functions; grant only to the intended backend role.
- Do not grant anon/authenticated access to queue tables or worker functions.
- If SECURITY DEFINER is ever chosen, pin a safe search_path, validate all inputs, and audit ownership/privileges.
- Verify effective privileges and Supabase security advisors on a dedicated project.

### P1 - Retry and event semantics need stronger invariants
Expired leases are requeued immediately, without backoff, while explicit failures can set a retry delay. Repeated worker crashes can therefore create rapid reclaim loops. The expiry path also retains the prior last_error when present, which may obscure the latest expiry reason.

Required correction:
- Define bounded exponential backoff with jitter or a deterministic bounded backoff policy.
- Record lease-expiry attempt number and reason distinctly.
- Ensure terminal failure and retry transitions are atomic and covered by integration tests.

### P2 - Operational completeness
The SQL does not provide a scheduler, worker supervisor, watchdog, alerting, kill switch, budget enforcement, or external side-effect reconciliation. It does not provide exactly-once effects.

Required correction:
- Add supervised workers, health checks, bounded concurrency, queue-age alerts, dead-letter review, and an emergency pause.
- Use provider-side idempotency keys and reconciliation for every external side effect.
- Require approval for money movement, spending, refunds, KYC, legal commitments, and sensitive account changes.

## Verification state

- GitHub CI run #43735742707: job `test` completed successfully; npm tests and both JavaScript syntax checks passed.
- PostgreSQL SQL: not applied to any database.
- PostgreSQL runtime/concurrency tests: not run.
- Supabase advisors: not run for this mission's dedicated project.
- Multi-worker correctness: NOT VERIFIED.
- Production readiness: NO.

## Release gate

Do not connect cloud workers or mark the queue production-ready until the P0 fencing correction, P1 privilege/validation corrections, live PostgreSQL migration, concurrent claim tests, lease-expiry tests, stale-token tests, retry/dead-letter tests, and security advisor review all pass on a dedicated project.
