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

  async insert(schemaKey, data, transaction) {
    if (!this.schemas[schemaKey]) {
      throw new Error(`Schema ${schemaKey} is not registered`);
    }

    return this.adapter.insert(schemaKey, data, transaction);
  }

  async findOne(schemaKey, filter, transaction) {
    if (!this.schemas[schemaKey]) {
      throw new Error(`Schema ${schemaKey} is not registered`);
    }

    return this.adapter.findOne(schemaKey, filter, {}, transaction);
  }

  async update(schemaKey, id, patch, transaction) {
    if (!this.schemas[schemaKey]) {
      throw new Error(`Schema ${schemaKey} is not registered`);
    }

    return this.adapter.update(schemaKey, id, patch, transaction);
  }

  async upsert(schemaKey, instanceFilter, values, transaction) {
    if (!this.schemas[schemaKey]) {
      throw new Error(`Schema ${schemaKey} is not registered`);
    }

    return this.adapter.upsert(schemaKey, instanceFilter, values, transaction);
  }
}

module.exports = Manager;
