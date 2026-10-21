import test from 'node:test';
import assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {buildAll, roleFor, analyzeClub, appearancesFor} from '../shared/metrics.mjs';
import {commentFor} from '../shared/commentary.mjs';
const data = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url)));
const all = buildAll(data);

test('metriche calcolate per tutti i Pro', () => {
  assert.strictEqual(all.length, data.members.members.length);
  const g = all.find(x => x.name === 'garrus92');
  assert.ok(g.gaPerGame > 1 && g.passFailedPerGame > 0 && g.ratingStd != null);
});
test('nessun elogio sotto 8 di media', () => {
  for (const m of all) if (m.rating <= 8) assert.strictEqual(commentFor(m).praise, null, m.name);
});
test('elogio con media sopra 8', () => {
  for (const m of all) if (m.rating > 8 && m.games >= 3) assert.ok(commentFor(m).praise, m.name);
});
test('media sotto 6.5: critica chiara ma garbata, nessun elogio', () => {
  const c = commentFor({name: 'x', games: 6, rating: 6.1, passPct: 67, passFailedPerGame: 9, position: 'midfielder', sample: 0});
  assert.strictEqual(c.tier, 'bocciato'); // etichetta interna del livello, mai mostrata
  assert.match(c.charge, /sotto il livello atteso|sotto le attese/);
  assert.match(c.verdict, /sotto le attese/);
  assert.strictEqual(c.praise, null);
});

/* ---- Regole ruolo-dipendenti, campioni piccoli, contesto ---- */
const base = {name: 'x', games: 30, rating: 7.2, position: 'midfielder', sample: 0, passAttPerGame: 30, passFailedPerGame: 7.5, cleanSheets: 0, goals: 3, assists: 3, gaPerGame: 0.2};
const withPass = (role, passPct, extra = {}) => commentFor({...base, role, passPct, ...extra});
const hasPassNeg = c => c.negatives.some(n => n.area === 'pass' && n.sev >= 7);
const hasSoftPass = c => c.negatives.some(n => n.area === 'pass' && n.soft && n.sev <= 4);

test('mappatura ruoli: proPos 14 = CC, 25 = ST, avatar punta a centrocampo = offensivo', () => {
  assert.strictEqual(roleFor('midfielder', 14), 'CC');
  assert.strictEqual(roleFor('midfielder', 10), 'MED');
  assert.strictEqual(roleFor('midfielder', 18), 'TRQ');
  assert.strictEqual(roleFor('midfielder', 25), 'MEZ_OFF');
  assert.strictEqual(roleFor('forward', 25), 'ATT');
  assert.strictEqual(roleFor('defender', 5), 'DIF');
  assert.strictEqual(roleFor('goalkeeper', 0), 'POR');
  assert.strictEqual(roleFor(null, 25), 'ATT');
});
test('passaggi al 74%: nota lieve (non accusa dura) per difensore e mediano/CC, niente per attaccante o centrocampista offensivo', () => {
  for (const role of ['DIF', 'CC', 'MED']) {
    const c = withPass(role, 74);
    assert.ok(hasSoftPass(c), role); // resta un rilievo, ma lieve
    assert.ok(!hasPassNeg(c), role);
  }
  // sotto la zona di tolleranza il rilievo diventa netto
  for (const role of ['DIF', 'CC', 'MED']) assert.ok(hasPassNeg(withPass(role, 70)), role);
  assert.ok(!hasSoftPass(withPass('DIF', 80)));
  assert.ok(!hasPassNeg(withPass('ATT', 74)));
  assert.ok(!hasPassNeg(withPass('TRQ', 74)));
  assert.ok(!hasPassNeg(withPass('MEZ_OFF', 74)));
  assert.ok(!hasPassNeg(withPass('DIF', 75)));
  // la soglia tollerante esiste comunque
  assert.ok(hasPassNeg(withPass('ATT', 55)));
  assert.ok(hasPassNeg(withPass('TRQ', 65)));
});
test('il motore reale applica il ruolo giocato (Draigon CC al 57% negativo, H2K avatar ST a centrocampo)', () => {
  const d = all.find(x => x.name === 'Draigon000');
  assert.strictEqual(d.role, 'CC');
  assert.ok(commentFor(d).negatives.some(n => n.area === 'pass'));
  const h = all.find(x => x.name === 'H2K_simoID');
  assert.strictEqual(h.role, 'MEZ_OFF');
});
test('nessun elogio a 8.0 anche con ottimi numeri; oltre 8 elogio con limite tecnico e coachNote', () => {
  const great = {...base, rating: 8.0, gaPerGame: 2, passPct: 90, role: 'CC', motmRate: 40, motm: 12};
  assert.strictEqual(commentFor(great).praise, null);
  const elite = commentFor({...great, rating: 8.4});
  assert.ok(elite.praise);
  assert.ok(elite.charge && elite.charge.length > 20);
  assert.ok(elite.coachNote);
});
test('media 6 non si elogia: bocciatura e nessun elogio', () => {
  const c = commentFor({...base, rating: 6.0, role: 'ATT', gaPerGame: 1.5, passPct: 90});
  assert.strictEqual(c.praise, null);
  assert.strictEqual(c.tier, 'bocciato');
});
test('campioni piccoli: 0-2 presenze nessun giudizio duro, 3-9 cautela dichiarata', () => {
  for (const g of [0, 1, 2]) {
    const c = commentFor({...base, games: g, rating: 5.0, passPct: 50, role: 'CC'});
    assert.strictEqual(c.tier, 'campione_insufficiente');
    assert.strictEqual(c.praise, null);
    assert.deepStrictEqual(c.negatives, []);
    assert.doesNotMatch(c.verdict, /Bocciat/);
  }
  const c = commentFor({...base, games: 4, rating: 6.0, passPct: 60, role: 'CC'});
  assert.strictEqual(c.tier, 'bocciato');
  assert.match(c.verdict, /provvisoria/);
  assert.ok(c.caveats.some(x => /Campione ridotto/.test(x)));
  for (const m of all.filter(x => x.games < 3)) assert.strictEqual(commentFor(m).tier, 'campione_insufficiente', m.name);
});
test('costanza/forma non usate senza almeno 6 gare di dettaglio', () => {
  const c = commentFor({...base, games: 12, rating: 7.1, sample: 3, ratedGames: 3, ratingStd: 1.2, below65Share: 60, below65: 2});
  assert.ok(!c.negatives.some(n => n.area === 'consistency'));
});
test('contesto: calo nelle gare senza vittoria e difesa con/senza', () => {
  const c = commentFor({...base, games: 20, rating: 7.6, sample: 12, ratedGames: 12, nWins: 6, nNotWin: 6, ratingInWins: 8.3, ratingNotWin: 7.0, nOn: 12, nOff: 5, concededPerGameOn: 2.1, concededPerGameOff: 1.0, role: 'MED'});
  assert.ok(c.negatives.some(n => n.area === 'context'));
  assert.ok(c.negatives.some(n => n.area === 'defense' && n.sev >= 7));
});
test('coachNote presente, specifico e con numeri', () => {
  for (const m of all) {
    const c = commentFor(m);
    assert.ok(typeof c.coachNote === 'string' && c.coachNote.length > 20, m.name);
    if (m.games >= 3) assert.match(c.coachNote, /\d/, m.name);
  }
});
test('i commenti dei Pro con >= 3 presenze non sono identici', () => {
  const rated = all.filter(m => m.games >= 3).map(m => commentFor(m));
  assert.strictEqual(new Set(rated.map(c => c.charge)).size, rated.length);
  assert.strictEqual(new Set(rated.map(c => c.coachNote)).size, rated.length);
});
test('minuti da secondsPlayed/gameTime, clean sheet dai gol subiti', () => {
  const a = appearancesFor(data.matchHistory, 'garrus92');
  const second = a.find(x => x.matchId === '99064037870189');
  assert.ok(second.minutes < 90 && second.minutes > 60);
  assert.ok(a.some(x => x.cleanSheet));
  assert.ok(a.every(x => x.cleanSheet === (x.ga === 0)));
});
test('analyzeClub: coppie calcolate dalle partite, insight di squadra', () => {
  const c = analyzeClub(data);
  assert.strictEqual(c.record.n, data.matchHistory.length);
  assert.strictEqual(c.record.w + c.record.d + c.record.l, c.record.n);
  const p = c.pairs.find(x => x.a === 'garrus92' && x.b === 'Nyveex');
  const manual = data.matchHistory.filter(m => { const n = Object.values(m.players['70375']).map(q => q.playername); return n.includes('garrus92') && n.includes('Nyveex'); });
  assert.strictEqual(p.n, manual.length);
  assert.ok(c.dependence.share > 0 && c.dependence.share < 100);
  assert.ok(c.lines.length >= 4);
  assert.ok(c.dataLimits.some(x => /match_event_aggregate/.test(x)));
});

test('nessun testo di squadra segnala difensori o portieri assenti (sono bot)', async () => {
  const {analyzeClub} = await import('../shared/metrics.mjs');
  const text = analyzeClub(data).lines.join(' ');
  assert.doesNotMatch(text, /nessun Pro/i);
});
