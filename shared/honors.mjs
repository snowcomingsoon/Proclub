/**
 * Menzioni d'onore: traguardi di carriera nel club, cinque livelli per famiglia, ogni livello molto piu` raro del precedente.
 * Le famiglie "stagione" usano i totali EA del Pro (completi); quelle "archivio" contano solo le partite archiviate
 * (dettaglio gara per gara) e per questo sono dichiarate come tali.
 */
export const HONOR_TIERS = ['Bronzo', 'Argento', 'Oro', 'Platino', 'Leggenda'];

const n = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

function maxRun(apps, pred) {
  let best = 0, run = 0;
  for (const a of apps) { run = pred(a) ? run + 1 : 0; if (run > best) best = run; }
  return best;
}
const countApps = (apps, pred) => apps.filter(pred).length;

/**
 * fit: reparti per cui la famiglia e` "in corso" anche se non ancora raggiunta (att, mid, dif, por);
 * le famiglie fuori reparto compaiono solo quando almeno il Bronzo e` stato conquistato.
 * min: presenze minime perche' un traguardo "a gara" abbia senso.
 */
export const HONOR_FAMILIES = [
  { id: 'presenze', title: 'Presenze', verb: 'presenze', kind: 'carriera', source: 'stagione', fit: 'all', tiers: [10, 25, 50, 100, 200], value: m => n(m.gamesPlayed) },
  { id: 'mvp', title: 'Uomo partita', verb: 'premi MVP', kind: 'carriera', source: 'stagione', fit: 'all', tiers: [3, 10, 25, 50, 100], value: m => n(m.manOfTheMatch) },
  { id: 'voto', title: 'Voto medio', verb: 'di voto medio', kind: 'carriera', source: 'stagione', fit: 'all', min: 20, digits: 1, tiers: [7.0, 7.5, 8.0, 8.5, 9.0], value: m => n(m.ratingAve) },
  { id: 'fairplay', title: 'Fair play', verb: 'gare senza espulsioni', kind: 'carriera', source: 'stagione', fit: 'all', tiers: [25, 50, 100, 150, 250], value: m => (n(m.redCards) === 0 ? n(m.gamesPlayed) : 0) },
  { id: 'gol', title: 'Bomber', verb: 'gol', kind: 'attacco', source: 'stagione', fit: ['att', 'mid'], tiers: [10, 25, 50, 100, 200], value: m => n(m.goals) },
  { id: 'assist', title: 'Rifinitore', verb: 'assist', kind: 'creazione', source: 'stagione', fit: ['mid', 'att'], tiers: [10, 25, 50, 100, 200], value: m => n(m.assists) },
  { id: 'ga', title: 'Partecipazioni al gol', verb: 'gol + assist', kind: 'attacco', source: 'stagione', fit: 'all', tiers: [25, 50, 100, 200, 400], value: m => n(m.goals) + n(m.assists) },
  { id: 'cecchino', title: 'Cecchino', verb: 'gol a gara', kind: 'attacco', source: 'stagione', fit: ['att'], min: 20, digits: 2, tiers: [0.3, 0.5, 0.7, 0.9, 1.1], value: m => n(m.goals) / Math.max(1, n(m.gamesPlayed)) },
  { id: 'regista', title: 'Regista', verb: 'assist a gara', kind: 'creazione', source: 'stagione', fit: ['mid'], min: 20, digits: 2, tiers: [0.3, 0.5, 0.7, 0.9, 1.1], value: m => n(m.assists) / Math.max(1, n(m.gamesPlayed)) },
  { id: 'passaggi', title: 'Metronomo', verb: 'passaggi riusciti', kind: 'creazione', source: 'stagione', fit: ['mid', 'dif'], tiers: [250, 750, 1500, 3000, 6000], value: m => n(m.passesMade) },
  { id: 'precisione', title: 'Precisione chirurgica', verb: '% di passaggi', kind: 'creazione', source: 'stagione', fit: ['mid', 'dif'], min: 30, tiers: [70, 76, 82, 88, 92], value: m => n(m.passSuccessRate) },
  { id: 'contrasti', title: 'Recuperatore', verb: 'contrasti riusciti', kind: 'difesa', source: 'stagione', fit: ['dif', 'mid'], tiers: [50, 150, 300, 600, 1000], value: m => n(m.tacklesMade) },
  { id: 'muro', title: 'Muro', verb: 'contrasti a gara', kind: 'difesa', source: 'stagione', fit: ['dif', 'mid'], min: 20, digits: 1, tiers: [1, 1.5, 2, 3, 4], value: m => n(m.tacklesMade) / Math.max(1, n(m.gamesPlayed)) },
  { id: 'inviolata', title: 'Porta inviolata', verb: 'porte inviolate (da difensore o portiere)', kind: 'difesa', source: 'stagione', fit: ['dif', 'por'], tiers: [3, 10, 25, 50, 100], value: m => n(m.cleanSheetsDef) + n(m.cleanSheetsGK) },
  { id: 'doppiette', title: 'Doppietta', verb: 'gare con 2+ gol', kind: 'attacco', source: 'archivio', fit: ['att', 'mid'], tiers: [1, 3, 8, 15, 30], value: (m, a) => countApps(a, x => x.goals >= 2) },
  { id: 'triplette', title: 'Tripletta', verb: 'gare con 3+ gol', kind: 'attacco', source: 'archivio', fit: ['att'], tiers: [1, 2, 4, 8, 15], value: (m, a) => countApps(a, x => x.goals >= 3) },
  { id: 'doppioassist', title: 'Doppio passaggio decisivo', verb: 'gare con 2+ assist', kind: 'creazione', source: 'archivio', fit: ['mid', 'att'], tiers: [1, 3, 8, 15, 30], value: (m, a) => countApps(a, x => x.assists >= 2) },
  { id: 'striscia', title: 'Sempre decisivo', verb: 'gare di fila con gol o assist', kind: 'carriera', source: 'archivio', fit: ['att', 'mid'], tiers: [3, 5, 8, 12, 18], value: (m, a) => maxRun(a, x => x.goals + x.assists > 0) },
  { id: 'vittorie', title: 'Serie vincente', verb: 'vittorie di fila con lui in campo', kind: 'carriera', source: 'archivio', fit: 'all', tiers: [3, 5, 8, 12, 20], value: (m, a) => maxRun(a, x => x.result === 'V') },
  { id: 'nove', title: 'Partita da 9', verb: 'gare con voto 9+', kind: 'carriera', source: 'archivio', fit: 'all', tiers: [1, 3, 6, 12, 25], value: (m, a) => countApps(a, x => x.rating >= 9) },
  { id: 'parate', title: 'Saracinesca', verb: 'parate', kind: 'difesa', source: 'archivio', fit: ['por'], tiers: [10, 30, 75, 150, 300], value: (m, a) => a.reduce((s, x) => s + (x.pos === 'goalkeeper' ? x.saves : 0), 0) },
];

function familyOfRole(role) {
  return { att: 'att', mid: 'mid', dif: 'dif', por: 'por' }[role] || 'mid';
}
const fits = (fam, family) => fam.fit === 'all' || fam.fit.includes(family);

function evaluate(fam, member, apps) {
  const games = n(member.gamesPlayed);
  const raw = fam.value(member, apps);
  const value = fam.min && games < fam.min ? 0 : raw;
  let tier = -1;
  fam.tiers.forEach((t, i) => { if (value >= t - 1e-9 && value > 0) tier = i; });
  const next = tier + 1 < fam.tiers.length ? fam.tiers[tier + 1] : null;
  const base = tier >= 0 ? fam.tiers[tier] : 0;
  const progress = next == null ? 1 : Math.max(0, Math.min(1, (value - base) / (next - base)));
  return {
    id: fam.id, title: fam.title, verb: fam.verb, kind: fam.kind, source: fam.source, digits: fam.digits || 0,
    tier, tierName: tier >= 0 ? HONOR_TIERS[tier] : null, value, next, progress, min: fam.min || 0, locked: !!(fam.min && games < fam.min),
  };
}

/**
 * Menzioni di un Pro. `role` e` il reparto ('att'|'mid'|'dif'|'por', da ROLE_INFO[...].family).
 * Ritorna {earned, inProgress, points}: earned = tutte le famiglie con almeno il Bronzo (piu` alte prima);
 * inProgress = famiglie del reparto non ancora al massimo, con il traguardo successivo piu` vicino per prime.
 */
export function honorsFor(member, appearances = [], role = 'mid') {
  const family = familyOfRole(role);
  const all = HONOR_FAMILIES.map(fam => ({ fam, h: evaluate(fam, member, appearances) }));
  const earned = all.filter(x => x.h.tier >= 0).map(x => x.h)
    .sort((a, b) => b.tier - a.tier || b.value / b.next - a.value / a.next || a.title.localeCompare(b.title));
  const inProgress = all.filter(x => fits(x.fam, family) && x.h.next != null)
    .map(x => x.h).sort((a, b) => b.progress - a.progress || a.title.localeCompare(b.title));
  const points = earned.reduce((s, h) => s + (h.tier + 1) * (h.tier + 1), 0);
  return { family, earned, inProgress, points };
}

/** Bacheca del club: per ogni Pro con presenze, numero di menzioni per livello e la migliore. */
export function clubHonors(members, historyFor, roleFor) {
  return members.filter(m => n(m.gamesPlayed) > 0).map(m => {
    const { earned, points } = honorsFor(m, historyFor(m.name), roleFor(m.name));
    const byTier = HONOR_TIERS.map((_, i) => earned.filter(h => h.tier === i).length);
    return { name: m.name, total: earned.length, byTier, points, best: earned.slice(0, 3) };
  }).sort((a, b) => b.points - a.points || b.total - a.total || a.name.localeCompare(b.name));
}
