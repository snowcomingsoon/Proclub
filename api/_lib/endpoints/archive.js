const { makeHandler } = require('../serve.js');

module.exports = makeHandler({
  file: (_query, club) => `${club.dataDir}/archive/index.json`,
  sMaxAge: 300,
});
