import test from 'node:test';
import assert from 'node:assert/strict';
import { honorsFor, clubHonors, HONOR_FAMILIES, HONOR_TIERS } from '../shared/honors.mjs';

const member = { name: 'X', gamesPlayed: '84', goals: '55', assists: '83', manOfTheMatch: '18', ratingAve: '8.1', passesMade: '1927', passSuccessRate: '76', tacklesMade: '151', redCards: '0', cleanSheetsDef: '0', cleanSheetsGK: '0' };

test('menzioni: livelli dai totali di stagione, soglie e progresso al livello successivo', () => {
  const { earned } = honorsFor(member, [], 'mid');
  const by = Object.fromEntries(earned.map(h => [h.id, h]));
  assert.equal(by.presenze.tierName, 'Oro');
  assert.equal(by.presenze.next, 100);
  assert.equal(by.assist.tierName, 'Oro');
  assert.equal(by.gol.tierName, 'Oro');
  assert.equal(by.voto.tierName, 'Oro');
  assert.equal(by.mvp.tierName, 'Argento');
  assert.ok(!by.inviolata && !by.doppiette);
  assert.ok(by.presenze.progress > 0.5 && by.presenze.progress < 1);
});

test('menzioni: ogni famiglia ha 5 soglie crescenti, e le soglie a gara richiedono presenze minime', () => {
  for (const f of HONOR_FAMILIES) {
    assert.equal(f.tiers.length, HONOR_TIERS.length, f.id);
    f.tiers.forEach((t, i) => i && assert.ok(t > f.tiers[i - 1], `${f.id} crescente`));
  }
  const few = honorsFor({ ...member, gamesPlayed: '10', goals: '10', ratingAve: '9.5' }, [], 'att');
  assert.ok(!few.earned.some(h => h.id === 'voto' || h.id === 'cecchino'));
});

test('menzioni: dall archivio doppiette, serie e voto 9+; il reparto decide cosa e in corso', () => {
  const apps = [
    { goals: 2, assists: 0, rating: 9.1, result: 'V', pos: 'forward', saves: 0 },
    { goals: 1, assists: 1, rating: 8, result: 'V', pos: 'forward', saves: 0 },
    { goals: 0, assists: 2, rating: 7, result: 'V', pos: 'forward', saves: 0 },
    { goals: 0, assists: 0, rating: 6, result: 'S', pos: 'forward', saves: 0 },
  ];
  const att = honorsFor(member, apps, 'att');
  const by = Object.fromEntries(att.earned.map(h => [h.id, h]));
  assert.equal(by.doppiette.value, 1);
  assert.equal(by.doppioassist.value, 1);
  assert.equal(by.striscia.value, 3);
  assert.equal(by.vittorie.value, 3);
  assert.equal(by.nove.value, 1);
  assert.ok(att.inProgress.some(h => h.id === 'cecchino'));
  assert.ok(!att.inProgress.some(h => h.id === 'parate' || h.id === 'inviolata'));
  const por = honorsFor(member, [], 'por');
  assert.ok(por.inProgress.some(h => h.id === 'inviolata') && !por.inProgress.some(h => h.id === 'cecchino'));
});

test('bacheca del club: ordinata per punti, solo Pro con presenze', () => {
  const rows = clubHonors([member, { name: 'Y', gamesPlayed: '12', goals: '3' }, { name: 'Z', gamesPlayed: '0' }], () => [], () => 'mid');
  assert.deepEqual(rows.map(r => r.name), ['X', 'Y']);
  assert.ok(rows[0].points > rows[1].points);
  assert.equal(rows[0].byTier.length, 5);
});
