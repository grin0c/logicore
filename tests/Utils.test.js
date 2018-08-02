const Utils = require('../lib/Utils');

describe('Utils', () => {
  describe('areEqual', () => {
    const testCases = [
      /* Empty property */
      {
        title: 'Empty property non-strict equal',
        property: null,
        v1: '1',
        v2: 1,
        result: false
      },
      {
        title: 'Empty property strict equal',
        property: null,
        v1: 1,
        v2: 1,
        result: true
      },
      {
        title: 'Empty property non-equal',
        property: null,
        v1: 1,
        v2: 2,
        result: false
      },

      /* Integers */
      {
        title: 'Integer equals',
        property: { type: 'integer' },
        v1: 1.1,
        v2: 1.9,
        result: true
      },
      {
        title: 'Integers with different fractions',
        property: { type: 'integer' },
        v1: 1.9,
        v2: 2.1,
        result: false
      },
      {
        title: 'Integer and number-string',
        property: { type: 'integer' },
        v1: 1.9,
        v2: '1.2',
        result: true
      },
      {
        title: 'Integer and NaN',
        property: { type: 'integer' },
        v1: 1.9,
        v2: 'a',
        result: false
      },
      {
        title: 'Integer and non-equal string',
        property: { type: 'integer' },
        v1: 1.9,
        v2: '2.1',
        result: false
      }
    ];
    testCases.forEach(testCase => {
      it(testCase.title, () => {
        expect(Utils.areEqual(testCase.v1, testCase.v2, testCase.property)).toEqual(testCase.result);
      })
    });
  });
  describe('getPatchDiff', () => {
    const schema = {
      properties: {
        a1: {},
        a2: { type: 'integer' },
        a3: { type: 'integer' }
      }
    };
    const testCases = [
      {
        title: 'Ignore non-schema properties',
        patch:    { a1: 2, a2: 3, a4: 1 },
        instance: { a1: 2, a2: 2, a3: 2 },
        result:          { a2: 3 }
      },
      {
        title: 'Respect areEqual',
        patch:    { a2: "2", a3: 3.2 },
        instance: { a2: 2.5, a3: 3.9, a1: 2 },
        result:   { }
      }
    ];
    testCases.forEach(testCase => {
      it(testCase.title, () => {
        expect(Utils.getPatchDiff(testCase.patch, testCase.instance, schema)).toMatchObject(testCase.result);
      })
    });
  });
});