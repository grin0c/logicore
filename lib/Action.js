const _ = require("lodash");
const Promise = require("bluebird");
const Event = require("./Event");
const Utils = require("./Utils");
const Trigger = require("./Trigger");

const ACTION_TYPE = {
  INSERT: 1,
  UPDATE: 2,
  UPSERT: 3
};

const ACTION_STATUS = {
  PENDING: 1,
  SKIPPED: 2,
  PERFORMED: 3,
  COMPLETED: 10,
  ERROR: 20
};

const ACTION_SCHEMA = {
  properties: {
    id: {
      type: "integer",
      default: null
    },
    type: {
      type: "integer",
      enum: Object.values(ACTION_STATUS),
      default: null,
      description: "ACTION_TYPE"
    },
    metaKey: {
      type: "string",
      title: "Any arbitrary key",
      default: null
    },
    metaData: {
      type: "object",
      title: "Any arbitrary information",
      default: null
    },
    parent: {
      type: "integer",
      default: null,
      description: "Parent action id"
    },
    rootParent: {
      type: "integer",
      default: null,
      description: "Root parent action id"
    },
    depth: {
      type: "integer",
      default: 0,
      description: "Depth of subaction"
    },
    schemaKey: {
      type: "integer",
      default: null
    },
    instanceId: {
      type: "integer",
      default: null
    },
    instanceFilter: {
      type: "object",
      default: null,
      description: "Filter to find target instance for upserting"
    },
    data: {
      type: "object",
      default: null,
      description: "Original data from the action creator"
    },
    dataOld: {
      type: "object",
      default: null,
      description: "Existing data (before the action took part), for INSERT operation should be empty"
    },
    dataDiff: {
      type: "object",
      default: null,
      description: "Difference between old and new data"
    },
    dataDiffPrepatched: {
      type: "object",
      default: null,
      description: "Difference after prepatch"
    },
    dataResult: {
      type: "object",
      default: null,
      description: "Result after performing"
    },
    dataResultId: {
      type: "integer",
      default: null,
      description: "Result id"
    },
    status: {
      type: "integer",
      enum: Object.values(ACTION_STATUS),
      default: ACTION_STATUS.PENDING,
      description: "Status of the execution"
    },
    attempt: {
      type: "integer",
      default: 0,
      description: "Attempt to perform an action"
    }
  }
};

class Action {
  constructor(data) {
    ["dataOld", "dataDiff", "dataDiffPrepatched", "dataResult", "status"].forEach(key => {
      if (!_.isNil(data[key])) {
        throw new Error(`Action.${key} should be empty!`);
      }
    });

    Object.keys(ACTION_SCHEMA.properties).forEach(key => {
      this[key] = _.isNil(data[key]) ? ACTION_SCHEMA.properties[key].default : data[key];
    });
    if (this.id) {
      throw new Error("Action.id will be created automatically and therefore should be empty");
    }

    this.type = Number(this.type);

    if (Object.values(ACTION_TYPE).indexOf(this.type) === -1) {
      throw new Error(`Action.type has inappropriate value ${this.type}`);
    }

    if (!this.schemaKey) {
      throw new Error("Action.schemaKey is required");
    }
    if (!this.data) {
      throw new Error("Action.data is required");
    }
    if (typeof this.data !== "object") {
      throw new Error("Action.data should be an object");
    }
    if (Array.isArray(this.data)) {
      throw new Error("Action.data should not be an array");
    }

    switch (this.type) {
      case ACTION_TYPE.INSERT:
        if (this.instanceId) {
          throw new Error("Action.instanceId should be empty for INSERT type");
        }
        if (this.instanceFilter) {
          throw new Error("Action.instanceFilter should be empty for INSERT type");
        }
        break;
      case ACTION_TYPE.UPDATE:
        if (!this.instanceId) {
          throw new Error("Action.instanceId is required for UPDATE type");
        }
        if (this.instanceFilter) {
          throw new Error("Action.instanceFilter should be empty for UPDATE type");
        }
        break;
      case ACTION_TYPE.UPSERT:
        if (this.instanceId) {
          throw new Error("Action.instanceId should be empty for UPSERT type");
        }
        if (!this.instanceFilter) {
          throw new Error("Action.instanceFilter is required for UPSERT type");
        }
        if (typeof this.instanceFilter !== "object") {
          throw new Error("Action.instanceFilter should be an object");
        }
        break;
      // no default
    }
  }

  getFreshestDiff() {
    return this.dataDiffPrepatched || this.dataDiff || this.data;
  }

  getFreshestInstance() {
    const diff = this.getFreshestDiff();
    if (!this.dataOld) {
      return diff;
    }
    return Object.assign({}, this.dataOld, diff);
  }

  _extractData() {
    return {
      data: this.data,
      dataOld: this.dataOld,
      dataDiff: this.dataDiff,
      dataDiffPrepatched: this.dataDiffPrepatched
    };
  }

  async populateWithOld(core, transaction) {
    const { logger, db } = core;
    try {
      if (this.type === ACTION_TYPE.INSERT) {
        return;
      }

      switch (this.type) {
        case ACTION_TYPE.INSERT:
          return;
        case ACTION_TYPE.UPDATE:
          this.dataOld = Object.assign({}, await db.findOne(this.schemaKey, { id: this.instanceId }, transaction));
          break;
        case ACTION_TYPE.UPSERT:
          this.dataOld = Object.assign({}, await db.findOne(this.schemaKey, this.instanceFilter, transaction));
          break;
        default:
          throw new Error(`Unknown action.type ${this.type}`);
      }

      this.dataDiff = Object.assign({}, Utils.getPatchDiff(this.data, this.dataOld, db.schemas[this.schemaKey]));
    } catch (err) {
      await logger.logError(
        this.id,
        this.attempt,
        Event.EVENT_STAGE.POPULATING,
        { instanceId: this.instanceId, instanceFilter: this.instanceFilter, data: this.data },
        err
      );
      throw err;
    }
    await logger.logSuccess(
      this.id,
      this.attempt,
      Event.EVENT_STAGE.POPULATING,
      { instanceId: this.instanceId, instanceFilter: this.instanceFilter, data: this.data },
      { dataOld: this.dataOld, dataDiff: this.dataDiff }
    );
    await logger.updateAction(this);
  }

  /**
   * Performs all the prepatching procedure with checking and applying all of the subscribed triggers
   * @param core
   * @param transaction
   * @param depth
   * @param hashOfPerformed
   * @returns {Promise}
   */
  async prepatch(core, transaction, depth = 0, hashOfPerformed = {}) {
    const { logger, config } = core;

    const filteredTriggers = await this.filterTriggers(
      core,
      Trigger.TRIGGER_TYPE.PREPATCH,
      config.prepatchDontRepeat,
      Event.EVENT_STAGE.PREPATCH_CHECKING,
      depth,
      hashOfPerformed,
      transaction
    );
    const patched = await this._prepatchingApplyTriggers(core, filteredTriggers, depth, hashOfPerformed, transaction);

    if (patched && depth <= config.prepatchDepth) {
      await this.prepatch(core, transaction, (Number(depth) || 0) + 1, Object.assign({}, hashOfPerformed));
    }

    if (patched) {
      await logger.updateAction(this);
    }

    return patched;
  }

  /**
   * If there are new changes in patch, merges them into dataDiffPrepatched and returns true
   * Otherwise, returns false
   * @param {object} core
   * @param {object} patch
   * @returns {boolean}
   * @private
   */
  _prepatchingApplyData(core, patch) {
    const { db } = core;

    let old = this.dataOld;
    let currentDiff = this.dataDiffPrepatched || this.dataDiff;
    if (this.type === ACTION_TYPE.INSERT) {
      old = {};
      currentDiff = this.dataDiffPrepatched || this.data;
    }

    const newDiff = Object.keys(patch).reduce((memo, key) => {
      const value = patch[key];
      const property = db.schemas[this.schemaKey].properties[key];
      if (!property) {
        return memo;
      }

      const hasInDiff = Object.prototype.hasOwnProperty.call(currentDiff, key);
      const hasInOld = Object.prototype.hasOwnProperty.call(old, key);

      const oldValue = hasInOld ? old[key] : undefined;
      const beforeValue = hasInDiff ? currentDiff[key] : oldValue;

      if (!Utils.areEqual(value, beforeValue, property)) {
        memo[key] = value;
      }
      return memo;
    }, {});

    if (!Object.keys(newDiff)) {
      return false;
    }

    this.dataDiffPrepatched = Object.assign({}, currentDiff, newDiff);

    return true;
  }

  /**
   * Filter triggers, which should apply for this action
   * @param {object} core
   * @param {number} triggerType – type of triggers (Trigger.TRIGGER_TYPE.PREPATCH or Trigger.TRIGGER_TYPE.SUBACTION)
   * @param {boolean} dontRepeat – dont take if trigger id is in hashOfPerformed
   * @param {boolean} stage – action stage (needed for logging)
   * @param {number} depth – current depth of recursion (needed for logging)
   * @param {object} hashOfPerformed – used to filter out already applied triggers
   * @returns Promise{Array.<Trigger>}
   * @private
   */
  async filterTriggers(core, triggerType, dontRepeat, stage, depth, hashOfPerformed, transaction) {
    const { logger, triggers } = core;
    if (!triggers[triggerType][this.schemaKey]) {
      return [];
    }

    return Promise.filter(triggers[triggerType][this.schemaKey], async trigger => {
      // if this trigger was already performed for this action,
      // don't repeat it
      if (dontRepeat && hashOfPerformed[trigger.key]) {
        return false;
      }

      let conditionResult;
      try {
        conditionResult = await trigger.calculateCondition(this, transaction);
      } catch (err) {
        await logger.logError(
          this.id,
          this.attempt,
          stage,
          {
            trigger: trigger.key,
            v: trigger.v,
            depth,
            ...this._extractData()
          },
          err
        );
        throw err;
      }
      if (conditionResult) {
        await logger.logSuccess(
          this.id,
          this.attempt,
          stage,
          {
            trigger: trigger.key,
            v: trigger.v,
            depth,
            ...this._extractData()
          },
          { conditionResult }
        );
      }
      return conditionResult;
    });
  }

  /**
   * Apply selected triggers for prepatching
   * @param core
   * @param {Trigger} triggers[]
   * @param {number} depth – current depth of recursion (needed for logging)
   * @param {Object} hashOfPerformed – we put newly applied triggers into this hash
   * @param {Object} transaction
   * @returns Promise {Boolean} - was something changed or not
   * @private
   */
  async _prepatchingApplyTriggers(core, triggers, depth, hashOfPerformed, transaction) {
    const { logger } = core;
    let patched = false;
    // eslint-disable-next-line no-restricted-syntax
    for (const trigger of triggers) {
      let triggerPatch;
      try {
        // eslint-disable-next-line no-await-in-loop
        triggerPatch = await trigger.getPatch(this, transaction);
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await logger.logError(
          this.id,
          this.attempt,
          Event.EVENT_STAGE.PREPATCH_PERFORMING,
          {
            trigger: trigger.key,
            v: trigger.v,
            depth,
            ...this._extractData()
          },
          err
        );
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      await logger.logSuccess(
        this.id,
        this.attempt,
        Event.EVENT_STAGE.PREPATCH_PERFORMING,
        {
          trigger: trigger.key,
          v: trigger.v,
          depth,
          ...this._extractData()
        },
        { triggerPatch }
      );

      hashOfPerformed[trigger.key] = true;

      const isPatched = this._prepatchingApplyData(core, triggerPatch);
      patched = patched || isPatched;
    }

    return patched;
  }

  async validate(core) {
    const { logger } = core;
    const values = this.getFreshestInstance();
    let result;
    try {
      result = core.db.validate(this.schemaKey, values);
    } catch (err) {
      await logger.logError(this.id, this.attempt, Event.EVENT_STAGE.VALIDATION, { values }, err);
      throw err;
    }
    if (result !== true) {
      const err = new Error("Validation result error. See details in log.outData.");
      await logger.logError(
        this.id,
        this.attempt,
        Event.EVENT_STAGE.VALIDATION,
        {
          values,
          result
        },
        err
      );
      throw err;
    }
    await logger.logSuccess(
      this.id,
      this.attempt,
      Event.EVENT_STAGE.VALIDATION,
      {
        values
      },
      {}
    );
  }

  async perform(core, transaction) {
    const { db, logger } = core;
    const inData = {};

    try {
      switch (this.type) {
        case ACTION_TYPE.INSERT:
          inData.values = this.getFreshestInstance();
          this.dataResult = await db.insert(this.schemaKey, inData.values, transaction);
          break;
        case ACTION_TYPE.UPDATE:
        case ACTION_TYPE.UPSERT:
          inData.diff = this.getFreshestDiff();
          if (Object.keys(inData.diff).length) {
            const methodName = this.type === ACTION_TYPE.UPDATE ? "update" : "upsert";

            this.dataResult = await db[methodName](this.schemaKey, this.instanceId, inData.diff, transaction);
          } else {
            this.dataResult = null;
            this.status = ACTION_STATUS.SKIPPED;
          }
          break;
        // no default
      }
      this.dataResultId = this.dataResult && this.dataResult.id;
    } catch (err) {
      await logger.logError(this.id, this.attempt, Event.EVENT_STAGE.PERFORMING, inData, err);
      throw err;
    }

    await logger.logSuccess(this.id, this.attempt, Event.EVENT_STAGE.PERFORMING, inData, {
      dataResult: this.dataResult
    });
    if (this.status !== ACTION_STATUS.SKIPPED) {
      this.status = ACTION_STATUS.PERFORMED;
    }
    await logger.updateAction(this);
  }

  static async beginTransaction(core) {
    if (!core || !core.db || !core.db.adapter) {
      return undefined;
    }
    if (typeof core.db.adapter.transaction !== "function") {
      return undefined;
    }
    return core.db.adapter.transaction();
  }

  static async endTransaction(transaction) {
    if (typeof transaction !== "function") {
      return undefined;
    }
    return transaction.commit();
  }

  static async rollbackTransaction(transaction) {
    if (typeof transaction !== "function") {
      return undefined;
    }
    return transaction.rollback();
  }
}

Action.ACTION_TYPE = ACTION_TYPE;
Action.ACTION_STATUS = ACTION_STATUS;
Action.ACTION_SCHEMA = ACTION_SCHEMA;

module.exports = Action;
