// Backpack Ball Battler — configuration & layout. Edit numbers here to rebalance the game.
window.BBB = window.BBB || {};
(function (B) {
  const CFG = {
    W: 390, H: 844,
    ENEMY_ZONE: { y0: 0, y1: 211 },
    ARENA: { y0: 211, y1: 633 },
    PLAYER_ZONE: { y0: 633, y1: 844 },

    COLS: 5, ROWS: 4, CELL: 42, GRID_X: 90,
    PLAYER_GRID_BOTTOM: 807, ENEMY_GRID_TOP: 37,
    UNIT_BODY: 34,                 // physics body size of a backpack unit (px)

    ROUNDS: 3,
    CASTLE_HP: 1000,
    CASTLE_DMG_MULT: 3,            // unit damage multiplier when it slams into a castle
    FRONT_Y: [552, 292],           // castle front lines: [player castle, enemy castle]
    HAND_SIZE: 3,
    PREP_TIME: 45,                 // seconds before battle auto-starts
    UNIT_CLEANUP_CAP: 25,          // max seconds to wait for units after last ball
    MAX_LEVEL: 3,

    // Launcher base values
    BASE_BALLS: 20,
    BASE_INTERVAL: 0.45,           // seconds between shots
    BASE_SPREAD: 0.5,              // radians of random launch-angle spread (+/-)
    BALL_R: 5,
    BALL_SPEED: 6.5,               // px per physics step (60/s)
    BALL_LIFE: 9,                  // seconds before a stray ball fizzles
    UPGRADE_CAPS: { extraBalls: 9, doubleShot: 2, rapidFire: 3, piercing: 2, precision: 3 },
    EXTRA_BALLS: 5,
    RAPID_MULT: 0.7,
    PRECISION_MULT: 0.5,
  };

  // Per-level multipliers (index = level-1). hits = extra hits needed to spawn.
  const LEVELS = [
    { hp: 1.0, dmg: 1.0, hits: 0 },
    { hp: 1.8, dmg: 1.6, hits: 1 },
    { hp: 3.2, dmg: 2.6, hits: 2 },
  ];

  // Unit table. speed px/s, range px (center-to-center), cd seconds.
  const UNITS = {
    warrior: { name: 'Warrior', hits: 3, hp: 100, dmg: 15, speed: 48, range: 28, cd: 0.9,  ranged: false, splash: 0,  radius: 12, color: '#d9dde6' },
    archer:  { name: 'Archer',  hits: 2, hp: 55,  dmg: 10, speed: 42, range: 95, cd: 0.8,  ranged: true,  splash: 0,  radius: 11, color: '#58c46a' },
    tank:    { name: 'Tank',    hits: 5, hp: 250, dmg: 12, speed: 26, range: 30, cd: 1.1,  ranged: false, splash: 0,  radius: 15, color: '#8a94a8' },
    dwarf:   { name: 'Dwarf',   hits: 2, hp: 70,  dmg: 12, speed: 78, range: 26, cd: 0.55, ranged: false, splash: 0,  radius: 10, color: '#e08a3c' },
    mage:    { name: 'Mage',    hits: 4, hp: 65,  dmg: 30, speed: 38, range: 105, cd: 1.6, ranged: true,  splash: 38, radius: 11, color: '#a974ff' },
  };

  const UPGRADES = {
    extraBalls: { name: 'Extra Balls',    desc: '+5 balls per round',   color: '#ffb703' },
    doubleShot: { name: 'Double Shot',    desc: '2 balls per shot',     color: '#4dd2ff' },
    rapidFire:  { name: 'Rapid Fire',     desc: 'Shoot faster',         color: '#ff6b4a' },
    piercing:   { name: 'Piercing Ball',  desc: 'Hits 2 units',         color: '#ffd84d' },
    precision:  { name: 'Precision Shot', desc: 'Tighter aim',          color: '#7dffb0' },
  };

  // Predefined deck (both sides use the same composition, shuffled per match).
  const DECK = [
    'warrior', 'warrior', 'warrior', 'archer', 'archer', 'archer',
    'tank', 'tank', 'dwarf', 'dwarf', 'dwarf', 'mage', 'mage',
    'extraBalls', 'extraBalls', 'doubleShot', 'rapidFire', 'rapidFire', 'piercing', 'precision',
  ];

  const TEAM = [
    { name: 'YOU', main: '#3b8bff', light: '#8cc0ff', dark: '#173a7a', ball: '#4de1ff' },
    { name: 'ENEMY', main: '#ee4a3f', light: '#ff9a7a', dark: '#7a1f1a', ball: '#ffb24d' },
  ];

  // ---- layout helpers (screen coordinates; side 0 = player/bottom, 1 = enemy/top) ----
  // Row 0 is always the FRONT row (nearest the launcher) for both sides.
  const L = {
    cellRect(side, r, c) {
      const x = CFG.GRID_X + c * CFG.CELL;
      const y = side === 0 ? CFG.PLAYER_GRID_BOTTOM - (r + 1) * CFG.CELL : CFG.ENEMY_GRID_TOP + r * CFG.CELL;
      return { x, y, w: CFG.CELL, h: CFG.CELL, cx: x + CFG.CELL / 2, cy: y + CFG.CELL / 2 };
    },
    cellAt(side, px, py) {
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
        const q = L.cellRect(side, r, c);
        if (px >= q.x && px < q.x + q.w && py >= q.y && py < q.y + q.h) return { r, c };
      }
      return null;
    },
    launcher(side) { return { x: CFG.W / 2, y: side === 0 ? 827 : 17 }; },
    muzzle(side) { return { x: CFG.W / 2, y: side === 0 ? 815 : 29 }; },
    zone(side) { return side === 0 ? CFG.PLAYER_ZONE : CFG.ENEMY_ZONE; },
    laneX(col) { return 55 + col * 70; },
    startBtn: { x: 85, y: 368, w: 220, h: 64 },
    speedBtn: { x: 296, y: 226, w: 80, h: 28 },
    roundPill: { x: 14, y: 226, w: 90, h: 28 },
    restartBtn: { x: 95, y: 470, w: 200, h: 58 },
    cardRect(i, n) {
      const gap = 6;
      const w = Math.min(78, Math.floor((CFG.W - 16 - gap * (n - 1)) / n));
      const h = Math.min(86, w * 1.15 + 6);
      const total = w * n + gap * (n - 1);
      return { x: (CFG.W - total) / 2 + i * (w + gap), y: 470, w, h };
    },
    inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; },
  };

  B.CFG = CFG; B.LEVELS = LEVELS; B.UNITS = UNITS; B.UPGRADES = UPGRADES; B.DECK = DECK; B.TEAM = TEAM; B.L = L;
})(window.BBB);
