// Monolite compatibile: stesso contenuto di sempre, ma letto da GitHub (con ripiego sul file del deploy)
// così resta fresco anche quando i commit di soli dati non ripubblicano il sito.
const { makeHandler } = require('./_lib/serve.js');

module.exports = makeHandler({ file: () => 'data/data.json', sMaxAge: 60 });
