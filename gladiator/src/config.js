// Central tuning knobs. Everything gameplay-relevant that a designer might tweak lives here.
export const CONFIG = {
  startCoins: 10,
  winsToTakeMatch: 3,
  maxRounds: 5,
  shopSize: 3,
  benchSize: 3,
  sellRatio: 0.5,

  rewards: {
    roundIncome: 2,       // flat coins every round so a loss is not a dead end
    damagePerCoin: 20,    // 1 coin per 20 damage dealt (rounded down)
    maxDamageCoins: 8,
    winBonus: 5,
  },

  combat: {
    baseHp: 100,
    roundTimeLimit: 60,   // seconds; on timeout the higher HP% wins
    regionDamageMult: { head: 1.5, body: 1.0, arm: 0.75, legL: 0.8, legR: 0.8 },
    armorK: 20,           // reduction = armor / (armor + armorK)
    baseStability: 1.0,
    baseMoveSpeed: 2.2,
    knockbackScale: 0.95, // m/s of root slide per point of knockback
    knockdownThreshold: 3.0,
    cliffBias: 0.18,      // fraction of knockback pushed toward the rear cliff
    hitStop: 0.06,
  },

  arena: {
    halfWidth: 7.2,       // walls at +-x
    front: 3.2,           // front lip (toward camera)
    edge: -2.7,           // rear cliff edge (z)
    fallY: -2.2,          // pelvis below this = fell off
  },

  physics: {
    dt: 1 / 120,
    iterations: 4,
    gravity: -16,
    kp: 520,
    kd: 34,
  },
};
