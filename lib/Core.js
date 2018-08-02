const _ = require("lodash");
const Promise = require("bluebird");
const Trigger = require("./Trigger");
const Action = require("./Action");
const Manager = require("./Manager");
const Logger = require("./Manager");
const Event = require("./Event");

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
    this.db = new Manager(this.config.dbAdapter);
    this.logger = new Logger(this.config.dbLogAdapter);
  }

  async init() {
    await this.db.init();
    await this.logger.init();
  }

  registerSchema(key, schema) {
    this.db.registerSchema(key, schema);
  }

  hook(schemaKey, triggerData) {
    const trigger = (triggerData instanceof Trigger)
      ? triggerData
      : new Trigger(triggerData);

    if (!this.triggers[trigger.type][schemaKey]) {
      this.triggers[trigger.type][schemaKey] = [trigger];
    } else {
      this.triggers[trigger.type].push(trigger);
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

      await action.populateWithOld(this.db, this.logger);

      await action.applyPrepatches(action);
      await this.logger.updateAction(action);

      await this.log.save(action);

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