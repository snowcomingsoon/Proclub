const { makeHandler } = require('../serve.js');

module.exports = makeHandler({
  file: (_query, club) => `${club.dataDir}/data.json`,
  sMaxAge: 60,
});
