const { makeHandler, derive } = require('./_lib/serve.js');

module.exports = makeHandler({
  file: () => 'data/public/summary.json',
  derive: derive.summaryFrom,
});
