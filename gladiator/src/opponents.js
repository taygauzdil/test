// Async "fake PvP" opponents. Each template is a list of grid placements in priority order.
// The builder spends a coin budget (scaled with round + player's build value) buying items in
// order, then upgrading them via merges - so the opponent obeys exactly the same inventory rules.
import { Inventory, newUid } from './inventory.js';
import { ITEMS, itemValue, footprint, REGION_LABEL } from './items.js';
import { regionsTouched } from './grid.js';
import { CONFIG } from './config.js';

// Grid slots: arm weapons sit in the outer columns (x=0 left / x=5 right) at y=0 (top arm),
// y=2 (middle arm), y=4 (bottom arm). Items are bought in list order, then upgraded.
export const TEMPLATES = [
  { key: 'balanced', name: 'Balanced Frame', names: ['Atlas-7', 'Kestrel', 'Vanguard'],
    items: [['sword', 0, 2], ['helmet', 2, 0], ['shield', 5, 2], ['chest', 1, 3], ['sword', 0, 0], ['legs', 2, 6], ['shield', 5, 0]] },
  { key: 'tank', name: 'Heavy Tank', names: ['Bulwark', 'Goliath-X', 'Ironclad'],
    items: [['axe', 0, 2], ['chest', 4, 2], ['shield', 5, 2], ['helmet', 2, 0], ['shield', 5, 0], ['legs', 2, 6], ['axe', 0, 4]] },
  { key: 'dual', name: 'Six-Blade Whirlwind', names: ['Shredder', 'Vortex', 'Razor-6'],
    items: [['sword', 0, 2], ['sword', 5, 2], ['helmet', 2, 0], ['sword', 0, 0], ['sword', 5, 0], ['sword', 0, 4], ['sword', 5, 4]] },
  { key: 'ranged', name: 'Artillery Mech', names: ['Longshot', 'Orion-9', 'Barrage'],
    items: [['bow', 0, 2], ['helmet', 2, 0], ['legs', 2, 6], ['chest', 1, 4], ['lightning', 4, 1], ['bow', 0, 0], ['spear', 5, 4]] },
  { key: 'knockback', name: 'Knockback Specialist', names: ['Piledriver', 'Rammer', 'Quake'],
    items: [['hammer', 0, 0], ['legs', 2, 6], ['helmet', 2, 0], ['axe', 5, 2], ['chest', 1, 2], ['axe', 0, 4]] },
  { key: 'lightning', name: 'Tesla Build', names: ['Voltage', 'Arc-3', 'Zapper'],
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

// ---------- Persistent rival ----------
// One opponent per match. It starts with the same coins as the player, earns rewards with the same
// formula after every round, and each round repairs broken limbs and buys / merges parts following
// its template - so both sides grow stronger together and the rival's earlier choices carry over.
export const limbCost = limb => (limb.startsWith('leg') ? CONFIG.limbs.repairCost.leg : CONFIG.limbs.repairCost.arm);

export function createRival(rng = Math.random) {
  const tpl = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
  return {
    template: tpl, name: tpl.names[Math.floor(rng() * tpl.names.length)],
    inv: new Inventory(), coins: CONFIG.startCoins, next: 0, skin: 1 + Math.floor(rng() * 3), log: [],
  };
}

export function rivalTurn(r) {
  r.log = [];
  const inv = r.inv;
  // 1) repair limbs that carry gear (or legs), cheapest priorities first
  const hosts = limb => inv.items.some(it => { const f = footprint(it); return regionsTouched(it.x, it.y, f.w, f.h).includes(limb); });
  const want = inv.broken.filter(l => l.startsWith('leg') || hosts(l)).sort((a, b) => (hosts(b) - hosts(a)) || (limbCost(a) - limbCost(b)));
  for (const limb of want) {
    const c = limbCost(limb);
    if (r.coins < c) break;
    r.coins -= c; inv.broken = inv.broken.filter(l => l !== limb);
    r.log.push(`Repaired ${REGION_LABEL[limb]}`);
  }
  // 2) buy the next template part; once the core build is in, merge-upgrade instead of saving
  let buys = 0;
  while (buys < CONFIG.rival.maxBuysPerRound) {
    const next = r.template.items[r.next];
    if (next) {
      const [id, x, y] = next;
      const it = { uid: newUid(), id, level: 1, rot: 0 };
      if (!inv.canPlace(it, x, y)) { r.next++; continue; }
      if (ITEMS[id].price <= r.coins) {
        inv.place(it, x, y, 0); r.coins -= ITEMS[id].price; r.next++; buys++;
        r.log.push(`Bought ${ITEMS[id].name}`);
        continue;
      }
      if (r.next < 3) break;   // save up for the core build
    }
    const up = [...inv.items].sort((a, b) => a.seq - b.seq).find(it => it.level < 3 && itemValue(it) <= r.coins);
    if (!up) break;
    r.coins -= itemValue(up); up.level++; buys++;
    r.log.push(`Upgraded ${ITEMS[up.id].name} to Lv.${up.level}`);
  }
  return r;
}
