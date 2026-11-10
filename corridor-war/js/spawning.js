// Corridor War — automatic unit production for both armies.
(function (CC) {
  'use strict';

  function unitStats(side, type) {
    const def = CC.CONFIG.units[type], P = CC.CONFIG.progression;
    const lvl = side.unitLevels[type] || 0;
    return {
      maxHp: def.hp * (1 + P.hpPerLevel * lvl) * side.mods.hp,
      dmg: def.dmg * (1 + P.dmgPerLevel * lvl) * side.mods.dmg,
    };
  }

  function initDeck(side, deck) {
    side.deck = deck.map((type, i) => ({ type, timer: 0.4 + i * 0.35 }));
  }

  function findSpawnPoint(b, side, i, n) {
    const map = b.map, base = side.base, ex = side.exitDir.x, ey = side.exitDir.y;
    const px = -ey, py = ex;
    for (let attempt = 0; attempt < 8; attempt++) {
      const lateral = (i - (n - 1) / 2) * 1.25 + (b.rng() - 0.5) * 6;
      const along = base.r + 1.8 + b.rng() * 3.5;
      const x = base.x + ex * along + px * lateral, y = base.y + ey * along + py * lateral;
      if (!map.isSolid(x, y) && map.wallDist[map.idx(x, y)] > 0.7) return { x, y };
    }
    return { x: base.x + ex * (base.r + 2.5) + (b.rng() - 0.5), y: base.y + ey * (base.r + 2.5) + (b.rng() - 0.5) };
  }

  function spawnUnit(b, side, type, i, n) {
    if (side.alive >= CC.CONFIG.sim.maxUnitsPerSide) return null;
    const def = CC.CONFIG.units[type], st = unitStats(side, type);
    const p = findSpawnPoint(b, side, i, n);
    const u = {
      id: b.nextId++, side: side.id, S: side, type, def,
      x: p.x, y: p.y, px: p.x, py: p.y, lx: p.x, ly: p.y, vx: 0, vy: 0,
      r: def.radius, mass: def.mass,
      hp: st.maxHp, maxHp: st.maxHp,
      cd: b.rng() * 0.3, target: null, retarget: b.rng() * CC.CONFIG.sim.retargetInterval, los: false, inRange: false,
      lane: b.rng() < 0.5 ? 0 : 1, ang: Math.atan2(side.exitDir.y, side.exitDir.x),
      flash: 0, swing: 0, dead: false, spawnT: 0,
    };
    b.units.push(u);
    side.alive++; side.spawned++;
    return u;
  }

  function update(b, side, dt) {
    for (const slot of side.deck) {
      slot.timer -= dt;
      if (slot.timer <= 0) {
        const def = CC.CONFIG.units[slot.type];
        slot.timer += def.spawn;
        const n = def.squad + side.mods.extraUnits;
        for (let i = 0; i < n; i++) spawnUnit(b, side, slot.type, i, n);
      }
    }
  }

  CC.Spawning = { initDeck, update, spawnUnit, unitStats };
})(globalThis.CC = globalThis.CC || {});
