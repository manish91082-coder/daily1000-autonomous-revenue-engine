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
