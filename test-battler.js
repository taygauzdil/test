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
    // grid modifiers: snapshot occupied slots' modifiers, generate, check the rules
    for (const t of ['blue', 'red']) {
      const pl = P[t], prev = Object.assign({}, pl.mods), occ = new Set(pl.groups.flatMap(g => g.slots.map(sl => S.skey(sl.col, sl.row))));
      const made = S.genModifiers(pl, round, rng);
      for (const k in prev) assert(pl.mods[k] === prev[k], 'existing modifiers never change');
      for (const m of made) assert(!occ.has(S.skey(m.col, m.row)) && !prev[S.skey(m.col, m.row)], 'new modifiers only on empty, unmodified slots');
      for (const k in pl.mods) { const [c, r] = k.split(',').map(Number); assert(S.inTerritory(t, c, r), 'modifier in own territory'); }
      const cnt = { 1: 0, '-1': 0 }; for (const k in pl.mods) cnt[CONFIG.MODIFIERS[pl.mods[k]].sign]++;
      const ri = Math.min(round, 5) - 1;
      assert(cnt[1] <= CONFIG.MODIFIER_TARGETS.positive[ri] && cnt[-1] <= CONFIG.MODIFIER_TARGETS.negative[ri], 'modifier totals capped');
      if (S.emptySlots(pl).length > 20) assert(cnt[1] === CONFIG.MODIFIER_TARGETS.positive[ri] && cnt[-1] === CONFIG.MODIFIER_TARGETS.negative[ri], 'modifier totals reached');
    }
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
    const st = S.simulate(P.blue, P.red, seed * 31 + round);
    assert(st.winner, 'battle must end by elimination');
    assert(st.alive[st.winner === 'blue' ? 'red' : 'blue'] === 0, 'loser fully eliminated');
    times.push(st.t); sizes.push(st.total.blue + st.total.red);
    score[st.winner]++; lastLoser = st.winner === 'blue' ? 'red' : 'blue';
  }
  return { winner: score.blue > score.red ? 'blue' : 'red', rounds: round, times, sizes, P };
}

// Grid modifiers change real battle numbers, multiply with upgrades, and persist
{
  const M = CONFIG.MODIFIERS;
  const p = S.createPlayer('blue', ['archer', 'knight', 'bomber', 'dwarf']);
  p.mods = { '0,9': 'multUp', '1,9': 'hpUp', '2,9': 'dmgUp', '3,9': 'spdUp', '4,9': 'multDown', '5,9': 'hpDown', '6,9': 'dmgDown', '7,9': 'spdDown' };
  const put = (type, col) => S.applyCard(p, { kind: 'unit', type }, col, 9);
  put('archer', 0); put('knight', 1); put('archer', 2); put('bomber', 3); put('archer', 4); put('dwarf', 5); put('knight', 6); put('archer', 7); put('dwarf', 8);
  S.applyCard(p, { kind: 'upgrade', type: 'archer' }, 2, 9); // Lv2 + Damage Boost
  const st = S.createBattle(p, [], 5), by = col => st.chars.filter(c => Math.floor(c.gx) === col);
  assert(by(0).length === 10, 'x2 Units: 5 archers -> 10');
  assert(new Set(by(0).map(c => c.id)).size === 10 && by(0).every(c => c.hp === UNITS.archer.hp), 'x2 Units makes independent characters');
  assert(by(1).every(c => c.maxHp === Math.round(UNITS.knight.hp * 1.3)), 'Health Boost +30%');
  assert(by(2).every(c => Math.abs(c.dmg - UNITS.archer.dmg * 1.25 * 1.25) < 1e-9), 'upgrade x modifier multiply');
  assert(by(3).every(c => Math.abs(c.cdMax - UNITS.bomber.cd / 1.25) < 1e-9), 'Attack Speed Boost');
  assert(by(4).length === 3, 'x0.5 Units: 5 -> 3 (round up)');
  assert(by(5).every(c => c.maxHp === Math.round(UNITS.dwarf.hp * 0.8)), 'Health Reduction');
  assert(by(6).every(c => Math.abs(c.dmg - UNITS.knight.dmg * 0.8) < 1e-9), 'Damage Reduction');
  assert(by(7).every(c => Math.abs(c.cdMax - UNITS.archer.cd / 0.8) < 1e-9), 'Attack Speed Reduction');
  assert(by(8).length === 4 && by(8).every(c => c.maxHp === UNITS.dwarf.hp), 'normal slot unchanged');
  assert(S.slotCount('dwarf', M.multDown) === 2 && S.slotCount('cavalry', M.multDown) === 1 && S.slotCount('knight', M.multDown) === 2, 'x0.5 rounding / min 1');
  assert(st.chars.every(c => c.x >= 0.15 && c.x <= 9.85 && c.y >= 0.15 && c.y <= 9.85), 'spawns inside the field');
  // persistence: later rounds never touch occupied slots, base unit data is never altered
  const before = JSON.stringify(p.mods), baseHp = UNITS.knight.hp;
  for (let r = 2; r <= 5; r++) S.genModifiers(p, r, S.mkRng(r));
  for (const k of Object.keys(JSON.parse(before))) assert(p.mods[k] === JSON.parse(before)[k], 'locked modifiers');
  assert(UNITS.knight.hp === baseHp, 'base stats untouched');
  const st2 = S.createBattle(p, [], 6);
  assert(st2.chars.filter(c => Math.floor(c.gx) === 0).length === 10 && st2.chars.every(c => c.hp === c.maxHp), 'restored every battle with modifiers');
  // a modifier really changes outcomes: 2 knights on Health Boost beat 2 identical knights on normal slots more often
  let w = 0; for (let s = 0; s < 30; s++) { const a = S.createPlayer('blue', ['knight']), b = S.createPlayer('red', ['knight']); a.mods = { '4,5': 'hpUp', '5,5': 'hpUp' };
    for (const c of [4, 5]) { S.applyCard(a, { kind: 'unit', type: 'knight' }, c, 5); S.applyCard(b, { kind: 'unit', type: 'knight' }, c, 4); }
    if (S.simulate(a, b, s).winner === 'blue') w++; }
  assert(w >= 24, 'Health Boost wins mirror matches (' + w + '/30)');
  // AI prefers a good slot over a bad one when positions are equal
  const ai = S.createPlayer('red', ['knight', 'archer', 'bomber', 'dwarf']), en = S.createPlayer('blue', ['knight']);
  ai.mods = { '4,4': 'hpDown', '5,4': 'hpUp' };
  let good = 0; for (let s = 0; s < 40; s++) { const d = S.aiDecide(ai, en, [{ kind: 'unit', type: 'knight' }], 1, S.mkRng(s)); if (d.col === 5 && d.row === 4) good++; }
  assert(good >= 30, 'AI picks the Health Boost front slot for knights (' + good + '/40)');
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
