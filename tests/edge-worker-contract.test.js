const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('supabase/functions/runtime-worker/index.ts', 'utf8');

test('edge worker requires platform JWT verification and service_role authorization', () => {
  assert.match(source, /jwtRole\(req\) !== "service_role"/);
  assert.match(source, /SUPABASE_DB_URL/);
  assert.match(source, /new Pool\(databaseUrl, 1\)/);
});

test('edge worker accesses the private schema through direct PostgreSQL, not Data API', () => {
  assert.match(source, /where idempotency_key = \$\{idempotencyKey\}[\s\S]*for update/);
  assert.match(source, /revenue_runtime\.complete_task/);
  assert.match(source, /revenue_runtime\.fail_task/);
  assert.doesNotMatch(source, /createClient\(/);
});

test('edge worker only executes explicitly registered health-check task', () => {
  assert.match(source, /task\.task_type === "runtime\.health_check"/);
  assert.match(source, /No Edge handler registered for task type/);
});


test('edge worker smoke-test path only enqueues a fixed health-check task', () => {
  assert.match(source, /requestBody\.mode !== "smoke_test"/);
  assert.match(source, /allowed_modes: \["smoke_test"\]/);
  assert.match(source, /task_type, payload, idempotency_key, priority, max_attempts/);
  assert.match(source, /values \('runtime\.health_check', '\{\}'::jsonb/);
  assert.match(source, /on conflict \(idempotency_key\) do nothing/);
  assert.match(source, /task\.queued/);
});

test('edge worker smoke-test requires a bounded idempotency key', () => {
  assert.match(source, /A-Za-z0-9\._:-\]\{8,180\}/);
});

test('edge worker rolls back failed enqueue transactions before releasing the connection', () => {
  assert.match(source, /queryArray\x60rollback\x60/);
});

test('edge worker resolves the exact idempotency record and never claims unrelated queue work', () => {
  assert.match(source, /where idempotency_key = \$\{idempotencyKey\}[\s\S]*for update/);
  assert.match(source, /where id = \$\{task\.id\}::uuid and status = 'queued'[\s\S]*returning \*/);
  assert.doesNotMatch(source, /select \* from revenue_runtime\.claim_task/);
});

test('edge worker returns completed and in-progress idempotent replays without executing another task', () => {
  assert.match(source, /task\.status === "succeeded"[\s\S]*idempotent_replay: true/);
  assert.match(source, /status: "in_progress", idempotent_replay: true/);
  assert.match(source, /task\.status === "failed" \|\| task\.status === "cancelled"/);
});

test('edge worker recovers only an expired lease for the requested idempotency key', () => {
  assert.match(source, /lease_expires_at/);
  assert.match(source, /source":"idempotent_recovery/);
  assert.match(source, /task\.attempts >= task\.max_attempts/);
});
