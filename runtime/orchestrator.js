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
    const handler = this.registry.get(task.type);
    if (!handler) {
      await this.queue.fail(task.id, workerId, new Error(`No handler registered for task type: ${task.type}`));
      return { worked: true, task_id: task.id, status: 'retry_or_failed', reason: 'handler_missing' };
    }
    try {
      const result = await handler(task.payload, { task, workerId, heartbeat: () => this.queue.heartbeat(task.id, workerId) });
      const completed = await this.queue.complete(task.id, workerId, result ?? null);
      return { worked: true, task_id: task.id, status: completed.status, result: completed.result };
    } catch (error) {
      const failed = await this.queue.fail(task.id, workerId, error);
      return { worked: true, task_id: task.id, status: failed.status, error: failed.last_error };
    }
  }
}
module.exports = { Orchestrator };
