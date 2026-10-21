// Simple AI opponent. Uses the same Game API (and therefore the same rules) as the player.
(function (B) {
  const CFG = B.CFG, Game = B.Game, AI = B.AI = {};
  let timer = 0;

  AI.plan = function () { timer = 0.9; };

  const dist2 = (r, c) => (r - CFG.CENTER) ** 2 + (c - CFG.CENTER) ** 2;

  // Best free spot for a card: cells close to the launcher get hit most.
  function bestPlacement(side, key) {
    let best = null, bs = -1e9;
    for (let rot = 0; rot < 4; rot++) for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const fp = Game.footprint(key, rot, r, c);
      const pre = Game.dropPreview(side, { kind: 'card', key, rot }, r, c);
      if (!pre || pre.action !== 'place') continue;
      const score = -fp.reduce((a, p) => a + dist2(p[0], p[1]), 0) / fp.length + Math.random() * 1.5;
      if (score > bs) { bs = score; best = { r, c, rot }; }
    }
    return best;
  }
  function mergeScan(side) {
    const us = Game.unitsOf(side);
    for (const a of us) for (const b of us) {
      if (!Game.canMerge(a, b)) continue;
      const da = dist2(a.ar, a.ac), db = dist2(b.ar, b.ac);
      return da < db ? Game.mergeUnits(side, b, a) : Game.mergeUnits(side, a, b);
    }
    return false;
  }

  // Perform one AI action. Returns false when nothing is left to do.
  function act(side) {
    // play the first card the AI can afford; keep the rest for later rounds
    for (let i = 0; i < side.hand.length; i++) {
      const card = side.hand[i];
      if (!Game.canAfford(side, card.key)) continue;
      if (!Game.isUnitCard(card.key)) { if (Game.playUpgradeCard(side, i)) return true; continue; }
      const m = Game.unitsOf(side).find(u => u.type === card.key && u.level === 1);
      if (m && Game.playUnitCard(side, i, m.ar, m.ac)) return true;
      const p = bestPlacement(side, card.key);
      if (p) { card.rot = p.rot; if (Game.playUnitCard(side, i, p.r, p.c)) return true; }
    }
    return mergeScan(side);
  }

  AI.update = function (dt) {
    timer -= dt;
    if (timer <= 0) { timer = 0.8; act(B.G.sides[1]); }
  };
  AI.flush = function (side) { let n = 60; while (n-- > 0 && act(side)); };
})(window.BBB);
