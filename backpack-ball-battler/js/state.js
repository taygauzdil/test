// Game state & rules (no rendering, no DOM). Side 0 = player, side 1 = AI opponent.
(function (B) {
  const CFG = B.CFG, U = B.UNITS, UP = B.UPGRADES, L = B.L, FX = B.FX;
  const G = B.G = {};
  const Game = B.Game = {};
  let uid = 1;

  const isUnitCard = k => !!U[k];
  Game.isUnitCard = isUnitCard;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function makeDeck() {
    let d;
    do { d = shuffle(B.DECK.slice()); } while (d.slice(0, CFG.HAND_SIZE).filter(isUnitCard).length < 2);
    return d;
  }

  Game.stats = function (type, level) {
    const d = U[type], lv = B.LEVELS[level - 1];
    return { hp: Math.round(d.hp * lv.hp), dmg: Math.round(d.dmg * lv.dmg), need: d.hits + lv.hits };
  };

  function makeSide(idx) {
    return {
      idx, grid: Array.from({ length: CFG.ROWS }, () => Array(CFG.COLS).fill(null)),
      deck: makeDeck(), hand: [],
      upg: { extraBalls: 0, doubleShot: 0, rapidFire: 0, piercing: 0, precision: 0 },
      launcher: { left: 0, timer: 0, aim: idx === 0 ? -Math.PI / 2 : Math.PI / 2, recoil: 0, aiTimer: 0 },
    };
  }

  Game.launcherParams = function (side) {
    const u = side.upg;
    return {
      balls: CFG.BASE_BALLS + CFG.EXTRA_BALLS * u.extraBalls,
      shots: 1 + u.doubleShot,
      interval: CFG.BASE_INTERVAL * Math.pow(CFG.RAPID_MULT, u.rapidFire),
      pierce: 1 + u.piercing,
      spread: CFG.BASE_SPREAD * Math.pow(CFG.PRECISION_MULT, u.precision),
    };
  };

  Game.newGame = function () {
    G.round = 1; G.phase = 'prep'; G.time = 0; G.speed = G.speed || 1;
    G.sides = [makeSide(0), makeSide(1)];
    G.castles = [0, 1].map(() => ({ hp: CFG.CASTLE_HP, max: CFG.CASTLE_HP, shake: 0, flash: 0 }));
    G.units = []; G.projs = [];
    G.winner = null; G.banner = null; G.toast = null; G.endTimer = 0; G.afterT = 0; G.combatT = 0;
    G.prepTimer = CFG.PREP_TIME; G.drag = null; G.aiQueue = [];
    FX.reset(); B.Physics.reset();
    Game.startRound();
  };

  function draw(side) {
    for (let i = 0; i < CFG.HAND_SIZE; i++) {
      if (!side.deck.length) side.deck = makeDeck();
      side.hand.push({ key: side.deck.shift(), id: uid++, born: G.time });
    }
  }

  Game.startRound = function () {
    G.phase = 'prep'; G.prepTimer = CFG.PREP_TIME;
    for (const s of G.sides) draw(s);
    G.banner = { text: 'ROUND ' + G.round, sub: 'Prepare your backpack', t: 1.8, max: 1.8 };
    B.AI.plan(G.sides[1]);
  };

  Game.toast = function (text, color) { G.toast = { text, color: color || '#fff', t: 1.4 }; };

  // ---- backpack operations ----
  Game.canMerge = (a, b) => a && b && a.type === b.type && a.level === b.level && a.level < CFG.MAX_LEVEL;

  function newUnit(type, level) { return { id: uid++, type, level: level || 1, hits: 0, pop: 1, flash: 0 }; }

  function mergeFx(side, r, c, unit) {
    const q = L.cellRect(side.idx, r, c);
    FX.ring(q.cx, q.cy, '#ffd84d', 40, 0.6);
    FX.burst(q.cx, q.cy, '#ffe680', 14, 130, 0.6, 3);
    FX.float(q.cx, q.cy - 14, 'MERGE! Lv' + unit.level, '#ffe680', 13);
    unit.pop = 1.4;
  }

  // What would dropping something on cell (r,c) do? kind: 'card' (unit card key) or 'unit' (from r0,c0)
  Game.dropAction = function (side, drag, r, c) {
    const target = side.grid[r][c];
    if (drag.kind === 'card') {
      if (!target) return 'place';
      return Game.canMerge({ type: drag.key, level: 1 }, target) ? 'merge' : null;
    }
    const src = side.grid[drag.r][drag.c];
    if (drag.r === r && drag.c === c) return null;
    if (!target) return 'move';
    return Game.canMerge(src, target) ? 'merge' : 'swap';
  };

  Game.playUnitCard = function (side, handIdx, r, c) {
    const card = side.hand[handIdx]; if (!card || !isUnitCard(card.key)) return false;
    const act = Game.dropAction(side, { kind: 'card', key: card.key }, r, c);
    if (!act) return false;
    if (act === 'place') {
      side.grid[r][c] = newUnit(card.key, 1);
      const q = L.cellRect(side.idx, r, c);
      FX.ring(q.cx, q.cy, B.TEAM[side.idx].light, 28, 0.4);
    } else {
      const t = side.grid[r][c]; t.level++; t.hits = 0; mergeFx(side, r, c, t);
    }
    side.hand.splice(handIdx, 1);
    return true;
  };

  Game.moveUnit = function (side, r0, c0, r1, c1) {
    const act = Game.dropAction(side, { kind: 'unit', r: r0, c: c0 }, r1, c1);
    if (!act) return null;
    const src = side.grid[r0][c0], dst = side.grid[r1][c1];
    if (act === 'move') { side.grid[r1][c1] = src; side.grid[r0][c0] = null; src.pop = 0.6; }
    else if (act === 'swap') { side.grid[r1][c1] = src; side.grid[r0][c0] = dst; src.pop = 0.6; dst.pop = 0.6; }
    else { dst.level++; dst.hits = 0; side.grid[r0][c0] = null; mergeFx(side, r1, c1, dst); }
    return act;
  };

  Game.playUpgradeCard = function (side, handIdx) {
    const card = side.hand[handIdx]; if (!card || isUnitCard(card.key)) return false;
    const k = card.key;
    if (side.upg[k] >= CFG.UPGRADE_CAPS[k]) { if (side.idx === 0) Game.toast(UP[k].name + ' is maxed!', '#ffb703'); return false; }
    side.upg[k]++;
    side.hand.splice(handIdx, 1);
    const lp = L.launcher(side.idx);
    FX.ring(lp.x, lp.y, UP[k].color, 60, 0.7);
    FX.burst(lp.x, lp.y, UP[k].color, 18, 150, 0.7, 3);
    FX.float(lp.x, lp.y + (side.idx === 0 ? -34 : 34), UP[k].name + '!', UP[k].color, 14);
    side.launcher.recoil = 1;
    return true;
  };

  // ---- combat ----
  Game.startBattle = function () {
    if (G.phase !== 'prep') return;
    B.AI.flush(G.sides[1]);
    G.drag = null;
    for (const s of G.sides) {
      const p = Game.launcherParams(s);
      s.launcher.left = p.balls; s.launcher.timer = 0.4; s.launcher.aiTimer = 0;
      B.Physics.buildUnits(s.idx);
    }
    G.phase = 'combat'; G.combatT = 0; G.afterT = 0;
    G.banner = { text: 'FIGHT!', sub: '', t: 1.0, max: 1.0 };
  };

  // called by physics when a ball touches a backpack unit
  Game.onBallHitUnit = function (sideIdx, ball, ref) {
    const unit = ref.unit, side = G.sides[sideIdx];
    const pos = ball.body.position;
    unit.flash = 1;
    FX.burst(pos.x, pos.y, B.TEAM[sideIdx].ball, 7, 120, 0.35, 2.2);
    if (ball.hitSet.has(unit)) return;      // piercing ball bouncing off the same unit: no extra count
    ball.hitSet.add(unit);
    if (--ball.hitsLeft <= 0) ball.dead = true;
    unit.hits++;
    const need = Game.stats(unit.type, unit.level).need;
    if (unit.hits >= need) {
      unit.hits = 0; unit.pop = 1.3;
      const q = L.cellRect(sideIdx, ref.r, ref.c);
      FX.ring(q.cx, q.cy, B.TEAM[sideIdx].light, 36, 0.5);
      B.Battle.spawn(sideIdx, unit.type, unit.level, ref.c);
    }
  };

  function fireLauncher(side, dt) {
    const l = side.launcher, p = Game.launcherParams(side);
    l.recoil = Math.max(0, l.recoil - dt * 6);
    if (l.left <= 0) return;
    l.timer -= dt;
    if (l.timer > 0) return;
    l.timer = p.interval;
    if (side.idx === 1) B.AI.aim(side);
    const m = L.muzzle(side.idx);
    const n = Math.min(p.shots, l.left);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2);
      const ang = l.aim + (Math.random() * 2 - 1) * p.spread + off * 0.07;
      const sx = m.x + off * 9 * Math.cos(l.aim + Math.PI / 2);
      const sy = m.y + off * 9 * Math.sin(l.aim + Math.PI / 2);
      B.Physics.fire(side.idx, sx, sy, ang, p.pierce);
    }
    l.left -= n; l.recoil = 1;
    FX.burst(m.x + Math.cos(l.aim) * 8, m.y + Math.sin(l.aim) * 8, B.TEAM[side.idx].ball, 3, 60, 0.2, 2);
  }

  Game.endRound = function () {
    for (const u of G.units) FX.ghost(u);
    G.units.length = 0; G.projs.length = 0;
    G.phase = 'roundEnd'; G.endTimer = 2.4;
    G.banner = { text: 'ROUND ' + G.round + ' COMPLETE', sub: 'Your castle ' + G.castles[0].hp + '  •  Enemy ' + G.castles[1].hp, t: 2.4, max: 2.4 };
  };

  Game.finish = function () {
    const a = G.castles[0].hp, b = G.castles[1].hp;
    G.winner = a > b ? 'player' : b > a ? 'enemy' : 'draw';
    G.phase = 'over'; G.units.length = 0; G.projs.length = 0; G.banner = null;
  };

  Game.castleDestroyed = function (idx) {
    G.winner = idx === 1 ? 'player' : 'enemy';
    G.phase = 'over'; G.banner = null;
    const q = idx === 1 ? { x: 195, y: 250 } : { x: 195, y: 590 };
    FX.burst(q.x, q.y, '#ffb347', 50, 260, 1.0, 4); FX.ring(q.x, q.y, '#ff6b3a', 140, 0.9);
    G.units.length = 0; G.projs.length = 0;
  };

  Game.step = function (dt) {
    G.time += dt;
    FX.update(dt);
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
    if (G.toast && (G.toast.t -= dt) <= 0) G.toast = null;
    for (const c of G.castles) { c.shake = Math.max(0, c.shake - dt * 4); c.flash = Math.max(0, c.flash - dt * 4); }
    for (const s of G.sides) for (const row of s.grid) for (const u of row) if (u) {
      u.pop = Math.max(0, u.pop - dt * 3); u.flash = Math.max(0, u.flash - dt * 5);
    }

    if (G.phase === 'prep') {
      G.prepTimer -= dt;
      B.AI.update(dt);
      if (G.prepTimer <= 0) Game.startBattle();
    } else if (G.phase === 'combat') {
      G.combatT += dt;
      for (const s of G.sides) fireLauncher(s, dt);
      B.Physics.step(0); B.Physics.step(1);
      B.Battle.update(dt);
      if (G.phase !== 'combat') return;
      const fired = G.sides.every(s => s.launcher.left <= 0);
      if (fired && B.Physics.count(0) + B.Physics.count(1) === 0) {
        G.afterT += dt;
        if (!G.units.length && !G.projs.length || G.afterT > CFG.UNIT_CLEANUP_CAP) Game.endRound();
      }
    } else if (G.phase === 'roundEnd') {
      if ((G.endTimer -= dt) <= 0) {
        if (G.round >= CFG.ROUNDS) Game.finish();
        else { G.round++; Game.startRound(); }
      }
    }
  };
})(window.BBB);
