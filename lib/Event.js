const _ = require("lodash");

const EVENT_STAGE = {
  POPULATING: 1,
  PREPATCH_CHECKING: 2,
  PREPATCH_PERFORMING: 3,
  VALIDATION: 4,
  PERFORMING: 5,
  SUBACTION_FILTERING: 6,
  SUBACTION_GENERATING: 7,
  ACTION_UPDATING: 100
};

const EVENT_SCHEMA = {
  properties: {
    id: {
      type: "integer",
      default: null
    },
    action: {
      type: "integer",
      description: "Relevant action id"
    },
    stage: {
      type: "integer",
      enum: Object.values(EVENT_STAGE),
      description: "Relevant action stage"
    },
    isError: {
      type: "boolean"
    },
    inData: {
      type: "object"
    },
    outData: {
      type: "object"
    },
    errorMessage: {
      type: "string",
      default: ""
    },
    errorStack: {
      type: "string",
      default: ""
    },
    attempt: {
      type: "integer",
      default: 0,
      description: "Attempt to perform an action"
    }
  },
  required: ["action", "stage", "isError", "inData", "outData", "attempt"]
};

class Event {
  constructor(data) {
    Object.keys(EVENT_SCHEMA.properties).forEach(key => {
      const property = EVENT_SCHEMA.properties[key];
      if (_.isNil(data[key])) {
        if (property.required) {
          throw new Error(`Event.${key} should not be empty`);
        }
        this[key] = !_.isNil(property.default) ? property.default : null;
      } else {
        this[key] = data[key];
      }
    });
  }

  static fromError(action, attempt, stage, inData, error) {
    return new Event({
      action,
      attempt,
      stage,
      isError: true,
      inData,
      outData: Object.assign({}, error),
      errorMessage: error.message,
      errorStack: error.stack
    });
  }

  static success(action, attempt, stage, inData, outData) {
    return new Event({
      action,
      attempt,
      stage,
      isError: false,
      inData,
      outData
    });
  }
}

Event.EVENT_SCHEMA = EVENT_SCHEMA;
Event.EVENT_STAGE = EVENT_STAGE;

module.exports = Event;
