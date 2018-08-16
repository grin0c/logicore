const EVENT_STAGE = {
  POPULATING: 1,
  PREPATCH_CHECKING: 2,
  PREPATCH_PERFORMING: 3,
  VALIDATION: 4,
  PERFORMING: 5,
  TRIGGER_FILTERING: 6,
  TRIGGER_PERFORMING: 7,
  
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
      description: "Relevant action id",
      required: true
    },
    stage: {
      type: "integer",
      enum: Object.values(EVENT_STAGE),
      description: "Relevant action stage",
      required: true
    },
    isError: {
      type: "boolean",
      required: true
    },
    inData: {
      type: "json",
      required: true
    },
    outData: {
      type: "json",
      required: true
    },
    errorMessage: {
      type: "string",
      default: ""
    }
  }
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