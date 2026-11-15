# PostgreSQL Queue Security and Reliability Audit

Date: 2026-11-15
Branch: source-import/v0.1.2
Audit type: static source review; live database verification pending

## Decision

**NOT APPROVED for production or multi-worker activation.** The queue migration is now applied to the dedicated Supabase project and a transactional integration test has passed. The adapter, independent concurrent-session test, worker runtime and operations layer remain unimplemented.

## Remediation state

### P0 - Per-claim lease fencing
- UUID token generated on every database claim.
- Heartbeat, completion and failure require worker ID plus exact token.
- Token cleared on expiry/retry/completion.
- Runtime prototype uses fresh 256-bit token and constant-time comparison.
- Runtime tests cover stale-token rejection after same-worker reclaim.
- SQL contract tests check token issuance and validation. These are static checks only.

### P1 - Heartbeat validation and grants
- Heartbeat lease duration is bounded to 5..3600 seconds.
- PUBLIC, anon and authenticated are revoked from schema/table/function access.
- service_role is granted backend access as a server-side-only role.
- Live catalog checks confirm no schema usage or table SELECT for anon/authenticated; service_role has schema/table access. Explicit deny-all RLS policies exist for anon/authenticated. Security Advisor now reports no lints. Never expose service_role credentials to a browser.

### P1 - Retry scheduling
- Runtime: configurable exponential cap with full jitter, retry availability timestamp and event records.
- Expired runtime leases invalidate tokens and schedule retry or dead-letter at attempt exhaustion.
- SQL draft: jittered exponential retry delay for explicit failure and lease expiry.
- Live PostgreSQL integration test passed for claim, valid/stale-token completion, explicit failure retry, lease-token clearing, expired-lease retry events and reclaim. The test ran in a rollback transaction. Independent simultaneous-session race testing remains open.

### P2 - Operational completeness
No cloud scheduler, worker supervisor, watchdog, alerting, kill switch, budget enforcement, agent sandbox, provider adapter, or external side-effect reconciliation exists. Exactly-once external effects are not guaranteed.

## Verification state

- Earlier GitHub CI run #43735742707 passed before the latest fencing/retry changes.
- Latest fencing/retry commits require a fresh CI result; do not infer PASS from earlier runs.
- Migration applied to dedicated project `vpuuotssufznyjgtubuz` (Postgres 17.11, Mumbai region).
- Live transactional integration test: PASS for tested flows; no parallel-session concurrency race test yet.
- Supabase Security Advisor: no lints after explicit deny-all policies; Performance and Health advisors: no lints.
- Multi-worker correctness NOT VERIFIED; SQL `SKIP LOCKED` semantics still need independent concurrent-connection load tests.
- Production readiness NO.

## Release gate

Require current CI success, a dedicated project, executed migration, live concurrent-claim/stale-token/lease-expiry/retry tests, effective privilege inspection, and security advisor review before enabling distributed workers.
