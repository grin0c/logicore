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
      case 'integer':
        return parseInt(v1) === parseInt(v2);
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

    for (const key of Object.keys(patch)) {
      const property = schema.properties[key];
      if (!property) { continue; }

      const oldValue = instance[key];
      const newValue = patch[key];

      if (!module.exports.areEqual(oldValue, newValue)) {
        diff[key] = newValue;
      }
    }

    return diff;
  }
};