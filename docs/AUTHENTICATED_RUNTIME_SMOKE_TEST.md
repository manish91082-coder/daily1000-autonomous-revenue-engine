# Authenticated runtime smoke test

## Purpose

This manual workflow validates one complete cloud task lifecycle against the dedicated Supabase runtime project:

1. GitHub Actions sends a protected authenticated request.
2. The Edge Function inserts an idempotent `runtime.health_check` task and its audit event.
3. The Edge Function claims the task using the PostgreSQL queue.
4. The registered health-check handler executes.
5. PostgreSQL records successful completion and the function returns the task ID/result.

The endpoint accepts only the fixed `smoke_test` mode and a bounded idempotency key. It does not accept arbitrary task types or executable payloads.

## One-time GitHub repository configuration

In repository Settings → Secrets and variables → Actions → New repository secret, configure:

- `SUPABASE_URL`: project URL for the dedicated runtime project.
- `SUPABASE_SERVICE_ROLE_KEY`: the project's service-role JWT, stored only as a protected GitHub Actions secret.

Never commit either value, print it in logs, place it in a workflow file, or use it in browser code. Keep the workflow manual until the end-to-end test and operational controls are reviewed.

## Run

Open Actions → Authenticated runtime smoke test → Run workflow.

The workflow fails unless the response confirms `worked=true`, `status=succeeded`, a task ID, and `result.ok=true`.

After a successful run, independently verify the task row and audit events in the private `revenue_runtime` schema. The workflow response alone is not the entire audit record.

## Current boundary

This workflow is manual only. It does not create a schedule, run continuously, or establish 24×7 supervision. CI/source deployment and actual authenticated invocation are separate gates.
