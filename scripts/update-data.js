'use strict';
// Entry point della raccolta (GitHub Actions: update-data.yml). Tutta la logica è in scripts/collector.js.
const {run} = require('./collector');

run().then((result) => { process.exitCode = result.exitCode; }).catch((e) => { console.error(e.message); process.exitCode = 1; });
