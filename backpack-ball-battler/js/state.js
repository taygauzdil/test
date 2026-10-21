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
      idx, coins: CFG.START_COINS, coinPop: 0, grid: Array.from({ length: CFG.ROWS }, () => Array(CFG.COLS).fill(null)),
      deck: makeDeck(), hand: [],
      upg: { extraBalls: 0, doubleShot: 0, rapidFire: 0, piercing: 0, precision: 0 },
      launcher: { left: 0, timer: 0, angle: Math.random() * Math.PI * 2, dir: idx === 0 ? 1 : -1, recoil: 0 },
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
    G.prepTimer = CFG.PREP_TIME; G.drag = null; G.autoT = 0; G.pruneT = 0;
    FX.reset(); B.Physics.reset();
    Game.startRound();
  };

  function draw(side) {
    for (let i = 0; i < CFG.HAND_SIZE; i++) {
      if (!side.deck.length) side.deck = makeDeck();
      side.hand.push({ key: side.deck.shift(), id: uid++, born: G.time, rot: 0 });
    }
  }

  Game.startRound = function () {
    G.phase = 'prep'; G.prepTimer = CFG.PREP_TIME; G.autoT = 0; G.pruneT = 0;
    for (const s of G.sides) {
      draw(s);
      s.coins += CFG.ROUND_COINS; s.coinPop = 1;
      const z = L.zone(s.idx), y = s.idx === 0 ? z.y0 + 42 : z.y1 - 42;
      FX.float(34, y - 18, '+' + CFG.ROUND_COINS, '#ffe36b', 16);
    }
    G.banner = { text: 'ROUND ' + G.round, sub: '+' + CFG.ROUND_COINS + ' coins  •  place your cards', t: 1.8, max: 1.8 };
    B.AI.plan(G.sides[1]);
  };

  Game.toast = function (text, color) { G.toast = { text, color: color || '#fff', t: 1.4 }; };

  // ---- backpack operations (units can cover several cells; grid[r][c] holds the unit object) ----
  Game.canMerge = (a, b) => !!(a && b && a !== b && a.type === b.type && a.level === b.level && a.level < CFG.MAX_LEVEL);
  const isBlocked = (r, c) => Math.abs(r - CFG.CENTER_R) <= 1 && Math.abs(c - CFG.CENTER_C) <= 1;
  Game.isBlocked = isBlocked;

  // Shape cells relative to the anchor (first cell), rotated clockwise `rot` quarter turns.
  function shapeCells(type, rot) {
    let cells = U[type].shape.map(p => p.slice());
    for (let i = 0; i < (rot || 0) % 4; i++) cells = cells.map(([r, c]) => [c, -r]);
    const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
    cells = cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [ar, ac] = cells[0];
    return cells.map(([r, c]) => [r - ar, c - ac]);
  }
  const footprint = (type, rot, r, c) => shapeCells(type, rot).map(([dr, dc]) => [r + dr, c + dc]);
  Game.cardCost = key => (U[key] || UP[key]).cost;
  Game.canAfford = (side, key) => side.coins >= Game.cardCost(key);
  function pay(side, key, x, y) {
    side.coins -= Game.cardCost(key); side.coinPop = 1;
    FX.float(x, y - 18, '-' + Game.cardCost(key), '#ffb36b', 13);
  }
  function noCoins(side, key) { if (side.idx === 0) Game.toast('Need ' + Game.cardCost(key) + ' coins', '#ffd84d'); return false; }
  Game.shapeCells = shapeCells; Game.footprint = footprint;
  Game.isMulti = type => U[type].shape.length > 1;

  function fits(side, cells, ignore) {
    for (const [r, c] of cells) {
      if (r < 0 || c < 0 || r >= CFG.ROWS || c >= CFG.COLS || isBlocked(r, c)) return false;
      const o = side.grid[r][c];
      if (o && !(ignore && ignore.includes(o))) return false;
    }
    return true;
  }
  const disjoint = (a, b) => !a.some(([r, c]) => b.some(([r2, c2]) => r === r2 && c === c2));

  function newUnit(type, level, rot) { return { id: uid++, type, level: level || 1, hits: 0, pop: 1, flash: 0, rot: rot || 0, cells: [], ar: 0, ac: 0 }; }
  function putUnit(side, u, r, c) {
    u.ar = r; u.ac = c; u.cells = footprint(u.type, u.rot, r, c);
    for (const [cr, cc] of u.cells) side.grid[cr][cc] = u;
  }
  function takeUnit(side, u) { for (const [r, c] of u.cells) if (side.grid[r][c] === u) side.grid[r][c] = null; }

  Game.unitsOf = side => { const out = []; for (const row of side.grid) for (const u of row) if (u && !out.includes(u)) out.push(u); return out; };
  Game.unitCenter = (sideIdx, u) => {
    let x = 0, y = 0;
    for (const [r, c] of u.cells) { const q = L.cellRect(sideIdx, r, c); x += q.cx; y += q.cy; }
    return { x: x / u.cells.length, y: y / u.cells.length };
  };

  function mergeFx(side, u) {
    const q = Game.unitCenter(side.idx, u);
    FX.ring(q.x, q.y, '#ffd84d', 40, 0.6);
    FX.burst(q.x, q.y, '#ffe680', 14, 130, 0.6, 3);
    FX.float(q.x, q.y - 16, 'MERGE! Lv' + u.level, '#ffe680', 13);
    u.pop = 1.4;
  }
  function doMerge(side, src, dst) { if (src) takeUnit(side, src); dst.level++; dst.hits = 0; mergeFx(side, dst); }
  Game.mergeUnits = (side, src, dst) => { if (!Game.canMerge(src, dst)) return false; doMerge(side, src, dst); return true; };

  function canSwap(side, u, t) {
    const fu = footprint(u.type, u.rot, t.ar, t.ac), ft = footprint(t.type, t.rot, u.ar, u.ac);
    return fits(side, fu, [u, t]) && fits(side, ft, [u, t]) && disjoint(fu, ft);
  }

  // What would dropping at cell (r,c) do? -> { action, cells } (action null = invalid/no-op footprint)
  // drag: {kind:'card', key, rot} | {kind:'unit', unit, gr, gc} (gr/gc = grabbed cell offset from the anchor)
  Game.dropPreview = function (side, drag, r, c) {
    const t = side.grid[r][c];
    if (drag.kind === 'card') {
      const fp = footprint(drag.key, drag.rot || 0, r, c);
      if (fits(side, fp)) return { action: 'place', cells: fp };
      if (t && Game.canMerge({ type: drag.key, level: 1 }, t)) return { action: 'merge', cells: t.cells };
      return { action: null, cells: fp };
    }
    const u = drag.unit;
    if (t && t !== u) {
      if (Game.canMerge(u, t)) return { action: 'merge', cells: t.cells };
      return { action: canSwap(side, u, t) ? 'swap' : null, cells: t.cells };
    }
    const ar = r - drag.gr, ac = c - drag.gc, fp = footprint(u.type, u.rot, ar, ac);
    if (!fits(side, fp, [u])) return { action: null, cells: fp };
    if (ar === u.ar && ac === u.ac) return null;
    return { action: 'move', cells: fp, ar, ac };
  };

  Game.playUnitCard = function (side, handIdx, r, c) {
    const card = side.hand[handIdx]; if (!card || !isUnitCard(card.key)) return false;
    const pre = Game.dropPreview(side, { kind: 'card', key: card.key, rot: card.rot }, r, c);
    if (!pre || !pre.action) return false;
    if (!Game.canAfford(side, card.key)) return noCoins(side, card.key);
    if (pre.action === 'place') {
      const u = newUnit(card.key, 1, card.rot); putUnit(side, u, r, c);
      const q = Game.unitCenter(side.idx, u);
      FX.ring(q.x, q.y, B.TEAM[side.idx].light, 28, 0.4); pay(side, card.key, q.x, q.y);
    } else { const t = side.grid[r][c], q = Game.unitCenter(side.idx, t); doMerge(side, null, t); pay(side, card.key, q.x, q.y); }
    side.hand.splice(handIdx, 1);
    return true;
  };

  Game.dropUnit = function (side, u, r, c, grab) {
    const pre = Game.dropPreview(side, { kind: 'unit', unit: u, gr: grab.gr, gc: grab.gc }, r, c);
    if (!pre || !pre.action) return null;
    if (pre.action === 'move') { takeUnit(side, u); putUnit(side, u, pre.ar, pre.ac); u.pop = 0.6; }
    else if (pre.action === 'merge') doMerge(side, u, side.grid[r][c]);
    else {
      const t = side.grid[r][c], ua = [u.ar, u.ac], ta = [t.ar, t.ac];
      takeUnit(side, u); takeUnit(side, t); putUnit(side, u, ta[0], ta[1]); putUnit(side, t, ua[0], ua[1]); u.pop = t.pop = 0.6;
    }
    return pre.action;
  };

  Game.rotateUnit = function (side, u) {
    if (!Game.isMulti(u.type)) return false;
    const rot = (u.rot + 1) % 4, old = u.cells.slice();
    for (const [r, c] of old) {
      const fp = footprint(u.type, rot, r, c);
      if (fits(side, fp, [u])) { takeUnit(side, u); u.rot = rot; putUnit(side, u, r, c); u.pop = 0.5; return true; }
    }
    if (side.idx === 0) Game.toast('No room to rotate', '#ffb0a0');
    return false;
  };

  Game.canPlaceCard = function (side, key) {
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const t = side.grid[r][c];
      if (t && t.type === key && t.level === 1) return true;
      for (let rot = 0; rot < 4; rot++) if (fits(side, footprint(key, rot, r, c))) return true;
    }
    return false;
  };

  // Drop cards that can never be played (no room / upgrade already maxed) so the round can auto-start.
  Game.pruneHand = function (side) {
    for (let i = side.hand.length - 1; i >= 0; i--) {
      const k = side.hand[i].key, bad = isUnitCard(k) ? !Game.canPlaceCard(side, k) : side.upg[k] >= CFG.UPGRADE_CAPS[k];
      if (bad) { side.hand.splice(i, 1); if (side.idx === 0) Game.toast((isUnitCard(k) ? 'No room for ' + U[k].name : UP[k].name + ' maxed') + ' — discarded', '#ffb0a0'); }
    }
  };

  Game.playUpgradeCard = function (side, handIdx) {
    const card = side.hand[handIdx]; if (!card || isUnitCard(card.key)) return false;
    const k = card.key;
    if (side.upg[k] >= CFG.UPGRADE_CAPS[k]) { if (side.idx === 0) Game.toast(UP[k].name + ' is maxed!', '#ffb703'); return false; }
    if (!Game.canAfford(side, k)) return noCoins(side, k);
    side.upg[k]++;
    side.hand.splice(handIdx, 1);
    const lp = L.launcher(side.idx);
    pay(side, k, lp.x, lp.y - 20);
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
      s.launcher.left = p.balls; s.launcher.timer = 0.4;
      B.Physics.buildUnits(s.idx);
    }
    G.phase = 'combat'; G.combatT = 0; G.afterT = 0;
    G.banner = { text: 'FIGHT!', sub: '', t: 1.0, max: 1.0 };
  };

  // called by physics when a ball touches a backpack unit
  Game.onBallHitUnit = function (sideIdx, ball, ref) {
    const unit = ref.unit, pos = ball.body.position;
    unit.flash = 1;
    FX.burst(pos.x, pos.y, B.TEAM[sideIdx].ball, 7, 120, 0.35, 2.2);
    if (ball.hitSet.has(unit)) return;      // piercing ball bouncing off the same unit: no extra count
    ball.hitSet.add(unit);
    if (--ball.hitsLeft <= 0) ball.fade = 0.4;      // ball bounces off visibly, then fades
    unit.hits++;
    if (unit.hits >= Game.stats(unit.type, unit.level).need) {
      unit.hits = 0; unit.pop = 1.3;
      const q = Game.unitCenter(sideIdx, unit);
      FX.ring(q.x, q.y, B.TEAM[sideIdx].light, 36, 0.5);
      const col = unit.cells.reduce((a, p) => a + p[1], 0) / unit.cells.length;
      B.Battle.spawn(sideIdx, unit.type, unit.level, col);
    }
  };

  function spinLauncher(side, dt) {
    const l = side.launcher;
    l.angle += l.dir * CFG.ROT_SPEED * dt;
    l.recoil = Math.max(0, l.recoil - dt * 6);
  }
  function fireLauncher(side, dt) {
    const l = side.launcher, p = Game.launcherParams(side);
    if (l.left <= 0) return;
    l.timer -= dt;
    if (l.timer > 0) return;
    l.timer = p.interval;
    const n = Math.min(p.shots, l.left);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2);
      const ang = l.angle + (Math.random() * 2 - 1) * p.spread + off * 0.16;
      const m = L.muzzle(side.idx, ang);
      B.Physics.fire(side.idx, m.x, m.y, ang, p.pierce);
    }
    l.left -= n; l.recoil = 1;
    const m = L.muzzle(side.idx, l.angle);
    FX.burst(m.x, m.y, B.TEAM[side.idx].ball, 3, 60, 0.2, 2);
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
    for (const s of G.sides) {
      spinLauncher(s, dt);
      s.coinPop = Math.max(0, s.coinPop - dt * 3);
      for (const u of Game.unitsOf(s)) { u.pop = Math.max(0, u.pop - dt * 3); u.flash = Math.max(0, u.flash - dt * 5); }
    }

    if (G.phase === 'prep') {
      G.prepTimer -= dt;
      B.AI.update(dt);
      if ((G.pruneT -= dt) <= 0) { G.pruneT = 0.25; Game.pruneHand(G.sides[0]); }
      // the battle starts when the prep timer runs out, or earlier when the player presses BATTLE
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
