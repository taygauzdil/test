// Equipment activation: turns a grid inventory into an equipped loadout + combat stats.
// Deterministic: items are resolved in equip order (seq), so the first weapon equipped to an
// arm keeps it and later ones touching the same arm become inactive.
import { ITEMS, ARMS, REGION_LABEL, footprint, stats, UNARMED } from './items.js';
import { regionsTouched, regionWeights } from './grid.js';
import { CONFIG } from './config.js';
import { REGIONS, ARM_INFO } from './body.js';

export function resolveLoadout(inv) {
  const status = {};
  const hands = Object.fromEntries(ARMS.map(a => [a, null]));
  const armor = Object.fromEntries(REGIONS.map(r => [r, 0]));
  const perks = [];
  let hpBonus = 0, stability = CONFIG.combat.baseStability, moveMult = 1;
  const twoHanded = [];

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
        // two-handed: its own arm plus the opposite arm at the same height must both be free
        const ok = armsTouched.filter(a => !hands[a] && !hands[ARM_INFO[a].mirror]).sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
        if (!ok.length) {
          const a = armsTouched[0], m = ARM_INFO[a].mirror, blocker = hands[a] || hands[m];
          s.reason = `Needs ${REGION_LABEL[a]} + ${REGION_LABEL[m]} free (${ITEMS[blocker.item.id].name} in use)`;
          continue;
        }
        const primary = ok[0], other = ARM_INFO[primary].mirror;
        const entry = { item: it, def, st, twoHanded: true, primary, other };
        hands[primary] = entry; hands[other] = entry; twoHanded.push(entry);
        s.active = true; s.arm = primary; s.arms = [primary, other]; s.regions = [primary, other];
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
    if (!active.length) { s.reason = 'Must touch ' + def.regions.filter(r => !r.startsWith('arm') || r === 'armL1').map(r => r === 'armL1' ? 'an arm' : REGION_LABEL[r]).join(' / '); continue; }
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
    if (h.twoHanded && h.other === a) return { type: 'draw', st: h.st, item: h.item, bowArm: h.primary };
    if (h.twoHanded) return { type: h.def.attack, st: h.st, item: h.item, twoHanded: true, drawArm: h.other };
    return { type: h.def.attack, st: h.st, item: h.item };
  };

  const arms = Object.fromEntries(ARMS.map(a => [a, arm(a)]));
  const attackers = Object.values(arms).filter(a => a.type !== 'shield' && a.type !== 'draw');
  const weapons = attackers.filter(a => a.item);
  return {
    status, hands, armor, perks, twoHanded,
    arms,
    stats: {
      maxHp: CONFIG.combat.baseHp + hpBonus,
      stability,
      moveSpeed: CONFIG.combat.baseMoveSpeed * Math.max(0.6, moveMult),
      knockback: Math.max(UNARMED.kb, ...attackers.map(a => a.st.kb || 0)),
      damage: weapons.reduce((t, a) => t + a.st.dmg, 0),
      defense: Object.values(armor).reduce((a, b) => a + b, 0),
      // attacks per second across all arms (one swing at a time, so it saturates)
      attackSpeed: Math.min(3, attackers.reduce((t, a) => t + 1 / a.st.cooldown, 0)),
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
