module.exports = {
  schema: {
    title: "Credential",
    properties: {
      id: {
        type: "integer",
        default: null
      },
      person: {
        type: "integer",
        description: "Link to person"
      },
      cardCode: {
        type: "string",
        description: "Card identifier"
      },
      isBlocked: {
        type: "boolean"
      },
      isUserBlocked: {
        type: "boolean"
      }
    },
    required: ["person"]
  },
  instances: [
    {
      id: 1,
      person: 1,
      isBlocked: false,
      isUserBlocked: false
    }
  ]
};