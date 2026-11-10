// Corridor War — battle economy & temporary upgrades (pure logic, no DOM).
(function (CC) {
  'use strict';

  function createSide() {
    const E = CC.CONFIG.economy;
    const levels = {};
    for (const id of CC.CONFIG.upgradeOrder) levels[id] = 0;
    return { money: E.startMoney, payoutTimer: 0, totalEarned: 0, totalSpent: 0, levels };
  }

  function cost(eco, id) {
    const U = CC.CONFIG.upgrades[id];
    return Math.round(U.baseCost * Math.pow(U.growth, eco.levels[id]));
  }

  function incomePerSecond(eco) {
    return CC.CONFIG.economy.baseIncome * (1 + CC.CONFIG.upgrades.income.perLevel * eco.levels.income);
  }

  // Combat multipliers derived from upgrade levels
  function mods(eco) {
    const U = CC.CONFIG.upgrades, L = eco.levels;
    return {
      dmg: 1 + U.power.perLevel * L.power,
      hp: 1 + U.defense.perLevel * L.defense,
      speed: 1 + U.speed.perLevel * L.speed,
      atk: 1 + U.speed.perLevel * L.speed,
      extraUnits: Math.floor(L.tactic / U.tactic.levelsPerExtraUnit),
    };
  }

  function tick(eco, dt) {
    const E = CC.CONFIG.economy;
    eco.payoutTimer += dt;
    let paid = 0;
    while (eco.payoutTimer >= E.payoutInterval) {
      eco.payoutTimer -= E.payoutInterval;
      const inc = incomePerSecond(eco) * E.payoutInterval;
      eco.money += inc; eco.totalEarned += inc; paid += inc;
    }
    return paid;
  }

  function canBuy(eco, id) { return eco.money >= cost(eco, id); }

  function buy(eco, id) {
    const c = cost(eco, id);
    if (eco.money < c) return false;
    eco.money -= c; eco.totalSpent += c; eco.levels[id]++;
    return true;
  }

  CC.Economy = { createSide, cost, incomePerSecond, mods, tick, canBuy, buy };
})(globalThis.CC = globalThis.CC || {});
