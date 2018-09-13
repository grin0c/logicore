

class Manager {
  constructor(adapter) {
    this.adapter = adapter;
    this.schemas = {};
    this.validators = {};
  }

  registerSchema(key, schema, ajv) {
    this.schemas[key] = schema;
    this.validators[key] = ajv.compile(schema);
    this.adapter.registerSchema(key, schema);
  }

  validate(schemaKey, values) {
    const result = this.validators[schemaKey](values);
    return result || this.validators[schemaKey].errors;
  }

  async beginTransaction(core) {
    if (!core || !core.db || !core.db.adapter) { return; }
    if (typeof core.db.adapter.transaction !== "function") { return; }
    this.trx = await core.db.adapter.transaction();
  }

  async endTransaction() {
    if (!this.trx) { return; }
    await this.trx.commit();
  }

  async rollbackTransaction() {
    if (!this.trx) { return; }
    await this.trx.rollback();
  }

  async insert(schemaKey, data) {
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return this.adapter.insert(schemaKey, data, this.trx);
  };

  async findOne(schemaKey, filter) {
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return this.adapter.findOne(schemaKey, filter, this.trx);
  }

  async update(schemaKey, id, patch) {
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return this.adapter.update(schemaKey, id, patch, this.trx);
  }

  async upsert(schemaKey, instanceFilter, values) {
    if (!this.schemas[schemaKey]) { throw new Error(`Schema ${schemaKey} is not registered`); }

    return this.adapter.upsert(schemaKey, instanceFilter, values, this.trx);
  }
};

module.exports = Manager;
