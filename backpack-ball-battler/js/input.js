// Pointer (mouse + touch) input. Translates events to logical 390x844 coordinates.
(function (B) {
  const CFG = B.CFG, L = B.L, Game = B.Game;
  const Input = B.Input = {};
  let canvas;
  const CARD_LIFT = 30;     // cards float above the finger so the footprint stays visible

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * CFG.W, y: (e.clientY - r.top) / r.height * CFG.H };
  }

  function down(e) {
    const G = B.G, p = pos(e); e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (G.phase === 'over') { if (L.inRect(p, L.restartBtn)) Game.newGame(); return; }
    if (L.inRect(p, L.speedBtn)) { G.speed = G.speed === 2 ? 1 : 2; return; }
    if (G.phase !== 'prep') return;
    if (L.inRect(p, L.startBtn)) { Game.startBattle(); return; }
    const hand = G.sides[0].hand;
    for (let i = hand.length - 1; i >= 0; i--) {
      if (L.inRect(p, L.cardRect(i, hand.length))) {
        G.drag = { kind: 'card', id: hand[i].id, key: hand[i].key, rot: hand[i].rot || 0, sx: p.x, sy: p.y, px: p.x, py: p.y, x: p.x, y: p.y - CARD_LIFT, moved: false };
        return;
      }
    }
    const cell = L.cellAt(0, p.x, p.y), u = cell && G.sides[0].grid[cell.r][cell.c];
    if (u) G.drag = { kind: 'unit', unit: u, gr: cell.r - u.ar, gc: cell.c - u.ac, sx: p.x, sy: p.y, px: p.x, py: p.y, x: p.x, y: p.y, moved: false };
  }

  function move(e) {
    const G = B.G, d = G.drag; if (!d) return;
    const p = pos(e); e.preventDefault();
    d.px = p.x; d.py = p.y; d.x = p.x; d.y = d.kind === 'card' ? p.y - CARD_LIFT : p.y;
    if (Math.hypot(p.x - d.sx, p.y - d.sy) > 8) d.moved = true;
  }

  function up(e) {
    const G = B.G, d = G.drag; if (!d) return;
    G.drag = null;
    const side = G.sides[0], cell = L.cellAt(0, d.x, d.y);
    if (d.kind === 'card') {
      const idx = side.hand.findIndex(h => h.id === d.id); if (idx < 0) return;
      if (!d.moved) { if (Game.isMulti(d.key)) side.hand[idx].rot = (side.hand[idx].rot + 1) % 4; return; }   // tap = rotate
      if (Game.isUnitCard(d.key)) {
        if (cell && !Game.playUnitCard(side, idx, cell.r, cell.c)) Game.toast('Does not fit there', '#ffb0a0');
      } else if (d.py >= CFG.PLAYER_ZONE.y0) Game.playUpgradeCard(side, idx);
    } else if (d.kind === 'unit') {
      if (!d.moved) { Game.rotateUnit(side, d.unit); return; }
      if (cell) Game.dropUnit(side, d.unit, cell.r, cell.c, d);
    }
  }

  Input.init = function (c) {
    canvas = c;
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { B.G.drag = null; });
    c.addEventListener('contextmenu', e => e.preventDefault());
  };
})(window.BBB);
