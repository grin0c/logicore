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
      }
    }
  },
  instances: [
    {
      id: 1,
      nameFirst: "Rudy",
      nameLast: "Cruysbergs",
      age: 30
    }
  ]
};