const _ = require("lodash");
const Promise = require("bluebird");
const Trigger = require("./Trigger");
const Action = require("./Action");
const Manager = require("./Manager");
const Logger = require("./Logger");
const Ajv = require("ajv");

const defaultConfig = {
  dbAdapter: {},
  dbLogAdapter: {},
  createdAt: false,
  updatedAt: false,

  prepatchDepth: 4
};

module.exports = class LogiCore {
  constructor(config) {
    this.config = _.merge({}, defaultConfig, config);
    this.triggers = {
      [Trigger.TRIGGER_TYPE.PREPATCH]: {},
      [Trigger.TRIGGER_TYPE.ACTION]: {}
    };
    this.ajv = new Ajv();
    this.db = new Manager(this.config.dbAdapter);
    this.logger = new Logger(this.config.dbLogAdapter, this.ajv);
  }

  async init() {
    await this.db.init();
    await this.logger.init();
  }

  registerSchema(key, schema) {
    this.db.registerSchema(key, schema, this.ajv);
  }

  hook(schemaKey, triggerData) {
    const trigger = (triggerData instanceof Trigger)
      ? triggerData
      : new Trigger(triggerData);

    if (!this.triggers[trigger.type][schemaKey]) {
      this.triggers[trigger.type][schemaKey] = [trigger];
    } else {
      this.triggers[trigger.type][schemaKey].push(trigger);
    }
  }

  hookPrepatch(schemaKey, triggerData) {
    this.hook(schemaKey, { type: Trigger.TRIGGER_TYPE.PREPATCH, ...triggerData })
  }

  hookAction(schemaKey, triggerData) {
    this.hook(schemaKey, { type: Trigger.TRIGGER_TYPE.ACTION, ...triggerData })
  }

  async commitAction(actionBlank) {
    let action;
    try {
      if (!actionBlank.parent) {
        await this.db.beginTransaction();
      }
      action = new Action(actionBlank);
      await this.logger.logAction(action);

      await action.populateWithOld(this);
      await action.prepatch(this);
      await action.validate(this);


      this.db.performAction(action);

      // this._publish(action);

      if (!actionBlank.parent) {
        await this.db.endTransaction();
      }
    } catch(err) {
      await this.db.rollbackTransaction();

      if (action) {
        action.status = Action.ACTION_STATUS.ERROR;
        await this.logger.updateAction(action);
      }
    }
  }
};