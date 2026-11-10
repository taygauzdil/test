// Corridor War — targeting, crowd movement, attacks, projectiles and damage.
// Crowd movement = flow-field steering + spatial-hash separation + grid wall collision
// (cheap enough for well over a thousand simultaneous units).
(function (CC) {
  'use strict';

  // ---------- spatial hash ----------
  function createHash(map) {
    const bs = CC.CONFIG.sim.bucketSize;
    const bw = Math.ceil(map.W / bs), bh = Math.ceil(map.H / bs);
    return { bs, bw, bh, head: new Int32Array(bw * bh), next: new Int32Array(4096) };
  }
  function rebuildHash(h, units) {
    h.head.fill(-1);
    if (h.next.length < units.length) h.next = new Int32Array(units.length * 2);
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      let bx = (u.x / h.bs) | 0, by = (u.y / h.bs) | 0;
      if (bx < 0) bx = 0; else if (bx >= h.bw) bx = h.bw - 1;
      if (by < 0) by = 0; else if (by >= h.bh) by = h.bh - 1;
      const k = by * h.bw + bx; h.next[i] = h.head[k]; h.head[k] = i;
    }
  }

  // ---------- damage ----------
  function applyDamage(b, target, dmg, attackerSide) {
    if (target.isBase) {
      if (target.hp <= 0) return;
      target.hp = Math.max(0, target.hp - dmg); target.flash = 0.15;
      b.events.push({ t: 'baseHit', side: target.side, x: target.x, y: target.y, v: dmg });
      return;
    }
    if (target.dead) return;
    target.hp -= dmg; target.flash = 0.12;
    b.events.push({ t: 'hit', x: target.x, y: target.y, v: dmg, side: target.side });
    if (target.hp <= 0) {
      target.dead = true;
      b.sides[attackerSide].kills++;
      b.events.push({ t: 'death', x: target.x, y: target.y, side: target.side, type: target.type });
    }
  }

  // ---------- targeting ----------
  function retarget(b, u) {
    const h = b.hash, units = b.units, det = Math.max(CC.CONFIG.sim.detectRange, u.def.range + 2);
    const br = Math.ceil(det / h.bs);
    const cx = (u.x / h.bs) | 0, cy = (u.y / h.bs) | 0;
    let best = null, bestD = det * det;
    for (let by = Math.max(0, cy - br); by <= Math.min(h.bh - 1, cy + br); by++)
      for (let bx = Math.max(0, cx - br); bx <= Math.min(h.bw - 1, cx + br); bx++) {
        for (let j = h.head[by * h.bw + bx]; j !== -1; j = h.next[j]) {
          const e = units[j]; if (e.side === u.side || e.dead) continue;
          const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = e; }
        }
      }
    if (best) { u.target = best; u.los = b.map.los(u.x, u.y, best.x, best.y); return; }
    const eb = b.sides[u.S.enemy].base;
    const d = Math.hypot(eb.x - u.x, eb.y - u.y) - eb.r;
    if (d < det) { u.target = eb; u.los = b.map.los(u.x, u.y, eb.x, eb.y); return; }
    u.target = null;
  }

  // ---------- projectiles ----------
  const PROJ_SPEED = { arrow: 24, bullet: 46, bomb: 13 };
  function fire(b, u, target, dmg) {
    const kind = u.def.projectile;
    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    b.projectiles.push({
      kind, side: u.side, x: u.x, y: u.y, sx: u.x, sy: u.y, tx: target.x, ty: target.y,
      target, dmg, aoe: u.def.aoe || 0, t: 0, dur: Math.max(0.08, dist / PROJ_SPEED[kind] + (kind === 'bomb' ? 0.25 : 0)),
    });
  }

  function updateProjectiles(b, dt) {
    const ps = b.projectiles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.kind !== 'bomb' && p.target && !p.target.dead && !p.target.isBase) { p.tx = p.target.x; p.ty = p.target.y; }
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
      if (k < 1) continue;
      if (p.kind === 'bomb') explode(b, p);
      else if (p.target && (p.target.isBase || !p.target.dead)) applyDamage(b, p.target, p.dmg, p.side);
      ps[i] = ps[ps.length - 1]; ps.pop();
    }
  }

  function explode(b, p) {
    b.events.push({ t: 'boom', x: p.x, y: p.y, r: p.aoe, side: p.side });
    const h = b.hash, units = b.units, r2 = p.aoe * p.aoe, br = Math.ceil(p.aoe / h.bs);
    const cx = (p.x / h.bs) | 0, cy = (p.y / h.bs) | 0;
    for (let by = Math.max(0, cy - br); by <= Math.min(h.bh - 1, cy + br); by++)
      for (let bx = Math.max(0, cx - br); bx <= Math.min(h.bw - 1, cx + br); bx++)
        for (let j = h.head[by * h.bw + bx]; j !== -1; j = h.next[j]) {
          const e = units[j]; if (e.side === p.side || e.dead) continue;
          const dx = e.x - p.x, dy = e.y - p.y;
          if (dx * dx + dy * dy <= r2 + e.r * e.r) applyDamage(b, e, p.dmg, p.side);
        }
    const eb = b.sides[b.sides[p.side].enemy].base;
    if (Math.hypot(eb.x - p.x, eb.y - p.y) <= p.aoe + eb.r) applyDamage(b, eb, p.dmg, p.side);
  }

  // ---------- units ----------
  function updateUnits(b, dt) {
    const S = CC.CONFIG.sim, map = b.map, units = b.units, h = b.hash;
    rebuildHash(h, units);
    const steer = Math.min(1, S.steerResponse * dt);

    // 1) decide: target, desired velocity, attack
    for (let i = 0; i < units.length; i++) {
      const u = units[i]; if (u.dead) continue;
      const side = u.S, mods = side.mods, def = u.def;
      u.px = u.x; u.py = u.y; u.spawnT += dt;
      if (u.flash > 0) u.flash -= dt;
      if (u.swing > 0) u.swing -= dt;

      u.retarget -= dt;
      if (u.retarget <= 0 || (u.target && (u.target.dead || (u.target.isBase && u.target.hp <= 0)))) {
        u.retarget = S.retargetInterval; retarget(b, u);
      }

      let dx = 0, dy = 0; u.inRange = false;
      const t = u.target;
      if (t) {
        const tx = t.x - u.x, ty = t.y - u.y, d = Math.hypot(tx, ty) || 1e-6;
        const reach = def.range + u.r + t.r;
        if (d <= reach && (u.los || d < u.r + t.r + 0.6)) {
          u.inRange = true; u.ang = Math.atan2(ty, tx);
          if (def.range < 1) { dx = tx / d * 0.15; dy = ty / d * 0.15; } // melee keeps leaning in
        } else if (u.los) { dx = tx / d; dy = ty / d; }
        else {
          const ef = map.fields[side.enemy][u.lane], k = map.idx(u.x, u.y);
          const goingForward = t.isBase || ef.dist[map.idx(t.x, t.y)] <= ef.dist[k];
          const f = goingForward ? ef : map.fields[side.id][2];
          dx = f.fx[k]; dy = f.fy[k];
        }
      } else {
        const f = map.fields[side.enemy][u.lane], k = map.idx(u.x, u.y);
        dx = f.fx[k]; dy = f.fy[k];
      }

      const sp = def.move * mods.speed;
      u.vx += (dx * sp - u.vx) * steer; u.vy += (dy * sp - u.vy) * steer;
      u.x += u.vx * dt; u.y += u.vy * dt;
      if (!u.inRange && (u.vx * u.vx + u.vy * u.vy) > 0.05) u.ang = Math.atan2(u.vy, u.vx);

      // attack
      if (u.cd > 0) u.cd -= dt * mods.atk;
      if (u.inRange && u.cd <= 0) {
        u.cd += 1 / def.atkSpeed; if (u.cd < 0) u.cd = 0;
        u.swing = 0.16;
        const dmg = def.dmg * (1 + CC.CONFIG.progression.dmgPerLevel * (side.unitLevels[u.type] || 0)) * mods.dmg;
        if (def.projectile) fire(b, u, t, dmg); else applyDamage(b, t, dmg, side.id);
      }
    }

    // 2) separation (friend & foe) — positional, mass weighted
    const sepK = S.separationStrength;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]; if (u.dead) continue;
      const cx = (u.x / h.bs) | 0, cy = (u.y / h.bs) | 0;
      for (let by = Math.max(0, cy - 1); by <= Math.min(h.bh - 1, cy + 1); by++)
        for (let bx = Math.max(0, cx - 1); bx <= Math.min(h.bw - 1, cx + 1); bx++)
          for (let j = h.head[by * h.bw + bx]; j !== -1; j = h.next[j]) {
            if (j <= i) continue;
            const o = units[j]; if (o.dead) continue;
            let dx = o.x - u.x, dy = o.y - u.y; const rr = u.r + o.r, d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            let d = Math.sqrt(d2);
            if (d < 1e-4) { dx = (u.id % 7) - 3 + 0.5; dy = (o.id % 5) - 2 + 0.5; d = Math.hypot(dx, dy); }
            const ov = (rr - d) * sepK, nx = dx / d, ny = dy / d, mt = u.mass + o.mass;
            const ku = ov * (o.mass / mt), ko = ov * (u.mass / mt);
            u.x -= nx * ku; u.y -= ny * ku; o.x += nx * ko; o.y += ny * ko;
            // friendly sidestep: the moving unit slides around a friend in front of it
            if (u.side === o.side) {
              const tx = -ny, ty = nx;
              const s = (u.vx * tx + u.vy * ty) >= 0 ? 1 : -1;
              if (!u.inRange && u.vx * nx + u.vy * ny > 0) { u.x += tx * s * ov * 0.35; u.y += ty * s * ov * 0.35; }
              if (!o.inRange && -(o.vx * nx + o.vy * ny) > 0) { o.x -= tx * s * ov * 0.35; o.y -= ty * s * ov * 0.35; }
            }
          }
    }

    // 3) bases are solid; walls are solid
    const bases = [b.sides.blue.base, b.sides.red.base];
    for (let i = 0; i < units.length; i++) {
      const u = units[i]; if (u.dead) continue;
      for (const bs of bases) {
        const dx = u.x - bs.x, dy = u.y - bs.y, rr = bs.r + u.r, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3; u.x = bs.x + dx / d * rr; u.y = bs.y + dy / d * rr; }
      }
      map.resolveCircle(u);
      if (map.isSolid(u.x, u.y)) { u.x = u.lx; u.y = u.ly; u.vx *= -0.2; u.vy *= -0.2; }
      else { u.lx = u.x; u.ly = u.y; }
    }
  }

  CC.Combat = { createHash, updateUnits, updateProjectiles, applyDamage };
})(globalThis.CC = globalThis.CC || {});
