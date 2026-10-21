// Simple AI opponent. Uses the same Game API (and therefore the same rules) as the player.
(function (B) {
  const CFG = B.CFG, Game = B.Game, AI = B.AI = {};
  let timer = 0;

  AI.plan = function () { timer = 0.9; };

  function bestEmptyCell(side) {
    let best = null, bs = -1e9;
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      if (side.grid[r][c]) continue;
      const score = (CFG.ROWS - r) * 2 - Math.abs(c - 2) * 0.6 + Math.random() * 1.8;   // prefer front rows, centre
      if (score > bs) { bs = score; best = { r, c }; }
    }
    return best;
  }
  function findMergeTarget(side, type) {
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const u = side.grid[r][c]; if (u && u.type === type && u.level === 1) return { r, c };
    }
    return null;
  }
  function mergeScan(side) {
    const cells = [];
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) if (side.grid[r][c]) cells.push({ r, c, u: side.grid[r][c] });
    for (let i = 0; i < cells.length; i++) for (let j = 0; j < cells.length; j++) {
      if (i === j || !Game.canMerge(cells[i].u, cells[j].u)) continue;
      // merge the rear one into the front one
      const a = cells[i], b = cells[j];
      const [src, dst] = a.r > b.r ? [a, b] : a.r < b.r ? [b, a] : [a, b];
      return Game.moveUnit(side, src.r, src.c, dst.r, dst.c) === 'merge';
    }
    return false;
  }

  // Perform one AI action. Returns false when nothing is left to do.
  function act(side) {
    if (side.hand.length) {
      const card = side.hand[0];
      if (!Game.isUnitCard(card.key)) { if (!Game.playUpgradeCard(side, 0)) side.hand.shift(); return true; }
      const m = findMergeTarget(side, card.key), cell = m || bestEmptyCell(side);
      if (cell && Game.playUnitCard(side, 0, cell.r, cell.c)) return true;
      side.hand.shift(); return true;      // backpack full: discard
    }
    return mergeScan(side);
  }

  AI.update = function (dt) {
    timer -= dt;
    if (timer <= 0) { timer = 0.8; act(B.G.sides[1]); }
  };
  AI.flush = function (side) { let n = 60; while (n-- > 0 && act(side)); };

  // choose where the AI aims: sometimes straight, sometimes at a random occupied cell
  AI.aim = function (side) {
    const l = side.launcher, m = B.L.muzzle(1);
    if (Math.random() < 0.4) { l.aim = Math.PI / 2; return; }
    const cells = [];
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) if (side.grid[r][c]) cells.push(B.L.cellRect(1, r, c));
    if (!cells.length) return;
    const q = cells[(Math.random() * cells.length) | 0];
    l.aim = Math.max(0.25, Math.min(Math.PI - 0.25, Math.atan2(q.cy - m.y, q.cx - m.x)));
  };
})(window.BBB);
