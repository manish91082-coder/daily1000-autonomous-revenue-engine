# Release status

## v0.1.2 source baseline

This repository contains the browser-only AgentMargin Workbench prototype. It estimates:
- Variable model and tool spend per attempt, adjusted by attempts per successful outcome.
- Human review cost per accepted outcome.
- Fixed monthly hosting, monitoring and maintenance.
- Monthly delivery cost, cost per outcome, gross-margin-based monthly floor and setup fee.

## Explicit limitations

- The prototype has not established willingness to pay or market demand.
- Suggested prices are mathematical outputs from user-entered assumptions, not market benchmarks.
- No customer accounts, backend, telemetry, payment processing or external API calls are included.
- Browser visual QA, production hosting, security review, real invoice reconciliation and payout validation remain pending.
- Revenue is unverified and must be reported as zero until a real sale is evidenced.

## Local verification

Run `npm test`, `node --check site/app.js`, and `node --check site/calculator.js`.
