// Canvas rendering. Reads game state; never mutates rules state.
(function (B) {
  const CFG = B.CFG, U = B.UNITS, UP = B.UPGRADES, L = B.L, TEAM = B.TEAM, FX = B.FX;
  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  const R = B.Render = {};

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(ctx, s, x, y, size, color, align, weight, stroke) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function btn(ctx, rect, label, c1, c2, size, pulse) {
    const s = pulse ? 1 + Math.sin(B.G.time * 5) * 0.025 : 1;
    ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -rect.w / 2, -rect.h / 2 + 4, rect.w, rect.h, 16); ctx.fill();
    const g = ctx.createLinearGradient(0, -rect.h / 2, 0, rect.h / 2); g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; rr(ctx, -rect.w / 2, -rect.h / 2, rect.w, rect.h, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; rr(ctx, -rect.w / 2 + 1, -rect.h / 2 + 1, rect.w - 2, rect.h - 2, 15); ctx.stroke();
    text(ctx, label, 0, 1, size, '#fff', 'center', 'bold', 'rgba(0,0,0,.35)');
    ctx.restore();
  }

  // ---------- sprites ----------
  // Draws a unit centred at (x,y) with radius r. team 0 = blue, 1 = red.
  function sprite(ctx, type, x, y, r, team, o) {
    o = o || {};
    const t = TEAM[team], bob = o.walk ? Math.sin(o.walk) * r * 0.06 : 0;
    ctx.save(); ctx.translate(x, y + bob);
    if (o.lunge) ctx.translate(o.lunge[0], o.lunge[1]);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.28, 0, 0, 7); ctx.fill();
    const wide = type === 'tank' ? 1.3 : type === 'dwarf' ? 1.1 : 1;
    // body
    ctx.fillStyle = t.main; rr(ctx, -r * 0.62 * wide, -r * 0.1, r * 1.24 * wide, r * 1.0, r * 0.35); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; rr(ctx, -r * 0.5 * wide, -r * 0.02, r * 1.0 * wide, r * 0.3, r * 0.15); ctx.fill();
    ctx.strokeStyle = t.dark; ctx.lineWidth = Math.max(1, r * 0.12); rr(ctx, -r * 0.62 * wide, -r * 0.1, r * 1.24 * wide, r * 1.0, r * 0.35); ctx.stroke();
    // head
    const hy = -r * 0.42, hr = r * 0.56;
    ctx.fillStyle = '#ffd7ae'; ctx.beginPath(); ctx.arc(0, hy, hr, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b57a4a'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(-hr * 0.35, hy + hr * 0.05, hr * 0.12, 0, 7); ctx.arc(hr * 0.35, hy + hr * 0.05, hr * 0.12, 0, 7); ctx.fill();
    if (type === 'warrior') {
      ctx.fillStyle = '#b9c1cf'; ctx.beginPath(); ctx.arc(0, hy - hr * 0.1, hr * 1.02, Math.PI, 0); ctx.fill();
      ctx.fillStyle = t.main; rr(ctx, -hr * 0.12, hy - hr * 1.5, hr * 0.24, hr * 0.7, hr * 0.1); ctx.fill();
      ctx.strokeStyle = '#eef2f8'; ctx.lineWidth = r * 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.85, r * 0.55); ctx.lineTo(r * 0.85, -r * 0.7); ctx.stroke();
      ctx.strokeStyle = '#8a5a2b'; ctx.beginPath(); ctx.moveTo(r * 0.62, r * 0.35); ctx.lineTo(r * 1.08, r * 0.35); ctx.stroke();
    } else if (type === 'archer') {
      ctx.fillStyle = '#2f9a4e'; ctx.beginPath(); ctx.arc(0, hy - hr * 0.1, hr * 1.1, Math.PI, 0); ctx.lineTo(hr * 0.9, hy + hr * 0.3); ctx.lineTo(-hr * 0.9, hy + hr * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd7ae'; ctx.beginPath(); ctx.arc(0, hy + hr * 0.15, hr * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b2118'; ctx.beginPath(); ctx.arc(-hr * 0.25, hy + hr * 0.15, hr * 0.1, 0, 7); ctx.arc(hr * 0.25, hy + hr * 0.15, hr * 0.1, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-r * 0.9, r * 0.3, r * 0.75, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.moveTo(-r * 0.9 + Math.cos(-1.2) * r * 0.75, r * 0.3 + Math.sin(-1.2) * r * 0.75); ctx.lineTo(-r * 0.9 + Math.cos(1.2) * r * 0.75, r * 0.3 + Math.sin(1.2) * r * 0.75); ctx.stroke();
    } else if (type === 'tank') {
      ctx.fillStyle = '#8a94a8'; ctx.beginPath(); ctx.arc(0, hy - hr * 0.05, hr * 1.1, Math.PI * 0.95, Math.PI * 0.05 + Math.PI * 2 - Math.PI * 1.0); ctx.fill();
      ctx.beginPath(); ctx.arc(0, hy - hr * 0.1, hr * 1.08, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#556';  ctx.fillRect(-hr * 0.7, hy - hr * 0.05, hr * 1.4, hr * 0.18);
      ctx.fillStyle = '#c9d1de'; rr(ctx, -r * 0.55, r * 0.05, r * 1.1, r * 0.95, r * 0.3); ctx.fill();
      ctx.strokeStyle = t.main; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.moveTo(0, r * 0.15); ctx.lineTo(0, r * 0.9); ctx.moveTo(-r * 0.4, r * 0.5); ctx.lineTo(r * 0.4, r * 0.5); ctx.stroke();
      ctx.strokeStyle = '#6a7384'; ctx.lineWidth = r * 0.08; rr(ctx, -r * 0.55, r * 0.05, r * 1.1, r * 0.95, r * 0.3); ctx.stroke();
    } else if (type === 'dwarf') {
      ctx.fillStyle = '#e0762a'; ctx.beginPath(); ctx.moveTo(-hr * 0.95, hy + hr * 0.1); ctx.quadraticCurveTo(0, hy + hr * 1.9, hr * 0.95, hy + hr * 0.1); ctx.quadraticCurveTo(0, hy + hr * 0.45, -hr * 0.95, hy + hr * 0.1); ctx.fill();
      ctx.fillStyle = '#9aa3b4'; ctx.beginPath(); ctx.arc(0, hy - hr * 0.15, hr * 1.0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#e8edf5'; ctx.beginPath(); ctx.moveTo(-hr * 1.0, hy - hr * 0.2); ctx.lineTo(-hr * 1.35, hy - hr * 0.9); ctx.lineTo(-hr * 0.6, hy - hr * 0.6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hr * 1.0, hy - hr * 0.2); ctx.lineTo(hr * 1.35, hy - hr * 0.9); ctx.lineTo(hr * 0.6, hy - hr * 0.6); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(r * 0.8, r * 0.8); ctx.lineTo(r * 0.8, -r * 0.4); ctx.stroke();
      ctx.fillStyle = '#d5dbe6'; ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.55); ctx.lineTo(r * 1.35, -r * 0.35); ctx.lineTo(r * 0.8, -r * 0.1); ctx.fill();
    } else if (type === 'mage') {
      ctx.fillStyle = '#7a45e0'; ctx.beginPath(); ctx.moveTo(-hr * 1.25, hy - hr * 0.35); ctx.lineTo(hr * 1.25, hy - hr * 0.35); ctx.lineTo(hr * 0.1, hy - hr * 2.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.arc(0, hy - hr * 0.9, hr * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(-hr * 0.8, hy + hr * 0.45); ctx.lineTo(hr * 0.8, hy + hr * 0.45); ctx.lineTo(0, hy + hr * 1.3); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(r * 0.9, r * 0.9); ctx.lineTo(r * 0.9, -r * 0.5); ctx.stroke();
      const glow = ctx.createRadialGradient(r * 0.9, -r * 0.65, 0, r * 0.9, -r * 0.65, r * 0.5);
      glow.addColorStop(0, '#fff'); glow.addColorStop(0.4, '#d6a8ff'); glow.addColorStop(1, 'rgba(180,100,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(r * 0.9, -r * 0.65, r * 0.5, 0, 7); ctx.fill();
    }
    if (o.flash) { ctx.globalAlpha = o.flash * 0.7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  function stars(ctx, level, x, y, size) {
    ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 1;
    for (let i = 0; i < level; i++) {
      const cx = x + (i - (level - 1) / 2) * size * 1.15;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? size * 0.22 : size * 0.5; ctx.lineTo(cx + Math.cos(a) * rad, y + Math.sin(a) * rad); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function coin(ctx, x, y, r) {
    ctx.fillStyle = '#b8780a'; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ffc926');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c98a0c'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, 7); ctx.stroke();
  }

  function upgradeIcon(ctx, key, x, y, s) {
    const c = UP[key].color;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#1b2236'; ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const k = s / 14;
    if (key === 'extraBalls') { for (const [a, b] of [[-4, 3], [4, 3], [0, -4]]) { ctx.beginPath(); ctx.arc(a * k, b * k, 3.4 * k, 0, 7); ctx.fill(); } }
    else if (key === 'doubleShot') { for (const a of [-4.5, 4.5]) { ctx.beginPath(); ctx.arc(a * k, 0, 4 * k, 0, 7); ctx.fill(); } }
    else if (key === 'rapidFire') { ctx.beginPath(); ctx.moveTo(2 * k, -8 * k); ctx.lineTo(-4 * k, 1 * k); ctx.lineTo(0, 1 * k); ctx.lineTo(-2 * k, 8 * k); ctx.lineTo(5 * k, -2 * k); ctx.lineTo(1 * k, -2 * k); ctx.closePath(); ctx.fill(); }
    else if (key === 'piercing') { ctx.lineWidth = 2.2 * k; ctx.beginPath(); ctx.moveTo(-8 * k, 6 * k); ctx.lineTo(7 * k, -7 * k); ctx.stroke(); ctx.beginPath(); ctx.moveTo(7 * k, -7 * k); ctx.lineTo(1 * k, -6 * k); ctx.lineTo(6 * k, -1 * k); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(-1 * k, 1 * k, 3 * k, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }
    else if (key === 'precision') { ctx.lineWidth = 1.8 * k; ctx.beginPath(); ctx.arc(0, 0, 6 * k, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -9 * k); ctx.lineTo(0, -3 * k); ctx.moveTo(0, 9 * k); ctx.lineTo(0, 3 * k); ctx.moveTo(-9 * k, 0); ctx.lineTo(-3 * k, 0); ctx.moveTo(9 * k, 0); ctx.lineTo(3 * k, 0); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- background ----------
  const grass = [];
  for (let i = 0; i < 70; i++) grass.push([Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1 * 390, 215 + Math.abs(Math.sin(i * 78.233) * 12345.678) % 1 * 418]);

  function background(ctx) {
    let g = ctx.createLinearGradient(0, 0, 0, 211); g.addColorStop(0, '#2a0f1a'); g.addColorStop(1, '#52202a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 390, 211);
    g = ctx.createLinearGradient(0, 633, 0, 844); g.addColorStop(0, '#1b3a74'); g.addColorStop(1, '#0f1f45');
    ctx.fillStyle = g; ctx.fillRect(0, 633, 390, 211);
    g = ctx.createLinearGradient(0, 211, 0, 633); g.addColorStop(0, '#3f7c3a'); g.addColorStop(0.5, '#59a04a'); g.addColorStop(1, '#3f7c3a');
    ctx.fillStyle = g; ctx.fillRect(0, 211, 390, 422);
    // dirt road
    ctx.fillStyle = '#c8a96b'; ctx.fillRect(40, 211, 310, 422);
    ctx.fillStyle = 'rgba(120,80,30,.18)'; for (let i = 0; i < 6; i++) { if (i % 2) ctx.fillRect(40 + i * 51.6, 211, 51.6, 422); }
    ctx.strokeStyle = 'rgba(90,60,20,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 211); ctx.lineTo(40, 633); ctx.moveTo(350, 211); ctx.lineTo(350, 633); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.setLineDash([14, 12]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(195, 300); ctx.lineTo(195, 545); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30,90,30,.5)'; for (const [x, y] of grass) { if (x > 36 && x < 354) continue; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  }

  function castle(ctx, idx) {
    const G = B.G, c = G.castles[idx], t = TEAM[idx];
    const top = idx === 1, y0 = top ? 214 : 552, sh = c.shake * Math.sin(G.time * 70) * 4;
    ctx.save(); ctx.translate(sh, 0);
    const x = 105, w = 180, h = 76, by = y0 + (top ? 0 : 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; rr(ctx, x + 4, by + 8, w, h, 8); ctx.fill();
    // towers
    for (const tx of [x - 8, x + w - 28]) { ctx.fillStyle = '#9aa2b4'; rr(ctx, tx, by - 4, 36, h + 8, 6); ctx.fill(); ctx.fillStyle = t.main; ctx.fillRect(tx, by + (top ? 10 : 16), 36, 8); for (let i = 0; i < 3; i++) { ctx.fillStyle = '#7f879b'; ctx.fillRect(tx + 2 + i * 12, by - 10, 8, 8); } }
    ctx.fillStyle = '#b4bccb'; rr(ctx, x + 16, by + 8, w - 32, h - 8, 6); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 16, by + 14 + i * 14, w - 32, 2);
    // gate + banner
    ctx.fillStyle = '#5a3b20'; rr(ctx, 195 - 20, by + (top ? h - 40 : 18), 40, 40, 16); ctx.fill();
    ctx.fillStyle = t.main; ctx.beginPath(); ctx.moveTo(195 - 14, by + 12); ctx.lineTo(195 + 14, by + 12); ctx.lineTo(195 + 14, by + 34); ctx.lineTo(195, by + 26); ctx.lineTo(195 - 14, by + 34); ctx.fill();
    if (c.flash) { ctx.globalAlpha = c.flash * 0.6; ctx.fillStyle = '#fff'; rr(ctx, x - 8, by - 10, w + 16, h + 18, 8); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
    // hp bar
    const bw = 176, bx = 107, bh = 15, bY = top ? 214 + 2 : 617;
    const pct = Math.max(0, c.hp / c.max);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, bx - 2, bY - 2, bw + 4, bh + 4, 9); ctx.fill();
    ctx.fillStyle = t.main; if (pct > 0) { rr(ctx, bx, bY, Math.max(8, bw * pct), bh, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.25)'; if (pct > 0) { rr(ctx, bx, bY, Math.max(8, bw * pct), bh / 2, 6); ctx.fill(); }
    text(ctx, (idx === 0 ? '♥ ' : '♥ ') + c.hp + ' / ' + c.max, 195, bY + bh / 2 + 1, 11, '#fff', 'center', 'bold', 'rgba(0,0,0,.6)');
  }

  // ---------- backpack ----------
  function previewFor() {
    const G = B.G, d = G.drag;
    if (!d || !d.moved || (d.kind === 'card' && !U[d.key])) return null;
    const cell = L.cellAt(0, d.x, d.y); if (!cell) return null;
    const drag = d.kind === 'card' ? { kind: 'card', key: d.key, rot: d.rot } : { kind: 'unit', unit: d.unit, gr: d.gr, gc: d.gc };
    return B.Game.dropPreview(G.sides[0], drag, cell.r, cell.c);
  }

  function backpack(ctx, sideIdx) {
    const G = B.G, side = G.sides[sideIdx], t = TEAM[sideIdx], z = L.zone(sideIdx), b = L.board(sideIdx);
    ctx.fillStyle = t.main; ctx.fillRect(0, sideIdx === 0 ? z.y0 : z.y1 - 6, 390, 6);
    // board frame: the inner edge is the physical wall the balls bounce on
    ctx.fillStyle = sideIdx === 0 ? '#2a62b8' : '#b8382f'; rr(ctx, b.x - 7, b.y - 7, b.w + 14, b.h + 14, 14); ctx.fill();
    ctx.fillStyle = sideIdx === 0 ? '#0d2859' : '#521715'; rr(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      if (B.Game.isBlocked(r, c)) continue;
      const q = L.cellRect(sideIdx, r, c);
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.12)';
      rr(ctx, q.x + 2, q.y + 2, q.w - 4, q.h - 4, 7); ctx.fill();
    }
    // drop preview (footprint of the shape being dragged)
    const pre = sideIdx === 0 ? previewFor() : null;
    if (pre) {
      const col = pre.action === 'merge' ? '#ffd84d' : pre.action === 'swap' ? '#6bd0ff' : pre.action ? '#58f08a' : '#ff5a5a';
      for (const [r, c] of pre.cells) {
        if (r < 0 || c < 0 || r >= CFG.ROWS || c >= CFG.COLS) continue;
        const q = L.cellRect(0, r, c);
        ctx.globalAlpha = 0.38 + Math.sin(G.time * 8) * 0.1; ctx.fillStyle = col; rr(ctx, q.x + 2, q.y + 2, q.w - 4, q.h - 4, 7); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2.5; rr(ctx, q.x + 2, q.y + 2, q.w - 4, q.h - 4, 7); ctx.stroke();
      }
    }
    for (const u of B.Game.unitsOf(side)) {
      if (G.drag && G.drag.moved && G.drag.kind === 'unit' && sideIdx === 0 && G.drag.unit === u) continue;
      drawUnit(ctx, sideIdx, u, 0, 0, 1);
    }
  }

  // A backpack unit covering one or more cells, drawn as one merged tile.
  function drawUnit(ctx, sideIdx, u, dx, dy, scale) {
    const t = TEAM[sideIdx], st = B.Game.stats(u.type, u.level), n = u.cells.length;
    const qs = u.cells.map(([r, c]) => L.cellRect(sideIdx, r, c));
    let cx = 0, cy = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const q of qs) { cx += q.cx; cy += q.cy; minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x + q.w); maxY = Math.max(maxY, q.y + q.h); }
    cx /= n; cy /= n;
    const sc = (scale || 1) * (1 + u.pop * 0.18 * Math.sin(Math.min(1, u.pop) * Math.PI)) * (1 + u.flash * 0.05);
    const paint = pad => {
      for (const q of qs) { rr(ctx, q.x + pad, q.y + pad, q.w - 2 * pad, q.h - 2 * pad, 9 - pad); ctx.fill(); }
      for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
        const a = qs[i], b2 = qs[j];
        if (Math.abs(a.x - b2.x) + Math.abs(a.y - b2.y) !== CFG.CELL) continue;
        rr(ctx, Math.min(a.x, b2.x) + pad, Math.min(a.y, b2.y) + pad, Math.abs(a.x - b2.x) + a.w - 2 * pad, Math.abs(a.y - b2.y) + a.h - 2 * pad, 9 - pad); ctx.fill();
      }
    };
    ctx.save(); ctx.translate(cx + dx, cy + dy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    ctx.save(); ctx.translate(0, 3); ctx.fillStyle = 'rgba(0,0,0,.35)'; paint(3); ctx.restore();
    ctx.fillStyle = u.level === 3 ? '#ffd84d' : u.level === 2 ? '#aab8dc' : '#25304f'; paint(1.5);
    ctx.fillStyle = '#f4efe2'; paint(3);
    // card header strip (team colour) on every cell of the unit's top edge, like the cards in the tray
    const has = (r, c) => u.cells.some(p => p[0] === r && p[1] === c);
    u.cells.forEach(([r, c], i) => {
      if (has(r - 1, c)) return;
      const q = qs[i], x0 = has(r, c - 1) ? q.x : q.x + 4, x1 = has(r, c + 1) ? q.x + q.w : q.x + q.w - 4;
      ctx.fillStyle = t.main; rr(ctx, x0, q.y + 4, x1 - x0, 10, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.28)'; rr(ctx, x0, q.y + 4, x1 - x0, 4, 3); ctx.fill();
    });
    const rad = 8.6 * (1 + 0.3 * (n - 1));
    sprite(ctx, u.type, cx, cy + 3, rad, sideIdx, { flash: u.flash });
    const a0 = qs[0];
    text(ctx, 'L' + u.level, a0.x + 11, a0.y + 9.5, 9, u.level === 3 ? '#ffe680' : '#fff', 'center', 'bold');
    const need = st.need, bw = Math.min(28 + 8 * (n - 1), 44), pw = bw / need, by = Math.max(...qs.map(q => q.y + q.h)) - 10;
    const bx = cx - bw / 2;
    for (let i = 0; i < need; i++) {
      ctx.fillStyle = i < u.hits ? '#f2a900' : 'rgba(0,0,0,.28)';
      rr(ctx, bx + i * pw + 0.5, by, Math.max(2, pw - 1.5), 5, 2); ctx.fill();
    }
    if (u.flash > 0.4 || u.pop > 0.5) { ctx.globalAlpha = Math.max(u.flash, u.pop * 0.5) * 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(0,0,0,0)'; for (const q of qs) { rr(ctx, q.x + 2, q.y + 2, q.w - 4, q.h - 4, 8); ctx.stroke(); } }
    ctx.restore();
  }

  function launcher(ctx, sideIdx) {
    const G = B.G, side = G.sides[sideIdx], l = side.launcher, t = TEAM[sideIdx];
    const pos = L.launcher(sideIdx), u = side.upg;
    // free flight zone: the 3x3 block around the launcher stays empty
    const q0 = L.cellRect(sideIdx, CFG.CENTER_R - 1, CFG.CENTER_C - 1), zs = CFG.CELL * 3;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(ctx, q0.x + 2, q0.y + 2, zs - 4, zs - 4, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); rr(ctx, q0.x + 3, q0.y + 3, zs - 6, zs - 6, 13); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 42, 0, 7); ctx.stroke();
    // short aiming telegraph
    const m = L.muzzle(sideIdx, l.angle);
    ctx.save(); ctx.strokeStyle = t.ball; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -G.time * 30;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + Math.cos(l.angle) * 34, m.y + Math.sin(l.angle) * 34); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(pos.x, pos.y);
    if (u.rapidFire) { ctx.fillStyle = '#ff7b3a'; for (let i = 0; i < 3 + u.rapidFire * 2; i++) { const a = G.time * 6 + i * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * 17, Math.sin(a) * 17, 1.8, 0, 7); ctx.fill(); } }
    ctx.rotate(l.angle + Math.PI / 2);
    const rec = l.recoil * 3, barrels = 1 + u.doubleShot;
    for (let i = 0; i < barrels; i++) {
      const off = (i - (barrels - 1) / 2) * 8;
      ctx.fillStyle = '#d6dbe6'; rr(ctx, off - 3.5, -19 + rec, 7, 17, 3); ctx.fill();
      ctx.fillStyle = u.precision ? '#7dffb0' : t.ball; ctx.fillRect(off - 3.5, -19 + rec, 7, 4);
    }
    ctx.restore();
    ctx.fillStyle = '#2b3350'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = t.main; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = t.light; ctx.beginPath(); ctx.arc(pos.x, pos.y, 4.5, 0, 7); ctx.fill();
  }

  function balls(ctx, sideIdx) {
    const t = TEAM[sideIdx];
    for (const bb of B.Physics.balls[sideIdx]) {
      const pos = bb.body.position, tr = bb.trail, col = bb.pierce ? '#ffd84d' : t.ball;
      ctx.lineCap = 'round';
      for (let i = 1; i < tr.length; i++) {
        ctx.globalAlpha = i / tr.length * 0.7; ctx.strokeStyle = col; ctx.lineWidth = CFG.BALL_R * 2 * (i / tr.length);
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const fade = bb.fade > 0 ? Math.min(1, bb.fade / 0.25) : bb.age > CFG.BALL_LIFE - 1 ? Math.max(0, CFG.BALL_LIFE - bb.age) : 1;
      ctx.globalAlpha = fade;
      const g = ctx.createRadialGradient(pos.x - 1.5, pos.y - 1.5, 0, pos.x, pos.y, CFG.BALL_R + 1);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, col); g.addColorStop(1, t.main);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pos.x, pos.y, CFG.BALL_R, 0, 7); ctx.fill();
      if (bb.pierce) { ctx.strokeStyle = 'rgba(255,240,150,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pos.x, pos.y, CFG.BALL_R + 2.5, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }

  function sideHud(ctx, sideIdx) {
    const G = B.G, side = G.sides[sideIdx], t = TEAM[sideIdx], p = B.Game.launcherParams(side), z = L.zone(sideIdx);
    const ly = sideIdx === 0 ? z.y0 + 14 : z.y1 - 14;
    // name tag
    ctx.fillStyle = t.dark; rr(ctx, 4, ly - 10, 50, 20, 10); ctx.fill();
    text(ctx, t.name, 29, ly, 10, '#fff', 'center', 'bold');
    // coins
    const ccy = sideIdx === 0 ? ly + 28 : ly - 28, cs = 1 + side.coinPop * 0.25;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(ctx, 4, ccy - 12, 50, 24, 12); ctx.fill();
    ctx.save(); ctx.translate(17, ccy); ctx.scale(cs, cs); coin(ctx, 0, 0, 8); ctx.restore();
    text(ctx, String(side.coins), 38, ccy + 1, 15, '#ffe36b', 'center', 'bold', 'rgba(0,0,0,.5)');
    // ball counter
    const cy = (z.y0 + z.y1) / 2 + (sideIdx === 0 ? 4 : -4);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, 4, cy - 32, 50, 64, 12); ctx.fill();
    const g = ctx.createRadialGradient(18, cy - 20, 0, 20, cy - 18, 8); g.addColorStop(0, '#fff'); g.addColorStop(0.5, t.ball); g.addColorStop(1, t.main);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(18, cy - 20, 6, 0, 7); ctx.fill();
    text(ctx, 'BALLS', 40, cy - 20, 8, '#cfd8ee', 'center', 'bold');
    const left = G.phase === 'combat' || G.phase === 'roundEnd' ? side.launcher.left : p.balls;
    text(ctx, String(left), 29, cy + 3, 24, '#fff', 'center', 'bold', 'rgba(0,0,0,.5)');
    text(ctx, '/' + p.balls, 29, cy + 22, 10, '#9fb0d6', 'center', 'bold');
    // upgrades
    const keys = Object.keys(side.upg).filter(k => side.upg[k] > 0);
    if (!keys.length) { text(ctx, 'no upgrades', 359, cy, 9, 'rgba(255,255,255,.3)', 'center', 'normal'); return; }
    keys.forEach((k, i) => {
      const col = i % 2, row = (i / 2) | 0;
      const x = 341 + col * 31, y = cy - 22 + row * 36 - (keys.length > 4 ? 8 : 0);
      upgradeIcon(ctx, k, x, y, 13);
      ctx.fillStyle = '#10172b'; rr(ctx, x + 3, y + 5, 16, 12, 5); ctx.fill();
      text(ctx, k === 'extraBalls' ? '+' + side.upg[k] * CFG.EXTRA_BALLS : 'x' + side.upg[k], x + 11, y + 11, 9, '#fff', 'center', 'bold');
    });
  }

  // ---------- arena ----------
  function unitsDraw(ctx) {
    const G = B.G;
    const list = G.units.slice().sort((a, b) => a.y - b.y);
    for (const u of list) {
      const s = Math.min(1, u.spawnT), pop = s < 1 ? 1 + Math.sin(s * Math.PI) * 0.35 : 1;
      const lunge = u.atk > 0 ? [u.atkDx * Math.sin((u.atk / 0.25) * Math.PI) * u.r * 0.7, u.atkDy * Math.sin((u.atk / 0.25) * Math.PI) * u.r * 0.7] : null;
      ctx.save(); ctx.globalAlpha = Math.min(1, s * 1.5);
      sprite(ctx, u.type, u.x, u.y, u.r * 1.15 * pop, u.owner, { flash: u.hit, walk: u.phase, lunge });
      ctx.restore();
      // team ring
      ctx.strokeStyle = TEAM[u.owner].light; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(u.x, u.y + u.r * 1.05, u.r * 1.0, u.r * 0.32, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      // hp bar
      const bw = Math.max(20, u.r * 2.1), bx = u.x - bw / 2, by = u.y - u.r * 1.9;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, bx - 1, by - 1, bw + 2, 6, 3); ctx.fill();
      ctx.fillStyle = u.hp / u.max > 0.5 ? '#5be37d' : u.hp / u.max > 0.25 ? '#ffd84d' : '#ff5a4d';
      rr(ctx, bx, by, bw * Math.max(0, u.hp / u.max), 4, 2); ctx.fill();
      if (u.level > 1) stars(ctx, u.level, u.x, by - 6, 6);
    }
    for (const p of G.projs) {
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.kind === 'mage') {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 9); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#c78bff'); g.addColorStop(1, 'rgba(160,90,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
      } else {
        ctx.rotate(p.ang || 0); ctx.strokeStyle = '#f3e9d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.fillStyle = TEAM[p.owner].light; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.fill();
      }
      ctx.restore();
    }
  }

  function fxDraw(ctx) {
    for (const g of FX.ghosts) {
      const k = g.life / g.max; ctx.save(); ctx.globalAlpha = k * 0.8;
      ctx.translate(g.x, g.y - (1 - k) * 12); ctx.rotate((1 - k) * (g.owner ? 1 : -1) * 0.9);
      sprite(ctx, g.type, 0, 0, g.r * 1.15 * (0.6 + 0.4 * k), g.owner, { flash: 0.5 });
      ctx.restore();
    }
    for (const r of FX.rings) { const k = 1 - r.life / r.max; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.maxR * k, 0, 7); ctx.stroke(); }
    for (const p of FX.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * p.life / p.max), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const f of FX.floaters) { ctx.globalAlpha = Math.min(1, f.life / f.max * 1.6); text(ctx, f.text, f.x, f.y, f.size, f.color, 'center', 'bold', 'rgba(0,0,0,.7)'); }
    ctx.globalAlpha = 1;
  }

  // ---------- cards ----------
  function card(ctx, c, rect, opts) {
    opts = opts || {};
    const isU = !!U[c.key], col = isU ? '#3b8bff' : UP[c.key].color;
    ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2 + (opts.lift ? -8 : 0));
    const born = Math.min(1, (B.G.time - c.born) * 3), sc = (opts.scale || 1) * (0.7 + 0.3 * born + Math.sin(born * Math.PI) * 0.08);
    ctx.scale(sc, sc);
    const w = rect.w, h = rect.h;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(ctx, -w / 2 + 2, -h / 2 + 5, w, h, 10); ctx.fill();
    ctx.fillStyle = '#f4efe2'; rr(ctx, -w / 2, -h / 2, w, h, 10); ctx.fill();
    ctx.fillStyle = col; rr(ctx, -w / 2, -h / 2, w, h * 0.22, 10); ctx.fill(); ctx.fillRect(-w / 2, -h / 2 + h * 0.12, w, h * 0.1);
    ctx.strokeStyle = '#25304f'; ctx.lineWidth = 2; rr(ctx, -w / 2, -h / 2, w, h, 10); ctx.stroke();
    const nm = isU ? U[c.key].name : UP[c.key].name;
    text(ctx, nm.toUpperCase().replace('PIERCING BALL', 'PIERCING').replace('PRECISION SHOT', 'PRECISION'), 0, -h / 2 + h * 0.11, Math.max(7, w * 0.125), '#fff', 'center', 'bold');
    if (isU) {
      // the card shows the unit's real footprint (rotated by the card's current rotation)
      const cs = B.Game.shapeCells(c.key, c.rot || 0), n = cs.length;
      const rows = Math.max(...cs.map(p => p[0])) + 1 - Math.min(...cs.map(p => p[0]));
      const cols = Math.max(...cs.map(p => p[1])) + 1 - Math.min(...cs.map(p => p[1]));
      const k = Math.min(w * 0.62 / cols, h * 0.42 / rows, w * 0.34);
      const r0 = Math.min(...cs.map(p => p[0])), c0 = Math.min(...cs.map(p => p[1]));
      const ox = -cols * k / 2, oy = -h * 0.04 - rows * k / 2;
      const cell = pad => ([r, cc]) => rr(ctx, ox + (cc - c0) * k + pad, oy + (r - r0) * k + pad, k - 2 * pad, k - 2 * pad, k * 0.22);
      const paint = pad => {
        for (const q of cs) { cell(pad)(q); ctx.fill(); }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          if (Math.abs(cs[i][0] - cs[j][0]) + Math.abs(cs[i][1] - cs[j][1]) !== 1) continue;
          const x = ox + (Math.min(cs[i][1], cs[j][1]) - c0) * k + pad, y = oy + (Math.min(cs[i][0], cs[j][0]) - r0) * k + pad;
          rr(ctx, x, y, (Math.abs(cs[i][1] - cs[j][1]) + 1) * k - 2 * pad, (Math.abs(cs[i][0] - cs[j][0]) + 1) * k - 2 * pad, k * 0.22); ctx.fill();
        }
      };
      ctx.fillStyle = '#173a7a'; paint(0);
      const gr = ctx.createLinearGradient(0, oy, 0, oy + rows * k); gr.addColorStop(0, TEAM[0].light); gr.addColorStop(1, TEAM[0].main);
      ctx.fillStyle = gr; paint(1.5);
      let mx = 0, my = 0; for (const [r, cc] of cs) { mx += ox + (cc - c0 + 0.5) * k; my += oy + (r - r0 + 0.5) * k; }
      sprite(ctx, c.key, mx / n, my / n - k * 0.05, k * 0.4 * (1 + 0.12 * (n - 1)), 0);
      const st = B.Game.stats(c.key, 1);
      text(ctx, '♥' + st.hp + ' ⚔' + st.dmg, 0, h * 0.29, Math.max(7, w * 0.12), '#2b2f45', 'center', 'bold');
      text(ctx, st.need + ' hits', 0, h * 0.41, Math.max(7, w * 0.13), '#b36a00', 'center', 'bold');
    } else {
      upgradeIcon(ctx, c.key, 0, -h * 0.05, w * 0.27);
      text(ctx, UP[c.key].desc, 0, h * 0.34, Math.max(6.5, w * 0.105), '#2b2f45', 'center', 'bold');
    }
    const cost = B.Game.cardCost(c.key), poor = B.G.sides[0].coins < cost;
    if (poor) { ctx.fillStyle = 'rgba(18,24,44,.5)'; rr(ctx, -w / 2, -h / 2, w, h, 10); ctx.fill(); }
    const br = Math.max(8, w * 0.125), bx = w / 2 - 3, by = -h / 2 + 3;
    coin(ctx, bx, by, br);
    text(ctx, String(cost), bx, by + 1, br * 1.15, poor ? '#a3200f' : '#6b3f00', 'center', 'bold');
    ctx.restore();
  }

  function cardTray(ctx) {
    const G = B.G, hand = G.sides[0].hand, n = hand.length;
    if (G.phase !== 'prep') return;
    if (!n) { text(ctx, 'All cards played', 195, 505, 13, 'rgba(255,255,255,.7)', 'center', 'bold', 'rgba(0,0,0,.4)'); return; }
    ctx.fillStyle = 'rgba(15,25,50,.45)'; rr(ctx, 6, 452, 378, 108, 16); ctx.fill();
    text(ctx, 'DRAG TO PLACE  •  TAP TO ROTATE  •  COIN = COST', 195, 441, 11, '#fff', 'center', 'bold', 'rgba(0,0,0,.5)');
    hand.forEach((c, i) => {
      if (G.drag && G.drag.kind !== 'unit' && G.drag.id === c.id) return;
      card(ctx, c, L.cardRect(i, n), {});
    });
  }

  function hud(ctx) {
    const G = B.G;
    // round pill & speed button
    ctx.fillStyle = 'rgba(15,20,40,.85)'; rr(ctx, L.roundPill.x, L.roundPill.y, L.roundPill.w, L.roundPill.h, 14); ctx.fill();
    text(ctx, 'ROUND ' + Math.min(G.round, CFG.ROUNDS) + '/' + CFG.ROUNDS, L.roundPill.x + L.roundPill.w / 2, L.roundPill.y + 14, 12, '#ffe36b', 'center', 'bold');
    const sb = L.speedBtn;
    ctx.fillStyle = G.speed === 2 ? '#ffb703' : 'rgba(15,20,40,.85)'; rr(ctx, sb.x, sb.y, sb.w, sb.h, 14); ctx.fill();
    text(ctx, G.speed === 2 ? '» 2× SPEED' : '▸ 1× SPEED', sb.x + sb.w / 2, sb.y + 14, 11, G.speed === 2 ? '#222' : '#fff', 'center', 'bold');

    if (G.phase === 'prep') {
      const secs = Math.max(0, Math.ceil(G.prepTimer));
      if (!G.banner) {
        text(ctx, 'PREPARATION', 195, 322, 15, '#fff', 'center', 'bold', 'rgba(0,0,0,.55)');
        text(ctx, !G.sides[0].hand.length ? 'All placed — battle starting…' : G.canPlay === false ? 'No playable cards left — battle starting…' : 'Battle starts when no card is left to play  •  0:' + String(secs).padStart(2, '0'), 195, 345, 11, '#fff', 'center', 'bold', 'rgba(0,0,0,.6)');
      }
      btn(ctx, L.startBtn, 'START NOW', '#ffb703', '#ff7a1a', 24, true);
    }
    if (G.toast) { ctx.globalAlpha = Math.min(1, G.toast.t * 2); text(ctx, G.toast.text, 195, 440, 15, G.toast.color, 'center', 'bold', 'rgba(0,0,0,.7)'); ctx.globalAlpha = 1; }
    if (G.banner) {
      const b = G.banner, k = b.t / b.max, a = Math.min(1, k * 4, (1 - k) * 6 + 0.3);
      ctx.globalAlpha = Math.min(1, a); const sc = 1 + (1 - Math.min(1, (1 - k) * 5)) * 0.4;
      ctx.save(); ctx.translate(195, G.phase === 'prep' ? 322 : 395); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(10,15,35,.72)'; rr(ctx, -150, -34, 300, b.sub ? 74 : 58, 18); ctx.fill();
      text(ctx, b.text, 0, -8, 28, '#ffe36b', 'center', 'bold', 'rgba(0,0,0,.5)');
      if (b.sub) text(ctx, b.sub, 0, 22, 13, '#fff', 'center', 'bold');
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function dragLayer(ctx) {
    const G = B.G, d = G.drag; if (!d || !d.moved) return;
    if (d.kind === 'card') {
      const c = G.sides[0].hand.find(h => h.id === d.id); if (!c) return;
      const pre = U[d.key] ? previewFor() : null;
      if (pre && pre.cells.length) {
        const cs = pre.cells.map(([r, c2]) => L.cellRect(0, r, c2));
        const x = cs.reduce((a, q) => a + q.cx, 0) / cs.length, y = cs.reduce((a, q) => a + q.cy, 0) / cs.length;
        ctx.globalAlpha = 0.9; sprite(ctx, d.key, x, y - 3, 9.5 * (1 + 0.3 * (cs.length - 1)), 0, {}); ctx.globalAlpha = 1;
      } else card(ctx, c, { x: d.x - 32, y: d.y - 37, w: 64, h: 74 }, { scale: 1.1 });
      if (!U[d.key]) {
        ctx.globalAlpha = 0.35 + Math.sin(G.time * 8) * 0.12; ctx.fillStyle = UP[d.key].color; ctx.fillRect(0, 633, 390, 211); ctx.globalAlpha = 1;
        text(ctx, 'DROP ON YOUR BACKPACK TO UPGRADE', 195, 640, 11, '#fff', 'center', 'bold', 'rgba(0,0,0,.7)');
      }
    } else if (d.kind === 'unit') {
      const q = L.cellRect(0, d.unit.ar + d.gr, d.unit.ac + d.gc);
      ctx.globalAlpha = 0.92; drawUnit(ctx, 0, d.unit, d.x - q.cx, d.y - q.cy - 6, 1.1); ctx.globalAlpha = 1;
    }
  }

  function result(ctx) {
    const G = B.G; if (G.phase !== 'over') return;
    ctx.fillStyle = 'rgba(5,8,20,.78)'; ctx.fillRect(0, 0, 390, 844);
    const w = G.winner, col = w === 'player' ? '#ffe36b' : w === 'enemy' ? '#ff6b5a' : '#cfd8ee';
    const title = w === 'player' ? 'VICTORY!' : w === 'enemy' ? 'DEFEAT' : 'DRAW';
    ctx.save(); ctx.translate(195, 330); const k = Math.min(1, (G.time % 1000) * 0 + 1);
    ctx.fillStyle = '#18213d'; rr(ctx, -165, -110, 330, 250, 24); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 4; rr(ctx, -165, -110, 330, 250, 24); ctx.stroke();
    text(ctx, title, 0, -60, 44, col, 'center', 'bold', 'rgba(0,0,0,.5)');
    const why = G.castles[0].hp <= 0 ? 'Your castle was destroyed' : G.castles[1].hp <= 0 ? 'Enemy castle destroyed!' : 'After 3 rounds, castle HP decides';
    text(ctx, why, 0, -22, 13, '#fff', 'center', 'bold');
    text(ctx, 'Your castle: ' + G.castles[0].hp + ' HP', 0, 20, 17, TEAM[0].light, 'center', 'bold');
    text(ctx, 'Enemy castle: ' + G.castles[1].hp + ' HP', 0, 52, 17, TEAM[1].light, 'center', 'bold');
    ctx.restore();
    btn(ctx, L.restartBtn, 'RESTART', '#3be07a', '#13a04f', 24, true);
  }

  R.draw = function (ctx) {
    const G = B.G;
    background(ctx);
    castle(ctx, 1); castle(ctx, 0);
    backpack(ctx, 1); backpack(ctx, 0);
    launcher(ctx, 1); launcher(ctx, 0);
    sideHud(ctx, 1); sideHud(ctx, 0);
    balls(ctx, 1); balls(ctx, 0);
    unitsDraw(ctx);
    fxDraw(ctx);
    hud(ctx);
    cardTray(ctx);
    dragLayer(ctx);
    result(ctx);
  };
})(window.BBB);
