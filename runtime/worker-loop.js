'use strict';

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function runWorker({ orchestrator, workerId, idleMs = 1000, signal, logger = () => {} }) {
  if (!orchestrator || typeof orchestrator.runOne !== 'function') throw new Error('orchestrator.runOne is required.');
  if (!workerId || typeof workerId !== 'string') throw new Error('workerId is required.');
  if (!Number.isInteger(idleMs) || idleMs < 50 || idleMs > 60000) throw new Error('idleMs must be between 50 and 60000.');
  let processed = 0;
  let idle = 0;
  while (!signal?.aborted) {
    try {
      const result = await orchestrator.runOne(workerId);
      if (result?.worked) {
        processed += 1;
        logger({ level: 'info', event: 'worker.task_processed', worker_id: workerId, task_id: result.task_id, status: result.status });
      } else {
        idle += 1;
        await sleep(idleMs, signal);
      }
    } catch (error) {
      logger({ level: 'error', event: 'worker.iteration_failed', worker_id: workerId, error: String(error?.message || error).slice(0, 1000) });
      await sleep(idleMs, signal);
    }
  }
  logger({ level: 'info', event: 'worker.stopped', worker_id: workerId, processed, idle });
  return { processed, idle, stopped: true };
}

module.exports = { runWorker };
