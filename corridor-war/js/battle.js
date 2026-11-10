// Corridor War — battle simulation container. Deterministic, fixed timestep, no DOM.
// All player intent enters through battle.command(), so a network layer could later
// relay commands from a remote player instead of the local AI controller.
(function (CC) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function createSide(map, id, enemy, deck, unitLevels) {
    const B = CC.CONFIG.bases, pos = map.bases[id];
    const ey = map.center.y - pos.y;
    const side = {
      id, enemy, eco: CC.Economy.createSide(), unitLevels: Object.assign({}, unitLevels),
      base: { isBase: true, side: id, x: pos.x, y: pos.y, r: B.radius, hp: B.hp, maxHp: B.hp, flash: 0, dead: false },
      exitDir: { x: 0, y: Math.sign(ey) }, // corridors leave the base rooms vertically
      alive: 0, spawned: 0, kills: 0, lost: 0, deathLog: [], spawnLog: [],
    };
    side.mods = CC.Economy.mods(side.eco);
    CC.Spawning.initDeck(side, deck);
    return side;
  }

  /**
   * opts: { map, blueDeck, redDeck, blueLevels, redLevels, seed }
   */
  function create(opts) {
    const map = opts.map;
    const b = {
      map, time: 0, over: false, winner: null, nextId: 1,
      rng: mulberry32(opts.seed || ((Math.random() * 1e9) | 0)),
      units: [], projectiles: [], events: [], queue: [], controllers: [],
      hash: CC.Combat.createHash(map),
    };
    b.sides = {
      blue: createSide(map, 'blue', 'red', opts.blueDeck, opts.blueLevels || {}),
      red: createSide(map, 'red', 'blue', opts.redDeck, opts.redLevels || {}),
    };
    b.command = function (cmd) { b.queue.push(cmd); };
    return b;
  }

  function applyUpgrade(b, side, id) {
    if (!CC.Economy.buy(side.eco, id)) { b.events.push({ t: 'upgradeFail', side: side.id, id }); return; }
    const oldMods = side.mods;
    side.mods = CC.Economy.mods(side.eco);
    if (id === 'defense') {
      // existing units gain the extra max HP (and the same amount of current HP), no full heal
      const ratio = side.mods.hp / oldMods.hp;
      for (const u of b.units) if (u.side === side.id && !u.dead) {
        const nm = u.maxHp * ratio; u.hp += nm - u.maxHp; u.maxHp = nm;
      }
    }
    b.events.push({ t: 'upgrade', side: side.id, id, level: side.eco.levels[id] });
  }

  function step(b, dt) {
    if (b.over) return;
    b.time += dt;

    // commands (player UI, AI, or a future network peer)
    while (b.queue.length) {
      const c = b.queue.shift();
      if (c.type === 'upgrade' && b.sides[c.side]) applyUpgrade(b, b.sides[c.side], c.id);
    }

    for (const id of ['blue', 'red']) {
      const s = b.sides[id];
      CC.Economy.tick(s.eco, dt);
      const before = s.spawned;
      CC.Spawning.update(b, s, dt);
      if (s.spawned > before) s.spawnLog.push({ t: b.time, n: s.spawned - before });
      if (s.base.flash > 0) s.base.flash -= dt;
    }

    CC.Combat.updateUnits(b, dt);
    CC.Combat.updateProjectiles(b, dt);

    // remove the dead
    const units = b.units;
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (!u.dead) continue;
      const s = b.sides[u.side]; s.alive--; s.lost++; s.deathLog.push(b.time);
      units[i] = units[units.length - 1]; units.pop();
    }
    for (const id of ['blue', 'red']) {
      const s = b.sides[id];
      while (s.deathLog.length && s.deathLog[0] < b.time - 15) s.deathLog.shift();
      while (s.spawnLog.length && s.spawnLog[0].t < b.time - 15) s.spawnLog.shift();
    }

    for (const c of b.controllers) c.update(b, dt);

    for (const id of ['blue', 'red']) {
      if (b.sides[id].base.hp <= 0) { b.over = true; b.winner = b.sides[id].enemy; b.events.push({ t: 'over', winner: b.winner }); break; }
    }
  }

  CC.Battle = { create, step };
})(globalThis.CC = globalThis.CC || {});
