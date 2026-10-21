// Pointer (mouse + touch) input. Translates events to logical 390x844 coordinates.
(function (B) {
  const CFG = B.CFG, L = B.L, Game = B.Game;
  const Input = B.Input = {};
  let canvas, aiming = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * CFG.W, y: (e.clientY - r.top) / r.height * CFG.H };
  }
  function setAim(p) {
    const l = B.G.sides[0].launcher, m = L.muzzle(0);
    let a = Math.atan2(p.y - m.y, p.x - m.x);
    l.aim = Math.max(-Math.PI + 0.2, Math.min(-0.2, a < 0 ? a : (a > Math.PI / 2 ? -Math.PI + 0.2 : -0.2)));
  }

  function down(e) {
    const G = B.G, p = pos(e); e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (G.phase === 'over') { if (L.inRect(p, L.restartBtn)) Game.newGame(); return; }
    if (L.inRect(p, L.speedBtn)) { G.speed = G.speed === 2 ? 1 : 2; return; }
    if (G.phase === 'prep') {
      if (L.inRect(p, L.startBtn)) { Game.startBattle(); return; }
      const hand = G.sides[0].hand;
      for (let i = hand.length - 1; i >= 0; i--) {
        if (L.inRect(p, L.cardRect(i, hand.length))) { G.drag = { kind: 'card', id: hand[i].id, key: hand[i].key, x: p.x, y: p.y }; return; }
      }
      const cell = L.cellAt(0, p.x, p.y);
      if (cell && G.sides[0].grid[cell.r][cell.c]) { G.drag = { kind: 'unit', r: cell.r, c: cell.c, x: p.x, y: p.y }; return; }
    }
    if ((G.phase === 'prep' || G.phase === 'combat') && p.y >= CFG.PLAYER_ZONE.y0) { aiming = true; setAim(p); }
  }

  function move(e) {
    const G = B.G, p = pos(e);
    if (G.drag) { G.drag.x = p.x; G.drag.y = p.y; e.preventDefault(); }
    else if (aiming) setAim(p);
  }

  function up(e) {
    const G = B.G, p = pos(e), d = G.drag; aiming = false;
    if (!d) return;
    G.drag = null;
    const side = G.sides[0], cell = L.cellAt(0, p.x, p.y);
    if (d.kind === 'card') {
      const idx = side.hand.findIndex(h => h.id === d.id); if (idx < 0) return;
      if (Game.isUnitCard(d.key)) {
        if (cell) { if (!Game.playUnitCard(side, idx, cell.r, cell.c)) Game.toast('Pick an empty slot or a matching unit', '#ffb0a0'); }
      } else if (p.y >= CFG.PLAYER_ZONE.y0) Game.playUpgradeCard(side, idx);
    } else if (d.kind === 'unit' && cell) {
      Game.moveUnit(side, d.r, d.c, cell.r, cell.c);
    }
  }

  Input.init = function (c) {
    canvas = c;
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { B.G.drag = null; aiming = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
  };
})(window.BBB);
