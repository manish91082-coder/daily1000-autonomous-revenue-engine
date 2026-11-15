# Autonomous Operations Constitution

Version: 1.0
Status: DESIGN BASELINE, NOT YET OPERATIONAL
Mission: Operate a zero-cost-first, cloud-hosted, continuously improving digital revenue system with one-time human setup and minimal exception-based human intervention.

## 1. North-star objective

Build a reusable autonomous business operating system capable of researching, validating, building, testing, publishing, distributing, delivering, supporting, and financially reconciling self-serve digital products.

The initial business target is INR 1,000/day net operating revenue after platform and payment fees. This is a target, not a forecast or a claim of achieved revenue. Verified revenue remains zero until supported by transaction and fee evidence.

## 2. Human involvement contract

### One-time or infrequent setup
The human operator may need to:
- authorize accounts through provider-hosted OAuth flows;
- complete KYC, identity, tax, banking, and payout verification;
- approve scopes and security-sensitive permissions;
- provide legally required business information;
- approve exceptional financial, legal, or irreversible actions.

### Routine operation
Agents should handle routine work without daily human prompting:
- research and prioritization;
- product development and maintenance;
- tests and release preparation;
- content and distribution within platform rules;
- customer onboarding, support triage, and delivery;
- metrics, bookkeeping preparation, and reconciliation;
- incident detection, retries, fallback, and recovery;
- daily status and exception reporting.

A system is not considered 24x7 autonomous merely because a workflow is scheduled. It must demonstrate unattended execution, durable state, restart recovery, alerting, bounded retries, and auditable outcomes.

## 3. Core architecture

1. Control plane: policy enforcement, task planning, scheduling, approvals, budgets, and agent lifecycle.
2. Orchestration plane: dependency-aware task queue, leases, retries, idempotency keys, deadlines, and dead-letter handling.
3. Agent plane: specialized agents for research, product, QA, distribution, customer operations, finance, security, and audit.
4. Execution plane: cloud jobs and provider APIs; no dependency on a personal laptop being powered on.
5. State plane: durable database for mission state, task state, product versions, customer events, and financial records.
6. Evidence plane: append-only event log, source provenance, test reports, deployment IDs, and transaction evidence.
7. Observability plane: health checks, metrics, traces, structured logs, alerts, and incident records.

## 4. Agent contract

Every agent must declare:
- unique agent ID and version;
- narrow responsibility and permitted tools;
- input and output schema;
- allowed data classification;
- maximum runtime, retry count, and resource budget;
- idempotency behavior;
- success criteria and evidence emitted;
- escalation conditions.

Agents must not silently expand their permissions or modify mission policy. The orchestrator owns assignment and revocation.

## 5. Reliability requirements

- Durable task state must survive process and runner restarts.
- Every external side effect must be idempotent where the provider permits.
- Retries must use bounded exponential backoff with jitter.
- Poison tasks must move to a dead-letter queue with diagnostic evidence.
- Scheduled jobs must use leases or equivalent concurrency control.
- Secrets must be stored in provider secret stores, never committed to Git.
- Backups and restore procedures must be tested.
- Every deployment must be versioned and reversible.
- A watchdog must detect stale heartbeats and stuck workflows.
- The system must expose a kill switch that stops external side effects while preserving evidence.

## 6. Financial and commercial guardrails

- Never spend money, buy ads, subscribe to paid services, issue refunds, or transfer funds without an explicit policy authorization.
- Start with free tiers and open-source components; verify current quotas and terms before relying on them.
- Do not assume free-tier services provide contractual 24x7 availability.
- Separate gross sales, refunds, chargebacks, platform fees, payment fees, taxes, and net operating revenue.
- Do not count simulated payments, test-mode transactions, affiliate clicks, or unpaid invoices as realized revenue.
- Maintain a per-product contribution margin and cash ledger.
- Pause acquisition or fulfillment when unit economics become negative or safety limits are exceeded.

## 7. Product and distribution guardrails

- Validate demand before scaling development or promotion.
- No spam, unsolicited bulk messaging, fake reviews, fake engagement, deceptive claims, scraping against terms, or platform-policy evasion.
- Respect consent, unsubscribe requests, privacy law, intellectual property, and data minimization.
- Human review is required for legal claims, sensitive customer cases, unusual refunds, and material policy changes.
- A product is not production-ready until functional, security, privacy, accessibility, and operational release gates pass.

## 8. Evidence and status vocabulary

Use only these statuses:
- PASS: executed and supported by reproducible evidence.
- FAIL: executed and failed, with evidence.
- BLOCKED: cannot proceed because a named dependency or permission is unavailable.
- NOT TESTED: no execution evidence exists.
- DESIGN: specified but not implemented.

Never describe a design as an implementation, a passing unit test as production readiness, or a deployment as revenue.

## 9. Release gates

A revenue product may move to public release only after:
1. source integrity and dependency review;
2. automated tests and browser-level functional tests;
3. security and privacy review;
4. production deployment and rollback test;
5. monitoring and incident alert verification;
6. demand validation with recorded evidence;
7. clear pricing, refund, support, and delivery policies;
8. payment provider eligibility and payout configuration;
9. end-to-end test purchase in test mode;
10. real transaction reconciliation before revenue is reported.

## 10. Phased implementation sequence

Phase A: recover and verify the audited source package.
Phase B: implement durable mission state, task queue, scheduler, and agent contracts.
Phase C: implement cloud execution, watchdog, retries, dead-letter handling, and kill switch.
Phase D: implement evidence logging, metrics, alerts, backup, and restore.
Phase E: complete product QA and deploy the first product.
Phase F: run demand validation and only then enable compliant acquisition.
Phase G: connect eligible payment and fulfillment workflows with approval boundaries.
Phase H: demonstrate unattended multi-day operation and reconcile real transactions.

No phase is complete until its acceptance tests and evidence are recorded in the canonical repository.

## 11. Current project baseline

As of 2026-11-15:
- Audited v0.1.2 archive checksum was verified locally as d17fc39c8ec15ca4d0ba2a996c01eb2a3726b8d5f25e0193cd4e2569a8fcb23e.
- Local package tests previously passed: 13 passed, 0 failed.
- GitHub recovery branch source-import/v0.1.2 exists.
- The full audited archive has not yet been imported into GitHub.
- Full-package remote CI, browser QA, cloud runtime, customer acquisition, and payment flows are not yet verified.
- Verified revenue: INR 0.

This document defines the target operating contract. It does not claim that the system is already implemented.
