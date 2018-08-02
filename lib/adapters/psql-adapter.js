const { Client } = require('pg');
const knex = require("knex");

module.exports = class Adapter {
  constructor(config) {
    this.config = Object.assign({
      host: "localhost",
      port: 5432,
      database: null,
      user: null,
      password: null
    }, config);

    this.client = new Client(config);
  }

  async init() {
    await this.client.connect();
  }

  async insert(schemaKey, schema, data) {
    const query = knex(schemaKey).insert(data);
    const result = await this.client.query(query);

    return result.rows[0];
  }

  async findOne(schemaKey, schema, filter) {
    const query = knex(schemaKey).select().where(filter);
    const result = await this.client.query(query);

    return result.rows[0];
  }
};