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
    }
  },
  required: ["action", "stage", "isError", "inData", "outData"]
};

class Event {
  constructor(data) {
    for (const key of Object.keys(EVENT_SCHEMA.properties)) {
      const property = EVENT_SCHEMA.properties[key];
      if (data[key] == undefined) {
        if (property.required) {
          throw new Error(`Event.${key} should not be empty`);
        }
        this[key] = property.default != undefined ? property.default : null;
      } else {
        this[key] = data[key];
      }
    }
  }

  static fromError(action, stage, inData, error) {
    return new Event({
      action,
      stage,
      isError: true,
      inData,
      outData: Object.assign({}, error),
      errorMessage: error.message
    });
  }

  static success(action, stage, inData, outData) {
    return new Event({
      action,
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