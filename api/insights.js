const { makeHandler } = require('./_lib/serve.js');

// Nessuna ricostruzione dal monolite: se manca, il sito ricalcola gli insight da sé.
module.exports = makeHandler({
  file: () => 'data/public/insights.json',
  optional: true, // assente => 204: il sito ricalcola gli insight da sé
});
