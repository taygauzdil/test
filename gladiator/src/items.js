// Data-driven item definitions. Add a new item by adding an entry here (plus a mesh builder
// in models.js keyed by `model`). Stats are per level (index 0 = Lv.1).
//
// kind:      weapon | shield | armor | perk
// hands:     weapons only, 1 or 2
// regions:   body regions through which this item can activate
// w,h:       footprint in grid cells before rotation
// attack:    animation / collision profile used by the combat system

import { ARMS, REGIONS, REGION_LABEL } from './body.js';
export { ARMS, REGIONS, REGION_LABEL };

export const ITEMS = {
  sword: {
    name: 'Sword', kind: 'weapon', hands: 1, price: 4, w: 1, h: 2, model: 'sword',
    regions: ARMS, attack: 'slash',
    desc: 'Fast slashes, medium damage, short reach.',
    levels: [
      { dmg: 15, cooldown: 1.0, reach: 1.30, kb: 1.0, length: 0.95 },
      { dmg: 25, cooldown: 0.95, reach: 1.32, kb: 1.15, length: 1.0 },
      { dmg: 40, cooldown: 0.9, reach: 1.36, kb: 1.3, length: 1.08 },
    ],
  },
  axe: {
    name: 'Axe', kind: 'weapon', hands: 1, price: 5, w: 1, h: 2, model: 'axe',
    regions: ARMS, attack: 'chop',
    desc: 'Slow, heavy chops with strong knockback.',
    levels: [
      { dmg: 22, cooldown: 1.45, reach: 1.25, kb: 2.0, length: 0.9 },
      { dmg: 36, cooldown: 1.38, reach: 1.28, kb: 2.3, length: 0.95 },
      { dmg: 55, cooldown: 1.3, reach: 1.3, kb: 2.7, length: 1.0 },
    ],
  },
  spear: {
    name: 'Spear', kind: 'weapon', hands: 1, price: 5, w: 1, h: 2, model: 'spear',
    regions: ARMS, attack: 'thrust',
    desc: 'Long-reach forward thrusts.',
    levels: [
      { dmg: 18, cooldown: 1.15, reach: 1.85, kb: 0.9, length: 1.75 },
      { dmg: 30, cooldown: 1.1, reach: 1.9, kb: 1.0, length: 1.85 },
      { dmg: 46, cooldown: 1.05, reach: 1.95, kb: 1.15, length: 1.95 },
    ],
  },
  hammer: {
    name: 'Hammer', kind: 'weapon', hands: 1, price: 6, w: 2, h: 2, model: 'hammer',
    regions: ARMS, attack: 'slam',
    desc: 'Very slow, massive knockback. Sends foes flying.',
    levels: [
      { dmg: 26, cooldown: 2.3, reach: 1.3, kb: 3.1, length: 0.95, move: -0.1 },
      { dmg: 40, cooldown: 2.2, reach: 1.32, kb: 3.6, length: 1.0, move: -0.1 },
      { dmg: 60, cooldown: 2.1, reach: 1.35, kb: 4.2, length: 1.05, move: -0.1 },
    ],
  },
  bow: {
    name: 'Bow', kind: 'weapon', hands: 2, price: 6, w: 1, h: 2, model: 'bow',
    regions: ARMS, attack: 'shoot',
    desc: 'Two-handed: uses its arm plus the opposite arm at the same height. Fires physical arrows.',
    levels: [
      { dmg: 14, cooldown: 1.45, reach: 6.0, kb: 0.8, speed: 15 },
      { dmg: 23, cooldown: 1.35, reach: 6.0, kb: 0.9, speed: 16 },
      { dmg: 36, cooldown: 1.25, reach: 6.0, kb: 1.0, speed: 17 },
    ],
  },
  shield: {
    name: 'Shield', kind: 'shield', price: 4, w: 1, h: 2, model: 'shield',
    regions: ARMS,
    desc: 'Blocks hits that physically strike it. Uses an arm.',
    levels: [
      { block: 0.45, armor: 4, radius: 0.28 },
      { block: 0.6, armor: 7, radius: 0.31 },
      { block: 0.72, armor: 11, radius: 0.34 },
    ],
  },
  helmet: {
    name: 'Helmet', kind: 'armor', price: 3, w: 2, h: 1, model: 'helmet',
    regions: ['head'],
    desc: 'Reduces head damage.',
    levels: [{ armor: 12 }, { armor: 22 }, { armor: 36 }],
  },
  chest: {
    name: 'Chest Armor', kind: 'armor', price: 6, w: 1, h: 2, model: 'chest',
    regions: ['body', ...ARMS],
    desc: 'Protects the body and any arm it touches. +Max HP.',
    levels: [
      { armor: 10, hp: 20, move: -0.05 },
      { armor: 17, hp: 35, move: -0.05 },
      { armor: 27, hp: 55, move: -0.05 },
    ],
  },
  legs: {
    name: 'Leg Armor', kind: 'armor', price: 4, w: 2, h: 1, model: 'legs',
    regions: ['legL', 'legR'],
    desc: 'Protects legs and improves stability.',
    levels: [
      { armor: 10, stability: 0.35 },
      { armor: 17, stability: 0.6 },
      { armor: 27, stability: 0.9 },
    ],
  },
  lightning: {
    name: 'Lightning', kind: 'perk', price: 6, w: 1, h: 1, model: 'lightning',
    regions: ['head', 'body'],
    desc: 'Calls a lightning bolt on the foe every few seconds.',
    levels: [
      { dmg: 11, cooldown: 4.0 },
      { dmg: 19, cooldown: 3.5 },
      { dmg: 30, cooldown: 3.0 },
    ],
  },
  coinsteal: {
    name: 'Coin Steal', kind: 'perk', price: 5, w: 1, h: 1, model: 'coinsteal',
    regions: ['body', 'legL', 'legR'],
    desc: 'Pickpockets coins from the foe during combat.',
    levels: [
      { steal: 1, cooldown: 3.5 },
      { steal: 2, cooldown: 3.2 },
      { steal: 3, cooldown: 3.0 },
    ],
  },
};

export const MAX_LEVEL = 3;
export const UNARMED = { dmg: 4, cooldown: 1.25, reach: 1.12, kb: 0.7, length: 0.0 };

export const itemDef = id => ITEMS[id];
export const stats = item => ITEMS[item.id].levels[item.level - 1];
// Footprint after rotation (rot = 0 or 1, i.e. 0deg / 90deg)
export const footprint = item => {
  const d = ITEMS[item.id];
  return item.rot % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
};
// Total coin value invested in an item (Lv.N = 2^(N-1) copies)
export const itemValue = item => ITEMS[item.id].price * (1 << (item.level - 1));
export const sellPrice = (item, ratio = 0.5) => Math.floor(itemValue(item) * ratio);
