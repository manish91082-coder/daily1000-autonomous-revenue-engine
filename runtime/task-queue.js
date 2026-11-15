'use strict';
const crypto = require('node:crypto');
class TaskQueue {
  constructor(store, options = {}) {
    this.store = store;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
  }
  async enqueue({ type, payload = {}, idempotencyKey, priority = 0, maxAttempts = this.maxAttempts }) {
    if (!type || typeof type !== 'string') throw new Error('Task type is required.');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error('maxAttempts must be an integer from 1 to 20.');
    const key = idempotencyKey || crypto.randomUUID();
    return this.store.transact(state => {
      const existing = Object.values(state.tasks).find(t => t.idempotency_key === key);
      if (existing) return { task: existing, created: false };
      const id = crypto.randomUUID();
      const task = { id, type, payload, idempotency_key: key, priority: Number(priority) || 0, status: 'queued', attempts: 0, max_attempts: maxAttempts, created_at: this.now(), updated_at: this.now(), lease_until: null, lease_token: null, result: null, last_error: null };
      state.tasks[id] = task;
      state.events.push({ at: this.now(), task_id: id, event: 'task.queued' });
      return { task, created: true };
    });
  }
  async claim(workerId) {
    if (!workerId || typeof workerId !== 'string' || !workerId.trim()) throw new Error('workerId is required.');
    return this.store.transact(state => {
      const now = this.now();
      for (const task of Object.values(state.tasks)) {
        if (task.status === 'running' && task.lease_until <= now) {
          task.status = task.attempts >= task.max_attempts ? 'failed' : 'queued';
          task.worker_id = null; task.lease_until = null; task.lease_token = null;
          task.last_error = 'Worker lease expired.';
          task.updated_at = now;
          state.events.push({ at: now, task_id: task.id, event: 'task.lease_expired', attempt: task.attempts });
        }
      }
      const task = Object.values(state.tasks).filter(t => t.status === 'queued').sort((a,b) => b.priority-a.priority || a.created_at-b.created_at)[0];
      if (!task) return null;
      task.status = 'running'; task.attempts += 1; task.worker_id = workerId;
      task.lease_until = now + this.leaseMs; task.lease_token = crypto.randomBytes(32).toString('hex'); task.updated_at = now;
      state.events.push({ at: now, task_id: task.id, event: 'task.claimed', worker_id: workerId, attempt: task.attempts });
      return task;
    });
  }
  #assertLease(task, workerId, leaseToken) {
    if (!task || task.status !== 'running' || task.worker_id !== workerId ||
        typeof leaseToken !== 'string' || !leaseToken ||
        !task.lease_token || !crypto.timingSafeEqual(Buffer.from(task.lease_token), Buffer.from(leaseToken))) {
      throw new Error('Task lease is not owned by this worker claim.');
    }
  }
  async heartbeat(taskId, workerId, leaseToken) {
    return this.store.transact(state => {
      const task = state.tasks[taskId]; this.#assertLease(task, workerId, leaseToken);
      task.lease_until = this.now() + this.leaseMs; task.updated_at = this.now();
      state.events.push({ at: this.now(), task_id: taskId, event: 'task.heartbeat', worker_id: workerId, attempt: task.attempts });
      return task;
    });
  }
  async complete(taskId, workerId, leaseToken, result) { return this.#finish(taskId, workerId, leaseToken, 'succeeded', result, null); }
  async fail(taskId, workerId, leaseToken, error) {
    return this.store.transact(state => {
      const task = state.tasks[taskId]; this.#assertLease(task, workerId, leaseToken);
      task.last_error = String(error && error.message || error || 'Unknown error').slice(0,4000);
      task.status = task.attempts >= task.max_attempts ? 'failed' : 'queued';
      task.worker_id = null; task.lease_until = null; task.lease_token = null; task.updated_at = this.now();
      state.events.push({ at: this.now(), task_id: taskId, event: task.status === 'failed' ? 'task.dead_lettered' : 'task.retry_queued', error: task.last_error });
      return task;
    });
  }
  async #finish(taskId, workerId, leaseToken, status, result, error) {
    return this.store.transact(state => {
      const task = state.tasks[taskId]; this.#assertLease(task, workerId, leaseToken);
      task.status = status; task.result = result; task.last_error = error;
      task.worker_id = null; task.lease_until = null; task.lease_token = null; task.updated_at = this.now();
      state.events.push({ at: this.now(), task_id: taskId, event: `task.${status}` });
      return task;
    });
  }
  async get(taskId) { return (await this.store.read()).tasks[taskId] || null; }
  async stats() {
    const tasks = Object.values((await this.store.read()).tasks);
    return tasks.reduce((a,t) => { a.total++; a[t.status] = (a[t.status] || 0) + 1; return a; }, { total: 0 });
  }
}
module.exports = { TaskQueue };
