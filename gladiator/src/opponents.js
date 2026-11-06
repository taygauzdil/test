// Async "fake PvP" opponents. Each template is a list of grid placements in priority order.
// The builder spends a coin budget (scaled with round + player's build value) buying items in
// order, then upgrading them via merges - so the opponent obeys exactly the same inventory rules.
import { Inventory, newUid } from './inventory.js';
import { ITEMS, itemValue } from './items.js';

// Grid slots: arm weapons sit in the outer columns (x=0 left / x=5 right) at y=0 (top arm),
// y=2 (middle arm), y=4 (bottom arm). Items are bought in list order, then upgraded.
export const TEMPLATES = [
  { key: 'balanced', name: 'Balanced Brute', names: ['Marcus', 'Lucia', 'Titus'],
    items: [['sword', 0, 2], ['helmet', 2, 0], ['shield', 5, 2], ['chest', 1, 3], ['sword', 0, 0], ['legs', 2, 6], ['shield', 5, 0]] },
  { key: 'tank', name: 'Heavy Tank', names: ['Brutus', 'Gorgo', 'Magna'],
    items: [['axe', 0, 2], ['chest', 4, 2], ['shield', 5, 2], ['helmet', 2, 0], ['shield', 5, 0], ['legs', 2, 6], ['axe', 0, 4]] },
  { key: 'dual', name: 'Six-Blade Whirlwind', names: ['Cassia', 'Remus', 'Vex'],
    items: [['sword', 0, 2], ['sword', 5, 2], ['helmet', 2, 0], ['sword', 0, 0], ['sword', 5, 0], ['sword', 0, 4], ['sword', 5, 4]] },
  { key: 'ranged', name: 'Ranged Fighter', names: ['Sagitta', 'Orion', 'Flavia'],
    items: [['bow', 0, 2], ['helmet', 2, 0], ['legs', 2, 6], ['chest', 1, 4], ['lightning', 4, 1], ['bow', 0, 0], ['spear', 5, 4]] },
  { key: 'knockback', name: 'Knockback Specialist', names: ['Thud', 'Rocco', 'Bulla'],
    items: [['hammer', 0, 0], ['legs', 2, 6], ['helmet', 2, 0], ['axe', 5, 2], ['chest', 1, 2], ['axe', 0, 4]] },
  { key: 'lightning', name: 'Lightning Build', names: ['Zeta', 'Fulmen', 'Iris'],
    items: [['spear', 0, 2], ['lightning', 1, 4], ['helmet', 2, 0], ['coinsteal', 1, 5], ['chest', 4, 2], ['spear', 5, 2], ['lightning', 4, 1]] },
];

const BASE_BUDGET = [7, 12, 18, 25, 32];

export function buildValue(inv) {
  return [...inv.items, ...inv.bench].reduce((s, i) => s + itemValue(i), 0);
}

export function pickTemplate(round, used, rng = Math.random) {
  const pool = round === 1 ? TEMPLATES.filter(t => ['balanced', 'dual', 'lightning'].includes(t.key)) : TEMPLATES;
  const fresh = pool.filter(t => !used.includes(t.key));
  const list = fresh.length ? fresh : pool;
  return list[Math.floor(rng() * list.length)];
}

export function buildOpponent(round, playerInv, used = [], rng = Math.random) {
  const tpl = pickTemplate(round, used, rng);
  const base = BASE_BUDGET[Math.min(round - 1, BASE_BUDGET.length - 1)];
  const pv = buildValue(playerInv);
  // mostly mirror the player's investment (fair async PvP), with a floor that rises each round
  let budget = Math.round((base * 0.35 + Math.max(pv, base * 0.6) * 0.8) * (0.85 + rng() * 0.2));
  const inv = new Inventory();

  for (const [id, x, y, rot = 0] of tpl.items) {
    if (ITEMS[id].price > budget) continue;
    const it = { uid: newUid(), id, level: 1, rot };
    if (inv.place(it, x, y, rot)) budget -= ITEMS[id].price;
  }
  // upgrade in priority order while affordable
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const it of [...inv.items].sort((a, b) => a.seq - b.seq)) {
      const cost = itemValue(it);
      if (it.level < 3 && cost <= budget) { it.level++; budget -= cost; progressed = true; break; }
    }
  }
  const name = tpl.names[Math.floor(rng() * tpl.names.length)];
  return { inv, template: tpl, name, purse: 6 + round * 2 };
}
