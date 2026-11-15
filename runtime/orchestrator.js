'use strict';

class Orchestrator {
  constructor(queue, registry = {}, options = {}) {
    this.queue = queue;
    this.registry = new Map(Object.entries(registry));
    const leaseDurationMs = queue?.leaseMs ?? (queue?.leaseSeconds ? queue.leaseSeconds * 1000 : 60000);
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(10, Math.floor(leaseDurationMs / 3));
    if (!Number.isInteger(this.heartbeatIntervalMs) || this.heartbeatIntervalMs < 5) {
      throw new Error('heartbeatIntervalMs must be an integer of at least 5ms.');
    }
  }

  register(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('A task type and handler function are required.');
    if (this.registry.has(type)) throw new Error(`Handler already registered for ${type}.`);
    this.registry.set(type, handler);
  }

  async runOne(workerId = `worker-${process.pid}`) {
    const task = await this.queue.claim(workerId);
    if (!task) return { worked: false };
    const leaseToken = task.lease_token;
    const lease = {
      task, workerId, leaseToken,
      heartbeat: () => this.queue.heartbeat(task.id, workerId, leaseToken)
    };
    const handler = this.registry.get(task.type);
    if (!handler) {
      const failed = await this.queue.fail(task.id, workerId, leaseToken, new Error(`No handler registered for task type: ${task.type}`));
      return { worked: true, task_id: task.id, status: failed.status, reason: 'handler_missing' };
    }

    let heartbeatFailure = null;
    let heartbeatInFlight = null;
    let heartbeatTimer = null;
    if (typeof this.queue.heartbeat === 'function') {
      heartbeatTimer = setInterval(() => {
        if (heartbeatInFlight || heartbeatFailure) return;
        heartbeatInFlight = this.queue.heartbeat(task.id, workerId, leaseToken)
          .catch(error => { heartbeatFailure = error; })
          .finally(() => { heartbeatInFlight = null; });
      }, this.heartbeatIntervalMs);
      heartbeatTimer.unref?.();
    }

    try {
      const result = await handler(task.payload, lease);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (heartbeatInFlight) await heartbeatInFlight;
      if (heartbeatFailure) throw new Error(`Task heartbeat failed: ${heartbeatFailure.message || heartbeatFailure}`);
      const completed = await this.queue.complete(task.id, workerId, leaseToken, result ?? null);
      return { worked: true, task_id: task.id, status: completed.status, result: completed.result };
    } catch (error) {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (heartbeatInFlight) await heartbeatInFlight;
      const failed = await this.queue.fail(task.id, workerId, leaseToken, error);
      return { worked: true, task_id: task.id, status: failed.status, error: failed.last_error };
    }
  }
}

module.exports = { Orchestrator };
