# PostgreSQL Queue Security and Reliability Audit

Date: 2026-11-15
Branch: source-import/v0.1.2
Audit type: static source review; live database verification pending

## Decision

**NOT APPROVED for production or multi-worker activation.** Per-claim fencing and retry scheduling have been added to the draft. The SQL has not been executed against PostgreSQL.

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
- Effective permissions and Data API exposure are not verified. Never expose service_role credentials to a browser.

### P1 - Retry scheduling
- Runtime: configurable exponential cap with full jitter, retry availability timestamp and event records.
- Expired runtime leases invalidate tokens and schedule retry or dead-letter at attempt exhaustion.
- SQL draft: jittered exponential retry delay for explicit failure and lease expiry.
- Live SQL semantics, concurrency and event consistency remain unverified.

### P2 - Operational completeness
No cloud scheduler, worker supervisor, watchdog, alerting, kill switch, budget enforcement, agent sandbox, provider adapter, or external side-effect reconciliation exists. Exactly-once external effects are not guaranteed.

## Verification state

- Earlier GitHub CI run #43735742707 passed before the latest fencing/retry changes.
- Latest fencing/retry commits require a fresh CI result; do not infer PASS from earlier runs.
- PostgreSQL migration not applied.
- Live PostgreSQL integration/concurrency tests not run.
- Supabase advisors not run on a dedicated project.
- Multi-worker correctness NOT VERIFIED.
- Production readiness NO.

## Release gate

Require current CI success, a dedicated project, executed migration, live concurrent-claim/stale-token/lease-expiry/retry tests, effective privilege inspection, and security advisor review before enabling distributed workers.
