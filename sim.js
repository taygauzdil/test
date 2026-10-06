// Naval Draft — game data + headless battle simulation (no DOM; usable from node for balance tests)
(function (root) {
  const W = 10, H = 16; // battlefield size in tiles (portrait)

  // cost = Star cost. Power grows faster than linearly with cost.
  const UNITS = {
    // Every ship shoots. Rule of thumb: the further it reaches, the less each shot hurts (front = leads the formation).
    deckhand:  { id: 'deckhand',  name: 'Pistol Deckhand',   icon: '🗡️', role: 'Gunboat',   front: true, cost: 3, hp: 70,  dmg: 11, range: 3,   spd: 2.2, cd: 0.9, aoe: 0,   price: 0,   desc: 'Cheap brawler. Pistols hit hard up close.' },
    raider:    { id: 'raider',    name: 'Blunderbuss Raider',icon: '⚔️', role: 'Gunboat',   front: true, cost: 4, hp: 100, dmg: 22, range: 2.5, spd: 2.3, cd: 1.2, aoe: 0,   price: 0,   desc: 'Shortest reach, heavy scatter blast.' },
    guard:     { id: 'guard',     name: 'Shield Guard',      icon: '🛡️', role: 'Gunboat',   front: true, cost: 5, hp: 210, dmg: 12, range: 3.5, spd: 1.8, cd: 1.0, aoe: 0,   price: 0,   desc: 'Armored wall with a swivel gun.' },
    captain:   { id: 'captain',   name: 'Elite Captain',     icon: '🏴‍☠️', role: 'Elite',     front: true, cost: 6, hp: 270, dmg: 34, range: 4,   spd: 2.2, cd: 1.0, aoe: 0,   price: 290, desc: 'Elite duelist with a flintlock cannon.' },
    archer:    { id: 'archer',    name: 'Archer',            icon: '🏹', role: 'Archer',    cost: 3, hp: 45,  dmg: 8,  range: 5,   spd: 1.8, cd: 0.9, aoe: 0,   price: 0,   desc: 'Mid range, light arrows.' },
    longbow:   { id: 'longbow',   name: 'Longbow',           icon: '🎯', role: 'Archer',    cost: 4, hp: 55,  dmg: 11, range: 6.5, spd: 1.8, cd: 0.9, aoe: 0,   price: 0,   desc: 'Long range, weaker arrows.' },
    sharp:     { id: 'sharp',     name: 'Sharpshooter',      icon: '🔫', role: 'Archer',    cost: 5, hp: 60,  dmg: 18, range: 8.5, spd: 1.8, cd: 1.1, aoe: 0,   price: 200, desc: 'Sniper. Longest reach, lighter bullets.' },
    bomber:    { id: 'bomber',    name: 'Bomber',            icon: '💣', role: 'Bomber',    cost: 4, hp: 60,  dmg: 18, range: 3,   spd: 1.8, cd: 1.3, aoe: 1.4, price: 0,   desc: 'Lobbed bombs, area damage.' },
    grenadier: { id: 'grenadier', name: 'Grenadier',         icon: '🧨', role: 'Bomber',    cost: 5, hp: 75,  dmg: 25, range: 3.5, spd: 1.8, cd: 1.4, aoe: 1.7, price: 200, desc: 'Bigger blast radius.' },
    elitebomb: { id: 'elitebomb', name: 'Elite Bomber',      icon: '☄️', role: 'Elite',     cost: 6, hp: 100, dmg: 29, range: 4.5, spd: 1.8, cd: 1.4, aoe: 2.1, price: 290, desc: 'Fire comets. Elite area damage.' },
    cannon:    { id: 'cannon',    name: 'Cannon',            icon: '💥', role: 'Artillery', cost: 7, hp: 90,  dmg: 56, range: 8,   spd: 1.2, cd: 2.2, aoe: 2.0, price: 390, desc: 'Heavy shells from afar.' },
    mortar:    { id: 'mortar',    name: 'Siege Mortar',      icon: '🌋', role: 'Artillery', cost: 8, hp: 125, dmg: 52, range: 11,  spd: 1.0, cd: 2.4, aoe: 3.0, price: 510, desc: 'Extreme range, huge blast, lighter hit.' },
  };
  // Every unit has its own attack. spd = projectile speed in tiles/s (none = instant melee), arc = lob height in tiles.
  const SHOTS = {
    deckhand: { k: 'pistol', spd: 22, arc: 0 }, raider: { k: 'scatter', spd: 16, arc: 0 }, guard: { k: 'swivel', spd: 14, arc: 0.2 }, captain: { k: 'flintlock', spd: 26, arc: 0 },
    archer: { k: 'arrow', spd: 11, arc: 0.4 }, longbow: { k: 'longarrow', spd: 15, arc: 0.6 }, sharp: { k: 'bullet', spd: 34, arc: 0 },
    bomber: { k: 'bomb', spd: 6, arc: 1.3 }, grenadier: { k: 'grenade', spd: 7, arc: 1.1 }, elitebomb: { k: 'comet', spd: 9, arc: 1.8 },
    cannon: { k: 'ball', spd: 15, arc: 1.2 }, mortar: { k: 'shell', spd: 9, arc: 3.2 },
  };
  for (const id in SHOTS) UNITS[id].shot = SHOTS[id];
  const ORDER = Object.keys(UNITS);
  const STARTER = ['deckhand', 'raider', 'guard', 'archer', 'longbow', 'bomber'];
  const WAVES = 5;
  const BUDGETS = [10, 15, 20, 25, 30]; // star budget per round
  // bigger budgets need a bigger card pool: the deck is shuffled in this many times per round
  const poolCopies = b => Math.ceil(b / 12);
  // A round's card pool: random draws (with replacement) from the deck, so a card can show up several times or not at all.
  function drawPool(deck, budget, rng) {
    return Array.from({ length: deck.length * poolCopies(budget) }, () => deck[Math.floor(rnd(rng) * deck.length)]);
  }
  const MAX_DISCARDS = 3; // discards allowed per round
  const budgetFor = r => BUDGETS[Math.min(r, BUDGETS.length) - 1];
  const ROUNDS = 5, WIN_ROUNDS = 3;

  function rnd(rng) { return (rng || Math.random)(); }
  function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(rng) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Opponent AI: builds a deck, then drafts each round with the same rules as the player.
  function genOpponentDeck(ownedIds, rng) {
    const owned = ownedIds.slice();
    const extra = ORDER.filter(id => !owned.includes(id) && UNITS[id].cost <= 5);
    const pool = owned.concat(shuffle(extra, rng).slice(0, owned.length > 8 ? 1 : 0));
    const deck = shuffle(pool, rng).slice(0, 5); // one copy of each card, like the player's deck
    return deck;
  }
  // Returns the unit ids the bot recruits this round (cards it saw and discarded are gone, same as for the player).
  // A rival that drafts one card at a time, like the player. step() -> {id, recruit} or null when it has nothing left that fits.
  function createBot(deck, budget, rng) {
    return {
      budget, discards: MAX_DISCARDS, pool: drawPool(deck, budget, rng), done: false,
      step() {
        this.pool = this.pool.filter(id => UNITS[id].cost <= this.budget);
        if (!this.pool.length) { this.done = true; return null; }
        const id = this.pool.shift(), c = UNITS[id].cost;
        // takes strong cards, gambles on cheap ones when there is room for a better pair
        const want = c >= 5 || this.budget - c <= 2 || rnd(rng) < 0.55;
        if (want || this.discards <= 0) { this.budget -= c; return { id, recruit: true }; }
        this.discards--; return { id, recruit: false };
      },
    };
  }
  function draftBot(deck, budget, rng) {
    const bot = createBot(deck, budget, rng), got = [];
    for (let r = bot.step(); r; r = bot.step()) if (r.recruit) got.push(r.id);
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
    // Fleets start at the screen edges: yours at the bottom, the rival's at the top.
    // Gunboats lead (closest to the middle), then archers/bombers, artillery at the back.
    const place = (list, team) => {
      const rows = formationRows(list);
      rows.forEach((row, ri) => row.forEach((u, i) => {
        u.x = 1 + (i + 0.5) / row.length * 8;
        const d = 0.9 + (rows.length - 1 - ri) * 1.1; // distance from our own edge
        u.y = team === 'p' ? H - d : d;
      }));
    };
    const pu = players.map(p => { const u = makeUnit('p', p.id, p.hp, p.maxHp); u.srcUid = p.uid; return u; });
    const eu = enemies.map(e => { const u = makeUnit('e', e.id, e.hp, e.maxHp); u.srcUid = e.uid; return u; });
    place(pu, 'p'); place(eu, 'e');
    units.push(...pu, ...eu);
    return { units, events: [], proj: [], t: 0, winner: null };
  }

  // Splits ships (anything with .def) into formation rows: melee first, artillery last, up to 8 per row.
  function formationRows(list) {
    const rank = d => d.front ? 0 : d.role === 'Artillery' ? 2 : 1;
    const rows = [];
    for (let g = 0; g < 3; g++) {
      const grp = list.filter(u => rank(u.def) === g);
      for (let i = 0; i < grp.length; i += 8) rows.push(grp.slice(i, i + 8));
    }
    return rows;
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
          s.events.push({ k: 'muzzle', uid: u.uid, shot: sh.k, x: u.x, y: u.y, tx: target.x, ty: target.y, team: u.team, t: 0, dur: 0.3 });
          if (sh.spd) {
            const dd = Math.max(0.5, dist(u, target));
            s.proj.push({ shot: sh.k, arc: sh.arc, team: u.team, sx: u.x, sy: u.y, x: u.x, y: u.y, tx: target.x, ty: target.y, tgt: target, dmg, aoe: d.aoe, dur: dd / sh.spd, t: 0 });
          } else {
            hit(s, target, dmg, u);
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
          for (const o of s.units) if (o.alive && o.team !== p.team && Math.hypot(o.x - p.tx, o.y - p.ty) <= p.aoe) hit(s, o, p.dmg, { x: p.tx, y: p.ty });
          s.events.push({ k: 'boom', shot: p.shot, x: p.tx, y: p.ty, r: p.aoe, t: 0, dur: 0.55 });
        } else {
          if (p.tgt.alive) hit(s, p.tgt, p.dmg, { x: p.sx, y: p.sy });
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
        const min = a.team === b.team ? 0.85 : 0.55;
        if (d < min && d > 0.0001) {
          const push = (min - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
    for (const u of alive) { u.x = Math.max(0.4, Math.min(W - 0.4, u.x)); u.y = Math.max(-10, Math.min(H + 10, u.y)); }
    const pa = s.units.some(u => u.alive && u.team === 'p');
    const ea = s.units.some(u => u.alive && u.team === 'e');
    if (!ea) s.winner = 'p'; else if (!pa) s.winner = 'e';
    else if (s.t > 120) {
      const hp = t => s.units.filter(u => u.alive && u.team === t).reduce((x, u) => x + u.hp, 0);
      s.winner = hp('p') >= hp('e') ? 'p' : 'e';
    }
  }

  function hit(s, u, dmg, src) {
    u.hp -= dmg; u.flash = 0.16;
    const killed = u.hp <= 0;
    if (killed) { u.hp = 0; u.alive = false; u.diedAt = s.t; }
    s.events.push({ k: 'hit', uid: u.uid, x: u.x, y: u.y, dmg, team: u.team, killed, sx: src.x, sy: src.y });
  }

  const api = { W, H, UNITS, ORDER, STARTER, WAVES, BUDGETS, budgetFor, poolCopies, drawPool, MAX_DISCARDS, createBot, formationRows, SHOTS, ROUNDS, WIN_ROUNDS, genOpponentDeck, draftBot, createBattle, step };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
