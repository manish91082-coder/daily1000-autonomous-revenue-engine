const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('database/postgres_queue.sql', 'utf8');

test('queue schema is isolated from exposed public schema', () => {
  assert.match(sql, /create schema if not exists revenue_runtime/i);
  assert.match(sql, /alter table revenue_runtime\.tasks enable row level security/i);
  assert.match(sql, /alter table revenue_runtime\.task_events enable row level security/i);
  assert.doesNotMatch(sql, /create table if not exists public\./i);
});

test('task idempotency and bounded attempts are enforced by database constraints', () => {
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /max_attempts between 1 and 20/i);
});

test('concurrent workers claim with row locking and skip locked rows', () => {
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /status = 'queued'/i);
  assert.match(sql, /lease_expires_at/i);
});

test('worker ownership is checked before heartbeat, completion and failure', () => {
  for (const fn of ['heartbeat_task', 'complete_task', 'fail_task']) {
    const start = sql.toLowerCase().indexOf(`function revenue_runtime.${fn}`);
    assert.notEqual(start, -1, `${fn} must exist`);
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end);
    assert.match(body, /lease_owner = p_worker_id/i, `${fn} must validate lease owner`);
  }
});

test('retry exhaustion records a terminal dead-letter event', () => {
  assert.match(sql, /then 'failed' else 'queued'/i);
  assert.match(sql, /task\.dead_lettered/i);
  assert.match(sql, /task\.retry_scheduled/i);
});

test('every PostgreSQL lease mutation is fenced by a per-claim token', () => {
  assert.match(sql, /lease_token uuid/i);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/i);
  for (const fn of ['heartbeat_task', 'complete_task', 'fail_task']) {
    const start = sql.toLowerCase().indexOf(`function revenue_runtime.${fn}`);
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end);
    assert.match(body, /p_lease_token uuid/i, `${fn} must accept a fencing token`);
    assert.match(body, /lease_token = p_lease_token/i, `${fn} must validate the exact claim token`);
  }
});
test('heartbeat lease duration is bounded and public API roles are denied', () => {
  assert.match(sql, /p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 3600/i);
  assert.match(sql, /revoke all on schema revenue_runtime from public, anon, authenticated/i);
  assert.match(sql, /grant usage on schema revenue_runtime to service_role/i);
});

test('PostgreSQL retry and expired-lease paths schedule bounded jittered backoff', () => {
  assert.match(sql, /random\(\) \* least\(86400::numeric/i);
  assert.match(sql, /power\(2::numeric, greatest\(0/i);
  assert.match(sql, /available_at = case when t\.attempts >= t\.max_attempts/i);
  assert.match(sql, /available_at = case when attempts >= max_attempts/i);
});

test('PostgreSQL lease and retry inputs reject null and out-of-range values', () => {
  const claimStart = sql.toLowerCase().indexOf('function revenue_runtime.claim_task');
  const claimEnd = sql.indexOf('$$;', claimStart);
  assert.match(sql.slice(claimStart, claimEnd), /p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 3600/i);
  const failStart = sql.toLowerCase().indexOf('function revenue_runtime.fail_task');
  const failEnd = sql.indexOf('$$;', failStart);
  assert.match(sql.slice(failStart, failEnd), /p_retry_delay_seconds is null or p_retry_delay_seconds < 1 or p_retry_delay_seconds > 3600/i);
});

test('expired leases emit a retry-scheduled event when attempts remain', () => {
  assert.match(sql, /select id, 'task\.retry_scheduled', attempts/i);
  assert.match(sql, /from expired where status = 'queued'/i);
});
