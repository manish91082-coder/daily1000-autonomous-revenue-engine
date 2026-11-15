const test = require('node:test');
const assert = require('node:assert/strict');
const { runWorker } = require('../runtime/worker-loop');

test('worker loop processes tasks and exits cleanly after abort', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await runWorker({
    workerId: 'worker-test',
    signal: controller.signal,
    orchestrator: {
      runOne: async () => {
        calls += 1;
        if (calls === 1) {
          controller.abort();
          return { worked: true, task_id: 't1', status: 'succeeded' };
        }
        return { worked: false };
      }
    }
  });
  assert.equal(result.processed, 1);
  assert.equal(result.stopped, true);
  assert.equal(calls, 1);
});

test('worker loop backs off while queue is idle and stops on abort', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await runWorker({
    workerId: 'worker-idle',
    idleMs: 50,
    signal: controller.signal,
    orchestrator: {
      runOne: async () => {
        calls += 1;
        controller.abort();
        return { worked: false };
      }
    }
  });
  assert.equal(result.idle, 1);
  assert.equal(calls, 1);
});

test('worker loop validates worker configuration', async () => {
  await assert.rejects(() => runWorker({ orchestrator: {}, workerId: 'x' }), /runOne/);
  await assert.rejects(() => runWorker({ orchestrator: { runOne: async () => ({}) }, workerId: 'x', idleMs: 1, signal: AbortSignal.abort() }), /idleMs/);
});
