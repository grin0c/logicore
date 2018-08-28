const _ = require("lodash");

const INSTANCES = {
  person: require("./Person.js").instances
};
  
module.exports = class Adapter {
  constructor() {
    this.calls = [];
    this.instances = {};
    this.idPool = {};
    this.schemas = {};
  }

  init() {}

  _registerCall(title, args) {
    this.calls.push({ title, args });
  }

  registerSchema(schemaKey, schema) {
    this.instances[schemaKey] = INSTANCES[schemaKey]
      ? _.clone(INSTANCES[schemaKey])
      : [];
    this.idPool[schemaKey] = _.reduce(this.instances[schemaKey], (nextFreeId, instance) => {
      if (Number(instance.id) >= nextFreeId) {
        return Number(instance.id) + 1;
      }
      return nextFreeId;
    }, 1);
    this.schemas[schemaKey] = schema;
  }

  async insert(schemaKey, data) {
    const instances = this.instances[schemaKey];
    const dataToInsert = Object.assign({}, data, {
      id: this.idPool[schemaKey]++
    });
    
    instances.push(dataToInsert);
    return dataToInsert;
  }

  async update(schemaKey, id, patch) {
    const instance = await this.findOne(schemaKey, { id });
    return Object.assign({}, instance, patch);
  }

  async findOne(schemaKey, filter) {
    this._registerCall("db.findOne", [schemaKey, filter]);
    return new Promise((resolve, reject) => {
      const instances = this.instances[schemaKey];
      const item = instances.find(instance => Object.keys(filter).every(key => instance[key] === filter[key]))

      if (!item) { reject(new Error(`Item not found ${JSON.stringify(filter)}`)); }
      resolve(item);
    });
  }
};