const { makeHandler, validDay, derive } = require('./_lib/serve.js');

module.exports = makeHandler({
  validate: (query) => (validDay(query.day) ? null : 'invalid_day'),
  // `day` è già validato (YYYY-MM-DD reale): nessun path traversal possibile.
  file: (query) => `data/public/nights/${query.day}.json`,
  derive: (data, query) => derive.nightFrom(data, query.day),
});
