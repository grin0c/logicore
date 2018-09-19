const _ = require("lodash");
const Person = require("./fixtures/Person.js");
const Credential = require("./fixtures/Credential.js");
const Adapter = require("./fixtures/Adapter");
const Action = require("../lib/Action");
const Core = require("../lib/Core");

const createCore = async () => {
  const core = new Core({
    dbAdapter: new Adapter(),
    dbLogAdapter: new Adapter()
  });

  core.registerSchema("person", Person.schema);
  core.registerSchema("credential", Credential.schema);
  return core;
};

describe("Core", () => {
  describe("commitAction", () => {
    const testCases = [
      {
        title: "UPDATE",
        blank: {
          type: Action.ACTION_TYPE.UPDATE,
          schemaKey: "person",
          instanceId: 1,
          data: {
            isBlocked: true
          }
        },
        triggers: {
          person: [
            {
              key: "Block credentials when user blocked",
              condition: ["isBlocked"],
              schemaKey: "person",
              async subactions(action, instance) {
                const credentials = await this.core.db.adapter.find("credential", { person: instance.id });
                return credentials.map(credential => ({
                  type: Action.ACTION_TYPE.UPDATE,
                  schemaKey: "credential",
                  instanceId: credential.id,
                  data: { isUserBlocked: instance.isBlocked }
                }));
              }
            }
          ],
          credential: [
            {
              key: "Count active credentials",
              condition: ["isBlocked", "isUserBlocked"],
              schemaKey: "credential",
              async subactions(action, instance) {
                if (!instance.person) {
                  return undefined;
                }
                const credentials = await this.core.db.adapter.find("credential", {
                  person: instance.person,
                  isBlocked: false,
                  isUserBlocked: false
                });
                return [
                  {
                    type: Action.ACTION_TYPE.UPDATE,
                    schemaKey: "person",
                    instanceId: instance.person,
                    data: { activeCredentialsCount: credentials.length }
                  }
                ];
              }
            }
          ]
        },
        subactions: [
          {
            id: 2,
            parent: 1,
            rootParent: 1,
            type: Action.ACTION_TYPE.UPDATE,
            schemaKey: "credential",
            instanceFilter: null,
            instanceId: 1,
            data: {
              isUserBlocked: true
            },
            dataOld: {
              id: 1,
              person: 1,
              isBlocked: false,
              isUserBlocked: false
            },
            dataDiff: {
              isUserBlocked: true
            },
            dataDiffPrepatched: null,
            dataResult: {
              id: 1,
              person: 1,
              isBlocked: false,
              isUserBlocked: true
            },
            dataResultId: 1,
            status: Action.ACTION_STATUS.COMPLETED,
            depth: 1,
            metaKey: null,
            metaData: null,
            attempt: 0
          },
          {
            id: 3,
            type: 2,
            parent: 2,
            rootParent: 1,
            depth: 2,
            schemaKey: "person",
            instanceId: 1,
            instanceFilter: null,
            data: { activeCredentialsCount: 0 },
            dataOld: {
              id: 1,
              nameFirst: "Rudy",
              nameLast: "Cruysbergs",
              nameFull: "Rudy Cruysbergs",
              age: 30,
              isBlocked: true,
              activeCredentialsCount: 1
            },
            dataDiff: { activeCredentialsCount: 0 },
            dataDiffPrepatched: null,
            dataResult: {
              id: 1,
              nameFirst: "Rudy",
              nameLast: "Cruysbergs",
              nameFull: "Rudy Cruysbergs",
              age: 30,
              isBlocked: true,
              activeCredentialsCount: 0
            },
            dataResultId: 1,
            status: 10,
            metaKey: null,
            metaData: null,
            attempt: 0
          }
        ]
      }
    ];

    testCases.forEach(async testCase => {
      it(testCase.title, async () => {
        const core = await createCore();
        _.each(testCase.triggers, (triggers, schemaKey) => {
          triggers.forEach(trigger => core.hookSubaction(schemaKey, trigger));
        });
        const action = new Action(testCase.blank);

        if (testCase.error) {
          await expect(action.prepatch(core)).rejects.toThrow(testCase.error);
        } else {
          await core.commitAction(action);
          expect(core.logger.adapter.instances.action).toStrictEqual(
            [Object.assign({}, action)].concat(testCase.subactions)
          );
        }
      });
    });
  });
});
