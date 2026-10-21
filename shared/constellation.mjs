/** Descriptive co-appearance statistics. No inferred passes or causal chemistry score. */
const finite = v => v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
const n = v => Math.max(0, finite(v) ?? 0);
export const ROLE_NAMES = {forward: 'ATT', midfielder: 'CEN', defender: 'DIF', goalkeeper: 'POR'};
const norm = name => String(name || '').trim().toLowerCase();
export function constellationMatches(data, clubId = '70375') {
  const unique = new Map();
  for (const m of [...(data.matches || []), ...(data.matchHistory || [])]) {
    if (!m?.matchId || !m.players?.[clubId] || !m.clubs?.[clubId] || !finite(m.timestamp)) continue;
    const c = m.clubs[clubId], gf = finite(c.goals), ga = finite(c.goalsAgainst);
    if (gf == null || ga == null || gf < 0 || ga < 0) continue;
    const players = Object.entries(m.players[clubId]).filter(([, p]) => p?.playername).map(([id, p]) => ({...p, id: String(id)}));
    if (!players.length) continue;
    unique.set(String(m.matchId), {id: String(m.matchId), timestamp: Number(m.timestamp), gf, ga,
      result: gf > ga ? 'V' : gf < ga ? 'S' : 'P', players,
      opponent: Object.entries(m.clubs).find(([id]) => id !== clubId)?.[1]?.details?.name || 'Avversario'});
  }
  return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp);
}
export function constellationRoster(data, matches) {
  const byId = new Map();
  for (const m of matches) for (const p of m.players) {
    const previous = byId.get(p.id);
    byId.set(p.id, {id: p.id, name: p.playername, games: (previous?.games || 0) + 1});
  }
  const names = new Set([...byId.values()].map(p => norm(p.name)));
  for (const p of data.members?.members || []) if (!names.has(norm(p.name))) {
    byId.set(`member:${norm(p.name)}`, {id: `member:${norm(p.name)}`, name: p.name, games: 0});
    names.add(norm(p.name));
  }
  return [...byId.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}
function playerSummary(rows) {
  const ratings = rows.map(p => finite(p.rating)).filter(v => v != null && v > 0);
  const sum = key => rows.reduce((s, p) => s + n(p[key]), 0);
  const roles = {};
  for (const p of rows) roles[p.pos || 'unknown'] = (roles[p.pos || 'unknown'] || 0) + 1;
  return {goals: sum('goals'), assists: sum('assists'), rating: ratings.length ? ratings.reduce((a,b)=>a+b,0) / ratings.length : null,
    rated: ratings.length, roles, passes: sum('passesmade'), passAttempts: sum('passattempts')};
}
export function constellationPairs(matches, focusId, role = 'all') {
  const eligible = matches.filter(m => m.players.some(p => p.id === focusId && (role === 'all' || p.pos === role)));
  const pairs = new Map();
  for (const m of eligible) {
    const focus = m.players.find(p => p.id === focusId);
    for (const other of m.players.filter(p => p.id !== focusId)) {
      const pair = pairs.get(other.id) || {id: other.id, name: other.playername, games: [], a: [], b: []};
      pair.name = other.playername; pair.games.push(m); pair.a.push(focus); pair.b.push(other); pairs.set(other.id, pair);
    }
  }
  return [...pairs.values()].map(p => {
    const wins = p.games.filter(m => m.result === 'V').length, draws = p.games.filter(m => m.result === 'P').length;
    const a = playerSummary(p.a), b = playerSummary(p.b), games = p.games.length;
    return {...p, a, b, n: games, wins, draws, losses: games - wins - draws, winPct: wins / games * 100,
      ppg: (wins * 3 + draws) / games, gf: p.games.reduce((s,m)=>s+m.gf,0), ga: p.games.reduce((s,m)=>s+m.ga,0),
      goals: a.goals + b.goals, assists: a.assists + b.assists,
      reliability: games >= 25 ? 'Campione ampio' : games >= 10 ? 'Campione discreto' : 'Campione ridotto'};
  }).sort((a,b)=>b.n-a.n || b.ppg-a.ppg || a.name.localeCompare(b.name));
}
export function pairTitle(pair) {
  if (pair.n < 5) return 'PRIMO CONTATTO';
  if (pair.n >= 10 && pair.winPct >= 65) return 'ORBITA VINCENTE';
  if (pair.goals / pair.n >= 1.5) return 'SCINTILLE IN ATTACCO';
  if (pair.n >= 20) return 'LEGAME STELLARE';
  return 'STESSA ORBITA';
}

/** Site estimate of shared performance, not direct interactions or causal lift. */
export function pairChemistry(p) {
  const clamp = x => Math.max(0, Math.min(1,x));
  const rated = p.a.rated + p.b.rated;
  const rating = rated ? ((p.a.rating || 0)*p.a.rated + (p.b.rating || 0)*p.b.rated)/rated : null;
  const attack = clamp((p.goals + p.assists * .7) / Math.max(1,p.n) / 3);
  const performance = rating == null ? null : clamp((rating - 5)/4);
  const results = clamp(p.ppg/3);
  const raw = performance == null ? (attack*.35 + results*.2)/.55 : performance*.45 + attack*.35 + results*.2;
  return Math.round(100 * raw * (.5 + .5*Math.min(p.n/20,1)));
}
