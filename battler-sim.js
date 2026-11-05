// Grid Clash — game data, rules, AI and headless battle simulation.
// No DOM access: the same file runs in the browser (window.BattlerSim) and in node (require) for balance tests.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- tuning
  const CONFIG = {
    COLS: 10, ROWS: 10, TERRITORY_ROWS: 5,     // Red owns rows 0-4 (top), Blue owns rows 5-9 (bottom)
    CARD_OPTIONS: 3,                            // cards offered per action
    UPGRADE_CHANCE: 0.33,                       // chance each offered card is an upgrade (when one is possible)
    DOUBLE_CHANCE: 0.08,                        // chance each offered card is a Double card (when a group has room)
    UNIT_WEIGHTS: { archer: 1, knight: 1, cavalry: 1, bomber: 1, dwarf: 1 }, // relative card frequency
    ACTIONS_PER_ROUND: 3,
    COMEBACK_ACTIONS: 1,                        // extra action for the previous round's loser
    WINS_TO_MATCH: 3, MAX_ROUNDS: 5,
    MAX_LEVEL: 3,
    LEVELS: { 1: { dmg: 1, hp: 1 }, 2: { dmg: 1.25, hp: 1.2 }, 3: { dmg: 1.5, hp: 1.4 } },
    DECK_SIZE: 4,
    SIM_DT: 1 / 60,
    RETARGET_T: 0.3,
    SUDDEN_DEATH_T: 40,                         // after this many seconds damage ramps up so every battle ends by elimination
    SUDDEN_DEATH_RAMP: 0.2,                     // +20% damage per second past the threshold
  };

  // Unit stats. Distances are in grid cells, speeds in cells/second, cd = seconds between attacks.
  // range = reach measured edge-to-edge between character bodies.
  const UNITS = {
    archer:  { id: 'archer',  name: 'Archer',  count: 5, role: 'Ranged Damage',   icon: '🏹', hp: 80,  dmg: 12, range: 4.6,  speed: 1.05, cd: 1.05, radius: 0.14, mass: 1.0, attack: 'arrow', projSpeed: 9, kite: true, scale: 0.9,
               desc: 'Volleys from range. Fragile.' },
    knight:  { id: 'knight',  name: 'Knight',  count: 3, role: 'Melee Frontline', icon: '🛡️', hp: 320, dmg: 23, range: 0.12, speed: 0.95, cd: 1.15, radius: 0.2,  mass: 2.2, attack: 'melee', scale: 1.0,
               desc: 'Armored wall. High health.' },
    cavalry: { id: 'cavalry', name: 'Cavalry', count: 2, role: 'Fast Attacker',   icon: '🐎', hp: 290, dmg: 26, range: 0.14, speed: 2.3,  cd: 1.0,  radius: 0.24, mass: 2.6, attack: 'melee', charge: 2.6, chargeDist: 1.6, scale: 1.22,
               desc: 'Very fast. Devastating charge.' },
    bomber:  { id: 'bomber',  name: 'Bomber',  count: 2, role: 'Area Damage',     icon: '💣', hp: 135, dmg: 42, range: 3.5,  speed: 0.9,  cd: 2.5,  radius: 0.16, mass: 1.1, attack: 'bomb', aoe: 1.0, scale: 0.95,
               desc: 'Lobbed bombs hit groups.' },
    dwarf:   { id: 'dwarf',   name: 'Dwarf',   count: 4, role: 'Durable Brawler', icon: '🪓', hp: 175, dmg: 12, range: 0.22, speed: 1.0,  cd: 0.62, radius: 0.16, mass: 1.6, attack: 'melee', armor: 0.15, scale: 0.82,
               desc: 'Tough, fast axe swings.' },
  };
  const ORDER = ['archer', 'knight', 'cavalry', 'bomber', 'dwarf'];
  const FRONTLINE = { knight: 1, dwarf: 1, cavalry: 1 };

  // Formation offsets (in cells) around the slot centre, front of the formation = toward the enemy (negative y for Blue).
  const FORMATIONS = {
    1: [[0, 0]],
    2: [[-0.19, 0], [0.19, 0]],
    3: [[0, -0.17], [-0.21, 0.14], [0.21, 0.14]],
    4: [[-0.19, -0.16], [0.19, -0.16], [-0.19, 0.16], [0.19, 0.16]],
    5: [[0, 0], [-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]],
  };

  // ---------------------------------------------------------------- helpers
  function mkRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];
  function weightedPick(types, rng) {
    let tot = 0; for (const t of types) tot += CONFIG.UNIT_WEIGHTS[t] || 1;
    let r = rng() * tot;
    for (const t of types) { r -= CONFIG.UNIT_WEIGHTS[t] || 1; if (r <= 0) return t; }
    return types[types.length - 1];
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------------------------------------------------------------- players, territory, cards
  function territoryRows(team) {
    const n = CONFIG.TERRITORY_ROWS;
    return team === 'red' ? [0, n - 1] : [CONFIG.ROWS - n, CONFIG.ROWS - 1];
  }
  function inTerritory(team, col, row) {
    const [a, b] = territoryRows(team);
    return col >= 0 && col < CONFIG.COLS && row >= a && row <= b;
  }
  // 0 = front row (touching the middle line), 4 = back row
  function depth(team, row) { return team === 'red' ? CONFIG.TERRITORY_ROWS - 1 - row : row - (CONFIG.ROWS - CONFIG.TERRITORY_ROWS); }

  function createPlayer(team, deck) { return { team, deck: deck.slice(), groups: [], nextId: 1 }; }

  // A group is one unit type at one level that covers one or more orthogonally connected slots:
  //   { id, type, level, slots: [{col,row}, ...], col, row }   (col/row = anchor = first slot)
  // Each slot contributes one card's worth of characters (UNITS[type].count).
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function groupAt(player, col, row) { return player.groups.find(g => g.slots.some(s => s.col === col && s.row === row)) || null; }
  function groupCount(g) { return UNITS[g.type].count * g.slots.length; }
  function emptySlots(player) {
    const out = []; const [a, b] = territoryRows(player.team);
    for (let r = a; r <= b; r++) for (let c = 0; c < CONFIG.COLS; c++) if (!groupAt(player, c, r)) out.push({ col: c, row: r });
    return out;
  }
  function sortSlots(g) { g.slots.sort((a, b) => a.row - b.row || a.col - b.col); g.col = g.slots[0].col; g.row = g.slots[0].row; }
  const touches = (a, b) => a.slots.some(s => b.slots.some(t => Math.abs(s.col - t.col) + Math.abs(s.row - t.row) === 1));
  // Same unit type + same level + side by side => they merge into one bigger group.
  const canMerge = (a, b) => a !== b && a.type === b.type && a.level === b.level && touches(a, b);
  function mergeAround(player, g) {
    const absorbed = [];
    for (let changed = true; changed;) {
      changed = false;
      for (const o of player.groups) {
        if (!canMerge(g, o)) continue;
        g.slots.push(...o.slots); player.groups.splice(player.groups.indexOf(o), 1); absorbed.push(o); changed = true; break;
      }
    }
    sortSlots(g);
    return absorbed;
  }
  // Double card: one more copy of the unit (one card's worth) appears automatically in a free slot next to the
  // slot it was dropped on (or next to any slot of that group if that one is boxed in). Preference: side by side,
  // then toward the front, then toward the centre. Returns [{col,row}] or null if there is no room.
  function doubleSlots(player, g, col, row) {
    const free = (c, r) => inTerritory(player.team, c, r) && !groupAt(player, c, r);
    const from = col != null ? [{ col, row }].concat(g.slots) : g.slots;
    for (let pass = 0; pass < 2; pass++) {
      let best = null;
      for (const s of pass === 0 ? from.slice(0, 1) : from) for (const [dc, dr] of N4) {
        const c = s.col + dc, r = s.row + dr;
        if (!free(c, r)) continue;
        const v = (dr === 0 ? 2 : 0) + (depth(player.team, r) < depth(player.team, s.row) ? 0.5 : 0) - Math.abs(c - 4.5) * 0.05 - r * 0.001;
        if (!best || v > best.v) best = { v, col: c, row: r };
      }
      if (best) return [{ col: best.col, row: best.row }];
    }
    return null;
  }
  const canUpgrade = g => g.level < CONFIG.MAX_LEVEL;
  function upgradeableTypes(player) { return player.deck.filter(t => player.groups.some(g => g.type === t && canUpgrade(g))); }
  function doubleableGroups(player) { return player.groups.filter(g => doubleSlots(player, g)); }
  const sameCard = (a, b) => a.kind === b.kind && a.type === b.type;
  let cardUid = 1;

  // Three options. Unit cards only from the deck; upgrade cards only when a compatible group can still level up;
  // Double cards only when some group has room to double.
  function genCards(player, rng) {
    const hasEmpty = emptySlots(player).length > 0;
    const upTypes = upgradeableTypes(player);
    const canDouble = doubleableGroups(player).length > 0;
    const cards = [];
    for (let i = 0; i < CONFIG.CARD_OPTIONS; i++) {
      let card = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        let c = null;
        if (canDouble && rng() < CONFIG.DOUBLE_CHANCE) c = { kind: 'double', type: null };
        else if (upTypes.length && (!hasEmpty || rng() < CONFIG.UPGRADE_CHANCE)) c = { kind: 'upgrade', type: pick(upTypes, rng) };
        else if (hasEmpty) c = { kind: 'unit', type: weightedPick(player.deck, rng) };
        else if (canDouble) c = { kind: 'double', type: null };
        if (!c) break;
        card = c;
        if (!cards.some(x => sameCard(x, c))) break; // prefer variety, accept a duplicate if unavoidable
      }
      if (!card) break;
      card.uid = cardUid++;
      cards.push(card);
    }
    return cards;
  }

  // Valid drop targets for a card (every slot of an eligible group counts)
  function validTargets(player, card) {
    if (card.kind === 'unit') return emptySlots(player);
    const gs = card.kind === 'double' ? doubleableGroups(player) : player.groups.filter(g => g.type === card.type && canUpgrade(g));
    const out = []; for (const g of gs) for (const s of g.slots) out.push({ col: s.col, row: s.row });
    return out;
  }
  function checkPlacement(player, card, col, row) {
    if (!inTerritory(player.team, col, row)) return { ok: false, reason: card.kind === 'unit' ? 'Place units inside your own territory' : 'Drop the card on one of your groups' };
    const g = groupAt(player, col, row);
    if (card.kind === 'unit') return g ? { ok: false, reason: 'That slot is already occupied' } : { ok: true };
    if (card.kind === 'double') {
      if (!g) return { ok: false, reason: 'Drop the Double card on one of your groups' };
      if (!doubleSlots(player, g, col, row)) return { ok: false, reason: 'No free slot next to that group for the copy' };
      return { ok: true };
    }
    if (!g) return { ok: false, reason: 'Drop the upgrade on an existing ' + UNITS[card.type].name + ' group' };
    if (g.type !== card.type) return { ok: false, reason: 'This upgrade only fits ' + UNITS[card.type].name + ' groups' };
    if (!canUpgrade(g)) return { ok: false, reason: 'That group is already at max level' };
    return { ok: true };
  }
  // Predicts what a unit card dropped on (col,row) would merge with (for UI previews / AI)
  function mergePreview(player, type, col, row) {
    const probe = { type, level: 1, slots: [{ col, row }] };
    return player.groups.filter(g => canMerge(probe, g));
  }
  function applyCard(player, card, col, row) {
    const chk = checkPlacement(player, card, col, row);
    if (!chk.ok) return chk;
    if (card.kind === 'unit') {
      const g = { id: player.team[0] + (player.nextId++), type: card.type, level: 1, slots: [{ col, row }] };
      player.groups.push(g);
      const absorbed = mergeAround(player, g);
      return { ok: true, group: g, kind: 'unit', added: [{ col, row }], merged: absorbed.length > 0 };
    }
    const g = groupAt(player, col, row);
    if (card.kind === 'double') {
      const added = doubleSlots(player, g, col, row);
      g.slots.push(...added);
      const absorbed = mergeAround(player, g);
      return { ok: true, group: g, kind: 'double', added, merged: absorbed.length > 0 };
    }
    g.level++;
    const absorbed = mergeAround(player, g); // reaching a neighbour's level makes them merge
    return { ok: true, group: g, kind: 'upgrade', added: [], merged: absorbed.length > 0 };
  }

  function groupStats(type, level) {
    const U = UNITS[type], L = CONFIG.LEVELS[level];
    return { hp: Math.round(U.hp * L.hp), dmg: Math.round(U.dmg * L.dmg * 10) / 10 };
  }

  // Preparation order for a round: optional comeback action for last round's loser, then Blue/Red alternating.
  function buildQueue(lastLoser) {
    const q = [];
    if (lastLoser) for (let i = 0; i < CONFIG.COMEBACK_ACTIONS; i++) q.push({ team: lastLoser, bonus: true });
    for (let i = 0; i < CONFIG.ACTIONS_PER_ROUND; i++) { q.push({ team: 'blue', bonus: false }); q.push({ team: 'red', bonus: false }); }
    return q;
  }

  // ---------------------------------------------------------------- AI
  // counts in slots (one slot = one card's worth of characters)
  function countTypes(groups) { const o = {}; for (const g of groups) o[g.type] = (o[g.type] || 0) + g.slots.length; return o; }
  const totalSlots = groups => groups.reduce((n, g) => n + g.slots.length, 0);

  // How well a unit type answers the opponent's visible army (0..~1.5)
  function counterScore(type, opp) {
    const E = countTypes(opp.groups), n = Math.max(1, totalSlots(opp.groups));
    const f = t => (E[t] || 0) / n;
    switch (type) {
      case 'cavalry': return f('archer') + f('bomber');
      case 'bomber':  return f('knight') + f('dwarf') + 0.5 * f('archer');
      case 'knight':  return f('cavalry') + 0.5 * f('dwarf') + 0.3 * f('archer');
      case 'dwarf':   return 0.7 * f('knight') + 0.7 * f('cavalry');
      case 'archer':  return 0.6 * f('knight') + 0.6 * f('dwarf') + 0.3 * f('bomber');
    }
    return 0;
  }

  function bestSlot(self, opp, type, rng) {
    const pref = { knight: 0, dwarf: 0.6, cavalry: 1.1, archer: 3.1, bomber: 2.5 }[type];
    const front = !!FRONTLINE[type];
    const enemyCols = new Array(CONFIG.COLS).fill(0);
    for (const g of opp.groups) for (const s of g.slots) enemyCols[s.col] += UNITS[g.type].count >= 4 ? 1.2 : 1;
    const ownFront = []; for (const g of self.groups) if (FRONTLINE[g.type]) ownFront.push(...g.slots);
    let best = null;
    for (const s of emptySlots(self)) {
      const d = depth(self.team, s.row);
      let v = -Math.abs(d - pref) * 1.0;
      if (type === 'cavalry') v -= Math.min(s.col, CONFIG.COLS - 1 - s.col) * 0.45;
      else v -= Math.abs(s.col - 4.5) * 0.12;
      if (!front) { // ranged: sit behind an existing frontline group
        if (ownFront.some(f => Math.abs(f.col - s.col) <= 1 && depth(self.team, f.row) < d)) v += 0.55;
      } else if (type !== 'cavalry') { // melee: face where the enemy is
        v += 0.12 * ((enemyCols[s.col - 1] || 0) + enemyCols[s.col] + (enemyCols[s.col + 1] || 0));
      }
      if (mergePreview(self, type, s.col, s.row).length) v += 0.45; // merging is good value
      v += rng() * 0.4;
      if (!best || v > best.v) best = { v, col: s.col, row: s.row };
    }
    return best;
  }
  function bestUpgradeTarget(self, type, rng) {
    let best = null;
    for (const g of self.groups) {
      if (g.type !== type || !canUpgrade(g)) continue;
      const d = depth(self.team, g.row);
      let v = g.level * 0.5 + g.slots.length * 0.4 + (FRONTLINE[type] ? -d * 0.15 : -Math.abs(g.col - 4.5) * 0.05) + rng() * 0.3;
      if (!best || v > best.v) best = { v, col: g.col, row: g.row, level: g.level, size: g.slots.length };
    }
    return best;
  }
  function bestDoubleTarget(self, opp, rng) {
    let best = null;
    for (const g of doubleableGroups(self)) {
      const v = g.slots.length * 0.35 + (g.level - 1) * 0.3 + counterScore(g.type, opp) * 0.5 + rng() * 0.3;
      if (!best || v > best.v) best = { v, col: g.col, row: g.row, level: g.level, size: g.slots.length };
    }
    return best;
  }
  // Returns { idx, col, row } for the chosen card.
  function aiDecide(self, opp, cards, round, rng) {
    const own = countTypes(self.groups);
    let front = 0, back = 0;
    for (const g of self.groups) FRONTLINE[g.type] ? front += g.slots.length : back += g.slots.length;
    let best = null;
    cards.forEach((c, i) => {
      let v, slot;
      if (c.kind === 'unit') {
        slot = bestSlot(self, opp, c.type, rng); if (!slot) return;
        v = 1 + counterScore(c.type, opp) * 1.3;
        if (!own[c.type]) v += 0.2;
        if (FRONTLINE[c.type] && front <= back) v += 0.35;
        if (!FRONTLINE[c.type] && back < front) v += 0.3;
      } else if (c.kind === 'double') {
        slot = bestDoubleTarget(self, opp, rng); if (!slot) return;
        v = 1.1 + 0.3 * slot.size + 0.2 * (slot.level - 1);
      } else {
        slot = bestUpgradeTarget(self, c.type, rng); if (!slot) return;
        v = 0.7 + 0.22 * (round - 1) + 0.1 * (slot.level - 1) + 0.15 * (slot.size - 1) + counterScore(c.type, opp) * 0.6 + (self.groups.length >= 6 ? 0.2 : 0);
      }
      v += rng() * 0.35;
      if (!best || v > best.v) best = { v, idx: i, col: slot.col, row: slot.row };
    });
    return best;
  }
  function randomDeck(rng) {
    const pool = ORDER.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, CONFIG.DECK_SIZE);
  }

  // ---------------------------------------------------------------- battle simulation
  function createBattle(blueGroups, redGroups, seed) {
    const st = { t: 0, chars: [], projs: [], events: [], rng: mkRng(seed), dmg: { blue: 0, red: 0 }, alive: { blue: 0, red: 0 }, total: { blue: 0, red: 0 }, winner: null, tie: false, sudden: false, endT: 0 };
    let id = 0;
    for (const [team, groups] of [['blue', blueGroups], ['red', redGroups]]) {
      // every slot of every group spawns one card's worth of characters around that slot's centre
      const cells = [];
      for (const g of groups) for (const sl of g.slots) cells.push({ g, col: sl.col, row: sl.row });
      cells.sort((a, b) => (a.row * 10 + a.col) - (b.row * 10 + b.col));
      const flip = team === 'red' ? -1 : 1;
      for (const cell of cells) {
        const g = cell.g, U = UNITS[g.type], s = groupStats(g.type, g.level), F = FORMATIONS[U.count];
        for (let i = 0; i < U.count; i++) {
          const x = cell.col + 0.5 + F[i][0], y = cell.row + 0.5 + F[i][1] * flip;
          st.chars.push({
            id: id++, team, type: g.type, gid: g.id, level: g.level, U, gx: cell.col + 0.5, gy: cell.row + 0.5,
            x, y, hp: s.hp, maxHp: s.hp, dmg: s.dmg, cd: U.cd * (0.15 + 0.35 * st.rng()),
            target: null, threat: null, rt: st.rng() * CONFIG.RETARGET_T, moved: 0, chargeReady: !!U.charge,
            alive: true, deadT: 0, face: x < 5 ? 1 : -1, atk: 0, flash: 0, walk: st.rng() * 6, moving: false, vx: 0, vy: 0,
          });
          st.total[team]++;
        }
      }
    }
    st.alive.blue = st.total.blue; st.alive.red = st.total.red;
    return st;
  }

  function damage(st, T, amt, team) {
    if (!T.alive) return;
    amt *= 1 - (T.U.armor || 0);
    st.dmg[team] += Math.min(amt, T.hp);
    T.hp -= amt; T.flash = 1;
    if (T.hp <= 0) { T.hp = 0; T.alive = false; T.deadT = 0; T.target = null; st.events.push({ e: 'death', x: T.x, y: T.y, team: T.team, type: T.type }); }
  }

  function retarget(st, c) {
    c.rt = CONFIG.RETARGET_T;
    let best = null, bd = 1e9, threat = null, td = 1e9;
    for (const o of st.chars) {
      if (!o.alive || o.team === c.team) continue;
      const dx = o.x - c.x, dy = o.y - c.y, d = dx * dx + dy * dy;
      // a little stickiness on the current target avoids jittery switching
      const dd = o === c.target ? d * 0.8 : d;
      if (dd < bd) { bd = dd; best = o; }
      if (o.U.attack === 'melee' && d < td) { td = d; threat = o; }
    }
    c.target = best; c.threat = threat;
  }

  function attack(st, c, T, d, mult) {
    const U = c.U;
    c.cd = U.cd; c.atk = 0.3;
    if (U.attack === 'melee') {
      let dmg = c.dmg * mult;
      if (U.charge) {
        if (c.chargeReady) {
          dmg *= U.charge; c.chargeReady = false;
          st.events.push({ e: 'charge', x: T.x, y: T.y });
          const nx = (T.x - c.x) / (d || 1), ny = (T.y - c.y) / (d || 1);
          T.x = clamp(T.x + nx * 0.3, 0.15, 9.85); T.y = clamp(T.y + ny * 0.3, 0.15, 9.85);
        }
        c.moved = 0;
      }
      st.events.push({ e: 'melee', x: (c.x + T.x) / 2, y: (c.y + T.y) / 2, team: c.team });
      damage(st, T, dmg, c.team);
    } else if (U.attack === 'arrow') {
      st.projs.push({ k: 'arrow', team: c.team, x: c.x, y: c.y, sx: c.x, sy: c.y, target: T, tx: T.x, ty: T.y, spd: U.projSpeed, dmg: c.dmg * mult, d0: Math.max(0.3, d), prog: 0 });
    } else if (U.attack === 'bomb') {
      const dur = 0.5 + d * 0.11;
      const tx = clamp(T.x + T.vx * dur * 0.6, 0.1, 9.9), ty = clamp(T.y + T.vy * dur * 0.6, 0.1, 9.9);
      st.projs.push({ k: 'bomb', team: c.team, sx: c.x, sy: c.y, x: c.x, y: c.y, tx, ty, t: 0, dur, dmg: c.dmg * mult, aoe: U.aoe });
    }
  }

  function step(st, dt) {
    st.t += dt;
    const chars = st.chars;
    for (const c of chars) {
      if (!c.alive) { c.deadT += dt; continue; }
      c.atk = Math.max(0, c.atk - dt); c.flash = Math.max(0, c.flash - dt * 5);
      if (st.winner) { c.moving = false; c.walk += dt * 8; continue; }
      c.cd -= dt; c.rt -= dt;
      if (!c.target || !c.target.alive || c.rt <= 0) retarget(st, c);
    }
    if (st.winner) { st.endT += dt; return; }

    const mult = st.t > CONFIG.SUDDEN_DEATH_T ? 1 + (st.t - CONFIG.SUDDEN_DEATH_T) * CONFIG.SUDDEN_DEATH_RAMP : 1;
    st.sudden = mult > 1;
    // alternate update order every tick so neither team systematically acts first
    st.tick = (st.tick || 0) + 1;
    const n = chars.length, rev = st.tick & 1;
    for (let k = 0; k < n; k++) {
      const c = chars[rev ? n - 1 - k : k];
      if (!c.alive) continue;
      const T = c.target, U = c.U;
      c.vx = 0; c.vy = 0;
      if (!T) { c.moving = false; continue; }
      const dx = T.x - c.x, dy = T.y - c.y, d = Math.hypot(dx, dy) || 1e-6;
      const edge = d - U.radius - T.U.radius;
      if (Math.abs(dx) > 0.03) c.face = dx > 0 ? 1 : -1;
      let mx = 0, my = 0, spd = U.speed * (st.sudden ? 1.25 : 1);
      // Archers back away from melee threats while reloading
      if (U.kite && c.threat && c.threat.alive && c.cd > 0.2) {
        const tx = c.x - c.threat.x, ty = c.y - c.threat.y, td = Math.hypot(tx, ty) || 1e-6;
        if (td - U.radius - c.threat.U.radius < 0.8) { mx = tx / td; my = ty / td; spd *= 0.7; }
      }
      if (!mx && !my) {
        if (edge > U.range) { mx = dx / d; my = dy / d; }
        else if (c.cd <= 0) attack(st, c, T, d, mult);
      }
      if (mx || my) {
        c.vx = mx * spd; c.vy = my * spd;
        c.x = clamp(c.x + c.vx * dt, 0.15, 9.85); c.y = clamp(c.y + c.vy * dt, 0.15, 9.85);
        c.moved += spd * dt; c.walk += dt * (6 + spd * 4); c.moving = true;
        if (U.charge && !c.chargeReady && c.moved >= U.chargeDist) c.chargeReady = true;
      } else c.moving = false;
    }

    // collision avoidance: soft separation between every pair of living characters
    for (let i = 0; i < n; i++) {
      const a = chars[i]; if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = chars[j]; if (!b.alive) continue;
        const min = a.U.radius + b.U.radius;
        let dx = b.x - a.x; if (dx > min || dx < -min) continue;
        let dy = b.y - a.y; if (dy > min || dy < -min) continue;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-5) { const ang = st.rng() * 6.283; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
        const push = (min - d) * 0.5, nx = dx / d, ny = dy / d, tot = a.U.mass + b.U.mass;
        const pa = push * (b.U.mass / tot) * 2, pb = push * (a.U.mass / tot) * 2;
        a.x = clamp(a.x - nx * pa, 0.15, 9.85); a.y = clamp(a.y - ny * pa, 0.15, 9.85);
        b.x = clamp(b.x + nx * pb, 0.15, 9.85); b.y = clamp(b.y + ny * pb, 0.15, 9.85);
      }
    }

    // projectiles
    for (let i = st.projs.length - 1; i >= 0; i--) {
      const p = st.projs[i];
      if (p.k === 'arrow') {
        if (p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), mv = p.spd * dt;
        if (d <= mv + 0.05) {
          if (p.target.alive) { damage(st, p.target, p.dmg, p.team); st.events.push({ e: 'hit', x: p.tx, y: p.ty }); }
          st.projs.splice(i, 1); continue;
        }
        p.x += dx / d * mv; p.y += dy / d * mv;
        const sd = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1;
        p.prog = clamp(1 - d / Math.max(sd, p.d0), 0, 1);
      } else {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
        if (p.t >= p.dur) {
          st.events.push({ e: 'explode', x: p.tx, y: p.ty, r: p.aoe, team: p.team });
          for (const o of chars) {
            if (!o.alive || o.team === p.team) continue;
            const dd = Math.hypot(o.x - p.tx, o.y - p.ty) - o.U.radius;
            if (dd <= p.aoe) damage(st, o, p.dmg * (1 - 0.5 * Math.max(0, dd) / p.aoe), p.team);
          }
          st.projs.splice(i, 1);
        }
      }
    }

    // elimination-only victory
    let ab = 0, ar = 0;
    for (const c of chars) if (c.alive) c.team === 'blue' ? ab++ : ar++;
    st.alive.blue = ab; st.alive.red = ar;
    if (ab === 0 || ar === 0) {
      if (ab === 0 && ar === 0) {
        // Deterministic tie rule: more total damage dealt wins; exact equality goes to the smaller starting army, then Red.
        st.tie = true;
        st.winner = st.dmg.blue > st.dmg.red ? 'blue' : st.dmg.red > st.dmg.blue ? 'red' : (st.total.blue < st.total.red ? 'blue' : 'red');
      } else st.winner = ab ? 'blue' : 'red';
      st.projs.length = 0;
    }
  }

  // Run a whole battle headless (for tests / balance)
  function simulate(blueGroups, redGroups, seed, maxT) {
    const st = createBattle(blueGroups, redGroups, seed);
    while (!st.winner && st.t < (maxT || 300)) step(st, CONFIG.SIM_DT);
    return st;
  }

  const API = {
    CONFIG, UNITS, ORDER, FRONTLINE, FORMATIONS, mkRng, clamp,
    territoryRows, inTerritory, depth, createPlayer, groupAt, groupCount, emptySlots, upgradeableTypes,
    doubleSlots, doubleableGroups, mergePreview, genCards, validTargets, checkPlacement, applyCard, groupStats, buildQueue,
    counterScore, aiDecide, randomDeck, createBattle, step, simulate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.BattlerSim = API;
})(typeof window !== 'undefined' ? window : this);
