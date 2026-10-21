// Central battlefield simulation: spawning, movement, targeting, attacks, projectiles, castle hits.
(function (B) {
  const CFG = B.CFG, U = B.UNITS, L = B.L, FX = B.FX;
  const Battle = B.Battle = {};
  let uid = 1;

  Battle.spawn = function (owner, type, level, col) {
    const G = B.G, d = U[type], s = B.Game.stats(type, level);
    G.units.push({
      id: uid++, owner, type, level, x: L.laneX(col) + (Math.random() - 0.5) * 16,
      y: CFG.FRONT_Y[owner] + (owner === 0 ? -6 : 6),
      hp: s.hp, max: s.hp, dmg: s.dmg, speed: d.speed * (0.93 + Math.random() * 0.14), range: d.range, cd: d.cd,
      cdLeft: 0.3 + Math.random() * 0.4, r: d.radius * (1 + 0.14 * (level - 1)),
      spawnT: 0, atk: 0, atkDx: 0, atkDy: 0, hit: 0, phase: Math.random() * 6, dead: false,
    });
  };

  function damage(target, dmg, srcOwner) {
    target.hp -= dmg; target.hit = 1;
    FX.float(target.x, target.y - target.r - 4, dmg, srcOwner === 0 ? '#9fd0ff' : '#ffb0a0', 12);
    FX.burst(target.x, target.y, '#fff', 4, 70, 0.25, 2);
    if (target.hp <= 0 && !target.dead) {
      target.dead = true; FX.ghost(target);
      FX.burst(target.x, target.y, B.TEAM[target.owner].main, 12, 120, 0.6, 3);
    }
  }

  function castleHit(u) {
    const G = B.G, ci = 1 - u.owner, c = G.castles[ci];
    const dmg = Math.round(u.dmg * CFG.CASTLE_DMG_MULT);
    c.hp = Math.max(0, c.hp - dmg); c.shake = 1; c.flash = 1;
    const y = ci === 1 ? CFG.FRONT_Y[1] - 6 : CFG.FRONT_Y[0] + 6;
    FX.float(u.x, y + (ci === 1 ? -6 : 6), '-' + dmg, '#ffe36b', 16);
    FX.burst(u.x, y, '#ffcf6b', 14, 150, 0.5, 3); FX.ring(u.x, y, '#ffb347', 28, 0.35);
    u.dead = true;
    if (c.hp <= 0) B.Game.castleDestroyed(ci);
  }

  function attack(u, t) {
    u.cdLeft = u.cd; u.atk = 0.25;
    const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
    u.atkDx = dx / d; u.atkDy = dy / d;
    const def = U[u.type];
    if (!def.ranged) { damage(t, u.dmg, u.owner); return; }
    B.G.projs.push({ owner: u.owner, x: u.x, y: u.y, tgt: t, tx: t.x, ty: t.y, dmg: u.dmg, splash: def.splash, kind: u.type, speed: def.splash ? 200 : 300, life: 2 });
  }

  function projImpact(p) {
    const G = B.G;
    if (p.splash) {
      FX.ring(p.tx, p.ty, '#c79bff', p.splash, 0.4); FX.burst(p.tx, p.ty, '#d9b8ff', 12, 140, 0.5, 3);
      for (const e of G.units) {
        if (e.dead || e.owner === p.owner) continue;
        const d = Math.hypot(e.x - p.tx, e.y - p.ty);
        if (d <= p.splash) damage(e, Math.round(p.dmg * (d < 10 ? 1 : 0.7)), p.owner);
      }
    } else if (p.tgt && !p.tgt.dead) damage(p.tgt, p.dmg, p.owner);
  }

  Battle.update = function (dt) {
    const G = B.G, us = G.units;
    for (const u of us) {
      if (u.dead) continue;
      u.spawnT = Math.min(1, u.spawnT + dt * 3);
      u.cdLeft -= dt; u.atk = Math.max(0, u.atk - dt); u.hit = Math.max(0, u.hit - dt * 5); u.phase += dt * 8;
      let best = null, bd = 1e9;
      for (const e of us) {
        if (e.dead || e.owner === u.owner) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) { bd = d; best = e; }
      }
      const detect = Math.max(u.range + 45, 120);
      const dir = u.owner === 0 ? -1 : 1;
      if (best && bd <= detect) {
        if (bd > u.range * 0.95) {
          const dx = best.x - u.x, dy = best.y - u.y;
          u.x += dx / bd * u.speed * dt; u.y += dy / bd * u.speed * dt;
        } else if (u.cdLeft <= 0) attack(u, best);
      } else {
        u.y += dir * u.speed * dt;
        u.x = Math.max(20, Math.min(CFG.W - 20, u.x));
      }
      if (u.owner === 0 ? u.y <= CFG.FRONT_Y[1] : u.y >= CFG.FRONT_Y[0]) castleHit(u);
      if (G.phase !== 'combat') return;
    }
    // soft separation so units don't stack
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j]; if (a.dead || b.dead) continue;
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.9;
      if (d < min && d > 0.01) {
        const push = (min - d) * 0.25; dx /= d; dy /= d;
        const ratio = a.owner === b.owner ? 1 : 0.35;
        a.x -= dx * push * ratio; a.y -= dy * push * ratio; b.x += dx * push * ratio; b.y += dy * push * ratio;
      }
    }
    for (const p of G.projs) {
      p.life -= dt;
      if (p.tgt && !p.tgt.dead) { p.tx = p.tgt.x; p.ty = p.tgt.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      p.ang = Math.atan2(dy, dx);
      if (d <= p.speed * dt + 5) { projImpact(p); p.life = 0; }
      else { p.x += dx / d * p.speed * dt; p.y += dy / d * p.speed * dt; }
    }
    for (let i = us.length - 1; i >= 0; i--) if (us[i].dead) us.splice(i, 1);
    for (let i = G.projs.length - 1; i >= 0; i--) if (G.projs[i].life <= 0) G.projs.splice(i, 1);
  };
})(window.BBB);
