const { makeHandler } = require('../serve.js');

module.exports = makeHandler({
  file: (_query, club) => `${club.dataDir}/public/insights.json`,
  optional: true,
});
