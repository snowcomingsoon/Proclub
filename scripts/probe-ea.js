// Diagnostica: interroga EA con varie modalità e dimensioni e confronta con l'archivio per scoprire dove si nascondono le partite mancanti.
const fs = require('node:fs');
const path = require('node:path');
const BASE = 'https://proclubs.ea.com/api/fc';
const PLATFORM = process.env.EA_PLATFORM || 'common-gen5';
const CLUB_ID = process.env.EA_CLUB_ID || '70375';
const headers = {Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Referer: 'https://www.ea.com/'};
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'data.json'), 'utf8'));
const known = new Set((data.matchHistory || []).map(m => String(m.matchId)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const iso = t => new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ');

async function call(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {headers, signal: AbortSignal.timeout(20000)});
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {status: res.status, json, size: text.length};
  } catch (e) { return {status: 'ERR', error: e.message}; }
}

function summarize(label, r) {
  if (!Array.isArray(r.json)) return console.log(`${label}: HTTP ${r.status} ${r.error || (r.json ? 'non-array ' + JSON.stringify(r.json).slice(0, 80) : 'no json')}`);
  const list = r.json, ts = list.map(m => Number(m.timestamp)).filter(Boolean);
  const fresh = list.filter(m => !known.has(String(m.matchId)));
  const types = [...new Set(list.map(m => m.clubs?.[CLUB_ID]?.matchType))].join(',');
  console.log(`${label}: HTTP ${r.status} n=${list.length} types=[${types}] ${ts.length ? iso(Math.min(...ts)) + ' → ' + iso(Math.max(...ts)) : '-'} NUOVE per l'archivio=${fresh.length}${fresh.length ? ' ' + fresh.map(m => `${m.matchId}@${iso(m.timestamp)}`).join(' ') : ''}`);
}

(async () => {
  console.log(`Archivio: ${known.size} partite; club ${data.club?.[0]?.gamesPlayed}`);
  const types = ['leagueMatch', 'playoffMatch', 'friendlyMatch', 'gameType5', 'gameType9', 'gameType13', 'gameType1', 'gameType2', 'gameType3', 'gameType4', 'gameType6', 'gameType7', 'gameType8', 'privateMatch', 'tournamentMatch', 'all'];
  for (const t of types) { summarize(`matchType=${t} max=10`, await call('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, matchType: t, maxResultCount: 10})); await wait(400); }
  summarize('senza matchType max=10', await call('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, maxResultCount: 10}));
  for (const n of [5, 11, 15, 20, 50, 100]) { for (const t of ['leagueMatch', 'playoffMatch']) { summarize(`${t} max=${n}`, await call('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, matchType: t, maxResultCount: n})); await wait(400); } }
  for (const key of ['startIndex', 'offset', 'page']) summarize(`leagueMatch max=10 ${key}=10`, await call('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, matchType: 'leagueMatch', maxResultCount: 10, [key]: 10}));
  for (const platform of ['common-gen4', 'ps5', 'xbox-series-xs', 'pc']) summarize(`platform=${platform} leagueMatch`, await call('clubs/matches', {platform, clubIds: CLUB_ID, matchType: 'leagueMatch', maxResultCount: 10}));
  const members = await call('members/stats', {platform: PLATFORM, clubId: CLUB_ID});
  const club = await call('clubs/overallStats', {platform: PLATFORM, clubIds: CLUB_ID});
  console.log('club gamesPlayed:', club.json?.[0]?.gamesPlayed, 'wins', club.json?.[0]?.wins, 'ties', club.json?.[0]?.ties, 'losses', club.json?.[0]?.losses);
  console.log('somma presenze membri:', (members.json?.members || []).reduce((s, m) => s + Number(m.gamesPlayed || 0), 0));
  const ids = new Map((members.json?.members || []).map(m => [m.name, m.gamesPlayed]));
  console.log('presenze:', JSON.stringify([...ids]));
  // Per ogni partita archiviata: giocatori che EA ha registrato (verifica coerenza coi contatori)
  const per = {};
  for (const m of data.matchHistory || []) for (const p of Object.values(m.players?.[CLUB_ID] || {})) per[p.playername] = (per[p.playername] || 0) + 1;
  console.log('presenze in archivio:', JSON.stringify(per));
})();
