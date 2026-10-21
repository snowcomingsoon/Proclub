const { makeHandler, derive } = require('./_lib/serve.js');

module.exports = makeHandler({
  file: () => 'data/public/history.json',
  derive: derive.historyFrom,
});
