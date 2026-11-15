'use strict';
const { StateStore } = require('./state-store');
const { TaskQueue } = require('./task-queue');
const { Orchestrator } = require('./orchestrator');
async function createRuntime(statePath, options = {}) {
  const store = await new StateStore(statePath).init();
  const queue = new TaskQueue(store, options);
  const orchestrator = new Orchestrator(queue);
  return { store, queue, orchestrator };
}
module.exports = { createRuntime, StateStore, TaskQueue, Orchestrator };
