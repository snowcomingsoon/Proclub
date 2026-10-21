'use strict';
// Client minimo per le API pubbliche EA Pro Clubs, condiviso da raccolta e controllo del formato.
const {sleep} = require('./fsx');

const BASE = 'https://proclubs.ea.com/api/fc';
const HEADERS = {Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Referer: 'https://www.ea.com/'};
// EA restituisce al massimo 10 partite per modalità; le uniche modalità con dati sono campionato e playoff.
const MATCH_MODES = ['leagueMatch', 'playoffMatch'];
const validNumber = (v) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0;

function createEaClient({fetchImpl = fetch, wait = sleep, platform, clubId, attempts = 3, timeoutMs = 20000}) {
  async function ea(endpoint, params, validate = () => true) {
    const url = new URL(`${BASE}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let last;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetchImpl(url, {headers: HEADERS, signal: AbortSignal.timeout(timeoutMs)});
        if (!res.ok) throw Error(`EA ${endpoint} HTTP ${res.status}`);
        const data = await res.json();
        if (!validate(data)) throw Error(`EA ${endpoint}: risposta non valida`);
        return data;
      } catch (e) { last = e; if (i < attempts - 1) await wait(2000 * (i + 1)); }
    }
    throw last;
  }
  /** Le quattro letture della raccolta: [chiave, endpoint, parametri, validatore]. */
  const specs = () => [
    ['club', 'clubs/overallStats', {platform, clubIds: clubId}, (d) => Array.isArray(d) && String(d[0]?.clubId) === clubId && validNumber(d[0]?.gamesPlayed)],
    ['members', 'members/stats', {platform, clubId}, (d) => Array.isArray(d?.members) && d.members.length > 0 && d.members.every((m) => m.name && validNumber(m.gamesPlayed))],
    ...MATCH_MODES.map((mode) => [mode, 'clubs/matches', {platform, clubIds: clubId, matchType: mode, maxResultCount: 10},
      (d) => Array.isArray(d) && d.every((m) => m?.matchId && validNumber(m.timestamp) && m.clubs?.[clubId] && validNumber(m.clubs[clubId].goals) && validNumber(m.clubs[clubId].goalsAgainst))]),
  ];
  return {ea, specs};
}

module.exports = {createEaClient, MATCH_MODES, BASE, validNumber};
