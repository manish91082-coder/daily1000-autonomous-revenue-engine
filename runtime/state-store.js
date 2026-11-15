'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class StateStore {
  constructor(filePath) { this.filePath = path.resolve(filePath); }
  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try { await fs.access(this.filePath); }
    catch { await this.write({ schema_version: 1, revision: 0, tasks: {}, events: [] }); }
    return this;
  }
  async read() {
    const state = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    if (state.schema_version !== 1 || !Number.isInteger(state.revision) || !state.tasks || !Array.isArray(state.events)) throw new Error('State file failed schema validation.');
    return state;
  }
  async write(state) {
    const temp = `${this.filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, this.filePath);
  }
  async transact(mutator) {
    // Single-process atomic replacement only. Multi-process/cloud deployment requires a transactional DB or queue.
    const state = await this.read();
    const result = await mutator(state);
    state.revision += 1;
    await this.write(state);
    return result;
  }
}
module.exports = { StateStore };
