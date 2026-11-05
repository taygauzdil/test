// Shop generation, purchasing rules and round rewards.
import { ITEMS } from './items.js';
import { CONFIG } from './config.js';

const ALL = Object.keys(ITEMS);
const pickWeighted = (list, wfn, rng) => {
  const tot = list.reduce((s, x) => s + wfn(x), 0);
  let r = rng() * tot;
  for (const x of list) { r -= wfn(x); if (r <= 0) return x; }
  return list[list.length - 1];
};

// Round 1 is curated so the starter choice is readable: Sword + Helmet are always offered,
// plus one pricier item, so 10 coins buys exactly two of the three.
// Later rounds: one offer is an item you already own (merge bait), the rest are random.
export function generateShop(round, inv, rng = Math.random) {
  if (round === 1) {
    const third = pickWeighted(ALL.filter(id => !['sword', 'helmet'].includes(id) && ITEMS[id].price >= 4), () => 1, rng);
    return shuffle(['sword', 'helmet', third], rng).map(id => ({ id, sold: false }));
  }
  const offers = [];
  const owned = [...new Set([...inv.items, ...inv.bench].filter(i => i.level < 3).map(i => i.id))];
  if (owned.length) offers.push(pickWeighted(owned, id => (ITEMS[id].kind === 'weapon' ? 3 : 1), rng));
  while (offers.length < CONFIG.shopSize) {
    const id = pickWeighted(ALL.filter(x => !offers.includes(x)), id => (ITEMS[id].kind === 'perk' ? 0.8 : 1), rng);
    offers.push(id);
  }
  return shuffle(offers, rng).map(id => ({ id, sold: false }));
}

export function computeRewards({ damage, won, stolen = 0, lostToSteal = 0 }) {
  const R = CONFIG.rewards;
  const dmgCoins = Math.min(R.maxDamageCoins, Math.floor(damage / R.damagePerCoin));
  const rows = [
    ['Round income', R.roundIncome],
    [`Damage dealt (${Math.round(damage)})`, dmgCoins],
  ];
  if (won) rows.push(['Victory bonus', R.winBonus]);
  if (stolen) rows.push(['Coins stolen', stolen]);
  if (lostToSteal) rows.push(['Stolen by enemy', -lostToSteal]);
  return { rows, total: rows.reduce((s, r) => s + r[1], 0) };
}

export function shuffle(a, rng = Math.random) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
