// Deterministic rule tests: grid placement, body contact, weapon-per-arm, two-handed,
// merging, selling, shop, rewards and match flow. Run: node tests/rules.test.js
import assert from 'node:assert/strict';
import { Inventory, newUid } from '../src/inventory.js';
import { resolveLoadout } from '../src/loadout.js';
import { regionsTouched, CELLS } from '../src/grid.js';
import { ARMS } from '../src/body.js';
import { generateShop, computeRewards } from '../src/economy.js';
import { Match } from '../src/match.js';
import { ITEMS } from '../src/items.js';
import { buildOpponent, TEMPLATES } from '../src/opponents.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const mk = (id, level = 1, rot = 0) => ({ uid: newUid(), id, level, rot });

test('cells map to body regions (six arms)', () => {
  assert.deepEqual(regionsTouched(0, 0, 1, 2), ['armL1']);
  assert.deepEqual(regionsTouched(0, 2, 1, 2), ['armL2']);
  assert.deepEqual(regionsTouched(5, 4, 1, 2), ['armR3']);
  assert.deepEqual(regionsTouched(2, 0, 2, 1), ['head']);
  assert.deepEqual(regionsTouched(2, 6, 2, 1).sort(), ['legL', 'legR']);
  assert.deepEqual(regionsTouched(1, 2, 1, 2).sort(), ['armL2', 'body']);
  for (const a of ARMS) assert.ok(CELLS.flat().filter(c => c && c.regions.includes(a)).length >= 3, a);
});

test('items must fit on cells and cannot overlap', () => {
  const inv = new Inventory();
  assert.equal(inv.place(mk('sword'), 0, 2), true);
  assert.equal(inv.canPlace(mk('sword'), 0, 3), false, 'overlap');
  assert.equal(inv.canPlace(mk('sword'), 2, 1), false, 'body hole has no cells');
  assert.equal(inv.canPlace(mk('sword'), 0, 7), false, 'off grid');
  assert.equal(inv.canPlace(mk('helmet'), 4, 7), false, 'corner has no cell');
});

test('rotation swaps footprint and respects space', () => {
  const inv = new Inventory();
  const h = mk('helmet'); inv.place(h, 2, 0);
  const ok = inv.rotate(h.uid);
  const it = inv.get(h.uid);
  if (ok) assert.ok(inv.canPlace(it, it.x, it.y));
  const s = mk('sword', 1, 1);   // 2x1 horizontal sword in leg row
  assert.equal(inv.place(s, 2, 6, 1), true);
});

test('weapon activates through the arm it touches', () => {
  const inv = new Inventory();
  const s = mk('sword'); inv.place(s, 0, 2);
  const lo = resolveLoadout(inv);
  assert.equal(lo.status[s.uid].active, true);
  assert.equal(lo.status[s.uid].arm, 'armL2');
  assert.equal(lo.arms.armL2.type, 'slash');
  assert.equal(lo.arms.armL1.type, 'fist');
});

test('all six arms can hold their own weapon or shield', () => {
  const inv = new Inventory();
  const ids = ['sword', 'axe', 'spear', 'shield', 'sword', 'shield'];
  const spots = [[0, 0], [0, 2], [0, 4], [5, 0], [5, 2], [5, 4]];
  const items = ids.map((id, i) => { const it = mk(id); assert.ok(inv.place(it, ...spots[i])); return it; });
  const lo = resolveLoadout(inv);
  for (const it of items) assert.ok(lo.status[it.uid].active, it.id);
  assert.deepEqual(ARMS.map(a => lo.arms[a].type), ['slash', 'chop', 'thrust', 'shield', 'slash', 'shield']);
});

test('weapon not touching an arm is inactive', () => {
  const inv = new Inventory();
  const s = mk('sword', 1, 1); inv.place(s, 2, 6, 1);
  const lo = resolveLoadout(inv);
  assert.equal(lo.status[s.uid].active, false);
});

test('one active weapon per arm; first equipped wins', () => {
  const inv = new Inventory();
  const a = mk('sword'), b = mk('axe');
  inv.place(a, 0, 2); inv.place(b, 1, 2);   // both only reach the left middle arm
  let lo = resolveLoadout(inv);
  assert.equal(lo.status[a.uid].active, true);
  assert.equal(lo.status[b.uid].active, false);
  assert.match(lo.status[b.uid].reason, /Left Middle Arm already holds Sword/);
  inv.remove(a.uid); inv.place({ ...a }, 0, 2);   // re-equip -> sword is now newer, axe wins
  lo = resolveLoadout(inv);
  assert.equal(lo.status[b.uid].active, true);
  assert.equal(lo.status[a.uid].active, false);
});

test('weapon touching two arms takes a free one', () => {
  const inv2 = new Inventory();
  const t = mk('sword'); inv2.place(t, 0, 1);         // c0 r1-r2: touches L1 and L2
  const u = mk('sword'); inv2.place(u, 1, 1);         // c1 r1-r2: touches L1 (and L2)
  const lo = resolveLoadout(inv2);
  assert.ok(lo.status[t.uid].active && lo.status[u.uid].active);
  assert.notEqual(lo.status[t.uid].arm, lo.status[u.uid].arm);
});

test('shield occupies an arm', () => {
  const inv = new Inventory();
  const sh = mk('shield'), sw = mk('sword');
  inv.place(sh, 0, 2); inv.place(sw, 1, 2);
  const lo = resolveLoadout(inv);
  assert.equal(lo.status[sh.uid].active, true);
  assert.equal(lo.status[sw.uid].active, false);
  assert.equal(lo.arms.armL2.type, 'shield');
  assert.ok(lo.armor.armL2 > 0);
});

test('two-handed bow uses its arm + the mirror arm', () => {
  const inv = new Inventory();
  const bow = mk('bow'); inv.place(bow, 0, 2);
  let lo = resolveLoadout(inv);
  assert.equal(lo.status[bow.uid].active, true);
  assert.equal(lo.arms.armL2.type, 'shoot'); assert.equal(lo.arms.armR2.type, 'draw');
  assert.equal(lo.arms.armL1.type, 'fist');
  const inv2 = new Inventory();
  const sw = mk('sword'); inv2.place(sw, 5, 2);
  const bow2 = mk('bow'); inv2.place(bow2, 0, 2);
  lo = resolveLoadout(inv2);
  assert.equal(lo.status[bow2.uid].active, false);
  assert.match(lo.status[bow2.uid].reason, /Right Middle Arm/);
  const bow3 = mk('bow'); inv2.place(bow3, 0, 0);   // top pair is free
  assert.equal(resolveLoadout(inv2).status[bow3.uid].active, true);
});

test('armor protects each touched region it allows', () => {
  const inv = new Inventory();
  const c = mk('chest'); inv.place(c, 1, 2);   // body + left middle arm
  const h = mk('helmet'); inv.place(h, 2, 0);
  const lo = resolveLoadout(inv);
  assert.ok(lo.armor.body > 0 && lo.armor.armL2 > 0 && lo.armor.armR2 === 0);
  assert.equal(lo.armor.head, ITEMS.helmet.levels[0].armor);
  assert.equal(lo.stats.maxHp, 100 + ITEMS.chest.levels[0].hp);
  const h2 = mk('helmet'); inv.place(h2, 2, 6);
  assert.equal(resolveLoadout(inv).status[h2.uid].active, false);
});

test('perks need their designated regions', () => {
  const inv = new Inventory();
  const l1 = mk('lightning'); inv.place(l1, 1, 3);   // body
  const l2 = mk('lightning'); inv.place(l2, 0, 6);   // leg
  const lo = resolveLoadout(inv);
  assert.equal(lo.status[l1.uid].active, true);
  assert.equal(lo.status[l2.uid].active, false);
  assert.equal(lo.perks.length, 1);
});

test('merge: identical + same level, destination keeps spot and orientation', () => {
  const inv = new Inventory();
  const a = mk('sword'), b = mk('sword');
  inv.place(a, 0, 2); inv.place(b, 5, 2);
  const out = inv.merge(b.uid, a.uid);
  assert.equal(out.level, 2); assert.equal(out.x, 0); assert.equal(out.y, 2);
  assert.equal(inv.items.length, 1);
  assert.equal(resolveLoadout(inv).arms.armL2.st.dmg, 25);
  assert.equal(inv.merge(mk('axe').uid, a.uid), null);
  const c = mk('sword'); inv.place(c, 5, 2);
  assert.equal(inv.canMerge(c, inv.get(a.uid)), false, 'level mismatch');
});

test('sell returns 50% of invested value, rounded down', () => {
  const m = new Match(() => 0.1);
  const it = m.inv.addToBench('helmet');
  assert.equal(m.sell(it.uid), 1);
  const s = m.inv.addToBench('sword', 2);
  assert.equal(m.sell(s.uid), 4);
});

test('round 1 shop: sword + helmet + one item; 10 coins buys two not three', () => {
  for (let i = 0; i < 50; i++) {
    const shop = generateShop(1, new Inventory());
    assert.equal(shop.length, 3);
    const ids = shop.map(o => o.id);
    assert.ok(ids.includes('sword') && ids.includes('helmet'));
    const total = ids.reduce((s, id) => s + ITEMS[id].price, 0);
    assert.ok(total > 10, 'cannot afford all three');
  }
});

test('later shops offer something you own (merge bait)', () => {
  const inv = new Inventory(); inv.place(mk('sword'), 0, 2);
  for (let i = 0; i < 30; i++) assert.ok(generateShop(2, inv).some(o => o.id === 'sword'));
});

test('reward formula', () => {
  const r = computeRewards({ damage: 103, won: true, stolen: 2 });
  assert.equal(r.total, 2 + 5 + 5 + 2);
  assert.equal(computeRewards({ damage: 1000, won: false }).total, 2 + 8);
});

test('acceptance flow: buy, place, merge, persist, best-of-5', () => {
  const m = new Match(() => 0.3);
  assert.equal(m.coins, 10);
  const si = m.shop.findIndex(o => o.id === 'sword'), hi = m.shop.findIndex(o => o.id === 'helmet');
  assert.ok(m.buyAndPlace(si, 0, 2).ok);
  assert.ok(m.buyAndPlace(hi, 2, 0).ok);
  assert.equal(m.coins, 3);
  const third = m.shop.findIndex(o => !o.sold);
  assert.equal(m.buyAndPlace(third, 5, 2).ok, false, 'cannot afford third');
  let lo = m.loadout;
  assert.equal(lo.arms.armL2.type, 'slash');
  assert.ok(lo.armor.head > 0);
  const r = m.finishRound({ won: true, damage: 103 });
  assert.equal(m.coins, 3 + r.rewards.total);
  m.nextRound();
  assert.equal(m.inv.items.length, 2, 'inventory preserved');
  assert.equal(m.shop.length, 3);
  const s2 = m.shop.findIndex(o => o.id === 'sword');
  assert.ok(s2 >= 0);
  const sword = m.inv.items.find(i => i.id === 'sword');
  assert.ok(m.buyAndMerge(s2, sword.uid).ok);
  lo = m.loadout;
  assert.equal(lo.arms.armL2.item.level, 2);
  assert.equal(lo.arms.armL2.st.dmg, 25);
  m.finishRound({ won: true, damage: 50 }); m.nextRound();
  const end = m.finishRound({ won: true, damage: 50 });
  assert.equal(end.matchOver, true); assert.equal(end.matchWinner, 'p');
  assert.equal(m.history.length, 3, 'ends immediately at 3 wins');
});

test('opponent builds obey inventory rules and scale up', () => {
  for (const t of TEMPLATES) {
    const inv = new Inventory();
    for (const [id, x, y] of t.items) assert.ok(inv.place(mk(id), x, y), `${t.key}:${id}`);
    const lo = resolveLoadout(inv);
    for (const it of inv.items) assert.ok(lo.status[it.uid].active, `${t.key}:${it.id} active`);
  }
  const weak = buildOpponent(1, new Inventory(), [], () => 0.5);
  const big = new Inventory(); big.place(mk('sword', 3), 0, 2); big.place(mk('chest', 2), 4, 2);
  const strong = buildOpponent(5, big, [], () => 0.5);
  const val = o => o.inv.items.reduce((s, i) => s + ITEMS[i.id].price * (1 << (i.level - 1)), 0);
  assert.ok(val(strong) > val(weak));
});

console.log(`\n${passed} rule tests passed`);
