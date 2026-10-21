// Tono dei commenti: critico ma non troppo. Al massimo 2 rilievi per Pro, lessico misurato,
// note lievi per i casi borderline, nessun elogio sotto 8, coach note propositiva.
import test from 'node:test';
import assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {buildAll, analyzeClub} from '../shared/metrics.mjs';
import {commentFor, commentForNight, MAX_CHARGES} from '../shared/commentary.mjs';
import {metricsIndex, coverEditorial, notebookEditorial, turningPointsEditorial, novelEditorial, clubReading, matchStudioEditorial, awardEditorial, verdictFor} from '../shared/editorial.mjs';
import {groupByNight, summarizeNight} from '../app/src/lib/matches.js';
import {buildNightComments} from '../app/src/lib/coach.js';
import {buildGradeComments} from '../app/src/lib/grades.js';
import {buildTrial, buildTrialTitle} from '../app/src/lib/newsroom.js';
import {adaniNote} from '../app/src/lib/adani-quotes.js';

const fixtures = ['data.json', 'data-current.json'].map(f => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url))));
const CLUB_ID = '70375';

// Parole e frasi troppo aspre: non devono comparire in nessun testo di commento.
const HARSH = new RegExp([
  'insufficien', 'bocciat', 'bocciatur', 'rimandat', 'regala', 'regalat', 'problema', 'sprecon', 'sprecat', 'spreco',
  'non (è|e\') affidabil', 'affidabil', 'segue la squadra', 'trascinarla', 'fermo a questi livelli', 'non sta sostenendo',
  'non sostiene', 'non regge', 'non è all.altezza', 'anello debole', 'troppi palloni', 'troppo bass', 'troppo poco',
  'disastr', 'pessim', 'scadent', 'imbarazz', 'deludent', 'alibi', 'condann', 'assolt', 'sbarra', 'statua', 'olimpo',
  'patata', 'terapia', 'sabbatico', 'prenotato la doccia', 'ringrazia', 'fragile', 'si balla', 'serata nera', 'minimo accettabile',
  'sufficienza', 'punisce', 'limite tecnico', 'cala quando', 'va in difficolt', 'colpa', 'ridicol',
].join('|'), 'i');

const mk = (extra = {}) => ({name: 'Tizio', games: 30, rating: 7.2, position: 'midfielder', role: 'CC', sample: 0, passAttPerGame: 30, passPct: 80, passFailedPerGame: 6, goals: 3, assists: 3, gaPerGame: 0.2, ...extra});
const textOf = c => [c.charge, c.verdict, c.praise, c.coachNote, ...(c.proof || []), ...c.negatives.map(n => n.text), ...(c.caveats || [])].filter(Boolean).join(' ');

test('lessico: nessuna espressione aspra nei commenti del motore, su tutti i Pro e tutte le serate', () => {
  for (const data of fixtures) {
    const all = buildAll(data);
    for (const m of all) assert.doesNotMatch(textOf(commentFor(m)), HARSH, m.name);
    for (const night of groupByNight(data.matchHistory)) {
      for (const [name, c] of buildNightComments(data, night.games, all)) {
        assert.doesNotMatch(textOf(c) + ' ' + (c.nightItems || []).map(x => x.text).join(' '), HARSH, name);
      }
    }
  }
});

test('lessico: copertina, svolte, annotazioni, romanzo, match studio, Adani e testi di riserva', () => {
  for (const data of fixtures) {
    const all = buildAll(data), idx = metricsIndex(all), club = analyzeClub(data, undefined, all);
    for (const night of groupByNight(data.matchHistory)) {
      const ns = summarizeNight(night.games);
      const record = {wins: ns.wins, draws: ns.draws, losses: ns.losses, goals: ns.goals, against: ns.against, games: night.games.length};
      const cover = coverEditorial({day: night.day, record, winners: ns.winners, players: ns.players, metricsByName: idx});
      assert.doesNotMatch([cover.title, cover.deck, cover.closing, cover.balance].join(' '), HARSH, night.day);
      assert.doesNotMatch(notebookEditorial({players: ns.players, metricsByName: idx, record: {games: night.games.length, against: ns.against}}), HARSH);
      for (const p of turningPointsEditorial(night.games, {metricsByName: idx})) assert.doesNotMatch(p.title + ' ' + p.text, HARSH, p.tag);
      for (const p of ns.players) {
        assert.doesNotMatch(adaniNote({name: p.name, games: p.games, goals: p.goals, assists: p.assists, rating: p.rating, passPct: p.passPct, tackles: p.tackles, roleCounts: p.roleCounts, saves: p.saves}), HARSH, p.name);
        const t = buildTrial(p, night.day);
        assert.doesNotMatch([t.title, t.charge, t.proof, t.verdict, t.praise].join(' '), HARSH, p.name);
      }
    }
    for (const mem of data.members.members) {
      const m = idx.get(mem.name.toLowerCase());
      const n = novelEditorial(mem, m, club);
      assert.doesNotMatch([n.title, n.intro, ...n.sections.map(s => s.text), ...n.caveats].join(' '), HARSH, mem.name);
      assert.doesNotMatch(adaniNote({name: mem.name, games: Number(mem.gamesPlayed) || 0, goals: Number(mem.goals) || 0, assists: Number(mem.assists) || 0, rating: Number(mem.gamesPlayed) ? Number(mem.ratingAve) : null, passPct: Number(mem.passSuccessRate) || null, tackles: Number(mem.tacklesMade) || 0}), HARSH, mem.name);
    }
    const r = clubReading(club);
    assert.doesNotMatch(r.record + ' ' + r.quick + ' ' + club.lines.join(' '), HARSH);
    for (const match of data.matches || []) {
      const players = Object.values(match.players[CLUB_ID]);
      const st = matchStudioEditorial({own: match.clubs[CLUB_ID], players, metricsByName: idx});
      assert.doesNotMatch(st.headline + ' ' + st.text, HARSH);
      for (const p of players) for (const kind of ['rated', 'assist', 'tackle', 'pass']) assert.doesNotMatch(awardEditorial(kind, p, idx), HARSH);
    }
  }
  for (let v = 0; v < 12; v++) {
    const c = buildGradeComments({games: 5, goals: 1, assists: 0, shots: 12, passes: 20, passAttempts: 40, passPct: 50, tackles: 2, tackleAttempts: 12, saves: 0, reds: 1}, v);
    assert.doesNotMatch(c.negative + ' ' + c.positive, HARSH);
  }
});

test('quantità: al massimo 2 critiche nell\'accusa, anche con molti difetti; gli altri restano solo negli atti', () => {
  assert.strictEqual(MAX_CHARGES, 2);
  const bad = mk({
    games: 30, rating: 6.1, passPct: 58, passFailedPerGame: 11, tackPct: 20, tackAttPerGame: 6, tackFailedPerGame: 4.8, clubMedianTackPct: 40,
    sample: 12, ratedGames: 12, ratingStd: 1.4, ratingMin: 3.5, ratingMax: 8.1, below65: 6, below65Share: 50, form5: 5.7, formBefore: 6.5,
    nWins: 5, nNotWin: 7, ratingInWins: 7.2, ratingNotWin: 5.8, redCards: 1, worstPassPct: 40, ratingVsClubMedian: -0.9, passAttPerGame: 18,
  });
  const c = commentFor(bad);
  assert.ok(c.negatives.filter(n => !n.soft).length >= 4, 'molti difetti nei dati');
  assert.ok(c.chargeItems.length <= 2 && c.chargeItems.length >= 1);
  // il testo contiene solo il testo dei rilievi scelti
  assert.strictEqual(c.charge, c.chargeItems.map(x => x.text).join(' '));
  const unchosen = c.negatives.filter(n => !c.chargeItems.includes(n));
  assert.ok(unchosen.length >= 2);
  for (const n of unchosen) { assert.ok(!c.charge.includes(n.text), n.area); assert.ok(c.proof.length > 0); }
  // lo stesso concetto non compare due volte
  const areas = c.chargeItems.map(x => x.area);
  assert.strictEqual(new Set(areas).size, areas.length);
  assert.doesNotMatch(textOf(c), HARSH);
  // dati reali e serate: mai piu` di due rilievi
  for (const data of fixtures) {
    const all = buildAll(data);
    for (const m of all) assert.ok(commentFor(m).chargeItems.length <= 2, m.name);
    for (const night of groupByNight(data.matchHistory)) {
      for (const [name, cn] of buildNightComments(data, night.games, all)) assert.ok(cn.chargeItems.length <= 2, `${name} ${night.day}`);
    }
  }
});

test('soglie: i casi borderline producono una nota lieve, non un\'accusa', () => {
  const dif = commentFor(mk({role: 'DIF', position: 'defender', passPct: 74, passFailedPerGame: 8}));
  assert.ok(dif.negatives.some(n => n.area === 'pass' && n.soft && n.sev <= 4), 'nota lieve sul passaggio');
  assert.ok(!dif.negatives.some(n => n.area === 'pass' && !n.soft));
  assert.ok(dif.chargeItems.every(x => x.soft) && dif.chargeItems.length <= 1);
  assert.doesNotMatch(dif.charge, HARSH);
  assert.match(dif.charge, /74%/);
  // scarto netto e campione solido: rilievo pieno, comunque in tono misurato
  const dif2 = commentFor(mk({role: 'DIF', position: 'defender', passPct: 66, passFailedPerGame: 10}));
  assert.ok(dif2.chargeItems.some(x => x.area === 'pass' && !x.soft));
  assert.doesNotMatch(dif2.charge, HARSH);
  // campione piccolo: anche uno scarto di 5 punti resta una nota lieve
  const small = commentFor(mk({role: 'DIF', position: 'defender', games: 7, passPct: 70, rating: 7.2}));
  assert.ok(!small.negatives.some(n => n.area === 'pass' && !n.soft));
  // contrasti appena sotto la mediana di club: nota lieve; molto sotto su campione solido: rilievo
  const tk = (extra) => commentFor(mk({role: 'MED', position: 'midfielder', passPct: 82, tackAttPerGame: 5, tackFailedPerGame: 3, ...extra}));
  assert.ok(tk({games: 30, tackPct: 31, clubMedianTackPct: 40}).negatives.some(n => n.area === 'tackle' && n.soft));
  assert.ok(tk({games: 30, tackPct: 20, clubMedianTackPct: 40}).negatives.some(n => n.area === 'tackle' && !n.soft));
  assert.ok(!tk({games: 9, tackPct: 20, clubMedianTackPct: 40}).negatives.some(n => n.area === 'tackle' && !n.soft));
  // attaccante: passaggi al 74% non sono un rilievo
  const att = commentFor(mk({role: 'ATT', position: 'forward', passPct: 74}));
  assert.ok(!att.negatives.some(n => n.area === 'pass'));
  // contributo offensivo di poco sotto la soglia di lavoro: nota lieve
  const near = commentFor(mk({role: 'TRQ', position: 'midfielder', gaPerGame: 0.46, goals: 8, assists: 6}));
  assert.ok(near.negatives.some(n => n.area === 'output' && n.soft));
  const far = commentFor(mk({role: 'TRQ', position: 'midfielder', gaPerGame: 0.2}));
  assert.ok(far.negatives.some(n => n.area === 'output' && !n.soft));
});

test('media molto bassa: critica chiara ma garbata, con la direzione di lavoro', () => {
  const c = commentFor(mk({rating: 5.9, passPct: 60, passFailedPerGame: 9}));
  assert.strictEqual(c.praise, null);
  assert.match(c.charge, /sotto il livello atteso|sotto le attese/);
  assert.match(c.verdict, /sotto le attese/);
  assert.match(c.verdict, /punto di partenza/);
  assert.doesNotMatch(textOf(c), HARSH);
});

test('verdetti: gradazioni sobrie e distinte per livello, sempre con un\'indicazione di lavoro', () => {
  const byTier = {};
  for (const rating of [5.9, 6.8, 7.2, 7.7, 8.4]) {
    const c = commentFor(mk({rating, passPct: 82, passFailedPerGame: 5, tackPct: 40, tackAttPerGame: 3}));
    byTier[c.tier] = c.verdict;
    assert.doesNotMatch(c.verdict, HARSH);
    assert.match(c.verdict, /punto di partenza|margine|passo successivo|lavoro riguarda/, c.tier);
  }
  assert.strictEqual(Object.keys(byTier).length, 5);
  assert.strictEqual(new Set(Object.values(byTier).map(v => v.split(' ')[0] + v.split(' ')[1])).size, 5);
  assert.match(byTier.bocciato, /^Stagione sotto le attese/);
  assert.match(byTier.rimandato, /^Da migliorare/);
  assert.match(byTier.elite, /^Livello alto/);
});

test('elogio solo oltre 8 di media: mai sotto, con un aspetto da curare', () => {
  for (const data of fixtures) {
    const all = buildAll(data);
    for (const m of all) {
      const c = commentFor(m);
      if (m.rating <= 8) assert.strictEqual(c.praise, null, m.name);
      else if (m.games >= 3) { assert.ok(c.praise, m.name); assert.ok(c.charge.length > 20, m.name); }
    }
    for (const night of groupByNight(data.matchHistory)) {
      for (const [name, c] of buildNightComments(data, night.games, all)) {
        const m = all.find(x => x.name.toLowerCase() === name);
        if (c.praise) assert.ok(m.rating > 8, name);
      }
    }
  }
  const t = buildTrial({name: 'Z', games: 3, rating: 7.4, goals: 2, assists: 1, shots: 3, passes: 20, passAttempts: 25, passPct: 80, tackles: 2, tackleAttempts: 2, saves: 0, reds: 0}, 's');
  assert.strictEqual(t.praise, '');
  assert.strictEqual(buildTrialTitle({tier: 'rimandato'}, {rating: 6.8}), 'Stagione 6.80: da migliorare.');
});

test('coach note: una sola frase concreta e propositiva sulle prossime gare', () => {
  const clean = c => c.coachNote.replace(/\s*\(Indicazione provvisoria[^)]*\)\s*$/, '');
  const check = (c, who) => {
    const t = clean(c);
    assert.match(t, /^(Nelle prossime gare|Per restare a questo livello, nelle prossime gare): /, who);
    assert.strictEqual((t.match(/[.!?](\s|$)/g) || []).length, 1, `${who}: ${t}`);
    assert.doesNotMatch(t, HARSH, who);
    assert.match(t, /\d/, who);
  };
  for (const data of fixtures) {
    const all = buildAll(data);
    for (const m of all.filter(x => x.games >= 3)) check(commentFor(m), m.name);
    for (const night of groupByNight(data.matchHistory)) {
      for (const [name, c] of buildNightComments(data, night.games, all)) if (c.tier !== 'campione_insufficiente') check(c, name);
    }
  }
});

test('Draigon000 (la media piu` bassa): critica chiara ma misurata, con direzione di lavoro', () => {
  const data = fixtures[1], all = buildAll(data), idx = metricsIndex(all), club = analyzeClub(data, undefined, all);
  const m = all.find(x => x.name === 'Draigon000');
  assert.ok(m.rating < 6.5);
  const c = commentFor(m);
  assert.ok(c.chargeItems.length <= 2);
  assert.match(c.charge, /sotto/);
  assert.match(c.verdict, /sotto le attese/);
  assert.match(c.coachNote, /^Nelle prossime gare/);
  const n = novelEditorial(data.members.members.find(x => x.name === 'Draigon000'), idx.get('draigon000'), club);
  assert.match([n.title, n.intro].join(' '), /sotto le attese|margine|risalire/);
  assert.strictEqual(verdictFor(m), c.verdict);
});

test('serata: lead di ruolo + al massimo due rilievi, mai accuse offensive a un difensore', () => {
  const m = mk({role: 'ATT', position: 'forward', playedPos: 'forward', rating: 7.2, games: 30, shotsTotal: 0});
  const app = (i, pos, extra = {}) => ({matchId: String(i), timestamp: 1e9 + i * 1800, pos, rating: 6.2, goals: 0, assists: 0, shots: 0, passAtt: 30, passOk: 18, tackAtt: 8, tackOk: 2, saves: 0, ga: 4, gf: 1, result: 'S', red: 0, minutes: 90, ...extra});
  const c = commentForNight(m, [0, 1, 2, 3].map(i => app(i, 'defender')));
  assert.ok(c.chargeItems.length <= 2);
  assert.ok(c.nightItems.length >= 3, 'i dati di serata ci sono tutti');
  assert.doesNotMatch(c.charge, HARSH);
});
