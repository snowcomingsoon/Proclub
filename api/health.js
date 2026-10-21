const { makeHandler, derive } = require('./_lib/serve.js');

module.exports = makeHandler({
  file: () => 'data/public/health.json',
  derive: derive.healthFrom,
  sMaxAge: 30,
});
