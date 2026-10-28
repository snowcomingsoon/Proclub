import test from 'node:test';
import assert from 'node:assert/strict';

test('partite non restituite da EA: ricostruzione dai contatori per serata (health e monolite), con ripiego sulla nota di conteggio', async () => {
  const { missingByNight, reconstructedByNight, reconstructedNote, nightNotes, missingNote } = await import('../app/src/lib/missing.js');
  const players = [
    { name: 'garrus92', games: 2, goals: 0, assists: 6 },
    { name: 'We_Belen', games: 2, goals: 2, assists: 0 },
    { name: 'H2K_simoID', games: 1, goals: 1, assists: 0 },
  ];
  const pending = { since: '2026-10-27T21:41:17.570Z', games: 2, wins: 2, ties: 0, losses: 0, goalsFor: 8, goalsAgainst: 2, players };
  const health = { pendingMissing: [{ since: pending.since, count: 2 }], writtenOff: [], unlisted: { pending, final: [] } };
  const map = reconstructedByNight(health, null);
  assert.equal(map.get('2026-10-27').games, 2);
  const note = reconstructedNote(map.get('2026-10-27'));
  assert.equal(note, 'EA non ha restituito 2 partite di questa serata: dai contatori risultano 2V 0P 0S, gol 8–2; presenti: We_Belen (2 partite, 2 gol, 0 assist), garrus92 (2 partite, 0 gol, 6 assist), H2K_simoID (1 partita, 1 gol, 0 assist). Non compaiono nel dettaglio per partita.');
  assert.doesNotMatch(note, /in più|colpa|errore/);
  // una sola nota: la ricostruzione sostituisce il conteggio (nessun doppio conteggio)
  assert.deepEqual(nightNotes(missingByNight(health, null).get('2026-10-27'), map.get('2026-10-27')), [note]);
  // singolare
  const one = reconstructedByNight({ unlisted: { pending: { since: pending.since, games: 1, wins: 0, ties: 1, losses: 0, goalsFor: 2, goalsAgainst: 2, players: [players[2]] }, final: [] } }, null).get('2026-10-27');
  assert.equal(reconstructedNote(one), 'EA non ha restituito una partita di questa serata: dai contatori risulta 0V 1P 0S, gol 2–2; presente: H2K_simoID (1 partita, 1 gol, 0 assist). Non compare nel dettaglio per partita.');
  // voce definitiva + in attesa della stessa serata si sommano; dopo mezzanotte conta la serata precedente (00:10 italiane del 28 = serata del 27)
  const both = reconstructedByNight({ unlisted: { pending, final: [{ ...pending, since: '2026-10-27T23:10:00.000Z', games: 1, wins: 1, goalsFor: 3, goalsAgainst: 0, players: [players[0]] }, { ...pending, since: '2026-10-20T20:00:00.000Z', games: 1, players: [] }] } }, null);
  assert.equal(both.get('2026-10-27').games, 3);
  assert.equal(both.get('2026-10-27').players.find((p) => p.name === 'garrus92').assists, 12);
  assert.equal(both.get('2026-10-20').games, 1);
  assert.doesNotMatch(reconstructedNote(both.get('2026-10-20')), /presenti?:/);
  // monolite senza health: collectionStatus.unlisted
  const mono = { collectionStatus: { unlisted: { pending: null, final: [{ ...pending, at: 'x' }] } } };
  assert.equal(reconstructedByNight(null, mono).get('2026-10-27').games, 2);
  assert.equal(reconstructedByNight(null, null).size, 0);
  assert.equal(reconstructedByNight({ unlisted: { pending: null, final: [] } }, null).size, 0);
  // senza dati ricostruiti ripiega sulla nota di conteggio; la parte non coperta resta in conteggio
  assert.deepEqual(nightNotes(2, null), [missingNote(2)]);
  assert.deepEqual(nightNotes(3, map.get('2026-10-27')), [note, missingNote(1)]);
  assert.deepEqual(nightNotes(0, null), []);
});
