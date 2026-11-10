// Corridor War — canvas renderer for the battlefield (visual only; never mutates the sim).
(function (CC) {
  'use strict';

  const TEAM = {
    blue: { body: '#58a8ff', dark: '#0f2c52', light: '#bfe0ff', blood: 'rgba(40,90,170,0.35)' },
    red:  { body: '#ff5d5d', dark: '#4f1010', light: '#ffd0c8', blood: 'rgba(150,25,25,0.38)' },
  };
  const FLOOR = '#5a6074', WALL = '#0c0d12', BG = '#22252d';

  function Renderer(canvas, map) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.map = map;
    this.particles = []; this.rings = []; this.texts = []; this.flashes = [];
    this.shake = 0; this.hitCounter = 0;
    // map content bounds
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of map.polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    this.bounds = { x0: x0 - 1.2, y0: y0 - 1.2, x1: x1 + 1.2, y1: y1 + 1.2 };
  }

  Renderer.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    const B = this.bounds, bw = B.x1 - B.x0, bh = B.y1 - B.y0;
    this.s = Math.min(w / bw, h / bh);                       // css px per world unit
    this.ox = (w - bw * this.s) / 2 - B.x0 * this.s;
    this.oy = (h - bh * this.s) / 2 - B.y0 * this.s;
    this.buildStatic(); this.buildSprites();
    this.decal = document.createElement('canvas');
    this.decal.width = this.canvas.width; this.decal.height = this.canvas.height;
    this.dctx = this.decal.getContext('2d'); this.decalFade = 0;
  };

  Renderer.prototype.wx = function (x) { return this.ox + x * this.s; };
  Renderer.prototype.wy = function (y) { return this.oy + y * this.s; };

  Renderer.prototype.polyPath = function (ctx, poly) {
    ctx.moveTo(this.wx(poly[0][0]), this.wy(poly[0][1]));
    for (let i = 1; i < poly.length; i++) ctx.lineTo(this.wx(poly[i][0]), this.wy(poly[i][1]));
    ctx.closePath();
  };

  Renderer.prototype.buildStatic = function () {
    const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height;
    const ctx = c.getContext('2d'), s = this.s, map = this.map;
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, this.w, this.h);
    // faint rock noise in the background
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
      ctx.beginPath(); ctx.arc(rnd() * this.w, rnd() * this.h, 1 + rnd() * 6, 0, 7); ctx.fill();
    }
    // walls: thick dark outline = union of polygons stroked
    ctx.lineJoin = 'miter';
    ctx.beginPath(); for (const p of map.polys) this.polyPath(ctx, p);
    ctx.strokeStyle = WALL; ctx.lineWidth = Math.max(3, s * 0.9); ctx.stroke();
    ctx.fillStyle = WALL; ctx.fill();
    // floor
    ctx.beginPath(); for (const p of map.polys) this.polyPath(ctx, p);
    ctx.fillStyle = FLOOR; ctx.fill();
    // floor texture + inner wall shading (clip to floor)
    ctx.save(); ctx.beginPath(); for (const p of map.polys) this.polyPath(ctx, p); ctx.clip();
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() < 0.6 ? 'rgba(20,22,35,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(rnd() * this.w, rnd() * this.h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // darken near walls using the nav wall-distance field
    const step = 1 / map.RES;
    for (let gy = 0; gy < map.gh; gy++) for (let gx = 0; gx < map.gw; gx++) {
      const i = gy * map.gw + gx; if (map.solid[i]) continue;
      const wd = map.wallDist[i]; if (wd > 1.6) continue;
      ctx.fillStyle = `rgba(10,12,22,${(1.6 - wd) * 0.16})`;
      ctx.fillRect(this.wx(gx * step) - 0.5, this.wy(gy * step) - 0.5, step * s + 1, step * s + 1);
    }
    ctx.restore();
    // base rooms tinted by team
    for (const id of ['blue', 'red']) {
      const b = map.bases[id], g = ctx.createRadialGradient(this.wx(b.x), this.wy(b.y), 0, this.wx(b.x), this.wy(b.y), 10 * s);
      g.addColorStop(0, id === 'blue' ? 'rgba(70,150,255,0.30)' : 'rgba(255,70,70,0.30)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
    }
    // warm torch light
    ctx.globalCompositeOperation = 'lighter';
    for (const t of map.torches) {
      const x = this.wx(t.x), y = this.wy(t.y), g = ctx.createRadialGradient(x, y, 0, x, y, 9 * s);
      g.addColorStop(0, 'rgba(255,190,110,0.30)'); g.addColorStop(0.4, 'rgba(255,150,80,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9 * s, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const t of map.torches) {
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(this.wx(t.x), this.wy(t.y), Math.max(1.6, s * 0.35), 0, 7); ctx.fill();
    }
    this.static = c;
  };

  // ---- unit sprites: drawn once per type/team/flash, facing +x ----
  function drawUnitShape(ctx, shape, r, team, flash) {
    const T = TEAM[team], body = flash ? '#ffffff' : T.body, dark = T.dark;
    const lw = Math.max(1, r * 0.28);
    ctx.lineCap = 'round';
    // weapons behind / beside the body
    ctx.strokeStyle = flash ? '#fff' : '#d9dde6'; ctx.lineWidth = lw;
    if (shape === 'warrior') { ctx.beginPath(); ctx.moveTo(r * 0.3, r * 0.65); ctx.lineTo(r * 1.55, r * 0.65); ctx.stroke(); }
    if (shape === 'spearman') { ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.55); ctx.lineTo(r * 2.3, r * 0.55); ctx.stroke(); ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(r * 2.6, r * 0.55); ctx.lineTo(r * 2.1, r * 0.25); ctx.lineTo(r * 2.1, r * 0.85); ctx.fill(); }
    if (shape === 'assassin') { ctx.beginPath(); ctx.moveTo(r * 0.4, r * 0.7); ctx.lineTo(r * 1.3, r * 0.7); ctx.moveTo(r * 0.4, -r * 0.7); ctx.lineTo(r * 1.3, -r * 0.7); ctx.stroke(); }
    if (shape === 'sniper') { ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.moveTo(0, r * 0.35); ctx.lineTo(r * 2.2, r * 0.35); ctx.stroke(); }
    if (shape === 'berserker') { ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.7); ctx.lineTo(r * 1.4, r * 0.7); ctx.stroke(); ctx.fillStyle = '#c8ccd6'; ctx.beginPath(); ctx.arc(r * 1.4, r * 0.7, r * 0.45, -1.4, 1.4); ctx.fill(); }
    // body
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // little "ears/shoulders" like the reference blobs
    ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.85, r * 0.38, 0, 7); ctx.arc(-r * 0.15, r * 0.85, r * 0.38, 0, 7); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : T.light; ctx.beginPath(); ctx.arc(r * 0.25, 0, r * 0.38, 0, 7); ctx.fill();
    // front pieces
    if (shape === 'tank') { ctx.fillStyle = flash ? '#fff' : '#8a93a6'; ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.15); ctx.beginPath(); ctx.rect(r * 0.75, -r * 0.95, r * 0.42, r * 1.9); ctx.fill(); ctx.stroke(); }
    if (shape === 'archer') { ctx.strokeStyle = flash ? '#fff' : '#a0703a'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 1.1, -1.05, 1.05); ctx.stroke(); }
    if (shape === 'bomber') { ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.arc(r * 1.15, r * 0.35, r * 0.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.arc(r * 1.45, r * 0.0, r * 0.18, 0, 7); ctx.fill(); }
  }

  Renderer.prototype.buildSprites = function () {
    this.sprites = {};
    const px = this.s * this.dpr;
    for (const type of CC.CONFIG.unitOrder) {
      const def = CC.CONFIG.units[type], r = def.radius * px;
      const size = Math.ceil(r * 6 + 4);
      for (const team of ['blue', 'red']) for (const flash of [0, 1]) {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const ctx = c.getContext('2d'); ctx.translate(size / 2, size / 2);
        drawUnitShape(ctx, def.shape, r, team, flash);
        this.sprites[type + team + flash] = c;
      }
    }
  };

  // ---- events from the sim -> particles / decals ----
  Renderer.prototype.consume = function (events) {
    const s = this.s, dctx = this.dctx, dpr = this.dpr;
    for (const e of events) {
      if (e.t === 'death') {
        const T = TEAM[e.side];
        for (let i = 0; i < 6; i++) this.addParticle(e.x, e.y, T.body, 2.2 + Math.random() * 3, 0.45 + Math.random() * 0.3, 0.22);
        this.addParticle(e.x, e.y, '#ffffff', 1.5, 0.3, 0.18);
        dctx.fillStyle = T.blood; dctx.beginPath();
        dctx.arc(this.wx(e.x) * dpr, this.wy(e.y) * dpr, (0.35 + Math.random() * 0.45) * s * dpr, 0, 7); dctx.fill();
      } else if (e.t === 'hit') {
        if ((this.hitCounter++ & 3) === 0) this.addParticle(e.x, e.y, '#fff6d0', 3, 0.15, 0.12);
        if (this.texts.length < 14 && (this.hitCounter % 23) === 0) this.texts.push({ x: e.x, y: e.y - 0.5, txt: Math.round(e.v), life: 0.6, max: 0.6, color: e.side === 'blue' ? '#ff9a9a' : '#fff' });
      } else if (e.t === 'boom') {
        this.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.35, max: 0.35 });
        for (let i = 0; i < 10; i++) this.addParticle(e.x, e.y, i & 1 ? '#ffb347' : '#ff6a2a', 4 + Math.random() * 5, 0.35 + Math.random() * 0.25, 0.25);
        dctx.fillStyle = 'rgba(10,10,10,0.22)'; dctx.beginPath();
        dctx.arc(this.wx(e.x) * dpr, this.wy(e.y) * dpr, e.r * 0.8 * s * dpr, 0, 7); dctx.fill();
      } else if (e.t === 'baseHit') {
        if (e.side === 'blue') this.shake = Math.min(6, this.shake + 0.6);
        if (this.texts.length < 34 && Math.random() < 0.3) this.texts.push({ x: e.x + (Math.random() - 0.5) * 4, y: e.y - 2, txt: '-' + Math.round(e.v), life: 0.8, max: 0.8, color: '#ffd24d', big: true });
      }
    }
  };

  Renderer.prototype.addParticle = function (x, y, color, spd, life, size) {
    if (this.particles.length > 700) return;
    const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.6);
    this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
  };

  // ---- frame ----
  Renderer.prototype.draw = function (b, alpha, dt) {
    const ctx = this.ctx, dpr = this.dpr, s = this.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 18); }
    ctx.drawImage(this.static, sx * dpr, sy * dpr);
    // slowly fade old decals
    this.decalFade += dt;
    if (this.decalFade > 1.5) { this.decalFade = 0; this.dctx.globalCompositeOperation = 'destination-out'; this.dctx.fillStyle = 'rgba(0,0,0,0.06)'; this.dctx.fillRect(0, 0, this.decal.width, this.decal.height); this.dctx.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(this.decal, sx * dpr, sy * dpr);

    const OX = (this.ox + sx) * dpr, OY = (this.oy + sy) * dpr, K = s * dpr;

    // bases
    for (const id of ['blue', 'red']) this.drawBase(ctx, b.sides[id].base, id, OX, OY, K, b.time);

    // units
    const units = b.units, sprites = this.sprites;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      let x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      const c = Math.cos(u.ang), sn = Math.sin(u.ang);
      if (u.swing > 0) { const l = Math.sin(u.swing / 0.16 * Math.PI) * 0.22; x += c * l; y += sn * l; }
      const spr = sprites[u.type + u.side + (u.flash > 0 ? 1 : 0)], hw = spr.width / 2;
      ctx.setTransform(c, sn, -sn, c, OX + x * K, OY + y * K);
      if (u.spawnT < 0.3) ctx.globalAlpha = u.spawnT / 0.3;
      ctx.drawImage(spr, -hw, -hw);
      if (u.spawnT < 0.3) ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // projectiles
    ctx.lineCap = 'round';
    for (const p of b.projectiles) {
      const x = OX + p.x * K, y = OY + p.y * K;
      if (p.kind === 'bomb') {
        const k = Math.min(1, p.t / p.dur), hgt = Math.sin(k * Math.PI) * 2.2 * K;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x, y, 0.3 * K, 0, 7); ctx.fill();
        ctx.fillStyle = '#18181c'; ctx.beginPath(); ctx.arc(x, y - hgt, 0.38 * K, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.arc(x + 0.2 * K, y - hgt - 0.25 * K, 0.12 * K, 0, 7); ctx.fill();
      } else {
        const dx = p.tx - p.sx, dy = p.ty - p.sy, L = Math.hypot(dx, dy) || 1, len = (p.kind === 'bullet' ? 1.4 : 0.9) * K;
        ctx.strokeStyle = p.kind === 'bullet' ? '#fff2a8' : (p.side === 'blue' ? '#d8ecff' : '#ffe0d8');
        ctx.lineWidth = Math.max(1, 0.14 * K);
        ctx.beginPath(); ctx.moveTo(x - dx / L * len, y - dy / L * len); ctx.lineTo(x, y); ctx.stroke();
      }
    }

    // explosion rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life -= dt; if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(OX + r.x * K, OY + r.y * K, r.r * K * (0.4 + k * 0.8), 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,170,60,0.25)'; ctx.fill();
    }
    ctx.globalAlpha = 1;

    // particles
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
      ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color;
      const sz = p.size * K; ctx.fillRect(OX + p.x * K - sz / 2, OY + p.y * K - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    // floating numbers
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt; if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y -= dt * 2.2;
      ctx.globalAlpha = Math.min(1, t.life / t.max * 1.5);
      ctx.font = `800 ${(t.big ? 12 : 9) * dpr}px system-ui, sans-serif`;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.txt, OX + t.x * K, OY + t.y * K); ctx.fillStyle = t.color; ctx.fillText(t.txt, OX + t.x * K, OY + t.y * K);
    }
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.drawBase = function (ctx, base, id, OX, OY, K, time) {
    const T = TEAM[id], x = OX + base.x * K, y = OY + base.y * K, r = base.r * K;
    ctx.save(); ctx.translate(x, y);
    // octagonal keep
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
    ctx.fillStyle = base.flash > 0 ? '#ffffff' : T.dark; ctx.fill();
    ctx.lineWidth = Math.max(2, K * 0.35); ctx.strokeStyle = T.body; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 7); ctx.fillStyle = T.body; ctx.fill();
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.beginPath(); ctx.arc(0, 0, r * (0.22 + pulse * 0.06), 0, 7); ctx.fillStyle = T.light; ctx.fill();
    // HP bar
    const w = r * 2.6, h = Math.max(4, K * 0.6), k = base.hp / base.maxHp, by = id === 'red' ? -r - h * 2.2 : r + h * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(-w / 2 - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = k > 0.5 ? '#4cd964' : k > 0.25 ? '#ffcc33' : '#ff4d4d'; ctx.fillRect(-w / 2, by, w * k, h);
    ctx.restore();
  };

  CC.Renderer = Renderer;
})(globalThis.CC = globalThis.CC || {});
