module.exports = {
  schema: {
    title: "Person",
    properties: {
      id: {
        type: "integer",
        default: null
      },
      nameFirst: {
        type: "string",
        description: "First name"
      },
      nameLast: {
        type: "string",
        description: "Last name"
      },
      nameFull: {
        type: "string",
        description: "Full name"
      },
      age: {
        type: "integer",
        description: "Age"
      },
      summary: {
        type: "string",
        description: "nameFull, age"
      },
      isBlocked: {
        type: "boolean",
        description: "Is person blocked"
      },
      activeCredentialsCount: {
        type: "integer",
        description: "How many active credentials the person has"
      }
    },
    required: ["nameFull"]
  },
  instances: [
    {
      id: 1,
      nameFirst: "Rudy",
      nameLast: "Cruysbergs",
      nameFull: "Rudy Cruysbergs",
      age: 30,
      isBlocked: false,
      activeCredentialsCount: 1
    }
  ]
};