const _ = require("lodash");
const Manager = require("./Manager.js");
const Event = require("./Event.js");
const Action = require("./Action.js");

class Logger extends Manager {
  constructor(data, ajv) {
    super(data);
    this.registerSchema("action", Action.ACTION_SCHEMA, ajv);
    this.registerSchema("event", Event.EVENT_SCHEMA, ajv);
  }

  async logAction(action) {
    const result = await this.insert("action", action).catch(() => {
      // eslint-disable-next-line no-console
      console.log("EPIC PROBLEM! Can't put the action into the database", action);
    });
    action.id = result.id;
  }

  async updateAction(action) {
    await this.update("action", action.id, _.omit(action, "id")).catch(err => {
      // eslint-disable-next-line no-console
      console.log("EPIC PROBLEM! Can't update the action in the database", action);
      this.logError(action, action.attempt, Event.EVENT_STAGE.ACTION_UPDATING, { action }, err);
      throw err;
    });
  }

  async logError(action, attempt, stage, inData, error) {
    const event = Event.fromError(action, attempt, stage, inData, error);
    await this.insert("event", event).catch(() => {
      // eslint-disable-next-line no-console
      console.log("EPIC PROBLEM! Can't put the ERROR into the database", event);
    });
  }

  async logSuccess(action, attempt, stage, inData, outData) {
    const event = Event.success(action, attempt, stage, inData, outData);
    await this.insert("event", event).catch(() => {
      // eslint-disable-next-line no-console
      console.log("EPIC PROBLEM! Can't put the SUCCESS event into the database", event);
    });
  }
}

module.exports = Logger;
