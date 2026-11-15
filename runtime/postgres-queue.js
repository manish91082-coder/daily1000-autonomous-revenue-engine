'use strict';
const crypto = require('node:crypto');

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.task_type,
    payload: row.payload,
    idempotency_key: row.idempotency_key,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    available_at: row.available_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    worker_id: row.lease_owner,
    lease_until: row.lease_expires_at,
    lease_token: row.lease_token,
    result: row.result,
    last_error: row.last_error
  };
}

class PostgresTaskQueue {
  constructor(pool, options = {}) {
    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
      throw new Error('A PostgreSQL Pool-compatible client is required.');
    }
    this.pool = pool;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.retryDelaySeconds = options.retryDelaySeconds ?? 15;
    if (!Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 5 || this.leaseSeconds > 3600) {
      throw new Error('leaseSeconds must be an integer from 5 to 3600.');
    }
    if (!Number.isInteger(this.retryDelaySeconds) || this.retryDelaySeconds < 1 || this.retryDelaySeconds > 3600) {
      throw new Error('retryDelaySeconds must be an integer from 1 to 3600.');
    }
  }

  async enqueue({ type, payload = {}, idempotencyKey, priority = 0, maxAttempts = 3 }) {
    if (!type || typeof type !== 'string') throw new Error('Task type is required.');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error('maxAttempts must be an integer from 1 to 20.');
    }
    if (!Number.isSafeInteger(priority) || priority < -2147483648 || priority > 2147483647) {
      throw new Error('priority must be a 32-bit signed integer.');
    }
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !idempotencyKey.trim())) {
      throw new Error('idempotencyKey must be a non-empty string when provided.');
    }
    const key = idempotencyKey || crypto.randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const inserted = await client.query(
        `insert into revenue_runtime.tasks
          (task_type, payload, idempotency_key, priority, max_attempts)
         values ($1, $2::jsonb, $3, $4, $5)
         on conflict (idempotency_key) do nothing
         returning *`,
        [type, JSON.stringify(payload), key, priority, maxAttempts]
      );
      let row = inserted.rows[0];
      if (row) {
        await client.query(
          `insert into revenue_runtime.task_events(task_id,event_type,detail)
           values ($1,'task.queued','{}'::jsonb)`,
          [row.id]
        );
      } else {
        const existing = await client.query(
          'select * from revenue_runtime.tasks where idempotency_key = $1',
          [key]
        );
        row = existing.rows[0];
      }
      if (!row) throw new Error('Idempotent task lookup failed after enqueue.');
      await client.query('commit');
      return { task: mapTask(row), created: inserted.rowCount === 1 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async claim(workerId) {
    if (!workerId || typeof workerId !== 'string' || !workerId.trim()) {
      throw new Error('workerId is required.');
    }
    const result = await this.pool.query(
      'select * from revenue_runtime.claim_task($1, $2)',
      [workerId, this.leaseSeconds]
    );
    return mapTask(result.rows[0]);
  }

  async heartbeat(taskId, workerId, leaseToken) {
    const result = await this.pool.query(
      'select revenue_runtime.heartbeat_task($1, $2, $3, $4) as ok',
      [taskId, workerId, leaseToken, this.leaseSeconds]
    );
    if (!result.rows[0]?.ok) throw new Error('Task lease is not owned by this worker claim.');
    return this.get(taskId);
  }

  async complete(taskId, workerId, leaseToken, result) {
    const response = await this.pool.query(
      'select revenue_runtime.complete_task($1, $2, $3, $4::jsonb) as ok',
      [taskId, workerId, leaseToken, result == null ? null : JSON.stringify(result)]
    );
    if (!response.rows[0]?.ok) throw new Error('Task lease is not owned by this worker claim.');
    return this.get(taskId);
  }

  async fail(taskId, workerId, leaseToken, error) {
    const message = String(error && error.message || error || 'Unknown error').slice(0, 4000);
    const response = await this.pool.query(
      'select revenue_runtime.fail_task($1, $2, $3, $4, $5) as status',
      [taskId, workerId, leaseToken, message, this.retryDelaySeconds]
    );
    if (response.rows[0]?.status === 'lease_not_owned') {
      throw new Error('Task lease is not owned by this worker claim.');
    }
    return this.get(taskId);
  }

  async get(taskId) {
    const result = await this.pool.query(
      'select * from revenue_runtime.tasks where id = $1',
      [taskId]
    );
    return mapTask(result.rows[0]);
  }

  async stats() {
    const result = await this.pool.query(
      'select status, count(*)::integer as count from revenue_runtime.tasks group by status'
    );
    return result.rows.reduce((stats, row) => {
      stats[row.status] = row.count;
      stats.total += row.count;
      return stats;
    }, { total: 0 });
  }
}

module.exports = { PostgresTaskQueue, mapTask };
