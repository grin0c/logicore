module.exports = {
  /**
   * Returns true if two property values are equal basing on their json-schema
   * @param v1
   * @param v2
   * @param property json-schema of the property
   * @returns {boolean}
   */
  areEqual(v1, v2, property) {
    switch (property && property.type) {
      case "integer":
        return parseInt(v1, 10) === parseInt(v2, 10);
      default:
        return v1 === v2;
    }
  },

  /**
   * Returns diff between patch and existing instance
   * Result contains this part of patch, which differs with existing model
   * @param patch
   * @param instance
   * @param schema
   * @returns {{}}
   */
  getPatchDiff(patch, instance, schema) {
    const diff = {};

    // eslint-disable-next-line no-restricted-syntax
    for (const key of Object.keys(patch)) {
      const property = schema.properties[key];
      if (!property) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const oldValue = instance[key];
      const newValue = patch[key];

      if (!module.exports.areEqual(oldValue, newValue)) {
        diff[key] = newValue;
      }
    }

    return diff;
  }
};
