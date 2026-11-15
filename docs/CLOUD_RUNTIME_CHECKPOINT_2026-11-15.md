# Cloud Runtime Checkpoint — 15 November 2026

## Scope and separation

This is the cloud control-plane checkpoint for the independent ₹1,000/day Autonomous Revenue Mission. It does not replace or claim to import the audited v0.1.2 AgentMargin Workbench source package. The application release gates in `RELEASE_STATUS.md` remain independent.

Canonical runtime: Supabase project `daily1000-agent-runtime`
- Project ref: `vpuuotssufznyjgtubuz`
- Region: `ap-south-1`
- Plan: Free
- Status observed: `ACTIVE_HEALTHY`
- Runtime schema: `revenue_runtime`

## Deployed control-plane components

- PostgreSQL private schema with durable mission state, agent registry, provider registry, task queue/event tables, append-only memory, audit, agent-run, heartbeat, opportunity, product, order and revenue-ledger tables.
- `pg_cron` 1.6.4 and `pg_net` 0.20.4 installed.
- Edge Function `agent-dispatcher` version 3, ACTIVE, JWT verification disabled but guarded by a random token stored in Supabase Vault and checked with constant-time comparison.
- Cron job `agentic-revenue-heartbeat`, job ID 2, runs every five minutes and invokes the dispatcher.
- Dispatcher accepts only POST JSON mode `tick`, uses an idempotency key per five-minute slot, and performs deterministic control tasks.

## Verified evidence

- Manual pg_net invocation request ID 4 returned HTTP 200.
- It created task `a5ec5300-3e89-49a3-b599-72ec49111f50`, heartbeat ID 7, and four deterministic agent-run events.
- Replaying the same tick (request ID 5) returned HTTP 200 with `duplicate_tick=true`, the same task ID, and prior status `succeeded`; no duplicate task was created.
- Scheduled Cron run at `2026-11-15 18:05:00 UTC` succeeded; pg_net response ID 6 returned HTTP 200, task `a30dd90b-75e5-4a23-96d7-a3e6501ebc49`, heartbeat ID 8, and four deterministic agent runs.
- Latest observed database counts at checkpoint: 2 tasks, 2 succeeded, 8 agent-run events, 5 heartbeat records, 6 memory entries, 17 audit events, 0 orders, 0 revenue-ledger events.

## Enabled deterministic control agents

1. Reliability Monitor
2. Security & Compliance Auditor
3. Finance Auditor
4. Memory Keeper

These are deterministic control workers, not yet general-purpose LLM reasoning agents. The remaining nine registered roles are scaffolded, blocked, or disabled.

## Explicitly not complete

- No LLM provider credentials configured.
- No autonomous business/opportunity executor active.
- No live Superteam Earn agent registration or API key.
- No public frontend deployment or checkout.
- No orders, settlements, or verified revenue. Verified realized net revenue remains ₹0.
- No claim of ₹1,000/day achieved.
- No claim of fully autonomous revenue generation.

## Security and reliability notes

- Supabase Security Advisor returned no current lints, but table inspection reported RLS disabled on 11 newly created private-schema tables.
- Independent privilege inspection found no `anon` or `authenticated` schema USAGE and no table grants for those roles; `service_role` also has no grants on the new tables. The PostgREST exposed schemas were not configured to include `revenue_runtime`.
- No client-facing access has been granted. RLS remains a defense-in-depth hardening item and must be enabled with an explicit internal access model before any table is exposed. Do not add broad client policies.
- Supabase organization is on the Free plan. It has no production uptime SLA and may pause projects after inactivity; do not describe this as guaranteed 24×7 infrastructure. No paid upgrade or recurring spend is authorized.
- Keep all secrets in Vault/Edge Function secrets. Never commit service-role keys, provider keys, agent keys, or claim codes.

## Next sequence

1. Continue read-only verification of Superteam Earn's public listing API and agent eligibility contract. Official agent docs say only `AGENT_ALLOWED` and `AGENT_ONLY` listings accept agent submissions; a human must claim the agent for payout.
2. Build a read-only opportunity scout first. Store source URL, raw evidence hash, listing ID, reward token/amount, deadline, region, AI policy, agentAccess, and eligibility status.
3. Require independent policy/eligibility audit before any work is prepared. Never submit to `HUMAN_ONLY` listings or fabricate profile, Telegram, identity, wallet, or KYC details.
4. Register a Superteam agent only after a secure secret-onboarding path exists; agent registration creates an external identity and returns a private API key and human claim code. Payout claim remains human-gated.
5. Keep the audited v0.1.2 source import gate unchanged. The repository's 24-file archive is not present in GitHub; this cloud checkpoint does not satisfy source-import acceptance criteria.

Checkpoint date: 2026-11-15.
