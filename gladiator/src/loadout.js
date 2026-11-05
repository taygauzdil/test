// Equipment activation: turns a grid inventory into an equipped loadout + combat stats.
// Deterministic: items are resolved in equip order (seq), so the first weapon equipped to an
// arm keeps it and later ones touching the same arm become inactive.
import { ITEMS, ARMS, REGION_LABEL, footprint, stats, UNARMED } from './items.js';
import { regionsTouched, regionWeights } from './grid.js';
import { CONFIG } from './config.js';

export function resolveLoadout(inv) {
  const status = {};
  const hands = { armL: null, armR: null };
  const armor = { head: 0, body: 0, armL: 0, armR: 0, legL: 0, legR: 0 };
  const perks = [];
  let hpBonus = 0, stability = CONFIG.combat.baseStability, moveMult = 1;
  let twoHanded = null;

  const ordered = [...inv.items].sort((a, b) => a.seq - b.seq);
  for (const it of ordered) {
    const def = ITEMS[it.id];
    const f = footprint(it);
    const touched = regionsTouched(it.x, it.y, f.w, f.h);
    const weights = regionWeights(it.x, it.y, f.w, f.h);
    const st = stats(it);
    const s = { active: false, touched, regions: [], reason: '', arm: null };
    status[it.uid] = s;

    if (def.kind === 'weapon' || def.kind === 'shield') {
      const armsTouched = ARMS.filter(a => touched.includes(a));
      if (!armsTouched.length) { s.reason = 'Must touch an arm'; continue; }
      if (def.hands === 2) {
        const blocker = ARMS.map(a => hands[a]).find(Boolean);
        if (blocker) { s.reason = `Needs both arms (${ITEMS[blocker.item.id].name} in use)`; continue; }
        const primary = [...armsTouched].sort((a, b) => (weights[b] || 0) - (weights[a] || 0))[0];
        const entry = { item: it, def, st, twoHanded: true, primary };
        hands.armL = entry; hands.armR = entry; twoHanded = entry;
        s.active = true; s.arm = 'both'; s.regions = ['armL', 'armR'];
      } else {
        const free = armsTouched.filter(a => !hands[a]).sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
        if (!free.length) {
          const holder = hands[armsTouched[0]];
          s.reason = `${REGION_LABEL[armsTouched[0]]} already holds ${ITEMS[holder.item.id].name}`;
          continue;
        }
        const arm = free[0];
        hands[arm] = { item: it, def, st, arm };
        s.active = true; s.arm = arm; s.regions = [arm];
      }
      if (def.kind === 'shield') armor[s.arm] += st.armor;
      if (st.move) moveMult += st.move;
      continue;
    }

    const active = touched.filter(r => def.regions.includes(r));
    if (!active.length) { s.reason = 'Must touch ' + def.regions.map(r => REGION_LABEL[r]).join(' / '); continue; }
    s.active = true; s.regions = active;
    if (def.kind === 'armor') {
      for (const r of active) armor[r] += st.armor;
      if (st.hp) hpBonus += st.hp;
      if (st.stability) stability += st.stability;
      if (st.move) moveMult += st.move;
    } else if (def.kind === 'perk') {
      perks.push({ id: it.id, level: it.level, st, uid: it.uid });
    }
  }

  const arm = a => {
    const h = hands[a];
    if (!h) return { type: 'fist', st: UNARMED, item: null };
    if (h.def.kind === 'shield') return { type: 'shield', st: h.st, item: h.item };
    return { type: h.def.attack, st: h.st, item: h.item, twoHanded: !!h.twoHanded };
  };

  const L = arm('armL'), R = arm('armR');
  const kbPower = Math.max(L.st.kb || 0, R.st.kb || 0, UNARMED.kb);
  return {
    status, hands, armor, perks, twoHanded,
    arms: { armL: L, armR: R },
    stats: {
      maxHp: CONFIG.combat.baseHp + hpBonus,
      stability,
      moveSpeed: CONFIG.combat.baseMoveSpeed * Math.max(0.6, moveMult),
      knockback: kbPower,
      damage: Math.max(L.st.dmg || 0, R.st.dmg || 0),
      defense: Object.values(armor).reduce((a, b) => a + b, 0),
      attackSpeed: 1 / Math.min(L.st.cooldown || 9, R.st.cooldown || 9),
    },
  };
}

// Summary used by the UI stat panel.
export function statSummary(lo) {
  const s = lo.stats;
  return [
    ['❤️', 'HP', s.maxHp],
    ['⚔️', 'DMG', s.damage],
    ['🛡️', 'DEF', s.defense],
    ['⚡', 'SPD', s.attackSpeed.toFixed(2)],
    ['💥', 'KB', s.knockback.toFixed(1)],
    ['🦶', 'STB', s.stability.toFixed(2)],
  ];
}
