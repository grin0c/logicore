// const PgAdapter = require("./adapters/psql-adapter.js");

class Manager {
  constructor(adapter) {
    this.adapter = adapter;
    this.schemas = {};

    this._initPromise = this.init();
    this._initPromise.then(() => {
      delete this._initPromise;
    })
  }

  async init() {
    await this.adapter.init();
  }

  async _ensureReady() {
    if (this._initPromise) {
      await this._initPromise();
    }
  }

  registerSchema(key, schema) {
    this.schemas[key] = schema;
    this.adapter.registerSchema(key, schema);
  }

  async beginTransaction() {
  }

  async endTransaction() {
  }

  async rollbackTransaction() {
  }

  async insert(schemaKey, data) {
    await this._ensureReady();
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return await this.adapter.insert(schemaKey, data);
  };

  async findOne(schemaKey, filter) {
    await this._ensureReady();
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return await this.adapter.findOne(schemaKey, filter);
  }

  async update(schemaKey, id, patch) {
    await this._ensureReady();
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return await this.adapter.update(schemaKey, id, patch);
  }
};

module.exports = Manager;