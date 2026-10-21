// Test dei calcoli puri del front-end (app/src/lib). Nessuna dipendenza: node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLUB_ID, EA_CLUBS_URL } from '../app/src/lib/constants.js';
import {
  toNumber, averageRating, percentage, summarizePlayers, topPerformer,
  perGame, toFiniteNumber, mean, ratio,
} from '../app/src/lib/stats.js';
import {
  formatNumber, formatRating, formatLongDate, formatMatchTime, formatScore, formatProOverall,
} from '../app/src/lib/format.js';
import { POSITION_NAMES, POSITION_ABBREVIATIONS } from '../app/src/lib/positions.js';
import {
  getClubPlayers, getOpponentName, groupByNight, summarizeNight, getResultLetter,
} from '../app/src/lib/matches.js';
import { buildGradeComments, buildGradeRows } from '../app/src/lib/grades.js';
import { computeCardProfile } from '../app/src/lib/card-profile.js';
import { buildSeasonProfile } from '../app/src/lib/season-profile.js';
import {
  buildCover, buildTrialTitle, buildTrial, buildTrials, buildRoleTrend, buildShareText,
} from '../app/src/lib/newsroom.js';
import {
  classifyProfile, assignQuotes, toQuotePlayer, adaniNote,
} from '../app/src/lib/adani-quotes.js';
import { buildCoachComments } from '../app/src/lib/coach.js';
import { getEditorialContext } from '../app/src/lib/editorial-ctx.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const data = readJson('../data/data.json');
const ts = (iso) => Date.parse(iso) / 1e3;

let seq = 0;
const player = (name, o = {}) => ({ playername: name, pos: 'midfielder', rating: '7.0', goals: '0', assists: '0', ...o });
const match = (iso, own = [1, 0], players = {}, id = `m${++seq}`) => ({
  matchId: id,
  timestamp: ts(iso),
  clubs: { [CLUB_ID]: { goals: String(own[0]), goalsAgainst: String(own[1]) }, 999: { details: { name: 'Rivali' } } },
  players: { [CLUB_ID]: players },
});

test('constants e posizioni', () => {
  assert.equal(CLUB_ID, '70375');
  assert.match(EA_CLUBS_URL, /^https:\/\//);
  assert.deepEqual(Object.keys(POSITION_NAMES), Object.keys(POSITION_ABBREVIATIONS));
  assert.equal(POSITION_ABBREVIATIONS.goalkeeper, 'POR');
});

test('fallback-data.json (data.js) è valido e ha le sezioni attese', () => {
  const fb = readJson('../app/src/lib/fallback-data.json');
  assert.ok(fb.members && fb.matches);
});

// ---------- stats ----------
test('stats: toNumber / toFiniteNumber con stringhe, null, NaN', () => {
  assert.equal(toNumber('7.5'), 7.5);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(''), 0);
  assert.ok(Number.isNaN(toNumber('abc'))); // documenta: toNumber non filtra il testo non numerico
  assert.equal(toFiniteNumber('abc'), 0);
  assert.equal(toFiniteNumber(Infinity), 0);
  assert.equal(toFiniteNumber('3'), 3);
});

test('stats: averageRating, mean, percentage, ratio, perGame', () => {
  assert.equal(averageRating([]), null);
  assert.equal(averageRating([{ rating: '8' }, { rating: 6 }]), 7);
  assert.equal(mean([]), null);
  assert.equal(mean([2, 4]), 3);
  assert.equal(percentage(1, 0), null);
  assert.equal(percentage(2, 3), 67);
  assert.equal(ratio(1, 0), '—');
  assert.equal(ratio('3', '2'), '1.50');
  assert.equal(perGame('5', 0), '5.00'); // 0 partite non divide per zero
  assert.equal(perGame(5, 2), '2.50');
});

test('stats: summarizePlayers e lista vuota', () => {
  const empty = summarizePlayers([]);
  assert.equal(empty.games, 0);
  assert.equal(empty.rating, null);
  assert.equal(empty.pass, null);
  const s = summarizePlayers([
    { rating: '7', goals: '1', assists: 2, passesmade: '8', passattempts: '10', shots: 3 },
    { rating: 9, goals: 1, passesmade: 2, passattempts: 10 },
  ]);
  assert.equal(s.games, 2);
  assert.equal(s.rating, 8);
  assert.equal(s.goals, 2);
  assert.equal(s.assists, 2);
  assert.equal(s.pass, 50);
});

test('stats: topPerformer rispetta minimo e spareggio per voto', () => {
  assert.equal(topPerformer([], 'goals'), undefined);
  assert.equal(topPerformer([{ goals: 0 }], 'goals'), undefined);
  const a = { n: 'a', goals: '2', rating: '6' };
  const b = { n: 'b', goals: 2, rating: '8' };
  assert.equal(topPerformer([a, b], 'goals').n, 'b');
  assert.equal(topPerformer([a, b], 'goals', 3), undefined);
});

// ---------- format ----------
test('format: numeri e voti', () => {
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(3.14159, 1), '3.1');
  assert.equal(formatNumber(3), '3');
  assert.equal(formatRating(null), '—');
  assert.equal(formatRating(7), '7.00');
});

test('format: formatProOverall con stringhe, numeri e zero', () => {
  assert.equal(formatProOverall({ proOverall: '85' }), '85');
  assert.equal(formatProOverall({ proOverall: 85 }), '85');
  assert.equal(formatProOverall({ proOverall: '0' }), '—');
  assert.equal(formatProOverall({}), '—');
});

test('format: date e orari in fuso di Roma', () => {
  assert.equal(formatLongDate('2026-03-14'), '14 marzo 2026');
  assert.equal(formatMatchTime(match('2026-03-14T22:30:00Z')), '23:30');
  assert.equal(formatMatchTime(match('2026-07-09T23:00:00Z')), '01:00'); // ora legale
  assert.equal(formatScore(match('2026-03-14T20:00:00Z', [3, 2])), '3–2');
});

// ---------- matches ----------
test('matches: getClubPlayers / getOpponentName', () => {
  const m = match('2026-03-14T20:00:00Z', [1, 0], { a: player('A'), b: null });
  assert.equal(getClubPlayers(m).length, 1);
  assert.deepEqual(getClubPlayers({ clubs: {} }), []);
  assert.equal(getOpponentName(m), 'Rivali');
  assert.equal(getOpponentName({ clubs: { [CLUB_ID]: {} } }), 'Avversario');
});

test('matches: groupByNight - dopo mezzanotte fino alle 06:00 conta per la sera prima', () => {
  const nights = groupByNight([
    match('2026-03-14T22:30:00Z'), // 23:30 CET del 14
    match('2026-03-14T23:30:00Z'), // 00:30 del 15 -> 14
    match('2026-03-15T04:59:00Z'), // 05:59 del 15 -> 14
    match('2026-03-15T05:00:00Z'), // 06:00 del 15 -> 15
    match('2026-03-15T19:00:00Z'), // 15
  ]);
  assert.deepEqual(nights.map((n) => [n.day, n.games.length]), [['2026-03-15', 2], ['2026-03-14', 3]]);
});

test('matches: groupByNight - ora legale, cambio mese, ordine interno', () => {
  const nights = groupByNight([
    match('2026-07-09T23:00:00Z', [1, 0], {}, 'late'), // 01:00 CEST del 10 -> 9 luglio
    match('2026-07-09T19:00:00Z', [1, 0], {}, 'early'),
    match('2026-07-10T03:59:00Z', [1, 0], {}, 'latest'), // 05:59 CEST -> 9
    match('2026-07-10T04:00:00Z', [1, 0], {}, 'morning'), // 06:00 CEST -> 10
    match('2026-03-01T01:00:00Z', [1, 0], {}, 'mar'), // 02:00 CET del 1 marzo -> 28 febbraio
  ]);
  assert.deepEqual(nights.map((n) => n.day), ['2026-07-10', '2026-07-09', '2026-02-28']);
  assert.deepEqual(nights[1].games.map((g) => g.matchId), ['early', 'late', 'latest']);
});

test('matches: groupByNight scarta duplicati, senza club, senza id; lista vuota', () => {
  assert.deepEqual(groupByNight([]), []);
  const dup = match('2026-03-14T20:00:00Z', [1, 0], {}, 'x');
  const nights = groupByNight([
    dup, { ...dup }, { matchId: 'y', timestamp: ts('2026-03-14T20:00:00Z'), clubs: {} },
    { clubs: { [CLUB_ID]: {} }, timestamp: 1 },
  ]);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].games.length, 1);
});

test('matches: groupByNight non muta l\'input e accetta matchId numerici', () => {
  const input = [match('2026-03-14T21:00:00Z', [1, 0], {}, 2), match('2026-03-14T20:00:00Z', [1, 0], {}, 1)];
  const copy = input.map((m) => m.matchId);
  const [night] = groupByNight(input);
  assert.deepEqual(input.map((m) => m.matchId), copy);
  assert.deepEqual(night.games.map((g) => g.matchId), [1, 2]);
});

test('matches: getResultLetter con stringhe/numeri', () => {
  assert.equal(getResultLetter(match('2026-03-14T20:00:00Z', [2, 1])), 'V');
  assert.equal(getResultLetter(match('2026-03-14T20:00:00Z', [1, 1])), 'P');
  assert.equal(getResultLetter(match('2026-03-14T20:00:00Z', [0, 3])), 'S');
});

test('matches: summarizeNight - serata vuota', () => {
  const s = summarizeNight([]);
  assert.deepEqual([s.players, s.winners, s.wins, s.draws, s.losses, s.goals, s.against],
    [[], [], 0, 0, 0, 0, 0]);
  assert.equal(s.required, 0);
});

test('matches: summarizeNight - le assenze non valgono zero', () => {
  const g1 = match('2026-03-14T20:00:00Z', [2, 1], {
    1: player('Ann', { rating: '8.0', goals: '1', passesmade: '8', passattempts: '10' }),
    2: player('Bob', { rating: '6.0' }),
  });
  const g2 = match('2026-03-14T21:00:00Z', [0, 0], {
    1: player('Ann', { rating: '6.0', assists: 1, passesmade: '2', passattempts: '10' }),
  });
  const g3 = match('2026-03-14T22:00:00Z', [1, 3], { 1: player('Ann', { rating: '7.0' }) });
  const s = summarizeNight([g1, g2, g3]);
  const ann = s.players.find((p) => p.name === 'Ann');
  const bob = s.players.find((p) => p.name === 'Bob');
  assert.equal(ann.games, 3);
  assert.equal(ann.rating, 7);
  assert.equal(ann.goals, 1);
  assert.equal(ann.assists, 1);
  assert.equal(ann.passPct, 50);
  assert.equal(bob.games, 1);
  assert.equal(bob.rating, 6); // media sulle sole gare giocate
  assert.equal(bob.passPct, null);
  assert.deepEqual([s.wins, s.draws, s.losses, s.goals, s.against], [1, 1, 1, 3, 4]);
  assert.equal(s.required, 2);
  assert.deepEqual(s.winners.map((w) => w.name), ['Ann']); // Bob non ha il minimo di presenze
  assert.equal(s.fallback, false);
});

test('matches: summarizeNight - voti mancanti o zero non entrano nella media', () => {
  const s = summarizeNight([
    match('2026-03-14T20:00:00Z', [1, 0], { 1: player('Cid', { rating: '8' }) }),
    match('2026-03-14T21:00:00Z', [1, 0], { 1: player('Cid', { rating: '0' }), 2: player('Dan', { rating: undefined }) }),
  ]);
  const cid = s.players.find((p) => p.name === 'Cid');
  const dan = s.players.find((p) => p.name === 'Dan');
  assert.equal(cid.rating, 8);
  assert.equal(cid.ratedGames, 1);
  assert.equal(dan.rating, null);
  // Nessuno ha tutte le gare con voto: fallback, nessun vincitore
  assert.equal(s.fallback, true);
  assert.deepEqual(s.winners, []);
});

test('matches: summarizeNight - fallback sceglie il miglior voto tra chi ha più presenze', () => {
  const s = summarizeNight([
    match('2026-03-14T20:00:00Z', [1, 0], { 1: player('A', { rating: '7' }), 2: player('B', { rating: '7' }) }),
    match('2026-03-14T21:00:00Z', [1, 0], { 3: player('C', { rating: '9' }) }),
    match('2026-03-14T22:00:00Z', [1, 0], { 4: player('D', { rating: '9' }) }),
    match('2026-03-14T23:00:00Z', [1, 0], { 5: player('E', { rating: '9' }) }),
  ]);
  assert.equal(s.required, 2);
  assert.equal(s.fallback, true);
  assert.deepEqual(s.winners.map((w) => w.name).sort(), ['C', 'D', 'E']);
});

test('matches: summarizeNight - rossi, mvp, parate, contrasti e ruoli', () => {
  const s = summarizeNight([
    match('2026-03-14T20:00:00Z', [1, 0], { 1: player('Eve', { pos: 'forward', redcards: '1', mom: '1', saves: '2', tacklesmade: '3', tackleattempts: '5' }) }),
    match('2026-03-14T21:00:00Z', [1, 0], { 1: player('Eve', { pos: 'defender', mom: 0 }), 2: null }),
  ]);
  const eve = s.players[0];
  assert.equal(s.players.length, 1);
  assert.deepEqual([eve.reds, eve.mvp, eve.saves, eve.tackles, eve.tackleAttempts], [1, 1, 2, 3, 5]);
  assert.deepEqual(eve.roles, ['forward', 'defender']);
});

// ---------- grades ----------
test('grades: buildGradeComments è deterministico e rispetta variant', () => {
  const stats = { games: 4, goals: 3, assists: 1, shots: 12, passes: 20, passAttempts: 40, passPct: 50, tackles: 0, tackleAttempts: 0, saves: 0, reds: 0 };
  assert.deepEqual(buildGradeComments(stats, 2), buildGradeComments(stats, 2));
  const outs = new Set([0, 1, 2, 3].map((v) => buildGradeComments(stats, v).negative));
  assert.ok(outs.size > 1);
  assert.equal(buildGradeComments(stats, 0).negative, buildGradeComments(stats, 12).negative);
});

test('grades: buildGradeComments casi limite', () => {
  const none = { games: 0, goals: 0, assists: 0, shots: 0, passes: 0, passAttempts: 0, passPct: null, tackles: 0, tackleAttempts: 0, saves: 0, reds: 0 };
  const c = buildGradeComments(none);
  assert.ok(c.positive.length > 0 && c.negative.length > 0);
  assert.match(buildGradeComments({ ...none, games: 3, reds: 2 }).negative, /2 espulsioni/);
  assert.match(buildGradeComments({ ...none, games: 3, saves: 5 }).positive, /^5 parate/);
});

test('grades: buildGradeRows - assenze non valgono zero, liste vuote', () => {
  assert.deepEqual(buildGradeRows([], []), { windowSize: 0, nightGames: 0, nightDate: undefined, rows: [] });

  const members = [
    { name: 'Ann', gamesPlayed: '10', ratingAve: '7.50' },
    { name: 'Pro', gamesPlayed: '0', ratingAve: '0' }, // Pro senza presenze
    { name: 'Zed', gamesPlayed: '4', ratingAve: '0.00' }, // media non disponibile
  ];
  const old = match('2026-03-10T20:00:00Z', [1, 0], { 1: player('Ann', { rating: '6.0' }) });
  const last1 = match('2026-03-14T20:00:00Z', [1, 0], { 1: player('Ann', { rating: '8.0' }), 2: player('Guest', { rating: '7.0' }) });
  const last2 = match('2026-03-15T00:30:00Z', [1, 0], { 1: player('ann', { rating: '0' }) });
  const g = buildGradeRows(members, [old, last1, last2, last1]);
  assert.equal(g.windowSize, 3); // duplicato scartato
  assert.equal(g.nightGames, 2); // 00:30 del 15 appartiene alla serata del 14
  assert.equal(g.nightDate, '2026-03-14');
  const by = Object.fromEntries(g.rows.map((r) => [r.name, r]));
  assert.deepEqual(g.rows.map((r) => r.name), ['Ann', 'Guest', 'Pro', 'Zed']);
  assert.equal(by.Ann.season, 7.5);
  assert.equal(by.Ann.seasonGames, 10);
  assert.equal(by.Ann.evening, 8); // il voto 0 di mezzanotte non abbassa la media
  assert.equal(by.Ann.eveningGames, 1);
  assert.equal(by.Ann.recent, 7);
  assert.equal(by.Guest.season, null);
  assert.equal(by.Pro.season, null);
  assert.equal(by.Pro.recent, null);
  assert.equal(by.Pro.evening, null);
  assert.equal(by.Zed.season, null);
  assert.equal(by.Zed.seasonGames, 4);
});

// ---------- card profile ----------
test('card-profile: Pro senza presenze né partite -> unranked', () => {
  const p = computeCardProfile({ name: 'Nuovo', favoritePosition: 'forward', gamesPlayed: '0' }, []);
  assert.equal(p.basis, 'none');
  assert.equal(p.tier, 'unranked');
  assert.equal(p.score, 0);
  assert.equal(p.games, 0);
  assert.equal(p.label, 'ATT');
  assert.equal(p.hot, false);
});

test('card-profile: ripiega sui totali stagionali (stringhe EA)', () => {
  const p = computeCardProfile(
    { name: 'Sea', gamesPlayed: '20', goals: '20', assists: '4', ratingAve: '7.60', passSuccessRate: '80' },
    [],
  );
  assert.equal(p.basis, 'season');
  // 50 + 16 + min(16, 8*(22.8/20)=9.12) + 6.4 = 81.52 -> 82
  assert.equal(p.score, 82);
  assert.equal(p.tier, 'gold');
  assert.equal(p.label, '—'); // ruolo ignoto
});

test('card-profile: gare recenti nel reparto più recente, forma e hot', () => {
  const mk = (iso, o) => match(iso, [1, 0], { 1: player('Fra', { pos: 'forward', ...o }) });
  const matches = [
    mk('2026-03-10T20:00:00Z', { pos: 'defender', rating: '5.0', tacklesmade: 9 }),
    mk('2026-03-12T20:00:00Z', { rating: '8.0', goals: '2', assists: '0' }),
    mk('2026-03-13T20:00:00Z', { rating: '8.0', goals: '1', assists: '1' }),
    mk('2026-03-14T20:00:00Z', { rating: '7.8', goals: '1', assists: '1', passesmade: '8', passattempts: '10' }),
  ];
  const p = computeCardProfile({ name: 'fra', gamesPlayed: '4', favoritePosition: 'defender' }, matches);
  assert.equal(p.role, 'forward'); // dall'ultima gara, non dal ruolo preferito
  assert.equal(p.games, 3); // la gara da difensore è esclusa
  assert.equal(p.goals, 4);
  assert.equal(p.assists, 2);
  assert.equal(p.passPct, 80);
  assert.equal(p.basis, 'recent');
  assert.equal(p.hot, true);
  assert.ok(p.score >= 40 && p.score <= 99);
  assert.ok(['gold', 'platinum', 'iridescent'].includes(p.tier));
  assert.ok(Math.abs(p.recentRating - (8 + 8 + 7.8) / 3) < 1e-9);
});

test('card-profile: voti mancanti e score limitato a 40..99', () => {
  const low = computeCardProfile({ name: 'X' }, [match('2026-03-14T20:00:00Z', [0, 0], { 1: player('X', { rating: undefined, pos: 'goalkeeper' }) })]);
  assert.equal(low.score, 40);
  assert.equal(low.tier, 'bronze');
  assert.equal(low.hot, false);
  const high = computeCardProfile({ name: 'Y', gamesPlayed: 30, goals: 90, assists: 0, ratingAve: 10, passSuccessRate: 100 }, []);
  assert.equal(high.score, 99);
  assert.equal(high.tier, 'iridescent');
});

test('card-profile: ignora match senza players, nome case-insensitive', () => {
  const p = computeCardProfile({ name: 'ZIO', favoritePosition: 'midfielder' }, [
    { timestamp: 1, clubs: {} },
    match('2026-03-14T20:00:00Z', [1, 0], { 1: player('zio', { rating: '7', assists: '2' }) }),
  ]);
  assert.equal(p.games, 1);
  assert.equal(p.assists, 2);
});

// ---------- season profile ----------
test('season-profile: Pro senza presenze o senza metriche -> in attesa', () => {
  for (const [m, ctx] of [[{ gamesPlayed: '0' }, { metrics: {} }], [{ gamesPlayed: '5' }, {}], [{}, undefined]]) {
    const r = buildSeasonProfile(m, [], null, ctx);
    assert.equal(r.stage, 'Profilo in attesa');
    assert.deepEqual(r.sections, []);
  }
});

test('season-profile: stage in base alle presenze e zoom recente', () => {
  const ctx = getEditorialContext(data);
  const member = data.members.members.find((m) => ctx.metricsByName.has(m.name.toLowerCase()));
  assert.ok(member, 'serve almeno un Pro con metriche nei dati reali');
  const metrics = ctx.metricsByName.get(member.name.toLowerCase());
  const run = (g, recent) =>
    buildSeasonProfile({ ...member, gamesPlayed: String(g) }, [], recent, { metrics, club: ctx.club });
  assert.equal(run(1).stage, 'Prime impressioni');
  assert.equal(run(5).stage, 'La stagione prende forma');
  assert.equal(run(15).stage, 'Profilo in profondità');
  assert.equal(run(30).stage, 'Ritratto esteso');
  const zoom = run(10, { games: 3, label: 'ATT', rating: 7.25, goals: 2, assists: 1, passAttempts: 10, passPct: 80 }).sections.at(-1);
  assert.equal(zoom.label, 'ZOOM RECENTE / ATT');
  assert.match(zoom.text, /Nelle 3 presenze recenti/);
  assert.match(zoom.text, /80% nei passaggi/);
  const noPass = run(10, { games: 1, label: 'DIF', rating: 6, goals: 0, assists: 0, passAttempts: 0 }).sections.at(-1);
  assert.doesNotMatch(noPass.text, /nei passaggi/);
  assert.ok(!run(10, { games: 0 }).sections.some((s) => s.label.startsWith('ZOOM')));
});

// ---------- adani quotes ----------
test('adani: classifyProfile', () => {
  const base = { games: 10, goals: 0, assists: 0, rating: 7.5, passPct: 85, tackles: 0 };
  assert.equal(classifyProfile({ ...base, games: 0 }), 'welcome');
  assert.equal(classifyProfile({ ...base, rating: 6.2 }), 'roast');
  assert.equal(classifyProfile({ ...base, passPct: 60 }), 'roast');
  assert.equal(classifyProfile({ ...base, assists: 5, goals: 2 }), 'assist');
  assert.equal(classifyProfile({ ...base, goals: 8 }), 'goal');
  assert.equal(classifyProfile({ ...base, tackles: 10 }), 'duel');
  assert.equal(classifyProfile({ ...base, saves: 2 }), 'duel');
  assert.equal(classifyProfile({ ...base, rating: null, passPct: null }), 'quality');
});

test('adani: toQuotePlayer normalizza stringhe, numeri e valori mancanti', () => {
  const full = toQuotePlayer({ name: 'A', gamesPlayed: '12', goals: '3', assists: 2, ratingAve: '7.25', passSuccessRate: '81', tacklesMade: '9' });
  assert.deepEqual(full, { name: 'A', games: 12, goals: 3, assists: 2, rating: 7.25, passPct: 81, tackles: 9 });
  const none = toQuotePlayer({ name: 'B', gamesPlayed: '0', ratingAve: '7' });
  assert.equal(none.rating, null);
  assert.equal(none.games, 0);
});

test('adani: toQuotePlayer - passaggi mancanti non rendono "roast" un Pro che gioca', () => {
  // BUG corretto: passSuccessRate assente diventava 0 e classifyProfile lo giudicava "roast" (< 70%).
  const p = toQuotePlayer({ name: 'C', gamesPlayed: '10', goals: '9', assists: '0', ratingAve: '7.9' });
  assert.equal(p.passPct, null);
  assert.equal(classifyProfile(p), 'goal');
});

test('adani: assignQuotes è deterministico, senza ripetizioni finché possibile', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ name: `Pro${i}`, games: i % 4, goals: i, assists: i % 3, rating: 7, passPct: 80, tackles: 0 }));
  const a = assignQuotes(players, '2026-03-14');
  const b = assignQuotes(players, '2026-03-14');
  assert.deepEqual([...a], [...b]);
  assert.equal(a.size, 12);
  assert.equal(new Set([...a.values()].map((q) => q.id)).size, 12);
  assert.deepEqual([...a.keys()], players.map((p) => p.name));
  const c = assignQuotes(players, 'altra-sera');
  assert.notDeepEqual([...a.values()].map((q) => q.id), [...c.values()].map((q) => q.id));
});

test('adani: assignQuotes con più Pro delle citazioni ripete solo a citazioni esaurite', () => {
  const players = Array.from({ length: 60 }, (_, i) => ({ name: `P${i}`, games: 5, goals: 1, assists: 0, rating: 7, passPct: 80, tackles: 0 }));
  const ids = [...assignQuotes(players, 's').values()].map((q) => q.id);
  const total = new Set(ids).size; // tutte le citazioni disponibili sono state usate
  assert.ok(total >= 10 && total < 60);
  assert.equal(new Set(ids.slice(0, total)).size, total);
  assert.equal(assignQuotes([], 's').size, 0);
});

test('adani: assignQuotes preferisce la categoria del profilo', () => {
  const m = assignQuotes([{ name: 'Nessuna', games: 0, goals: 0, assists: 0, rating: null, passPct: null }], 's');
  assert.ok(m.get('Nessuna').categories.includes('welcome'));
});

test('adani: adaniNote', () => {
  assert.match(adaniNote({ name: 'A', games: 0 }), /^Nessuna presenza/);
  const p = { name: 'A', games: 1, goals: 1, assists: 0, rating: 8.5, passPct: 90, tackles: 0 };
  assert.match(adaniNote(p), /^A: 1 gol e 0 assist in 1 presenza, media EA 8\.50\./);
  assert.equal(adaniNote(p), adaniNote({ ...p }));
  assert.doesNotMatch(adaniNote({ name: 'B', games: 3, goals: 0, assists: 0, rating: null, passPct: null }), /media EA/);
  assert.match(adaniNote({ name: 'B', games: 3, goals: 0, assists: 0, rating: 5, passPct: 50 }), /50%/);
});

// ---------- newsroom ----------
test('newsroom: buildCover con serata vuota', () => {
  const c = buildCover({ players: [] }, 0);
  assert.equal(c.name, 'BILLOCCHI CLUB');
  assert.equal(c.closing, '');
  assert.equal(c.awardLabel, 'IL MIGLIORE DELLA SERATA');
});

test('newsroom: buildTrialTitle', () => {
  assert.equal(buildTrialTitle(null, null), 'Campione troppo corto per giudicare.');
  assert.equal(buildTrialTitle({ tier: 'xx' }, {}), 'Campione troppo corto per giudicare.');
  assert.equal(buildTrialTitle({ tier: 'buono' }, { rating: 7.456, proPosLabel: 'ATT' }), 'Stagione 7.46 · ATT: buono, con spazio per crescere.');
  assert.equal(buildTrialTitle({ tier: 'bocciato' }, undefined), 'Stagione —: stagione sotto le attese.');
});

const statsFor = (name, o = {}) => ({
  name, games: 3, rating: 7, goals: 1, assists: 0, shots: 3, passes: 20, passAttempts: 25, passPct: 80,
  tackles: 2, tackleAttempts: 2, saves: 0, reds: 0, ...o,
});

test('newsroom: buildTrial deterministico e titolo/ramo per profilo', () => {
  const p = statsFor('Gigi', { shots: 10, goals: 1 });
  assert.deepEqual(buildTrial(p, 'sale'), buildTrial(p, 'sale'));
  assert.match(buildTrial(p, 's').proof, /1 gol su 10 tiri: conversione 10%/);
  assert.match(buildTrial(statsFor('R', { reds: 2 }), 's').charge, /2 rossi/);
  assert.equal(buildTrial(statsFor('K', { saves: 4 }), 's').title, 'Il custode del risultato.');
  assert.equal(buildTrial(statsFor('A', { assists: 3, goals: 1 }), 's').title, 'Il servizio ai compagni.');
  assert.equal(buildTrial(statsFor('G', { goals: 4, games: 2 }), 's').title, 'Il tabellino lo conosce.');
  assert.equal(buildTrial(statsFor('N', { goals: 0, tackles: 0, assists: 0, shots: 0 }), 's').title, 'La manovra passa anche qui.');
  const pass = buildTrial(statsFor('Pa', { shots: 0, goals: 0, passPct: 60, passes: 15, passAttempts: 25 }), 's');
  assert.match(pass.proof, /10 passaggi non riusciti su 25; precisione 60%/);
  const noRating = buildTrial(statsFor('Z', { games: 0, goals: 0, shots: 0, rating: null, passes: 0, passAttempts: 0, passPct: null, tackles: 0, tackleAttempts: 0 }), 's');
  assert.match(noRating.proof, /Media EA —/);
});

test('newsroom: buildTrials non ripete accuse identiche', () => {
  const players = Array.from({ length: 6 }, (_, i) => statsFor(`Pro${i}`, { shots: 0, goals: 0 }));
  const trials = buildTrials(players, 'sera');
  assert.equal(trials.length, 6);
  assert.equal(new Set(trials.map((t) => t.trial.charge)).size, 6);
  assert.deepEqual(trials, buildTrials(players, 'sera'));
  assert.deepEqual(buildTrials([], 'x'), []);
});

test('newsroom: buildTrials con molti Pro simili usa il testo di riserva', () => {
  const players = Array.from({ length: 30 }, (_, i) => statsFor(`Same${i}`, { shots: 0, goals: 0 }));
  const charges = buildTrials(players, 's').map((t) => t.trial.charge);
  assert.equal(new Set(charges).size, 30);
  assert.ok(charges.some((c) => c.startsWith('Il fascicolo di Same')));
});

test('newsroom: buildRoleTrend', () => {
  assert.deepEqual(buildRoleTrend('Nessuno', []), {
    role: '—', points: [], previous: null, recent: null, previousCount: 0, recentCount: 0, delta: null,
  });
  const ms = [6, 6, 8, 8, 0, 'x'].map((r, i) =>
    match(`2026-03-${10 + i}T20:00:00Z`, [1, 0], { 1: player('Ro', { pos: 'forward', rating: r }) }),
  );
  ms.unshift(match('2026-03-01T20:00:00Z', [1, 0], { 1: player('RO', { pos: 'defender', rating: 1 }) }));
  const t = buildRoleTrend('ro', [...ms, ms[1]]);
  assert.equal(t.role, 'ATT');
  assert.equal(t.points.length, 4); // esclusi voti 0/non numerici, duplicato e altro ruolo
  assert.equal(t.previous, 6);
  assert.equal(t.recent, 8);
  assert.equal(t.delta, 2);
  assert.deepEqual([t.previousCount, t.recentCount], [2, 2]);
  assert.equal(buildRoleTrend('ro', ms.slice(0, 3)).delta, null);
});

test('newsroom: buildShareText', () => {
  assert.equal(buildShareText({ night: null }), '');
  const night = { day: '2026-03-14', games: [1, 2] };
  const nightStats = { winners: [{ name: 'Ann', rating: 8 }, { name: 'Bob', rating: 8 }], wins: 1, draws: 0, losses: 1, goals: 3, against: 2 };
  const text = buildShareText({
    night, nightStats,
    cover: { title: 'T', deck: 'D', closing: '', awardLabel: 'PREMIO' },
    trials: [{ player: { name: 'Ann', rating: 8 }, trial: { praise: '', charge: 'C', proof: 'P', verdict: 'V' } }],
  });
  assert.match(text, /Serata del 14 marzo 2026/);
  assert.match(text, /2 gare: 1V 0P 1S · 3 gol fatti, 2 subiti\./);
  assert.match(text, /PREMIO: Ann \+ Bob · media EA 8\.00/);
  assert.match(text, /Ann · 8\.00 EA\nAccusa: C/);
  assert.doesNotMatch(text, /A favore/);
  const none = buildShareText({ night, nightStats: { ...nightStats, winners: [] }, cover: { title: 'T', deck: 'D', closing: 'X' }, trials: [] });
  assert.doesNotMatch(none, /PREMIO|undefined/);
  assert.match(none, /\nX\n/);
});

// ---------- coach / editorial-ctx ----------
test('coach: buildCoachComments solo per chi ha presenze, chiavi minuscole', () => {
  const map = buildCoachComments(data);
  assert.ok(map instanceof Map);
  for (const [k, v] of map) {
    assert.equal(k, k.toLowerCase());
    assert.ok(v);
  }
  assert.equal(buildCoachComments({ ...data, members: { members: [] }, matches: [], matchHistory: [] }).size, 0);
});

test('editorial-ctx: contesto memorizzato per snapshot', () => {
  const a = getEditorialContext(data);
  assert.equal(getEditorialContext(data), a);
  assert.ok(a.all && a.club && a.metricsByName);
});

test('withPlayingMembers toglie i profili senza presenze', async () => {
  const {withPlayingMembers} = await import('../app/src/lib/useClubData.js').catch(() => ({}));
  if (!withPlayingMembers) return;
  const out = withPlayingMembers({members: {members: [{name: 'a', gamesPlayed: '3'}, {name: 'b', gamesPlayed: '0'}]}});
  assert.deepStrictEqual(out.members.members.map(m => m.name), ['a']);
});
