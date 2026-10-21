import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionDay } from '../shared/session.mjs';
import { groupByNight } from '../app/src/lib/matches.js';

const ts = (iso) => Date.parse(iso) / 1000;
const data = JSON.parse(readFileSync(new URL('./fixtures/data-current.json', import.meta.url), 'utf8'));

test('sessionDay: sera = giorno stesso (ora italiana)', () => {
  assert.equal(sessionDay(ts('2026-10-20T19:30:00Z')), '2026-10-20'); // 21:30 CEST
  assert.equal(sessionDay(ts('2026-10-20T21:59:00Z')), '2026-10-20'); // 23:59 CEST
});
test('sessionDay: tra 00:00 e 05:59 italiane appartiene alla serata precedente', () => {
  assert.equal(sessionDay(ts('2026-10-20T22:00:00Z')), '2026-10-20'); // 00:00 CEST del 21
  assert.equal(sessionDay(ts('2026-10-21T03:59:00Z')), '2026-10-20'); // 05:59 CEST
  assert.equal(sessionDay(ts('2026-10-21T04:00:00Z')), '2026-10-21'); // 06:00 CEST
});
test('sessionDay: ora solare e passaggi di mese/anno', () => {
  assert.equal(sessionDay(ts('2026-12-01T04:59:00Z')), '2026-11-30'); // 05:59 CET
  assert.equal(sessionDay(ts('2026-12-01T05:00:00Z')), '2026-12-01'); // 06:00 CET
  assert.equal(sessionDay(ts('2027-01-01T00:30:00Z')), '2026-12-31'); // 01:30 CET
});
test('sessionDay: cambio ora legale (ultima domenica di ottobre) e stringhe', () => {
  assert.equal(sessionDay(ts('2026-10-25T00:30:00Z')), '2026-10-24'); // 02:30 CEST
  assert.equal(sessionDay(ts('2026-10-25T05:30:00Z')), '2026-10-25'); // 06:30 CET
  assert.equal(sessionDay(String(ts('2026-10-20T19:30:00Z'))), '2026-10-20');
});
test('sessionDay: fuso e ora di fine notte configurabili', () => {
  assert.equal(sessionDay(ts('2026-10-20T23:30:00Z'), 'UTC', 6), '2026-10-20');
  assert.equal(sessionDay(ts('2026-10-21T02:00:00Z'), 'UTC', 6), '2026-10-20');
  assert.equal(sessionDay(ts('2026-10-21T02:00:00Z'), 'UTC', 0), '2026-10-21');
});
test('sessionDay coincide con la regola del sito (groupByNight) su tutte le partite reali e su un campione continuo', () => {
  for (const m of data.matchHistory) assert.equal(groupByNight([m])[0].day, sessionDay(m.timestamp), m.matchId);
  for (let t = ts('2026-03-20T00:00:00Z'); t < ts('2026-11-05T00:00:00Z'); t += 1777) {
    assert.equal(groupByNight([{matchId: String(t), timestamp: t, clubs: {70375: {}}}])[0].day, sessionDay(t), String(t));
  }
});
