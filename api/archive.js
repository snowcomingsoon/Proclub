const { makeHandler } = require('./_lib/serve.js');

// Archivio risultati: letto a runtime, così i commit di dati non richiedono un deploy.
module.exports = makeHandler({
  file: () => 'data/archive/index.json',
  sMaxAge: 300,
});
