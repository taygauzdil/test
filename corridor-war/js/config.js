// Corridor War — all balancing values live here.
(function (CC) {
  'use strict';

  CC.CONFIG = {
    sim: {
      dt: 1 / 30,               // fixed simulation timestep (seconds)
      maxUnitsPerSide: 650,     // hard cap to protect performance
      retargetInterval: 0.25,   // how often a unit re-scans for the nearest enemy
      detectRange: 9,           // cells; units notice enemies / the enemy base within this
      bucketSize: 2,            // spatial hash cell size (in map cells)
      separationStrength: 0.55, // 0..1 positional correction per tick for overlapping units
      steerResponse: 9,         // how quickly velocity follows the desired direction
    },

    economy: {
      startMoney: 100,
      baseIncome: 10,           // $ per second at Income level 0
      payoutInterval: 1,        // seconds between payouts
    },

    // Upgrade Cost = baseCost * growth ^ level  (rounded)
    upgrades: {
      power:   { name: 'Power',   icon: '⚔️', baseCost: 50, growth: 1.25, perLevel: 0.10, desc: '+10% damage' },
      defense: { name: 'Defense', icon: '🛡️', baseCost: 50, growth: 1.25, perLevel: 0.10, desc: '+10% max HP' },
      tactic:  { name: 'Tactic',  icon: '👥', baseCost: 50, growth: 1.25, levelsPerExtraUnit: 3, desc: '+1 unit / spawn every 3 Lv' },
      speed:   { name: 'Speed',   icon: '⚡', baseCost: 50, growth: 1.25, perLevel: 0.05, desc: '+5% move & attack speed' },
      income:  { name: 'Income',  icon: '💰', baseCost: 50, growth: 1.25, perLevel: 0.20, desc: '+20% income' },
    },
    upgradeOrder: ['power', 'defense', 'tactic', 'speed', 'income'],

    bases: { hp: 5000, radius: 3.6 },

    // Permanent progression (between battles)
    progression: {
      unitUpgradeBaseCost: 100, // Unit Upgrade Cost = base * growth ^ level
      unitUpgradeGrowth: 1.3,
      hpPerLevel: 0.10,
      dmgPerLevel: 0.10,
      winReward: 100,           // gems for a win
      killsPerGem: 8,           // + 1 gem per N kills (win only)
      baseHpBonus: 60,          // + up to this many gems scaled by remaining base HP (win only)
    },

    // Units. Distances are in map cells, speeds in cells/second.
    // squad = units produced per spawn cycle at Tactic 0 (Tactic adds +1 per 3 levels).
    units: {
      warrior:  { name: 'Warrior',  icon: '🗡️', role: 'Melee',      hp: 170, dmg: 8, atkSpeed: 1.0,  move: 3.0, range: 0.35, spawn: 3,  squad: 6, radius: 0.5,  mass: 1,   shape: 'warrior',  desc: 'Balanced frontline fighter.' },
      tank:     { name: 'Tank',     icon: '🦏', role: 'Melee',      hp: 650, dmg: 9, atkSpeed: 0.7,  move: 1.9, range: 0.4,  spawn: 8,  squad: 2, radius: 0.75, mass: 3,   shape: 'tank',     desc: 'Huge HP, slow. Holds the line.' },
      archer:   { name: 'Archer',   icon: '🏹', role: 'Ranged',     hp: 90,  dmg: 6, atkSpeed: 0.9,  move: 2.7, range: 6.5,  spawn: 5,  squad: 4, radius: 0.45, mass: 0.8, shape: 'archer',   desc: 'Fragile, long-range arrows.', projectile: 'arrow' },
      assassin: { name: 'Assassin', icon: '🥷', role: 'Melee',      hp: 120,  dmg: 17, atkSpeed: 1.25, move: 4.8, range: 0.35, spawn: 6,  squad: 3, radius: 0.45, mass: 0.8, shape: 'assassin', desc: 'Very fast, hits very hard.' },
      bomber:   { name: 'Bomber',   icon: '💣', role: 'Ranged AoE', hp: 130,  dmg: 15, atkSpeed: 0.4,  move: 2.4, range: 5.0,  spawn: 10, squad: 3, radius: 0.55, mass: 1,   shape: 'bomber',   desc: 'Slow lobbed bombs. Area damage.', projectile: 'bomb', aoe: 1.8 },
      spearman: { name: 'Spearman', icon: '🔱', role: 'Melee',      hp: 200, dmg: 7, atkSpeed: 0.9,  move: 2.8, range: 1.3,  spawn: 4,  squad: 5, radius: 0.5,  mass: 1.2, shape: 'spearman', desc: 'Long reach; hits from the 2nd row.' },
      sniper:   { name: 'Sniper',   icon: '🎯', role: 'Ranged',     hp: 75,  dmg: 22, atkSpeed: 0.35, move: 2.5, range: 9.0,  spawn: 7,  squad: 3, radius: 0.45, mass: 0.8, shape: 'sniper',   desc: 'Extreme range, slow heavy shots.', projectile: 'bullet' },
      berserker:{ name: 'Berserker',icon: '🪓', role: 'Melee',      hp: 240, dmg: 6,  atkSpeed: 2.2,  move: 3.4, range: 0.35, spawn: 6,  squad: 3, radius: 0.55, mass: 1.3, shape: 'berserker',desc: 'Frenzied, very fast axe swings.' },
    },
    unitOrder: ['warrior', 'tank', 'archer', 'assassin', 'bomber', 'spearman', 'sniper', 'berserker'],

    defaultDeck: ['warrior', 'tank', 'archer', 'assassin', 'bomber'],
    aiDeck: ['warrior', 'tank', 'archer', 'assassin', 'bomber'],
    deckSize: 5,

    ai: {
      thinkInterval: 1.0,       // seconds between AI decisions
      saveWindow: 9,            // AI waits for its preferred upgrade if affordable within N seconds
    },
  };
})(globalThis.CC = globalThis.CC || {});
