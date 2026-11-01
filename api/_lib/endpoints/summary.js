const { makeHandler, derive } = require('../serve.js');

module.exports = makeHandler({
  file: (_query, club) => `${club.dataDir}/public/summary.json`,
  derive: (data, _query, club) => derive.summaryFrom(data, club.clubId),
});
