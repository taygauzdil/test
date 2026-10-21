// Visual-effect data (particles, floating numbers, rings). Pure data; drawn by render.js.
(function (B) {
  const FX = { particles: [], floaters: [], rings: [], ghosts: [] };

  FX.reset = function () { FX.particles.length = FX.floaters.length = FX.rings.length = FX.ghosts.length = 0; };

  FX.burst = function (x, y, color, n, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      FX.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size || 2.5 });
    }
  };
  FX.float = function (x, y, text, color, size) {
    FX.floaters.push({ x: x + (Math.random() - 0.5) * 8, y, text: String(text), color: color || '#fff', size: size || 13, life: 0.9, max: 0.9 });
  };
  FX.ring = function (x, y, color, maxR, life) { FX.rings.push({ x, y, color, maxR, life: life || 0.45, max: life || 0.45 }); };
  FX.ghost = function (u) { FX.ghosts.push({ type: u.type, level: u.level, owner: u.owner, x: u.x, y: u.y, r: u.r, life: 0.45, max: 0.45 }); };

  FX.update = function (dt) {
    for (const p of FX.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    for (const f of FX.floaters) { f.y -= 28 * dt; f.life -= dt; }
    for (const r of FX.rings) r.life -= dt;
    for (const g of FX.ghosts) g.life -= dt;
    for (const arr of [FX.particles, FX.floaters, FX.rings, FX.ghosts]) {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) arr.splice(i, 1);
    }
  };

  B.FX = FX;
})(window.BBB);
