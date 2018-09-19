const Core = require("./lib/Core");

module.exports = async settings => new Core(settings);
module.exports.ACTION_TYPE = require("./lib/Action").ACTION_TYPE;
module.exports.ACTION_STATUS = require("./lib/Action").ACTION_STATUS;
module.exports.ACTION_SCHEMA = require("./lib/Action").ACTION_SCHEMA;

module.exports.EVENT_STAGE = require("./lib/Event").EVENT_STAGE;
module.exports.EVENT_SCHEMA = require("./lib/Event").EVENT_SCHEMA;
module.exports.TRIGGER_TYPE = require("./lib/Event").TRIGGER_TYPE;
