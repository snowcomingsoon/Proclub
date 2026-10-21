'use strict';
// Configurazione del club: config/club.json, con variabili d'ambiente come override.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function loadConfig(env = process.env, file = path.join(ROOT, 'config', 'club.json')) {
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hour = env.CLUB_NIGHT_ENDS_AT_HOUR != null && env.CLUB_NIGHT_ENDS_AT_HOUR !== '' ? Number(env.CLUB_NIGHT_ENDS_AT_HOUR) : Number(base.nightEndsAtHour);
  return {
    clubId: String(env.EA_CLUB_ID || base.clubId),
    platform: env.EA_PLATFORM || base.platform,
    name: env.CLUB_NAME || base.name,
    repo: env.GITHUB_REPOSITORY || base.repo,
    timezone: env.CLUB_TIMEZONE || base.timezone,
    nightEndsAtHour: Number.isFinite(hour) ? hour : 6,
  };
}

module.exports = {ROOT, loadConfig};
