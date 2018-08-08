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
      age: {
        type: "integer",
        description: "Age"
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