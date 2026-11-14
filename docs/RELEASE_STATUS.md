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

## Verified checkpoint: 2026-11-14

- Audited archive is present in the active execution workspace and its SHA-256 matches the recorded value: `d17fc39c8ec15ca4d0ba2a996c01eb2a3726b8d5f25e0193cd4e2569a8fcb23e`.
- Archive listing contains 24 project files.
- Fresh extraction and local verification completed: 13 tests passed, 0 failed; `node --check site/app.js` and `node --check site/calculator.js` passed.
- GitHub Actions Runs #4 and the three subsequent documentation runs completed successfully.
- Browser smoke test is BLOCKED in this execution environment: installed Chromium repeatedly timed out before producing DOM output. This is an environment/tooling limitation, not a successful browser test.
- The GitHub repository tree still does not contain `agents/`, `state/`, or the full source documentation set. Therefore audited source import is NOT COMPLETE.
- The one-time import workflow is present, but it requires the binary archive to be uploaded to the repository root. The available GitHub connector exposes text-file/blob operations but no direct binary asset upload action. No claim of upload/import is made.

## Next action

Resolve the archive transfer through a verified binary-capable route, then run the import workflow and confirm the full tree and remote tests. Do not deploy or launch checkout before browser QA and source-integrity gates pass.
