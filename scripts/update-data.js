const fs = require('node:fs');
const path = require('node:path');
const {validate, mergeHistory, archiveMatches, notify} = require('./lib');
const BASE = 'https://proclubs.ea.com/api/fc';
const PLATFORM = process.env.EA_PLATFORM || 'common-gen5';
const CLUB_ID = process.env.EA_CLUB_ID || '70375';
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'data.json');
const headers = {Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Referer: 'https://www.ea.com/'};

async function ea(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {headers, signal: AbortSignal.timeout(20000)});
      if (!res.ok) throw new Error(`EA ${endpoint} HTTP ${res.status}`);
      return await res.json();
    } catch (e) { last = e; await new Promise(r => setTimeout(r, 2000 * (i + 1))); }
  }
  throw last;
}

(async () => {
  const old = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const failures = {};
  const optional = (mode) => (error) => { failures[mode] = error.message; console.warn(`${mode} non disponibile:`, error.message); return []; };
  const [club, members, leagueMatches, friendlyMatches, playoffMatches] = await Promise.all([
    ea('clubs/overallStats', {platform: PLATFORM, clubIds: CLUB_ID}),
    ea('members/stats', {platform: PLATFORM, clubId: CLUB_ID}),
    ea('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, matchType: 'leagueMatch', maxResultCount: 10}),
    ea('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, matchType: 'friendlyMatch', maxResultCount: 10}).catch(optional('friendlyMatch')),
    ea('clubs/matches', {platform: PLATFORM, clubIds: CLUB_ID, matchType: 'playoffMatch', maxResultCount: 10}).catch(optional('playoffMatch')),
  ]);
  const newest = (list) => (list.length ? new Date(Math.max(...list.map(m => m.timestamp)) * 1000).toISOString() : 'nessuna');
  console.log(`EA: campionato ${leagueMatches.length} (ultima ${newest(leagueMatches)}), amichevoli ${friendlyMatches.length} (ultima ${newest(friendlyMatches)}), spareggi ${playoffMatches.length} (ultima ${newest(playoffMatches)}); club ${club[0]?.gamesPlayed} partite`);
  const matches = [...new Map([...leagueMatches.map(m => ({...m, sourceMatchType: 'leagueMatch'})), ...friendlyMatches.map(m => ({...m, sourceMatchType: 'friendlyMatch'})), ...playoffMatches.map(m => ({...m, sourceMatchType: 'playoffMatch'}))].map(m => [String(m.matchId), m])).values()].sort((a, b) => b.timestamp - a.timestamp);
  validate({club, members, matches}, CLUB_ID);
  const {history, fresh} = mergeHistory(old.matchHistory, matches);
  const next = {club, members, matches, matchHistory: history, capturedAt: old.capturedAt, fresh: []};
  const changed = JSON.stringify({...next, capturedAt: 0}) !== JSON.stringify({...old, capturedAt: 0});
  const checkedAt = new Date().toISOString();
  fs.writeFileSync(path.join(ROOT, 'data', 'sync-status.json'), JSON.stringify({checkedAt, complete: !Object.keys(failures).length, failures}));
  if (!changed) {
    console.log('Nessuna novità.');
    if (Object.keys(failures).length) throw new Error('Raccolta parziale: ' + Object.keys(failures).join(', '));
    return;
  }
  next.capturedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(next));
  archiveMatches(path.join(ROOT, 'data', 'archive'), history, CLUB_ID);
  console.log(`Aggiornato: ${fresh.length} nuove partite.`);
  await notify(fresh, CLUB_ID);
  if (Object.keys(failures).length) throw new Error('Raccolta parziale: ' + Object.keys(failures).join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
