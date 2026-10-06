// Naval Draft — game data + headless battle simulation (no DOM; usable from node for balance tests)
(function (root) {
  const W = 10, H = 16; // battlefield size in tiles (portrait)

  // cost = Star cost. Power grows faster than linearly with cost.
  const UNITS = {
    deckhand:  { id: 'deckhand',  name: 'Deckhand',      icon: '🗡️', role: 'Melee',     cost: 3, hp: 70,  dmg: 9,  range: 1.3, spd: 2.2, cd: 0.8, aoe: 0,   price: 0,   desc: 'Cheap, reliable frontliner.' },
    raider:    { id: 'raider',    name: 'Cutlass Raider',icon: '⚔️', role: 'Melee',     cost: 4, hp: 100, dmg: 14, range: 1.3, spd: 2.3, cd: 0.8, aoe: 0,   price: 0,   desc: 'Fast and hard-hitting.' },
    guard:     { id: 'guard',     name: 'Shield Guard',  icon: '🛡️', role: 'Melee',     cost: 5, hp: 210, dmg: 8,  range: 1.3, spd: 1.8, cd: 0.9, aoe: 0,   price: 0,   desc: 'Tanky wall. Soaks damage.' },
    captain:   { id: 'captain',   name: 'Elite Captain', icon: '🏴‍☠️', role: 'Elite',     cost: 6, hp: 270, dmg: 22, range: 1.4, spd: 2.2, cd: 0.8, aoe: 0,   price: 290, desc: 'Elite duelist. Stronger than two cheap units.' },
    archer:    { id: 'archer',    name: 'Archer',        icon: '🏹', role: 'Archer',    cost: 3, hp: 40,  dmg: 10, range: 5,   spd: 1.8, cd: 1.0, aoe: 0,   price: 0,   desc: 'Ranged single-target damage.' },
    longbow:   { id: 'longbow',   name: 'Longbow',       icon: '🎯', role: 'Archer',    cost: 4, hp: 55,  dmg: 18, range: 6.5, spd: 1.8, cd: 1.1, aoe: 0,   price: 0,   desc: 'Longer range, harder hits.' },
    sharp:     { id: 'sharp',     name: 'Sharpshooter',  icon: '🔫', role: 'Archer',    cost: 5, hp: 60,  dmg: 32, range: 7.5, spd: 1.8, cd: 1.4, aoe: 0,   price: 200, desc: 'Deadly sniper.' },
    bomber:    { id: 'bomber',    name: 'Bomber',        icon: '💣', role: 'Bomber',    cost: 4, hp: 60,  dmg: 15, range: 3,   spd: 1.8, cd: 1.3, aoe: 1.4, price: 0,   desc: 'Area damage vs groups.' },
    grenadier: { id: 'grenadier', name: 'Grenadier',     icon: '🧨', role: 'Bomber',    cost: 5, hp: 75,  dmg: 25, range: 3.5, spd: 1.8, cd: 1.4, aoe: 1.7, price: 200, desc: 'Bigger blast radius.' },
    elitebomb: { id: 'elitebomb', name: 'Elite Bomber',  icon: '☄️', role: 'Elite',     cost: 6, hp: 100, dmg: 29, range: 4.5, spd: 1.8, cd: 1.4, aoe: 2.1, price: 290, desc: 'Elite AoE devastation.' },
    cannon:    { id: 'cannon',    name: 'Cannon',        icon: '💥', role: 'Artillery', cost: 7, hp: 90, dmg: 46, range: 9,   spd: 1.2, cd: 2.2, aoe: 2.0, price: 390, desc: 'Long-range explosive shells.' },
    mortar:    { id: 'mortar',    name: 'Siege Mortar',  icon: '🌋', role: 'Artillery', cost: 8, hp: 115, dmg: 72, range: 12,  spd: 1.0, cd: 2.6, aoe: 2.5, price: 510, desc: 'Extreme range, enormous blast.' },
  };
  // Every unit has its own attack. spd = projectile speed in tiles/s (none = instant melee), arc = lob height in tiles.
  const SHOTS = {
    deckhand: { k: 'slash' }, raider: { k: 'slash2' }, guard: { k: 'bash' }, captain: { k: 'saber' },
    archer: { k: 'arrow', spd: 11, arc: 0.4 }, longbow: { k: 'longarrow', spd: 15, arc: 0.6 }, sharp: { k: 'bullet', spd: 34, arc: 0 },
    bomber: { k: 'bomb', spd: 6, arc: 1.3 }, grenadier: { k: 'grenade', spd: 7, arc: 1.1 }, elitebomb: { k: 'comet', spd: 9, arc: 1.8 },
    cannon: { k: 'ball', spd: 15, arc: 1.2 }, mortar: { k: 'shell', spd: 9, arc: 3.2 },
  };
  for (const id in SHOTS) UNITS[id].shot = SHOTS[id];
  const ORDER = Object.keys(UNITS);
  const STARTER = ['deckhand', 'raider', 'guard', 'archer', 'longbow', 'bomber'];
  const WAVES = 5;
  const BUDGET = 10;
  const ROUNDS = 5, WIN_ROUNDS = 3;

  function rnd(rng) { return (rng || Math.random)(); }
  function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(rng) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Opponent AI: builds a deck, then drafts each round with the same rules as the player.
  function genOpponentDeck(ownedIds, rng) {
    const owned = ownedIds.slice();
    const extra = ORDER.filter(id => !owned.includes(id) && UNITS[id].cost <= 5);
    const pool = owned.concat(shuffle(extra, rng).slice(0, 1));
    const deck = [];
    for (const id of shuffle(pool.concat(pool), rng)) {
      if (deck.length >= 9) break;
      if (deck.filter(x => x === id).length < 2) deck.push(id);
    }
    return deck;
  }
  // Returns the unit ids the bot recruits this round (cards it saw and discarded are gone, same as for the player).
  function draftBot(deck, budget, rng) {
    let pool = shuffle(deck, rng), got = [];
    while (budget > 0) {
      pool = pool.filter(id => UNITS[id].cost <= budget);
      if (!pool.length) break;
      const id = pool.shift(), c = UNITS[id].cost;
      // takes strong cards, gambles on cheap ones when there is room for a better pair
      if (c >= 5 || budget - c <= 2 || rnd(rng) < 0.55) { budget -= c; got.push(id); }
    }
    return got;
  }

  let uidCounter = 1;
  function makeUnit(team, id, hp, maxHp) {
    const d = UNITS[id];
    const mh = maxHp || d.hp;
    return { uid: uidCounter++, team, id, def: d, hp: hp == null ? mh : hp, maxHp: mh, dmgMul: 1, x: 0, y: 0, cd: Math.random() * 0.5, alive: true, flash: 0, srcUid: null };
  }

  // players / enemies: [{uid,id,hp,maxHp}] (both sides persist between rounds)
  function createBattle(players, enemies) {
    const units = [];
    const place = (list, team) => {
      const rows = { front: [], mid: [], back: [] };
      for (const u of list) {
        const r = u.def.role;
        (r === 'Melee' || r === 'Elite' && u.def.range < 2 ? rows.front : r === 'Artillery' ? rows.back : rows.mid).push(u);
      }
      const ys = { front: 9.6, mid: 11.4, back: 13.2 };
      for (const k of Object.keys(rows)) {
        const arr = rows[k];
        arr.forEach((u, i) => {
          const per = 6; // max per row before staggering
          const n = Math.min(arr.length, per);
          const col = i % per, rowOff = Math.floor(i / per) * 1.5;
          u.x = 1 + (col + 0.5) / n * 8;
          const y = ys[k] + rowOff;
          u.y = team === 'p' ? y : H - y;
        });
      }
    };
    const pu = players.map(p => { const u = makeUnit('p', p.id, p.hp, p.maxHp); u.srcUid = p.uid; return u; });
    const eu = enemies.map(e => { const u = makeUnit('e', e.id, e.hp, e.maxHp); u.srcUid = e.uid; return u; });
    place(pu, 'p'); place(eu, 'e');
    units.push(...pu, ...eu);
    return { units, events: [], proj: [], t: 0, winner: null };
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
          const dmg = d.dmg * u.dmgMul, sh = d.shot;
          s.events.push({ k: 'muzzle', shot: sh.k, x: u.x, y: u.y, tx: target.x, ty: target.y, team: u.team, t: 0, dur: 0.3 });
          if (sh.spd) {
            const dd = Math.max(0.5, dist(u, target));
            s.proj.push({ shot: sh.k, arc: sh.arc, team: u.team, sx: u.x, sy: u.y, x: u.x, y: u.y, tx: target.x, ty: target.y, tgt: target, dmg, aoe: d.aoe, dur: dd / sh.spd, t: 0 });
          } else {
            hit(target, dmg);
            s.events.push({ k: 'melee', shot: sh.k, x: target.x, y: target.y, fx: u.x, fy: u.y, team: u.team, t: 0, dur: 0.3 });
          }
        }
      } else {
        const mv = d.spd * dt;
        u.x += (target.x - u.x) / bd * mv;
        u.y += (target.y - u.y) / bd * mv;
      }
    }
    // projectiles in flight
    for (const p of s.proj) {
      p.t += dt;
      if (p.tgt && p.tgt.alive && !p.aoe) { p.tx = p.tgt.x; p.ty = p.tgt.y; } // single-target shots track their ship
      const f = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * f; p.y = p.sy + (p.ty - p.sy) * f; p.f = f;
      if (f >= 1) {
        p.done = true;
        if (p.aoe > 0) {
          for (const o of s.units) if (o.alive && o.team !== p.team && Math.hypot(o.x - p.tx, o.y - p.ty) <= p.aoe) hit(o, p.dmg);
          s.events.push({ k: 'boom', shot: p.shot, x: p.tx, y: p.ty, r: p.aoe, t: 0, dur: 0.55 });
        } else {
          if (p.tgt.alive) hit(p.tgt, p.dmg);
          s.events.push({ k: 'impact', shot: p.shot, x: p.tx, y: p.ty, t: 0, dur: 0.3 });
        }
      }
    }
    s.proj = s.proj.filter(p => !p.done);
    // separation
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i]; if (!a.alive) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = a.team === b.team ? 1.0 : 0.55;
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
    else if (s.t > 90) {
      const hp = t => s.units.filter(u => u.alive && u.team === t).reduce((x, u) => x + u.hp, 0);
      s.winner = hp('p') >= hp('e') ? 'p' : 'e';
    }
  }

  function hit(u, dmg) {
    u.hp -= dmg; u.flash = 0.12;
    if (u.hp <= 0) { u.hp = 0; u.alive = false; }
  }

  const api = { W, H, UNITS, ORDER, STARTER, WAVES, BUDGET, SHOTS, ROUNDS, WIN_ROUNDS, genOpponentDeck, draftBot, createBattle, step };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
