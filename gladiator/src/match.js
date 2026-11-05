// Match progression: best-of-5 rounds, coins, shop, persistent inventory. Pure logic.
import { CONFIG } from './config.js';
import { Inventory, newUid } from './inventory.js';
import { ITEMS } from './items.js';
import { generateShop, computeRewards } from './economy.js';
import { resolveLoadout } from './loadout.js';
import { buildOpponent } from './opponents.js';

export class Match {
  constructor(rng = Math.random) { this.rng = rng; this.reset(); }

  reset() {
    this.round = 1;
    this.wins = { p: 0, e: 0 };
    this.coins = CONFIG.startCoins;
    this.inv = new Inventory();
    this.history = [];
    this.usedTemplates = [];
    this.shop = generateShop(1, this.inv, this.rng);
    this.over = false;
  }

  get loadout() { return resolveLoadout(this.inv); }
  offer(i) { return this.shop[i]; }
  canAfford(i) { const o = this.shop[i]; return o && !o.sold && this.coins >= ITEMS[o.id].price; }

  _pay(i) {
    const o = this.shop[i];
    if (!o || o.sold) return { ok: false, why: 'Already bought' };
    const price = ITEMS[o.id].price;
    if (this.coins < price) return { ok: false, why: `Need ${price} coins` };
    return { ok: true, price, id: o.id };
  }

  // Confirmed purchase -> bench (must be placed before fighting)
  buyToBench(i) {
    const p = this._pay(i); if (!p.ok) return p;
    if (this.inv.bench.length >= CONFIG.benchSize) return { ok: false, why: 'Bench is full' };
    this.coins -= p.price; this.shop[i].sold = true;
    return { ok: true, item: this.inv.addToBench(p.id) };
  }

  // Drag from shop straight onto a valid grid spot = confirmed purchase
  buyAndPlace(i, x, y, rot = 0) {
    const p = this._pay(i); if (!p.ok) return p;
    const item = { uid: newUid(), id: p.id, level: 1, rot };
    if (!this.inv.canPlace(item, x, y)) return { ok: false, why: 'Does not fit there' };
    this.coins -= p.price; this.shop[i].sold = true;
    this.inv.place(item, x, y, rot);
    return { ok: true, item: this.inv.get(item.uid) };
  }

  // Drag from shop onto an identical Lv.1 item = buy + merge
  buyAndMerge(i, destUid) {
    const p = this._pay(i); if (!p.ok) return p;
    const dest = this.inv.get(destUid);
    if (!dest || !this.inv.canMerge({ uid: '_new', id: p.id, level: 1 }, dest)) return { ok: false, why: 'Cannot merge' };
    this.coins -= p.price; this.shop[i].sold = true;
    dest.level += 1;
    return { ok: true, item: dest };
  }

  sell(uid) {
    const v = this.inv.sell(uid, CONFIG.sellRatio);
    this.coins += v;
    return v;
  }

  get canFight() { return this.inv.bench.length === 0; }

  makeOpponent() {
    const o = buildOpponent(this.round, this.inv, this.usedTemplates, this.rng);
    this.usedTemplates.push(o.template.key);
    return o;
  }

  finishRound({ won, damage, stolen = 0, lostToSteal = 0, reason = '', foe = '' }) {
    const rewards = computeRewards({ damage, won, stolen, lostToSteal });
    const before = this.coins;
    this.coins = Math.max(0, this.coins + rewards.total);
    this.wins[won ? 'p' : 'e']++;
    this.history.push({ round: this.round, won, reason, foe, damage: Math.round(damage) });
    const T = CONFIG.winsToTakeMatch;
    this.over = this.wins.p >= T || this.wins.e >= T || this.round >= CONFIG.maxRounds;
    return { rewards, gained: this.coins - before, matchOver: this.over, matchWinner: this.over ? (this.wins.p > this.wins.e ? 'p' : 'e') : null };
  }

  nextRound() {
    this.round++;
    this.shop = generateShop(this.round, this.inv, this.rng);   // unbought offers are discarded
  }
}
