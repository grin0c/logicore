const Manager = require("./Manager.js");
const Event = require("./Event.js");
const Action = require("./Action.js");

module.expprts = class Logger extends Manager {
  constructor(data) {
    super(data);
    this.registerSchema("action", Action.ACTION_SCHEMA);
    this.registerSchema("event", Event.EVENT_SCHEMA);
  }

  async logAction(action) {
    await this.insert("action", action)
      .catch((err) => {
        console.log("EPIC PROBLEM! Can't put the action into the database", action);
      });
  }

  async updateAction(action) {
    await this.update("action", action.id, _.omit(action, "id"))
      .catch((err) => {
        console.log("EPIC PROBLEM! Can't update the action in the database", action);
        this.logError(action, Event.EVENT_STAGE.ACTION_UPDATING, { action }, err);
        throw err;
      });
  }

  async logError(action, stage, inData, error) {
    const event = Event.fromError(action, stage, inData, error);
    await this.insert("event", event)
      .catch((err) => {
        console.log("EPIC PROBLEM! Can't put the ERROR into the database", event);
      });
  }

  async logSuccess(action, stage, inData, outData) {
    const event = Event.success(action, stage, inData, outData);
    await this.insert("event", event)
      .catch((err) => {
        console.log("EPIC PROBLEM! Can't put the SUCCESS event into the database", event);
      });
  }
};