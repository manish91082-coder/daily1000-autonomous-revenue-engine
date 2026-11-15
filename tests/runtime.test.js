const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRuntime } = require('../runtime');
async function fixture(options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'd1000-runtime-'));
  const runtime = await createRuntime(path.join(dir, 'state.json'), options);
  return { ...runtime, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}
test('durable queue survives runtime recreation', async () => {
  const f = await fixture();
  try {
    const q = await f.queue.enqueue({ type: 'echo', payload: { value: 7 }, idempotencyKey: 'stable-1' });
    const again = await createRuntime(f.store.filePath);
    assert.equal((await again.queue.get(q.task.id)).payload.value, 7);
  } finally { await f.cleanup(); }
});
test('idempotency key prevents duplicate task creation', async () => {
  const f = await fixture();
  try {
    const a = await f.queue.enqueue({ type: 'x', idempotencyKey: 'same' });
    const b = await f.queue.enqueue({ type: 'x', idempotencyKey: 'same' });
    assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(a.task.id, b.task.id);
  } finally { await f.cleanup(); }
});
test('orchestrator executes registered handler and records result', async () => {
  const f = await fixture();
  try {
    f.orchestrator.register('sum', async p => ({ total: p.a + p.b }));
    const t = await f.queue.enqueue({ type: 'sum', payload: { a: 2, b: 3 } });
    const r = await f.orchestrator.runOne('worker-a');
    assert.equal(r.status, 'succeeded'); assert.deepEqual((await f.queue.get(t.task.id)).result, { total: 5 });
  } finally { await f.cleanup(); }
});
test('failed tasks retry with delay then enter terminal failed state', async () => {\n  let now = 1000;\n  const f = await fixture({ now: () => now, retryBaseMs: 100, retryMaxMs: 500, random: () => 1 });
  try {
    f.orchestrator.register('flaky', async () => { throw new Error('simulated failure'); });
    const t = await f.queue.enqueue({ type: 'flaky', maxAttempts: 2 });
    assert.equal((await f.orchestrator.runOne('w1')).status, 'queued');
    assert.equal((await f.orchestrator.runOne('w1')).worked, false);
    now += 100;
    assert.equal((await f.orchestrator.runOne('w1')).status, 'failed');
    assert.equal((await f.queue.get(t.task.id)).attempts, 2);
  } finally { await f.cleanup(); }
});
test('expired worker lease is recovered and task can be reclaimed', async () => {
  let now = 1000;
  const f = await fixture({ leaseMs: 10, retryBaseMs: 20, retryMaxMs: 100, random: () => 1, now: () => now });
  try {
    const t = await f.queue.enqueue({ type: 'echo' });
    await f.queue.claim('dead-worker'); now += 11;
    assert.equal(await f.queue.claim('healthy-worker'), null);
    now += 20;
    const recovered = await f.queue.claim('healthy-worker');
    assert.equal(recovered.id, t.task.id); assert.equal(recovered.worker_id, 'healthy-worker');
    assert.equal(recovered.attempts, 2);
  } finally { await f.cleanup(); }
});
test('worker cannot complete a task owned by another worker', async () => {
  const f = await fixture();
  try {
    const t = await f.queue.enqueue({ type: 'echo' }); await f.queue.claim('worker-a');
    const claimed = await f.queue.get(t.task.id);
    await assert.rejects(() => f.queue.complete(t.task.id, 'worker-b', 'forged', 'bad'), /not owned/);
    await assert.rejects(() => f.queue.complete(t.task.id, 'worker-a', 'forged', 'bad'), /not owned/);
  } finally { await f.cleanup(); }
});
test('priority tasks are claimed before lower priority tasks', async () => {
  const f = await fixture();
  try {
    await f.queue.enqueue({ type: 'low', priority: 1 });
    const high = await f.queue.enqueue({ type: 'high', priority: 9 });
    assert.equal((await f.queue.claim('w')).id, high.task.id);
  } finally { await f.cleanup(); }
});

test('stale claim token cannot heartbeat or complete after same worker reclaims task', async () => {
  let now = 1000;
  const f = await fixture({ leaseMs: 10, retryBaseMs: 1, retryMaxMs: 1, random: () => 0, now: () => now });
  try {
    const t = await f.queue.enqueue({ type: 'echo', maxAttempts: 3 });
    const first = await f.queue.claim('reused-worker');
    now += 11;
    const second = await f.queue.claim('reused-worker');
    assert.equal(second.id, t.task.id);
    assert.notEqual(first.lease_token, second.lease_token);
    await assert.rejects(() => f.queue.heartbeat(t.task.id, 'reused-worker', first.lease_token), /not owned/);
    await assert.rejects(() => f.queue.complete(t.task.id, 'reused-worker', first.lease_token, { stale: true }), /not owned/);
    assert.equal((await f.queue.complete(t.task.id, 'reused-worker', second.lease_token, { fresh: true })).status, 'succeeded');
  } finally { await f.cleanup(); }
});
test('lease token is required for all lease mutations', async () => {
  const f = await fixture();
  try {
    const t = await f.queue.enqueue({ type: 'echo' });
    await f.queue.claim('worker-a');
    await assert.rejects(() => f.queue.heartbeat(t.task.id, 'worker-a'), /not owned/);
    await assert.rejects(() => f.queue.fail(t.task.id, 'worker-a', undefined, new Error('forged')), /not owned/);
  } finally { await f.cleanup(); }
});

test('retry backoff grows exponentially and is capped with full jitter', async () => {
  let now = 5000;
  const f = await fixture({ now: () => now, retryBaseMs: 100, retryMaxMs: 250, random: () => 1 });
  try {
    const t = await f.queue.enqueue({ type: 'retry-me', maxAttempts: 4 });
    const first = await f.queue.claim('w');
    const r1 = await f.queue.fail(t.task.id, 'w', first.lease_token, new Error('first'));
    assert.equal(r1.available_at, now + 100);
    assert.equal((await f.queue.claim('w')), null);
    now += 100;
    const second = await f.queue.claim('w');
    const r2 = await f.queue.fail(t.task.id, 'w', second.lease_token, new Error('second'));
    assert.equal(r2.available_at, now + 200);
    now += 200;
    const third = await f.queue.claim('w');
    const r3 = await f.queue.fail(t.task.id, 'w', third.lease_token, new Error('third'));
    assert.equal(r3.available_at, now + 250);
    const state = await f.store.read();
    assert.equal(state.events.filter(e => e.event === 'task.retry_scheduled').length, 3);
  } finally { await f.cleanup(); }
});
test('retry jitter is bounded and can schedule immediate retry at zero', async () => {
  let now = 9000;
  const f = await fixture({ now: () => now, retryBaseMs: 100, retryMaxMs: 500, random: () => 0 });
  try {
    const t = await f.queue.enqueue({ type: 'jitter', maxAttempts: 2 });
    const claim = await f.queue.claim('w');
    const retry = await f.queue.fail(t.task.id, 'w', claim.lease_token, new Error('retry'));
    assert.equal(retry.available_at, now);
    assert.equal((await f.queue.claim('w')).id, t.task.id);
  } finally { await f.cleanup(); }
});
