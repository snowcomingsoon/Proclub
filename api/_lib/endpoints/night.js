const { makeHandler, validDay, derive } = require('../serve.js');

module.exports = makeHandler({
  validate: (query) => (validDay(query.day) ? null : 'invalid_day'),
  file: (query, club) => `${club.dataDir}/public/nights/${query.day}.json`,
  derive: (data, query, club) => derive.nightFrom(data, query.day, club.clubId),
});
