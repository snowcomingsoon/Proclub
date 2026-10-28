import test from 'node:test';
import assert from 'node:assert/strict';
import { defenseProfile, rankMembers } from '../app/src/lib/defense.js';

const game = (id, rows) => ({ matchId: id, players: { 70375: Object.fromEntries(rows.map((r, i) => [i, { playername: r[0], pos: r[1], goals: r[2], assists: r[3] }])) } });

test('classifica: le gare da difensore pesano con la media delle altre gare; sotto 5 gare fuori dalla difesa vale il reale', () => {
  const history = [];
  for (let i = 0; i < 6; i++) history.push(game(`a${i}`, [['Belen', 'forward', 1, 1], ['Garrus', 'midfielder', 0, 1]]));
  for (let i = 0; i < 3; i++) history.push(game(`d${i}`, [['Belen', 'defender', 0, 0], ['Garrus', 'midfielder', 0, 1]]));
  const belen = { name: 'Belen', goals: 6, assists: 6, gamesPlayed: 9 };
  const garrus = { name: 'Garrus', goals: 0, assists: 9, gamesPlayed: 9 };
  const p = defenseProfile(history, belen, '70375');
  assert.equal(p.defGames, 3);
  assert.equal(p.weighted, 12 + 3 * 2);
  assert.equal(rankMembers([garrus, belen], history, '70375')[0].name, 'Belen');
  const few = defenseProfile(history.slice(4), belen, '70375');
  assert.equal(few.adjusted, false);
  assert.equal(few.weighted, 12);
});
