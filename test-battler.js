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
      for (const c of cards) { assert(me.deck.includes(c.type), 'card from deck'); if (c.kind === 'upgrade') assert(S.validTargets(me, c).length > 0, 'upgrade has target'); }
      const d = S.aiDecide(me, opp, cards, round, rng);
      const r = S.applyCard(me, cards[d.idx], d.col, d.row);
      assert(r.ok, 'ai placement valid');
      assert(S.inTerritory(a.team, d.col, d.row), 'own territory');
    }
    // invariants: one group per slot, levels capped, actions counted
    for (const t of ['blue', 'red']) {
      const keys = new Set(P[t].groups.map(g => g.col + ',' + g.row));
      assert(keys.size === P[t].groups.length, 'no overlapping groups');
      assert(P[t].groups.every(g => g.level <= CONFIG.MAX_LEVEL && S.inTerritory(t, g.col, g.row)), 'levels/territory');
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
  S.applyCard(p, { kind: 'unit', type: 'archer' }, 0, 9); S.applyCard(p, { kind: 'unit', type: 'archer' }, 1, 9);
  S.applyCard(p, { kind: 'upgrade', type: 'archer' }, 0, 9);
  assert(p.groups[0].level === 2 && p.groups[1].level === 1, 'slot-specific upgrade');
  assert(!S.applyCard(p, { kind: 'unit', type: 'knight' }, 0, 2).ok, 'reject enemy territory');
  assert(!S.applyCard(p, { kind: 'unit', type: 'knight' }, 0, 9).ok, 'reject occupied');
  const st = S.createBattle(p.groups, [], 1);
  assert(st.chars.length === 10 && st.chars.every(c => c.hp === c.maxHp), 'full count/health');
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
const duel = (x, y) => { let w = 0; for (let s = 0; s < 40; s++) { const st = S.simulate([{ id: 'a', type: x, level: 1, col: 4 + (s % 2), row: 7 }, { id: 'b', type: x, level: 1, col: 3 + (s % 3), row: 8 }], [{ id: 'c', type: y, level: 1, col: 4 + (s % 2), row: 2 }, { id: 'd', type: y, level: 1, col: 5 - (s % 3), row: 1 }], s); if (st.winner === 'blue') w++; } return w / 40; };
console.log('duel matrix (row wins vs col, 2 cards each):');
console.log('        ' + ORDER.map(u => u.slice(0, 6).padStart(7)).join(''));
for (const x of ORDER) console.log(x.padEnd(8) + ORDER.map(y => (duel(x, y) * 100).toFixed(0).padStart(7)).join(''));
if (!process.exitCode) console.log('all checks passed');
