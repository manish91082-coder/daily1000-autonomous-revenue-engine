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
test('failed tasks retry then enter terminal failed state', async () => {
  const f = await fixture();
  try {
    f.orchestrator.register('flaky', async () => { throw new Error('simulated failure'); });
    const t = await f.queue.enqueue({ type: 'flaky', maxAttempts: 2 });
    assert.equal((await f.orchestrator.runOne('w1')).status, 'queued');
    assert.equal((await f.orchestrator.runOne('w1')).status, 'failed');
    assert.equal((await f.queue.get(t.task.id)).attempts, 2);
  } finally { await f.cleanup(); }
});
test('expired worker lease is recovered and task can be reclaimed', async () => {
  let now = 1000;
  const f = await fixture({ leaseMs: 10, now: () => now });
  try {
    const t = await f.queue.enqueue({ type: 'echo' });
    await f.queue.claim('dead-worker'); now += 11;
    const recovered = await f.queue.claim('healthy-worker');
    assert.equal(recovered.id, t.task.id); assert.equal(recovered.worker_id, 'healthy-worker');
    assert.equal(recovered.attempts, 2);
  } finally { await f.cleanup(); }
});
test('worker cannot complete a task owned by another worker', async () => {
  const f = await fixture();
  try {
    const t = await f.queue.enqueue({ type: 'echo' }); await f.queue.claim('worker-a');
    await assert.rejects(() => f.queue.complete(t.task.id, 'worker-b', 'forged'), /not owned/);
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
