const { makeHandler, derive } = require('../serve.js');

module.exports = makeHandler({
  file: (_query, club) => `${club.dataDir}/public/history.json`,
  derive: (data, _query, club) => derive.historyFrom(data, club.clubId),
});
