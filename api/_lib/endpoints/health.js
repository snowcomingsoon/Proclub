const { makeHandler, derive } = require('../serve.js');

module.exports = makeHandler({
  file: (_query, club) => `${club.dataDir}/public/health.json`,
  derive: (data) => derive.healthFrom(data),
  sMaxAge: 30,
});
