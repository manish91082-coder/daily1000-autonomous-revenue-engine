# PostgreSQL Queue Security and Reliability Audit

Date: 2026-11-15
Branch: source-import/v0.1.2
Target: database/postgres_queue.sql
Audit type: static source review; live database execution pending

## Decision

**NOT APPROVED for production or multi-worker activation.** The first source-level corrections are implemented, but static contract tests do not establish runtime correctness, effective database permissions, or concurrency safety.

## Findings and remediation state

### P0 - Per-claim lease fencing
**Source correction implemented; live verification pending.**
- Each claim assigns a fresh UUID lease token.
- Heartbeat, completion, and failure require both worker identity and exact lease token.
- Lease token is cleared on expiry and terminal/retry transition.
- Local runtime prototype uses a fresh 256-bit random token per claim and constant-time comparison.
- Runtime tests now cover stale-token heartbeat/completion after the same worker ID reclaims the task.
- PostgreSQL contract tests assert token issuance and validation. They do not execute PostgreSQL.

### P1 - Heartbeat input validation
**Source correction partially implemented; live verification pending.**
- SQL heartbeat bounds lease duration to 5..3600 seconds and requires worker identity/token.
- Invalid UUID/null task inputs and database exception behaviour still need integration tests.

### P1 - Function execution and privilege model
**Baseline grants added; live privilege verification pending.**
- The schema remains outside public.
- PUBLIC, anon, and authenticated are denied schema/table/function access.
- service_role is granted schema usage, table access, sequence access, and function execution.
- This is a Supabase-oriented server-side baseline, not proof that effective grants are correct. Never expose service_role credentials to browser/client code.
- Verify Data API exposure, role grants, RLS behaviour, and security advisors on a dedicated project.

### P1 - Retry and event semantics
**Open.**
- Expired leases are still requeued immediately.
- Bounded exponential backoff/jitter and stale error replacement need implementation.
- Failure and expiry paths require live integration tests.

### P2 - Operational completeness
**Open.**
- No scheduler, worker supervisor, watchdog, alerting, kill switch, budget enforcement, or external side-effect reconciliation exists yet.
- Exactly-once external effects are not guaranteed.
- Use provider-side idempotency and reconciliation; require human approval for spending, transfers, refunds, KYC, legal commitments, and sensitive account changes.

## Verification state

- Previous GitHub CI run #43735742707 passed before the fencing changes.
- New fencing changes have been committed; CI for the latest commit must be checked independently.
- PostgreSQL SQL: not applied to any database.
- PostgreSQL runtime/concurrency tests: not run.
- Supabase advisors: not run for this mission's dedicated project.
- Multi-worker correctness: NOT VERIFIED.
- Production readiness: NO.

## Release gate

Do not connect cloud workers or mark the queue production-ready until CI passes for the fencing changes, the SQL is applied to a dedicated project, concurrent claim/stale-token/lease-expiry/retry tests pass against real PostgreSQL, effective permissions are inspected, and security advisors are reviewed.
