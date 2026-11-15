'use strict';
const { StateStore } = require('./state-store');
const { TaskQueue } = require('./task-queue');
const { PostgresTaskQueue } = require('./postgres-queue');
const { Orchestrator } = require('./orchestrator');
const { runWorker } = require('./worker-loop');

async function createRuntime(statePath, options = {}) {
  const store = await new StateStore(statePath).init();
  const queue = new TaskQueue(store, options);
  const orchestrator = new Orchestrator(queue);
  return { store, queue, orchestrator };
}

function createPostgresRuntime(pool, options = {}) {
  const queue = new PostgresTaskQueue(pool, options);
  const orchestrator = new Orchestrator(queue);
  return { queue, orchestrator, runWorker };
}

module.exports = { createRuntime, createPostgresRuntime, StateStore, TaskQueue, PostgresTaskQueue, Orchestrator, runWorker };
