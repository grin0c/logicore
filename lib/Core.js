const _ = require("lodash");
const Promise = require("bluebird");
const Trigger = require("./Trigger");
const Action = require("./Action");
const Event = require("./Event");
const Manager = require("./Manager");
const Logger = require("./Logger");
const Ajv = require("ajv");

const defaultConfig = {
  dbAdapter: {},
  dbLogAdapter: {},
  createdAt: false,
  updatedAt: false,

  prepatchDepth: 4,
  prepatchDontRepeat: true,

  subactionDepth: 4,
  subactionDontRepeat: true
};

module.exports = class LogiCore {
  constructor(config) {
    this.config = _.merge({}, defaultConfig, config);
    this.triggers = {
      [Trigger.TRIGGER_TYPE.PREPATCH]: {},
      [Trigger.TRIGGER_TYPE.SUBACTION]: {}
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

    trigger.core = this;

    if (!this.triggers[trigger.type][schemaKey]) {
      this.triggers[trigger.type][schemaKey] = [trigger];
    } else {
      this.triggers[trigger.type][schemaKey].push(trigger);
    }
  }

  hookPrepatch(schemaKey, triggerData) {
    this.hook(schemaKey, { type: Trigger.TRIGGER_TYPE.PREPATCH, ...triggerData })
  }

  hookSubaction(schemaKey, triggerData) {
    this.hook(schemaKey, { type: Trigger.TRIGGER_TYPE.SUBACTION, ...triggerData })
  }

  async commitAction(actionBlank, depth = 0, hashOfPerformed = {}) {
    let action;
    try {
      if (!actionBlank.parent) {
        await this.db.beginTransaction();
      }
      action = actionBlank instanceof Action
        ? actionBlank
        : new Action(actionBlank);

      await this.logger.logAction(action);

      await action.populateWithOld(this);
      await action.prepatch(this);
      await action.validate(this);
      await action.perform(this);

      if (action.status === Action.ACTION_STATUS.PERFORMED) {
        const subactionTriggers = await action.filterTriggers(
          this,
          Trigger.TRIGGER_TYPE.SUBACTION,
          this.config.subactionDontRepeat,
          Event.EVENT_STAGE.SUBACTION_FILTERING,
          depth,
          hashOfPerformed
        );
        for (const trigger of subactionTriggers) {
          let subactions;
          try {
            subactions = await trigger.getSubactions(action);
          } catch(err) {
            await this.logger.logError(
              action.id,
              Event.EVENT_STAGE.SUBACTION_GENERATING,
              { trigger: trigger.key, v: trigger.v, depth, ...(action._extractData()) },
              err
            );
            throw err;
          }
          hashOfPerformed[trigger.key] = true;
          if (subactions) {
            for (const subaction of subactions) {
              subaction.trigger = trigger.key;
              subaction.parent = action.id;
              subaction.rootParent = action.rootParent || action.id;
              subaction.depth = depth + 1;
              await this.commitAction(subaction, depth + 1, hashOfPerformed);
            }
          }
        }
      }

      action.status = Action.ACTION_STATUS.COMPLETED;
      await this.logger.updateAction(action);
      
      if (!actionBlank.parent) {
        await this.db.endTransaction();
      }
      return action;
    } catch(err) {
      if (!actionBlank.parent) {
        await this.db.rollbackTransaction();
      }

      if (action) {
        err.action = action;
        action.status = Action.ACTION_STATUS.ERROR;
        await this.logger.updateAction(action);
      }
      throw err;
    }
  }
};