import test from 'node:test';
import assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {buildAll, analyzeClub} from '../shared/metrics.mjs';
import {commentFor} from '../shared/commentary.mjs';
import {
  metricsIndex, coverEditorial, notebookEditorial, turningPointsEditorial, novelEditorial,
  clubReading, signalsEditorial, matchStudioEditorial, awardEditorial, awardLabel, verdictFor,
} from '../shared/editorial.mjs';
import {groupByNight, summarizeNight} from '../app/src/lib/matches.js';
import {adaniNote, classifyProfile} from '../app/src/lib/adani-quotes.js';

const data = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url)));
const all = buildAll(data);
const idx = metricsIndex(all);
const club = analyzeClub(data, undefined, all);
const nights = groupByNight(data.matchHistory);
const BANNED = /ottim|eccellent|straordinar|fenomen|magnific|brillant|sorride|gioiell|spettacol|fantastic|imprendibil/i;
// frasi-regola: i testi giudicano, non spiegano il criterio
const RULES = /elogi|soglia|applaus|sotto l.8|oltre l.8|sopra l.8|8 di media EA|regolamento|sotto il 6\.5|sotto il 75|sotto l.80/i;
const CLUB_ID = '70375';
const nightCover = night => {
  const ns = summarizeNight(night.games);
  const record = {wins: ns.wins, draws: ns.draws, losses: ns.losses, goals: ns.goals, against: ns.against, games: night.games.length};
  return {ns, record, cover: coverEditorial({day: night.day, record, winners: ns.winners, players: ns.players, metricsByName: idx})};
};

test('copertina narrativa: protagonista, niente regole, niente percentuali di passaggio', () => {
  assert.ok(nights.length >= 2);
  const titles = new Set();
  for (const night of nights) {
    const {ns, cover} = nightCover(night);
    const text = [cover.title, cover.deck, cover.closing, cover.balance].join(' ');
    assert.doesNotMatch(text, BANNED, night.day);
    assert.doesNotMatch(text, RULES, night.day);
    assert.doesNotMatch(cover.title + cover.deck + cover.closing, /passagg\w* .*%|%.*passagg/i, night.day);
    assert.ok(cover.title.includes(ns.winners[0].name) || ns.winners.length > 1);
    assert.match(cover.deck, /\d+V \d+P \d+S/);
    assert.strictEqual(cover.awardLabel, 'IL MIGLIORE DELLE GARE REGISTRATE');
    assert.strictEqual(cover.note, '');
    titles.add(cover.title);
  }
  assert.ok(titles.size >= 2);
});

test('copertina: tono sobrio sotto 8 di media, nessuna regola esplicita', () => {
  const player = (name, rating, goals = 3) => ({name, rating, games: 3, goals, assists: 0, shots: 4, passes: 30, passAttempts: 40, passPct: 75, tackles: 1, tackleAttempts: 3, reds: 0, roles: ['forward'], saves: 0, mvp: 0});
  const rec = {wins: 2, draws: 0, losses: 1, goals: 5, against: 3, games: 3};
  const mk = (name, rating, season) => {
    const m = {...all.find(x => x.name === 'We_Belen'), name, rating: season};
    const p = player(name, rating);
    return coverEditorial({day: '2026-02-02', record: rec, winners: [p], players: [p], metricsByName: new Map([[name.toLowerCase(), m]])});
  };
  for (const [season, night] of [[7.4, 7.6], [6.2, 7.9], [7.4, 8.6]]) {
    const c = mk('Tizio', night, season);
    const t = `${c.title} ${c.deck} ${c.closing}`;
    assert.doesNotMatch(t, RULES);
    assert.doesNotMatch(t, BANNED);
    assert.match(c.deck, /3 gol/);
  }
  assert.match(mk('Caio', 7.9, 6.2).deck, /stagione/);
});

test('copertina: vittoria con difesa che concede viene segnalata nella chiusura', () => {
  const weak = coverEditorial({day: '2026-01-01', record: {wins: 3, draws: 0, losses: 0, goals: 9, against: 6, games: 3}, winners: [], players: [], metricsByName: idx});
  assert.match(weak.closing, /difesa|tenuta|dietro/i);
});

test('etichetta premio come nel design originale', () => {
  assert.strictEqual(awardLabel(7, false), 'IL MIGLIORE DELLE GARE REGISTRATE');
  assert.strictEqual(awardLabel(9, true), 'I MIGLIORI DELLE GARE REGISTRATE');
});

test('svolte: massimo tre, dati reali, nessuna regola', () => {
  for (const night of nights) {
    const pts = turningPointsEditorial(night.games, {metricsByName: idx});
    assert.ok(pts.length >= 1 && pts.length <= 3);
    for (const p of pts) {
      assert.match(p.text, /\d/);
      assert.doesNotMatch(p.title + p.text, BANNED);
      assert.doesNotMatch(p.title + p.text, RULES);
    }
    assert.strictEqual(new Set(pts.map(p => p.tag)).size, pts.length);
  }
});

test('annotazioni: media piu` alta e piu` bassa, nessuna regola', () => {
  const ns = summarizeNight(nights[0].games);
  const t = notebookEditorial({players: ns.players, metricsByName: idx, record: {games: nights[0].games.length, against: ns.against}});
  assert.match(t, /Media EA più alta/);
  assert.doesNotMatch(t, RULES);
  assert.doesNotMatch(t, BANNED);
});

test('romanzo: titolo e intro unici, nessuna regola, nessun capitolo con/senza su campioni piccoli', () => {
  const titles = [], intros = [];
  for (const mem of data.members.members) {
    const m = idx.get(mem.name.toLowerCase());
    if (m.games < 3) continue;
    const n = novelEditorial(mem, m, club);
    titles.push(n.title); intros.push(n.intro);
    const text = [n.title, n.intro, ...n.sections.map(s => s.text)].join(' ');
    assert.doesNotMatch(text, BANNED, m.name);
    assert.doesNotMatch(text, RULES, m.name);
    if (m.rating < 6.5) assert.match(text, /[Bb]occiat/, m.name);
    assert.ok(n.sections.some(s => s.label === 'IL TABELLINO'));
    assert.ok(!n.sections.some(s => s.label === 'CON E SENZA DI LUI'), m.name);
    assert.doesNotMatch(text, /senza di lui|senza la coppia|insieme il club/, m.name);
  }
  assert.strictEqual(new Set(titles).size, titles.length);
  assert.strictEqual(new Set(intros).size, intros.length);
});

test('romanzo: Draigon000 passaggi citati senza soglia, We_Belen quota gol come fatto', () => {
  const d = novelEditorial(data.members.members.find(x => x.name === 'Draigon000'), idx.get('draigon000'), club);
  const pass = d.sections.find(s => s.label === 'IL PALLONE TRA I PIEDI').text;
  assert.match(pass, /57%/);
  assert.doesNotMatch(pass, /soglia|75/);
  const w = novelEditorial(data.members.members.find(x => x.name === 'We_Belen'), idx.get('we_belen'), club);
  const tab = w.sections.find(s => s.label === 'IL TABELLINO').text;
  assert.match(tab, /capocannoniere.*45%/);
  assert.doesNotMatch(tab, /dipend/);
});

test('panoramica e segnali: dati di stagione, nessuna regola né causalità', () => {
  const r = clubReading(club);
  assert.match(r.record, new RegExp(club.season.gaPerGame.toFixed(2)));
  assert.match(r.quick, /We_Belen/);
  assert.doesNotMatch(r.record + r.quick, BANNED);
  assert.doesNotMatch(r.record + r.quick, RULES);
  assert.doesNotMatch(r.quick, /quando manca|dipend/);
  const s = signalsEditorial(club, {scorer: 'We_Belen', assister: 'garrus92', passer: 'Nyveex'});
  assert.match(s.scorer, /45%/);
  assert.match(s.passer, /83%/);
  for (const t of Object.values(s)) assert.doesNotMatch(t, RULES);
});

test('match studio: verdetto, premi e note senza regole esplicite', () => {
  for (const match of data.matches) {
    const players = Object.values(match.players[CLUB_ID]);
    const st = matchStudioEditorial({own: match.clubs[CLUB_ID], players, metricsByName: idx});
    assert.ok(st.headline.length > 10);
    assert.doesNotMatch(st.headline + st.text, BANNED);
    assert.doesNotMatch(st.headline + st.text, RULES);
    assert.match(st.text, /passaggi non riusciti su \d+/);
    const top = [...players].sort((a, b) => Number(b.rating) - Number(a.rating))[0];
    for (const kind of ['rated', 'assist', 'tackle', 'pass']) {
      const t = awardEditorial(kind, top, idx);
      assert.doesNotMatch(t, BANNED);
      assert.doesNotMatch(t, RULES);
    }
  }
  const bad = Object.values(data.matches[0].players[CLUB_ID]).find(p => p.playername === 'Draigon000');
  assert.match(awardEditorial('pass', {...bad, passesmade: '16', passattempts: '24'}, idx), /basso/);
});

test('verdetti variati per Pro, nessuna regola, bocciatura sotto 6.5', () => {
  const regulars = all.filter(m => m.games >= 3 && m.rating);
  const verdicts = regulars.map(m => verdictFor(m));
  for (const [i, m] of regulars.entries()) {
    assert.doesNotMatch(verdicts[i], BANNED, m.name);
    assert.doesNotMatch(verdicts[i], RULES, m.name);
    if (m.rating < 6.5) assert.match(verdicts[i], /[Bb]occiat/, m.name);
    if (m.rating <= 8) assert.doesNotMatch(verdicts[i], /Promosso/, m.name);
  }
  assert.strictEqual(new Set(verdicts).size, verdicts.length);
});

test('commenti del motore senza frasi-regola', () => {
  for (const m of all.filter(x => x.games >= 3)) {
    const c = commentFor(m);
    const t = [c.charge, c.verdict, c.praise, c.coachNote, ...c.proof].filter(Boolean).join(' ');
    assert.doesNotMatch(t, RULES, m.name);
  }
});

test('commento Adani: dati del Pro, nessuna regola, nessun elogio sotto 8', () => {
  const players = data.members.members.map(m => ({name: m.name, games: Number(m.gamesPlayed) || 0, goals: Number(m.goals) || 0, assists: Number(m.assists) || 0, rating: Number(m.gamesPlayed) ? Number(m.ratingAve) : null, passPct: Number(m.passSuccessRate) || 0, tackles: Number(m.tacklesMade) || 0}));
  const notes = players.filter(p => p.games).map(p => adaniNote(p));
  for (const [i, t] of notes.entries()) {
    assert.doesNotMatch(t, RULES);
    assert.doesNotMatch(t, BANNED);
    assert.match(t, /\d/);
  }
  assert.ok(new Set(notes).size === notes.length);
  assert.ok(classifyProfile(players[0]));
});

/* ----------------------- con/senza e coppie: campioni ------------------- */

function synthetic({withGames, withoutGames, redInWith = 0}) {
  const d = JSON.parse(JSON.stringify(data));
  const base = d.matchHistory.flatMap(h => Object.values(h.players[CLUB_ID])).find(r => r.playername === 'garrus92');
  const mk = (name, extra = {}) => ({...base, playername: name, secondsPlayed: base.gameTime, rating: '7.0', redcards: '0', ...extra});
  const tpl = d.matchHistory[0];
  const history = [];
  const total = withGames + withoutGames;
  for (let i = 0; i < total; i++) {
    const withIt = i < withGames;
    const m = JSON.parse(JSON.stringify(tpl));
    m.matchId = `S${i}`; m.timestamp = 1700000000 + i * 3600;
    m.clubs[CLUB_ID].goals = withIt ? '3' : '0';
    m.clubs[CLUB_ID].goalsAgainst = withIt ? '0' : '2';
    const players = {a: mk('Beta'), c: mk('Gamma')};
    if (withIt) players.b = mk('Alfa', i < redInWith ? {redcards: '1'} : {});
    m.players[CLUB_ID] = players;
    history.push(m);
  }
  d.matchHistory = history;
  d.members.members = ['Alfa', 'Beta', 'Gamma'].map(n => ({...d.members.members.find(x => x.name === 'garrus92'), name: n}));
  return d;
}

test('con/senza: campione grande produce l\'insight, con numero di gare e senza causalità', () => {
  const d = synthetic({withGames: 12, withoutGames: 12});
  const all2 = buildAll(d), a = all2.find(m => m.name === 'Alfa');
  assert.strictEqual(a.nOn, 12);
  assert.strictEqual(a.nOff, 12);
  assert.strictEqual(a.pointsPerGame, 3);
  assert.strictEqual(a.pointsPerGameOff, 0);
  const c2 = analyzeClub(d, undefined, all2);
  const n = novelEditorial(d.members.members[0], a, c2);
  const sec = n.sections.find(s => s.label === 'CON E SENZA DI LUI');
  assert.ok(sec);
  assert.match(sec.text, /3\.00 punti a gara con lui in campo \(12 gare\) e 0\.00 senza \(12 gare\)/);
  assert.doesNotMatch(sec.text, /grazie|crolla|merito|colpa/i);
  const pair = c2.pairs.find(p => [p.a, p.b].sort().join() === 'Alfa,Beta');
  assert.strictEqual(pair.n, 12);
  assert.strictEqual(pair.nRest, 12);
  assert.strictEqual(pair.ppgRest, 0);
  assert.ok(c2.bestPairs.length > 0);
  assert.ok(c2.lines.some(l => /senza la coppia/.test(l)));
});

test('con/senza: campioni piccoli (meno di 10 per gruppo) non producono nulla', () => {
  for (const [w, wo] of [[9, 15], [15, 9], [4, 12], [12, 4]]) {
    const d = synthetic({withGames: w, withoutGames: wo});
    const all2 = buildAll(d), a = all2.find(m => m.name === 'Alfa');
    assert.strictEqual(a.nOff, 0, `${w}/${wo}`);
    assert.strictEqual(a.pointsPerGameOff, null);
    const c2 = analyzeClub(d, undefined, all2);
    assert.ok(c2.pairs.every(p => p.ppgRest === null && p.delta === null));
    assert.strictEqual(c2.bestPairs.length + c2.worstPairs.length, 0);
    const sec = novelEditorial(d.members.members[0], a, c2).sections.find(s => s.label === 'CON E SENZA DI LUI');
    assert.strictEqual(sec, undefined);
    assert.ok(!c2.lines.some(l => /senza la coppia/.test(l)));
    assert.ok(!commentFor(a).negatives.some(n => ['onoff', 'defense'].includes(n.area)));
  }
});

test('con/senza: gare con espulsione del Pro escluse dal gruppo "con"', () => {
  // 12 gare con, di cui 3 con espulsione: restano 9 valide -> insight non prodotto
  let d = synthetic({withGames: 12, withoutGames: 12, redInWith: 3});
  let a = buildAll(d).find(m => m.name === 'Alfa');
  assert.strictEqual(a.nOff, 0);
  assert.strictEqual(a.onOffExcluded, 3);
  // 13 gare con, 3 espulsioni: 10 valide -> insight prodotto con 10 gare
  d = synthetic({withGames: 13, withoutGames: 12, redInWith: 3});
  a = buildAll(d).find(m => m.name === 'Alfa');
  assert.strictEqual(a.nOn, 10);
  assert.strictEqual(a.nOff, 12);
});

test('con/senza: scarto minimo di 0.5 punti a gara', () => {
  const d = synthetic({withGames: 12, withoutGames: 12});
  // senza il Pro il club fa quasi lo stesso: nessun insight
  d.matchHistory.slice(12).forEach((m, i) => { m.clubs[CLUB_ID].goals = i % 2 ? '3' : '0'; m.clubs[CLUB_ID].goalsAgainst = i % 2 ? '0' : '0'; });
  const a = buildAll(d).find(m => m.name === 'Alfa');
  assert.strictEqual(a.nOff, 0);
});

test('dati reali: nessun Pro supera il campione minimo, nessun insight con/senza né coppie', () => {
  for (const m of all) assert.strictEqual(m.nOff, 0, m.name);
  assert.strictEqual(club.bestPairs.length + club.worstPairs.length, 0);
  assert.ok(club.pairs.every(p => p.ppgRest === null));
  assert.ok(!club.lines.some(l => /Coppia|coppia/.test(l)));
});
