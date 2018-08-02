const PgAdapter = require("./adapters/psql-adapter.js");

module.exports = class Manager {
  constructor(adapter) {
    // this.adapter = new PgAdapter(adapterConfig);
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

    return await this.adapter.insert(schemaKey, this.schemas[schemaKey], data);
  };

  async findOne(schemaKey, filter) {
    await this._ensureReady();
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return await this.adapter.findOne(schemaKey, this.schemas[schemaKey], filter);
  }
};