const Event = require("./Event");
const Utils = require("./Utils");

const ACTION_TYPE = {
  INSERT: 1,
  UPDATE: 2,
  UPSERT: 3
};

const ACTION_STATUS = {
  PENDING: 1,
  COMPLETED: 2,
  ERROR: 3
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
    parent: {
      type: "integer",
      default: null,
      description: "Parent action id"
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
      type: "json",
      default: null,
      description: "Filter to find target instance for upserting"
    },
    data: {
      type: "json",
      default: null,
      description: "Original data from the action creator"
    },
    dataOld: {
      type: "json",
      default: null,
      description: "Existing data (before the action took part), for INSERT operation should be empty"
    },
    dataDiff: {
      type: "json",
      default: null,
      description: "Difference between old and new data"
    },
    dataDiffPrepatched: {
      type: "json",
      default: null,
      description: "Difference after prepatch"
    },
    status: {
      type: "integer",
      enum: Object.values(ACTION_STATUS),
      default: ACTION_STATUS.PENDING,
      description: "Status of the execution"
    }
  }
};

class Action {
  constructor(data) {
    ["dataOld", "dataDiff", "dataDiffPrepatched", "stage", "status"].forEach((key) => {
      if (data[key] != undefined) { throw new Error(`Action.${key} should be empty!`)};
    });

    for (const key of Object.keys(ACTION_SCHEMA.properties)) {
      this[key] = data[key] == undefined
        ? ACTION_SCHEMA.properties[key].default
        : data[key];
    }
    if (this.id) { throw new Error("Action.id will be created automatically and therefore should be empty"); }

    this.type = Number(this.type);

    if (Object.values(ACTION_TYPE).indexOf(this.type) === -1) {
      throw new Error(`Action.type has inappropriate value ${this.type}`);
    }

    if (!this.schemaKey) { throw new Error("Action.schemaKey is required"); }
    if (!this.data) { throw new Error("Action.data is required"); }
    if (typeof this.data !== "object") { throw new Error("Action.data should be an object"); }
    if (Array.isArray(this.data)) { throw new Error("Action.data should not be an array"); }

    switch (this.type) {
      case ACTION_TYPE.INSERT:
        if (this.instanceId) { throw new Error("Action.instanceId should be empty for INSERT type"); }
        if (this.instanceFilter) { throw new Error("Action.instanceFilter should be empty for INSERT type"); }
        break;
      case ACTION_TYPE.UPDATE:
        if (!this.instanceId) { throw new Error("Action.instanceId is required for UPDATE type"); }
        if (this.instanceFilter) { throw new Error("Action.instanceFilter should be empty for UPDATE type"); }
        break;
      case ACTION_TYPE.UPSERT:
        if (this.instanceId) { throw new Error("Action.instanceId should be empty for UPSERT type"); }
        if (!this.instanceFilter) { throw new Error("Action.instanceFilter is required for UPSERT type"); }
        if (typeof this.instanceFilter !== "object") { throw new Error("Action.instanceFilter should be an object"); }
        break;
    }
  }

  async populateWithOld(core) {
    const { logger, db } = core;
    try {
      if (this.type === ACTION_TYPE.INSERT) { return; }

      switch (this.type) {
        case ACTION_TYPE.INSERT:
          return;
        case ACTION_TYPE.UPDATE:
          this.dataOld = await db.findOne(this.schemaKey, { id: this.instanceId });
          break;
        case ACTION_TYPE.UPSERT:
          this.dataOld = await db.findOne(this.schemaKey, this.instanceFilter);
          break;
        default:
          throw new Error(`Unknown action.type ${this.type}`);
          break;
      }

      this.dataDiff = Utils.getPatchDiff(this.data, this.dataOld, db.schemas[this.schemaKey]);
    } catch(err) {
      await logger.logError(
        this.id,
        Event.EVENT_STAGE.POPULATING,
        { instanceId: this.instanceId, instanceFilter: this.instanceFilter, data: this.data },
        err
      );
      throw err;
    }
    await logger.logSuccess(
      this.id,
      Event.EVENT_STAGE.POPULATING,
      { instanceId: this.instanceId, instanceFilter: this.instanceFilter, data: this.data },
      { dataOld: this.dataOld, dataDiff: this.dataDiff }
    );
    await logger.updateAction(this);
  }

  /**
   * Performs all the prepatching procedure with checking and applying all of the subscribed triggers
   * @param core
   * @param depth
   * @param hashOfPerformed
   * @returns {Promise}
   */
  async performPrepatching(core, depth = 0, hashOfPerformed = {}) {
    const { logger } = core;

    const filteredTriggers = await this._prepatchingFilterTriggers(core, depth, hashOfPerformed);
    let patched = await this._prepatchingApplyTriggers(core, filteredTriggers, depth, hashOfPerformed);

    if (patched && depth <= core.config.prepatchDepth) {
      await this._prepatchingPerformRecursive(this, (Number(depth) || 0) + 1, Object.assign({}, hashOfPerformed));
    }

    if (!depth && patched) {
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
    if (this.type === ACTION_TYPE.CREATE) {
      old = {};
      currentDiff = this.dataDiffPrepatched || this.data;
    }

    const newDiff = Object.keys(patch).reduce((memo, key, value) => {
      const property = db.schemas[this.schemaKey][key];
      if (!property) { return memo; }

      const hasInDiff = currentDiff.hasOwnProperty(key);
      const hasInOld = old.hasOwnProperty(key);

      const beforeValue = hasInDiff
        ? currentDiff[key]
        : hasInOld
          ? old[key]
          : undefined;

      if (!Utils.areEqual(value, beforeValue, property)) {
        memo[key] = value;
      }
      return memo;
    }, {});

    if (!Object.keys(newDiff)) { return false; }

    this.dataDiffPrepatched = Object.assign({}, currentDiff, newDiff);

    return true;
  }

  /**
   * Filter prepatch triggers, which should apply for this action
   * @param {object} core
   * @param {integer} depth – current depth of recursion (needed for logging)
   * @param {object} hashOfPerformed – used to filter out already applied triggers
   * @returns Promise{Array.<Trigger>}
   * @private
   */
  async _prepatchingFilterTriggers(core, depth, hashOfPerformed) {
    const { logger } = core;
    return Promise.filter(core.prepatchTriggers, async (trigger) => {
      // if this trigger was already performed for this action,
      // don't repeat it
      if (hashOfPerformed[trigger.key]) { return false; }

      let conditionResult;
      try {
        conditionResult = await trigger.calculateCondition(this);
      } catch(err) {
        logger.logError(
          this.id,
          Event.EVENT_STAGE.PREPATCH_CHECKING,
          { trigger: trigger.key, v: trigger.v, depth, action: this },
          err
        );
        throw err;
      }
      await logger.logSuccess(
        this.id,
        Event.EVENT_STAGE.PREPATCH_CHECKING,
        { trigger: trigger.key, v: trigger.v, depth, action: this },
        { conditionResult }
      );
      return conditionResult;
    });
  }

  /**
   * Apply selected triggers for prepatching
   * @param core
   * @param {Trigger} triggers[]
   * @param {integer} depth – current depth of recursion (needed for logging)
   * @param {Object} hashOfPerformed – we put newly applied triggers into this hash
   * @returns Promise {Boolean} - was something changed or not
   * @private
   */
  async _prepatchingApplyTriggers(core, triggers, depth, hashOfPerformed) {
    const { logger } = core;
    let patched = false;
    for (const trigger of triggers) {
      let triggerPatch;
      try {
        triggerPatch = await trigger.getPatch(this);
      } catch(err) {
        logger.logError(
          this.id,
          Event.EVENT_STAGE.PREPATCH_PERFORMING,
          { trigger: trigger.key, v: trigger.v, depth, action: this },
          err
        );
        throw err;
      }
      await logger.logSuccess(
        this.id,
        Event.EVENT_STAGE.PREPATCH_CHECKING,
        { trigger: trigger.key, v: trigger.v, depth, action: this },
        { triggerPatch }
      );

      hashOfPerformed[trigger.key] = true;

      const isPatched = this._prepatchingApplyData(triggerPatch);
      patched = patched || isPatched;
    }

    return patched;
  }
  
  getDataDiff = () => this.type === ACTION_TYPE.CREATE ? this.data : this.dataDiff;
  getDataDiffPrepatched = () => this.dataDiffPrepatched || Object.assign({}, this.getDataDiff());
};

Action.ACTION_TYPE = ACTION_TYPE;
// Action.ACTION_STAGE = ACTION_STAGE;
Action.ACTION_STATUS = ACTION_STATUS;
Action.ACTION_SCHEMA = ACTION_SCHEMA;

module.exports = Action;