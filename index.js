const LogiCore = require("/lib/LogiCore");

module.exports = async (settings) => {
  const core = new LogiCore(settings);
  await core.init();
  return core;
};