const _ = require("lodash");
const Ajv = require("ajv");
const Trigger = require("./Trigger");
const Action = require("./Action");
const Event = require("./Event");
const Manager = require("./Manager");
const Logger = require("./Logger");

const defaultConfig = {
  dbAdapter: {},
  dbLogAdapter: {},
  createdAt: false,
  updatedAt: false,

  prepatchDepth: 4,
  prepatchDontRepeat: true,

  subactionDepth: 4,
  subactionDontRepeat: true,

  attemptLimit: 2
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

  registerSchema(key, schema) {
    this.db.registerSchema(key, schema, this.ajv);
  }

  hook(schemaKey, triggerData) {
    const trigger = triggerData instanceof Trigger ? triggerData : new Trigger(triggerData);

    trigger.core = this;

    if (!this.triggers[trigger.type][schemaKey]) {
      this.triggers[trigger.type][schemaKey] = [trigger];
    } else {
      this.triggers[trigger.type][schemaKey].push(trigger);
    }
  }

  hookPrepatch(schemaKey, triggerData) {
    this.hook(schemaKey, { type: Trigger.TRIGGER_TYPE.PREPATCH, ...triggerData });
  }

  hookSubaction(schemaKey, triggerData) {
    this.hook(schemaKey, { type: Trigger.TRIGGER_TYPE.SUBACTION, ...triggerData });
  }

  async commitAction(actionBlank, depth = 0, hashOfPerformed = {}, transactionArg) {
    let action;
    let transaction;
    try {
      transaction = transactionArg || (await Action.beginTransaction(this));
      action = actionBlank instanceof Action ? actionBlank : new Action(actionBlank);

      if (!action.attempt && !action.id) {
        await this.logger.logAction(action);
      }

      await action.populateWithOld(this, transaction);
      await action.prepatch(this, transaction);
      await action.validate(this);
      await action.perform(this, transaction);

      if (action.status === Action.ACTION_STATUS.PERFORMED) {
        const subactionTriggers = await action.filterTriggers(
          this,
          Trigger.TRIGGER_TYPE.SUBACTION,
          this.config.subactionDontRepeat,
          Event.EVENT_STAGE.SUBACTION_FILTERING,
          depth,
          hashOfPerformed,
          transaction
        );
        // eslint-disable-next-line no-restricted-syntax
        for (const trigger of subactionTriggers) {
          let subactions;
          try {
            // eslint-disable-next-line no-await-in-loop
            subactions = await trigger.getSubactions(action, transaction);
          } catch (err) {
            // eslint-disable-next-line no-await-in-loop
            await this.logger.logError(
              action.id,
              action.attempt,
              Event.EVENT_STAGE.SUBACTION_GENERATING,
              {
                trigger: trigger.key,
                v: trigger.v,
                depth,
                ...action._extractData()
              },
              err
            );
            throw err;
          }
          hashOfPerformed[trigger.key] = true;
          if (subactions) {
            // eslint-disable-next-line no-restricted-syntax
            for (const subaction of subactions) {
              subaction.trigger = trigger.key;
              subaction.parent = action.id;
              subaction.rootParent = action.rootParent || action.id;
              subaction.depth = depth + 1;
              // eslint-disable-next-line no-await-in-loop
              await this.commitAction(subaction, depth + 1, hashOfPerformed, transaction);
            }
          }
        }
      }

      action.status = Action.ACTION_STATUS.COMPLETED;
      await this.logger.updateAction(action);

      if (!actionBlank.parent) {
        await Action.endTransaction(transaction);
      }
      return action;
    } catch (err) {
      if (!actionBlank.parent) {
        await Action.rollbackTransaction(transaction);
      }

      if (action) {
        err.action = action;
        action.status = Action.ACTION_STATUS.ERROR;
        await this.logger.updateAction(action);
      }

      if (this.db.adapter.isTransactionError(err) && action.attempt <= this.config.attemptLimit) {
        action.attempt += 1;
        return this.commitAction(action);
      }

      throw err;
    }
  }
};
