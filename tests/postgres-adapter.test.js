const test = require('node:test');
const assert = require('node:assert/strict');
const { PostgresTaskQueue, mapTask } = require('../runtime/postgres-queue');

const row = {
  id: 'task-1', task_type: 'echo', payload: { n: 1 }, idempotency_key: 'key-1',
  priority: 4, status: 'running', attempts: 1, max_attempts: 3,
  available_at: new Date(0), created_at: new Date(0), updated_at: new Date(0),
  lease_owner: 'worker-a', lease_expires_at: new Date(60000),
  lease_token: 'claim-token', result: null, last_error: null
};

test('maps database task rows into the runtime queue contract', () => {
  const task = mapTask(row);
  assert.equal(task.type, 'echo');
  assert.equal(task.worker_id, 'worker-a');
  assert.equal(task.lease_token, 'claim-token');
  assert.equal(task.max_attempts, 3);
});

test('rejects invalid lease and retry configuration', () => {
  const pool = { query: async () => ({ rows: [] }), connect: async () => ({}) };
  assert.throws(() => new PostgresTaskQueue(pool, { leaseSeconds: 4 }), /leaseSeconds/);
  assert.throws(() => new PostgresTaskQueue(pool, { retryDelaySeconds: 0 }), /retryDelaySeconds/);
});

test('claims tasks through the atomic database function', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [row] }; },
    connect: async () => { throw new Error('not used'); }
  };
  const queue = new PostgresTaskQueue(pool, { leaseSeconds: 45 });
  const task = await queue.claim('worker-a');
  assert.equal(task.id, 'task-1');
  assert.match(calls[0].sql, /claim_task/);
  assert.deepEqual(calls[0].params, ['worker-a', 45]);
});

test('completion is fenced by database result and returns refreshed task', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/complete_task/.test(sql)) return { rows: [{ ok: true }] };
      if (/where id = \$1/.test(sql)) return { rows: [{ ...row, status: 'succeeded', lease_token: null }] };
      throw new Error('unexpected query');
    },
    connect: async () => { throw new Error('not used'); }
  };
  const queue = new PostgresTaskQueue(pool);
  const task = await queue.complete('task-1', 'worker-a', 'claim-token', { done: true });
  assert.equal(task.status, 'succeeded');
  assert.equal(calls[0].params[3], JSON.stringify({ done: true }));
});

test('rejects stale-token completion', async () => {
  const pool = {
    query: async sql => {
      if (/complete_task/.test(sql)) return { rows: [{ ok: false }] };
      throw new Error('unexpected query');
    },
    connect: async () => ({})
  };
  const queue = new PostgresTaskQueue(pool);
  await assert.rejects(() => queue.complete('task-1', 'worker-a', 'stale', null), /not owned/);
});
