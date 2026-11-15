'use strict';
class Orchestrator {
  constructor(queue, registry = {}) { this.queue = queue; this.registry = new Map(Object.entries(registry)); }
  register(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('A task type and handler function are required.');
    if (this.registry.has(type)) throw new Error(`Handler already registered for ${type}.`);
    this.registry.set(type, handler);
  }
  async runOne(workerId = `worker-${process.pid}`) {
    const task = await this.queue.claim(workerId);
    if (!task) return { worked: false };
    const leaseToken = task.lease_token;
    const lease = { task, workerId, leaseToken, heartbeat: () => this.queue.heartbeat(task.id, workerId, leaseToken) };
    const handler = this.registry.get(task.type);
    if (!handler) {
      const failed = await this.queue.fail(task.id, workerId, leaseToken, new Error(`No handler registered for task type: ${task.type}`));
      return { worked: true, task_id: task.id, status: failed.status, reason: 'handler_missing' };
    }
    try {
      const result = await handler(task.payload, lease);
      const completed = await this.queue.complete(task.id, workerId, leaseToken, result ?? null);
      return { worked: true, task_id: task.id, status: completed.status, result: completed.result };
    } catch (error) {
      const failed = await this.queue.fail(task.id, workerId, leaseToken, error);
      return { worked: true, task_id: task.id, status: failed.status, error: failed.last_error };
    }
  }
}
module.exports = { Orchestrator };
