const TRIGGER_TYPE = {
  PREPATCH: 1,
  SUBACTION: 2
};

const DEFAULTS = {
  type: null,
  v: 1,
  key: null,
  condition: null,
  schemaKey: null,
  selector: null,
  patch: null,
  subactions: null
};

class Trigger {
  constructor(data) {
    for (const key of Object.keys(DEFAULTS)) {
      this[key] = data[key] == undefined
        ? DEFAULTS[key]
        : data[key];
    }
    if (!this.key) { throw new Error("Trigger.key is required"); }

    this.type = Number(this.type);
    if (this.type !== 1 && this.type !== 2) { throw new Error("Trigger.type should be one of the [1, 2]"); }

    if (!this.condition) { throw new Error("Trigger.condition is required"); }
    if (typeof this.condition !== "function" && !Array.isArray(this.condition)) {
      throw new Error("Trigger.condition should be a function or an array");
    }

    switch (this.type) {
      case TRIGGER_TYPE.PREPATCH:
        if (this.schemaKey) { throw new Error("Trigger.schemaKey should be empty for prepatch type"); }
        if (this.selector) { throw new Error("Trigger.selector should be empty for prepatch type"); }
        if (!this.patch) { throw new Error("Trigger.patch is required for prepatch type"); }
        if (typeof this.patch !== "function") {
          throw new Error("Trigger.patch should be a function!");
        }
        break;
      case TRIGGER_TYPE.SUBACTION:
        if (!this.schemaKey) { throw new Error("Trigger.schemaKey is required for action type"); }
        if (typeof this.schemaKey !== "string") { throw new Error("Trigger.schemaKey should be a string"); }

        // if (!this.selector) { throw new Error("Trigger.selector is required for action type"); }
        // if (!(this.selector instanceof Function)) { throw new Error("Trigger.selector should be a function"); }

        if (!this.getSubactions) { throw new Error("Trigger.getSubactions is required for subaction type"); }
        if (typeof this.getSubactions !== "function") {
          throw new Error("Trigger.getSubactions should be a function!");
        }

        break;
    }
  }

  calculateCondition = async (action) => {
    if (this.condition instanceof Function) { return this.condition(action); }

    const dataDiffPrepatched = action.getFreshestDiff();
    return this.condition.some(attributeKey => dataDiffPrepatched.hasOwnProperty(attributeKey));
  };

  getPatch = async(action) => this.patch(action, action.getFreshestInstance());

  getSubactions = async(action) => this.subactions(action, action.getFreshestInstance());
};

Trigger.TRIGGER_TYPE = TRIGGER_TYPE;
module.exports = Trigger;