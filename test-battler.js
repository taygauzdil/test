// Grid Clash headless checks: rule invariants + AI-vs-AI balance.  Run: node test-battler.js
const S = require('./battler-sim.js');
const { CONFIG, UNITS, ORDER } = S;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } };

function playMatch(seed, deckB, deckR) {
  const rng = S.mkRng(seed);
  const P = { blue: S.createPlayer('blue', deckB || S.randomDeck(rng)), red: S.createPlayer('red', deckR || S.randomDeck(rng)) };
  const score = { blue: 0, red: 0 }; let lastLoser = null, round = 0; const times = [], sizes = [];
  while (score.blue < CONFIG.WINS_TO_MATCH && score.red < CONFIG.WINS_TO_MATCH) {
    round++;
    const q = S.buildQueue(lastLoser);
    const before = { blue: P.blue.groups.length, red: P.red.groups.length };
    for (const a of q) {
      const me = P[a.team], opp = P[a.team === 'blue' ? 'red' : 'blue'];
      const cards = S.genCards(me, rng);
      assert(cards.length === CONFIG.CARD_OPTIONS, 'three options');
      for (const c of cards) { assert(c.kind === 'double' || me.deck.includes(c.type), 'card from deck'); if (c.kind === 'upgrade') assert(S.validTargets(me, c).length > 0, 'upgrade has target'); }
      const d = S.aiDecide(me, opp, cards, round, rng);
      const r = S.applyCard(me, cards[d.idx], d.col, d.row);
      assert(r.ok, 'ai placement valid');
      assert(S.inTerritory(a.team, d.col, d.row), 'own territory');
    }
    // invariants: one group per slot, levels capped, actions counted
    for (const t of ['blue', 'red']) {
      const all = P[t].groups.flatMap(g => g.slots.map(sl => sl.col + ',' + sl.row));
      assert(new Set(all).size === all.length, 'no overlapping slots');
      assert(P[t].groups.every(g => g.level <= CONFIG.MAX_LEVEL && g.slots.every(sl => S.inTerritory(t, sl.col, sl.row))), 'levels/territory');
      assert(P[t].groups.every(g => g.slots.length <= CONFIG.DOUBLE_MAX_SLOTS), 'groups cover 1 slot, or 2 when doubled');
    }
    const st = S.simulate(P.blue.groups, P.red.groups, seed * 31 + round);
    assert(st.winner, 'battle must end by elimination');
    assert(st.alive[st.winner === 'blue' ? 'red' : 'blue'] === 0, 'loser fully eliminated');
    times.push(st.t); sizes.push(st.total.blue + st.total.red);
    score[st.winner]++; lastLoser = st.winner === 'blue' ? 'red' : 'blue';
  }
  return { winner: score.blue > score.red ? 'blue' : 'red', rounds: round, times, sizes, P };
}

// Determinism
const a = playMatch(42), b = playMatch(42);
assert(JSON.stringify(a.times) === JSON.stringify(b.times) && a.winner === b.winner, 'deterministic');

// Restoration: a fresh battle from the same groups always has full health
{
  const p = S.createPlayer('blue', ['archer', 'knight', 'bomber', 'dwarf']);
  S.applyCard(p, { kind: 'unit', type: 'archer' }, 0, 9); S.applyCard(p, { kind: 'unit', type: 'archer' }, 2, 9);
  S.applyCard(p, { kind: 'upgrade', type: 'archer' }, 0, 9);
  assert(p.groups[0].level === 2 && p.groups[1].level === 1, 'slot-specific upgrade');
  assert(!S.applyCard(p, { kind: 'unit', type: 'knight' }, 0, 2).ok, 'reject enemy territory');
  assert(!S.applyCard(p, { kind: 'unit', type: 'knight' }, 0, 9).ok, 'reject occupied');
  const st = S.createBattle(p.groups, [], 1);
  assert(st.chars.length === 10 && st.chars.every(c => c.hp === c.maxHp), 'full count/health');
  // no merging: same units side by side stay separate groups
  const m = S.createPlayer('blue', ['archer', 'knight', 'bomber', 'dwarf']);
  S.applyCard(m, { kind: 'unit', type: 'archer' }, 4, 8); S.applyCard(m, { kind: 'unit', type: 'archer' }, 5, 8);
  assert(m.groups.length === 2 && m.groups.every(g => g.slots.length === 1), 'adjacent archers stay separate');
  S.applyCard(m, { kind: 'upgrade', type: 'archer' }, 4, 8);
  assert(S.groupAt(m, 4, 8).level === 2 && S.groupAt(m, 5, 8).level === 1, 'upgrade stays slot-specific');
  // double: the unit grows into the neighbouring slot -> one group, two slots, twice the characters, same level
  const d = S.createPlayer('blue', ['archer', 'knight', 'bomber', 'dwarf']);
  S.applyCard(d, { kind: 'unit', type: 'knight' }, 3, 6); S.applyCard(d, { kind: 'upgrade', type: 'knight' }, 3, 6);
  const r1 = S.applyCard(d, { kind: 'double' }, 3, 6);
  assert(r1.ok && d.groups.length === 1 && d.groups[0].slots.length === 2 && d.groups[0].slots.every(sl => sl.row === 6) && d.groups[0].level === 2 && S.groupCount(d.groups[0]) === 6, 'double covers two slots');
  assert(!S.checkPlacement(d, { kind: 'double' }, 3, 6).ok && S.validTargets(d, { kind: 'double' }).length === 0, 'cannot double twice');
  S.applyCard(d, { kind: 'upgrade', type: 'knight' }, d.groups[0].slots[1].col, 6);
  assert(d.groups[0].level === 3, 'upgrade via either slot upgrades the doubled unit');
  S.applyCard(d, { kind: 'unit', type: 'knight' }, 1, 6);
  assert(d.groups.length === 2, 'units next to a doubled unit stay separate');
  const bt = S.createBattle(d.groups, [], 2);
  assert(bt.chars.length === 9, 'every slot spawns characters');
  const full = S.createPlayer('blue', ['knight', 'archer', 'bomber', 'dwarf']);
  for (let c = 0; c < 10; c++) for (let r = 5; r < 10; r++) full.groups.push({ id: 'x' + c + r, type: (c + r) % 2 ? 'knight' : 'archer', level: 1, slots: [{ col: c, row: r }], col: c, row: r });
  assert(!S.checkPlacement(full, { kind: 'double' }, 0, 5).ok, 'double needs room');
  assert(S.buildQueue('red')[0].team === 'red' && S.buildQueue('red').length === 7 && S.buildQueue(null).length === 6, 'queue');
}

// Balance sweep
const N = 400; let blueW = 0, rounds = 0; const T = [], deckWins = {}, deckGames = {};
for (let i = 0; i < N; i++) {
  const r = playMatch(1000 + i);
  if (r.winner === 'blue') blueW++;
  rounds += r.rounds; T.push(...r.times);
  for (const t of ['blue', 'red']) for (const u of r.P[t].deck) { deckGames[u] = (deckGames[u] || 0) + 1; if (r.winner === t) deckWins[u] = (deckWins[u] || 0) + 1; }
}
T.sort((x, y) => x - y);
console.log('blue win %', (100 * blueW / N).toFixed(1), ' avg rounds', (rounds / N).toFixed(2));
console.log('battle seconds  p10', T[Math.floor(T.length * .1)].toFixed(1), ' median', T[T.length >> 1].toFixed(1), ' p90', T[Math.floor(T.length * .9)].toFixed(1), ' max', T[T.length - 1].toFixed(1));
console.log('win % when unit in deck:', ORDER.map(u => u + ' ' + (100 * (deckWins[u] || 0) / deckGames[u]).toFixed(0)).join('  '));

// Pure 1v1 group duels at equal "cards"
const duel = (x, y) => { let w = 0; for (let s = 0; s < 40; s++) { const G = (id, type, col, row) => ({ id, type, level: 1, col, row, slots: [{ col, row }] }); const st = S.simulate([G('a', x, 4 + (s % 2), 7), G('b', x, 3 + (s % 3), 8)], [G('c', y, 4 + (s % 2), 2), G('d', y, 5 - (s % 3), 1)], s); if (st.winner === 'blue') w++; } return w / 40; };
console.log('duel matrix (row wins vs col, 2 cards each):');
console.log('        ' + ORDER.map(u => u.slice(0, 6).padStart(7)).join(''));
for (const x of ORDER) console.log(x.padEnd(8) + ORDER.map(y => (duel(x, y) * 100).toFixed(0).padStart(7)).join(''));
if (!process.exitCode) console.log('all checks passed');
