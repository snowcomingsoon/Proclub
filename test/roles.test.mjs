import test from 'node:test';
import assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {buildAll, analyzeClub, appearancesFor, computeMetrics, judgedPosOf, metricsForRole} from '../shared/metrics.mjs';
import {commentFor, commentForNight} from '../shared/commentary.mjs';
import {metricsIndex, coverEditorial, novelEditorial, notebookEditorial, verdictFor, turningPointsEditorial} from '../shared/editorial.mjs';
import {groupByNight, summarizeNight} from '../app/src/lib/matches.js';
import {buildNightComments} from '../app/src/lib/coach.js';

// istantanea dei dati attuali (20/10: We_Belen difensore centrale nelle ultime 4 gare)
const data = JSON.parse(readFileSync(new URL('./fixtures/data-current.json', import.meta.url)));
const all = buildAll(data);
const idx = metricsIndex(all);
const club = analyzeClub(data, undefined, all);
const nights = groupByNight(data.matchHistory);
const night20 = nights.find(n => n.day === '2026-10-20');
const BANNED = /ottim|eccellent|straordinar|fenomen|magnific|brillant|sorride|gioiell|spettacol|fantastic|imprendibil/i;
const RULES = /elogi|soglia|applaus|sotto l.8|oltre l.8|sopra l.8|8 di media EA|regolamento|sotto il 6\.5|sotto il 75|sotto l.80/i;
// accuse offensive: mai a chi ha giocato da difensore
const OFFENSIVE_BLAME = /non segna|senza incidere|a secco|senza gol|gol a partita|G\+A|conversione|tiri|incisiv|gol più assist|nel tabellino|né gol né assist/i;
const belen = all.find(m => m.name === 'We_Belen');

const mkApp = (i, pos, extra = {}) => ({
  matchId: String(1000 + i), timestamp: 1e9 + i * 1800, pos, opponent: 'X', rating: 7, goals: 0, assists: 0, shots: 0,
  passAtt: 20, passOk: 17, tackAtt: 4, tackOk: 2, saves: 0, conceded: 0, cleanSheet: false, mom: false, red: 0, minutes: 90,
  mates: [], teamSize: 5, gf: 2, ga: 1, result: 'V', ...extra,
});
const member = (extra = {}) => ({name: 'Test', gamesPlayed: 40, goals: 20, assists: 5, ratingAve: 7.2, passSuccessRate: 80, passesMade: 800,
  tacklesMade: 80, tackleSuccessRate: 50, proPos: 25, favoritePosition: 'forward', proOverall: 80, ...extra});
const ctxFor = n => ({clubGames: 40, clubGoals: 80, medianRating: 7.2, medianTackPct: 50, matches: []});

test('ogni presenza porta il proprio ruolo; il ruolo giudicato e` quello recente (serie di 4 da difensore)', () => {
  assert.ok(belen.apps.length >= 8 && belen.apps.every(x => x.role));
  assert.deepStrictEqual(belen.apps.slice(-4).map(x => x.pos), ['defender', 'defender', 'defender', 'defender']);
  assert.strictEqual(belen.seasonPos, 'forward');
  assert.strictEqual(belen.playedPos, 'defender');
  assert.strictEqual(belen.role, 'DIF');
  assert.strictEqual(belen.roleLabel, 'difensore centrale');
  assert.ok(belen.mixed);
  assert.strictEqual(belen.roleSample, 4);
  assert.match(belen.roleScope, /difensore centrale nelle ultime 4 gare/);
});

test('We_Belen: nessuna serie a secco, nessuna accusa "non segna" nel fascicolo da difensore', () => {
  assert.strictEqual(belen.dryStreak, 0);
  assert.strictEqual(belen.shotsTotal, 0);
  assert.strictEqual(belen.blankShare, null);
  const c = commentFor(belen);
  for (const n of c.negatives) assert.ok(!['streak', 'output', 'finish'].includes(n.area), n.text);
  assert.doesNotMatch([c.charge, c.coachNote, ...c.proof, c.verdict, ...c.negatives.map(n => n.text)].join(' '), OFFENSIVE_BLAME);
  assert.doesNotMatch(c.charge, /5 gare consecutive/);
  // le medie EA di stagione (miste di ruoli) non producono accuse da attaccante
  assert.ok(!c.negatives.some(n => /da attaccante|segna .* a partita/.test(n.text)));
  assert.ok(c.caveats.some(x => /Ruoli diversi/.test(x) && /difensore centrale/.test(x)));
});

test('We_Belen: il romanzo dichiara il ruolo e non accusa i gol', () => {
  const mem = data.members.members.find(x => x.name === 'We_Belen');
  const n = novelEditorial(mem, belen, club);
  const txt = [n.title, n.intro, ...n.sections.map(s => s.text)].join(' ');
  assert.match(txt, /difensore centrale/);
  assert.doesNotMatch(txt, /insufficiente per un|consecutive senza|a secco/);
  assert.doesNotMatch(txt, BANNED);
  assert.doesNotMatch(txt, RULES);
  assert.doesNotMatch(verdictFor(belen), /attaccante|incidenza/);
});

test('We_Belen: fascicolo della serata 20/10 cita il ruolo da difensore e non critica i gol', () => {
  assert.ok(night20, 'serata 20/10 presente');
  const apps = appearancesFor(night20.games, 'We_Belen');
  assert.strictEqual(apps.filter(x => x.pos === 'defender').length, 4);
  const c = commentForNight(belen, apps);
  assert.match(c.charge, /difensore centrale/);
  assert.match(c.charge, /ruolo abituale: attaccante/);
  assert.match(c.nightRoleText, /difensore centrale/);
  assert.doesNotMatch([c.charge, c.coachNote, ...c.negatives.map(n => n.text)].join(' '), OFFENSIVE_BLAME);
  assert.ok(c.proof.some(p => /Serata: 4 gare da difensore centrale/.test(p) && /gol subiti a gara/.test(p) && /porta inviolata|porte inviolate/.test(p)));
  assert.doesNotMatch(c.charge + c.verdict, BANNED);
  assert.doesNotMatch(c.charge + c.verdict, RULES);
  // dal front-end: stesso risultato, passato dalle presenze della serata scelta
  const viaApp = buildNightComments(data, night20.games).get('we_belen');
  assert.strictEqual(viaApp.charge, c.charge);
  assert.match(viaApp.nightRoleText, /difensore centrale/);
});

test('serata: un difensore che segna non viene lodato ne` criticato come attaccante', () => {
  const ns = summarizeNight(night20.games);
  const p = ns.players.find(x => x.name === 'We_Belen');
  assert.strictEqual(p.roleCounts.defender, 4);
  const lone = {...p, name: 'We_Belen', goals: 0, shots: 4, roles: ['defender'], roleCounts: {defender: 4}, games: 4};
  const t = notebookEditorial({players: [lone], metricsByName: idx, record: {games: 4, against: 8}});
  assert.doesNotMatch(t, /tiri|conversione/);
});

test('adani: la serata da difensore non e` letta per gol e tabellino', async () => {
  const {adaniNote, classifyProfile} = await import('../app/src/lib/adani-quotes.js');
  const p = summarizeNight(night20.games).players.find(x => x.name === 'We_Belen');
  assert.strictEqual(classifyProfile(p), 'duel');
  assert.doesNotMatch(adaniNote(p), /tabellino|mestiere|incisivit|Segna|La porta la trova/);
  assert.strictEqual(classifyProfile({...p, roleCounts: {forward: 4}, goals: 0, assists: 0, tackles: 9}), 'duel');
  assert.match(adaniNote({...p, roleCounts: {forward: 4}, goals: 0, assists: 0, tackles: 9}), /tabellino|incisivit/);
});

test('Pro sempre attaccante: le critiche offensive restano', () => {
  const apps = Array.from({length: 12}, (_, i) => mkApp(i, 'forward', {shots: 3, goals: i < 6 ? 1 : 0, assists: 0}));
  apps.push(...Array.from({length: 4}, (_, i) => mkApp(20 + i, 'forward', {shots: 3, goals: 0})));
  const m = computeMetrics(member(), apps, ctxFor());
  assert.strictEqual(m.role, 'ATT');
  assert.ok(!m.mixed);
  assert.ok(m.dryStreak >= 4);
  const c = commentFor({...m, gaPerGame: 0.4});
  assert.ok(c.negatives.some(n => n.area === 'streak'), 'serie a secco da attaccante');
  assert.ok(c.negatives.some(n => n.area === 'output'), 'incidenza insufficiente da attaccante');
  assert.ok(c.negatives.some(n => n.area === 'finish'), 'conversione bassa');
  // anche nella serata, da attaccante
  const night = apps.slice(-4);
  const cn = commentForNight(m, night);
  assert.doesNotMatch(cn.charge, /cambiato ruolo|non nel suo ruolo/);
  assert.ok(cn.nightItems.some(x => x.area === 'finish' || x.area === 'streak'));
});

test('ruoli misti: mediano o difensore nelle ultime gare, attaccante prima', () => {
  const apps = [...Array.from({length: 14}, (_, i) => mkApp(i, 'forward', {shots: 3, goals: 0})), ...Array.from({length: 5}, (_, i) => mkApp(30 + i, 'midfielder', {passAtt: 30, passOk: 20}))];
  assert.strictEqual(judgedPosOf(apps), 'midfielder');
  const m = computeMetrics(member({proPos: 10, favoritePosition: 'midfielder'}), apps, ctxFor());
  assert.ok(m.mixed);
  assert.strictEqual(m.role, 'MED');
  assert.strictEqual(m.dryStreak, 0);
  assert.strictEqual(m.shotsTotal, 0);
  const c = commentFor(m);
  assert.ok(!c.negatives.some(n => ['streak', 'output', 'finish'].includes(n.area)));
  // passaggi dal solo campione nel ruolo (67%), con il ruolo dichiarato nel testo
  const pass = c.negatives.find(n => n.area === 'pass');
  assert.ok(pass && /mediano nelle ultime 5 gare/.test(pass.text));
  assert.deepStrictEqual(m.roleMix.map(x => `${x.pos}:${x.n}`).sort(), ['forward:5', 'midfielder:5']);
  // lo stesso Pro, visto da attaccante, e` giudicato con le attese di attaccante
  const asFwd = metricsForRole(m, 'forward');
  assert.strictEqual(asFwd.role, 'ATT');
  assert.ok(asFwd.shotsTotal >= 8);
  // il fascicolo di una serata mista dichiara il mix
  const mixNight = [mkApp(40, 'defender'), mkApp(41, 'defender'), mkApp(42, 'forward', {shots: 2}), mkApp(43, 'defender')];
  const cn = commentForNight(m, mixNight);
  assert.match(cn.charge, /3 gare da difensore centrale e 1 gara da attaccante/);
  assert.match(cn.nightRoleText, /difensore centrale e attaccante/);
});

test('serata da difensore: giudizio su passaggi, contrasti e gol subiti, mai sui gol', () => {
  const m = computeMetrics(member(), Array.from({length: 12}, (_, i) => mkApp(i, 'forward', {goals: 1, shots: 2})), ctxFor());
  const night = [0, 1, 2].map(i => mkApp(50 + i, 'defender', {passAtt: 25, passOk: 14, ga: 4, gf: 1, result: 'S', tackAtt: 6, tackOk: 1, rating: 6.1 + i * 0.1}));
  const c = commentForNight(m, night);
  assert.match(c.charge, /ieri|In serata ha giocato da difensore centrale \(3 gare\), non nel suo ruolo abituale da attaccante/);
  assert.ok(c.nightItems.some(x => x.area === 'pass'));
  assert.ok(c.nightItems.some(x => x.area === 'defense'));
  assert.doesNotMatch(c.charge + c.coachNote, OFFENSIVE_BLAME);
  assert.match(c.nightRoleText, /difensore centrale/);
  assert.match(c.proof.join(' '), /0 porte inviolate/);
});

test('copertina: un difensore che segna non e` presentato come bomber', () => {
  const m = computeMetrics(member({name: 'Dif'}), Array.from({length: 12}, (_, i) => mkApp(i, 'forward')), ctxFor());
  const p = {name: 'Dif', games: 4, rating: 8.5, ratedGames: 4, goals: 2, assists: 0, shots: 3, passes: 40, passAttempts: 50, tackles: 5, tackleAttempts: 8,
    saves: 0, reds: 0, mvp: 0, roles: ['defender'], roleCounts: {defender: 4}, passPct: 80};
  const cv = coverEditorial({day: '2026-10-20', record: {wins: 3, draws: 0, losses: 1, goals: 8, against: 4, games: 4}, winners: [p], players: [p], metricsByName: metricsIndex([m])});
  assert.doesNotMatch(cv.title + cv.deck, /mestiere|Davanti ha l/);
  assert.match(cv.deck, /difensore centrale/);
});

test('dati attuali: nessun fascicolo di serata o romanzo con frasi-regola, accuse offensive solo a chi gioca in attacco', () => {
  for (const night of nights) {
    const comments = buildNightComments(data, night.games);
    for (const [name, c] of comments) {
      assert.doesNotMatch(c.charge + c.verdict + c.coachNote, RULES, name);
      assert.doesNotMatch(c.charge + c.verdict, BANNED, name);
      if (c.nightRole && !['forward', 'midfielder'].includes(c.nightRole.pos) && !c.nightRole.multiple) assert.doesNotMatch(c.charge, OFFENSIVE_BLAME, name);
      if (c.praise) assert.ok(idx.get(name).rating > 8, name);
    }
    for (const p of turningPointsEditorial(night.games, {metricsByName: idx})) assert.doesNotMatch(p.text, RULES);
  }
  for (const mem of data.members.members) {
    const m = idx.get(mem.name.toLowerCase());
    const n = novelEditorial(mem, m, club);
    assert.doesNotMatch([n.title, n.intro, ...n.sections.map(s => s.text)].join(' '), RULES, mem.name);
    if (m.games >= 3 && m.playedPos === 'defender') assert.doesNotMatch(commentFor(m).charge, OFFENSIVE_BLAME, mem.name);
  }
});
