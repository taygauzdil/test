// Naval Draft — game data + headless battle simulation (no DOM; usable from node for balance tests)
(function (root) {
  const W = 10, H = 16; // battlefield size in tiles (portrait)

  // cost = Star cost. Power grows faster than linearly with cost.
  const UNITS = {
    deckhand:  { id: 'deckhand',  name: 'Deckhand',      icon: '🗡️', role: 'Melee',     cost: 3, hp: 70,  dmg: 9,  range: 0.9, spd: 2.2, cd: 0.8, aoe: 0,   price: 0,   desc: 'Cheap, reliable frontliner.' },
    raider:    { id: 'raider',    name: 'Cutlass Raider',icon: '⚔️', role: 'Melee',     cost: 4, hp: 100, dmg: 14, range: 0.9, spd: 2.3, cd: 0.8, aoe: 0,   price: 0,   desc: 'Fast and hard-hitting.' },
    guard:     { id: 'guard',     name: 'Shield Guard',  icon: '🛡️', role: 'Melee',     cost: 5, hp: 210, dmg: 8,  range: 0.9, spd: 1.8, cd: 0.9, aoe: 0,   price: 0,   desc: 'Tanky wall. Soaks damage.' },
    captain:   { id: 'captain',   name: 'Elite Captain', icon: '🏴‍☠️', role: 'Elite',     cost: 6, hp: 320, dmg: 24, range: 1.0, spd: 2.2, cd: 0.8, aoe: 0,   price: 290, desc: 'Elite duelist. Stronger than two cheap units.' },
    archer:    { id: 'archer',    name: 'Archer',        icon: '🏹', role: 'Archer',    cost: 3, hp: 40,  dmg: 10, range: 5,   spd: 1.8, cd: 1.0, aoe: 0,   price: 0,   desc: 'Ranged single-target damage.' },
    longbow:   { id: 'longbow',   name: 'Longbow',       icon: '🎯', role: 'Archer',    cost: 4, hp: 55,  dmg: 18, range: 6.5, spd: 1.8, cd: 1.1, aoe: 0,   price: 0,   desc: 'Longer range, harder hits.' },
    sharp:     { id: 'sharp',     name: 'Sharpshooter',  icon: '🔫', role: 'Archer',    cost: 5, hp: 60,  dmg: 32, range: 7.5, spd: 1.8, cd: 1.4, aoe: 0,   price: 200, desc: 'Deadly sniper.' },
    bomber:    { id: 'bomber',    name: 'Bomber',        icon: '💣', role: 'Bomber',    cost: 4, hp: 60,  dmg: 15, range: 3,   spd: 1.8, cd: 1.3, aoe: 1.4, price: 0,   desc: 'Area damage vs groups.' },
    grenadier: { id: 'grenadier', name: 'Grenadier',     icon: '🧨', role: 'Bomber',    cost: 5, hp: 75,  dmg: 25, range: 3.5, spd: 1.8, cd: 1.4, aoe: 1.7, price: 200, desc: 'Bigger blast radius.' },
    elitebomb: { id: 'elitebomb', name: 'Elite Bomber',  icon: '☄️', role: 'Elite',     cost: 6, hp: 110, dmg: 34, range: 4.5, spd: 1.8, cd: 1.4, aoe: 2.1, price: 290, desc: 'Elite AoE devastation.' },
    cannon:    { id: 'cannon',    name: 'Cannon',        icon: '💥', role: 'Artillery', cost: 7, hp: 90, dmg: 55, range: 9,   spd: 1.2, cd: 2.2, aoe: 2.0, price: 390, desc: 'Long-range explosive shells.' },
    mortar:    { id: 'mortar',    name: 'Siege Mortar',  icon: '🌋', role: 'Artillery', cost: 8, hp: 120, dmg: 85, range: 12,  spd: 1.0, cd: 2.6, aoe: 2.5, price: 510, desc: 'Extreme range, enormous blast.' },
    kraken:    { id: 'kraken',    name: 'Kraken Captain',icon: '🐙', role: 'Boss',      cost: 0, hp: 1100,dmg: 45, range: 5,   spd: 1.0, cd: 1.6, aoe: 2.0, price: 0,   desc: 'Boss.' },
  };
  const ORDER = Object.keys(UNITS).filter(k => k !== 'kraken');
  const STARTER = ['deckhand', 'raider', 'guard', 'archer', 'longbow', 'bomber'];
  const WAVES = 5;
  const BUDGET = 20;

  // Enemy fleet composition per wave
  const ENEMY_BUDGET = [14, 18, 24, 31, 27];
  const ENEMY_POOLS = [
    ['deckhand', 'archer', 'bomber', 'raider'],
    ['deckhand', 'raider', 'archer', 'longbow', 'bomber'],
    ['raider', 'guard', 'longbow', 'bomber', 'grenadier'],
    ['raider', 'guard', 'longbow', 'grenadier', 'captain', 'cannon'],
    ['raider', 'guard', 'longbow', 'grenadier'],
  ];

  function rnd(rng) { return (rng || Math.random)(); }

  function genEnemies(wave, rng) { // wave 1-based -> [{id, mult}]
    const out = [];
    let left = ENEMY_BUDGET[wave - 1];
    const pool = ENEMY_POOLS[wave - 1];
    const mult = 1 + 0.05 * (wave - 1);
    if (wave === WAVES) out.push({ id: 'kraken', mult: 1 });
    let guard = 50;
    while (guard-- > 0) {
      const fit = pool.filter(id => UNITS[id].cost <= left);
      if (!fit.length) break;
      const id = fit[Math.floor(rnd(rng) * fit.length)];
      left -= UNITS[id].cost;
      out.push({ id, mult });
    }
    return out;
  }

  let uidCounter = 1;
  function makeUnit(team, id, hp, maxHp, mult) {
    const d = UNITS[id];
    mult = mult || 1;
    const mh = maxHp || Math.round(d.hp * mult);
    return { uid: uidCounter++, team, id, def: d, hp: hp == null ? mh : hp, maxHp: mh, dmgMul: mult, x: 0, y: 0, cd: Math.random() * 0.5, alive: true, flash: 0, srcUid: null };
  }

  // players: [{uid,id,hp,maxHp}], enemies: [{id,mult}]
  function createBattle(players, enemies) {
    const units = [];
    const place = (list, team) => {
      const rows = { front: [], mid: [], back: [] };
      for (const u of list) {
        const r = u.def.role;
        (r === 'Melee' || r === 'Elite' && u.def.range < 2 || r === 'Boss' ? rows.front : r === 'Artillery' ? rows.back : rows.mid).push(u);
      }
      const ys = { front: 10.2, mid: 12.4, back: 14.4 };
      for (const k of Object.keys(rows)) {
        const arr = rows[k];
        arr.forEach((u, i) => {
          const per = 7; // max per row before staggering
          const n = Math.min(arr.length, per);
          const col = i % per, rowOff = Math.floor(i / per) * 0.9;
          u.x = 1 + (col + 0.5) / n * 8;
          const y = ys[k] + rowOff;
          u.y = team === 'p' ? y : H - y;
        });
      }
    };
    const pu = players.map(p => { const u = makeUnit('p', p.id, p.hp, p.maxHp); u.srcUid = p.uid; return u; });
    const eu = enemies.map(e => makeUnit('e', e.id, null, null, e.mult));
    place(pu, 'p'); place(eu, 'e');
    units.push(...pu, ...eu);
    return { units, events: [], t: 0, winner: null };
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function step(s, dt) {
    if (s.winner) return;
    s.t += dt;
    const alive = s.units.filter(u => u.alive);
    for (const u of alive) {
      if (!u.alive) continue;
      u.cd -= dt; u.flash = Math.max(0, u.flash - dt);
      let target = null, bd = 1e9;
      for (const o of alive) {
        if (!o.alive || o.team === u.team) continue;
        const d = dist(u, o);
        if (d < bd) { bd = d; target = o; }
      }
      if (!target) continue;
      const d = u.def;
      if (bd <= d.range) {
        if (u.cd <= 0) {
          u.cd = d.cd;
          const dmg = d.dmg * u.dmgMul;
          if (d.aoe > 0) {
            for (const o of alive) {
              if (o.alive && o.team !== u.team && dist(o, target) <= d.aoe) hit(o, dmg);
            }
            s.events.push({ k: 'boom', x: target.x, y: target.y, r: d.aoe, fx: u.x, fy: u.y, t: 0 });
          } else {
            hit(target, dmg);
            s.events.push({ k: d.range > 2 ? 'arrow' : 'slash', x: target.x, y: target.y, fx: u.x, fy: u.y, team: u.team, t: 0 });
          }
        }
      } else {
        const mv = d.spd * dt;
        u.x += (target.x - u.x) / bd * mv;
        u.y += (target.y - u.y) / bd * mv;
      }
    }
    // separation
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i]; if (!a.alive) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = (a.id === 'kraken' || b.id === 'kraken') ? 1.1 : 0.7;
        if (d < min && d > 0.0001) {
          const push = (min - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
    for (const u of alive) { u.x = Math.max(0.4, Math.min(W - 0.4, u.x)); u.y = Math.max(0.4, Math.min(H - 0.4, u.y)); }
    const pa = s.units.some(u => u.alive && u.team === 'p');
    const ea = s.units.some(u => u.alive && u.team === 'e');
    if (!ea) s.winner = 'p'; else if (!pa) s.winner = 'e';
    else if (s.t > 120) s.winner = 'e';
  }

  function hit(u, dmg) {
    u.hp -= dmg; u.flash = 0.12;
    if (u.hp <= 0) { u.hp = 0; u.alive = false; }
  }

  const api = { W, H, UNITS, ORDER, STARTER, WAVES, BUDGET, genEnemies, createBattle, step, ENEMY_BUDGET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
