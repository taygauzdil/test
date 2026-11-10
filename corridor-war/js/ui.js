// Corridor War — DOM UI: menus, deck builder, unit upgrades, battle HUD/upgrade panel, results.
(function (CC) {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = () => CC.CONFIG;

  function fmtMoney(v) {
    v = Math.floor(v);
    if (v < 1000) return '$' + v;
    if (v < 1e6) return '$' + (v / 1e3).toFixed(2) + 'K';
    return '$' + (v / 1e6).toFixed(2) + 'M';
  }
  function fmtTime(t) { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function lvlMult(lvl) { return 1 + C().progression.hpPerLevel * lvl; }

  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  }

  // ---------------- menu ----------------
  function renderMenu(save) {
    $('menuGems').textContent = save.gems;
    $('menuRecord').textContent = `Wins ${save.wins} · Losses ${save.losses}`;
  }

  function drawMenuArt() {
    const c = $('menuArt'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      for (const [team, x0] of [['blue', 40], ['red', 260]]) {
        const x = x0 + rnd() * 140, y = 30 + rnd() * 180, r = 7;
        ctx.fillStyle = team === 'blue' ? '#58a8ff' : '#ff5d5d'; ctx.strokeStyle = team === 'blue' ? '#0f2c52' : '#4f1010'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#dde'; ctx.beginPath(); ctx.moveTo(x + (team === 'blue' ? 4 : -4), y + 3); ctx.lineTo(x + (team === 'blue' ? 13 : -13), y + 3); ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffcc4d'; ctx.font = '900 46px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⚔', 220, 138);
  }

  // ---------------- deck ----------------
  const deckState = { slot: -1, pending: null };

  function statsHtml(type, lvl) {
    const u = C().units[type], m = lvlMult(lvl), dm = 1 + C().progression.dmgPerLevel * lvl;
    return `<div class="stats">
      <span>❤️ HP <b>${Math.round(u.hp * m)}</b></span><span>⚔️ DMG <b>${Math.round(u.dmg * dm)}</b></span><span>⏱ ATK <b>${u.atkSpeed}</b>/s</span>
      <span>👟 SPD <b>${u.move}</b></span><span>🎯 RNG <b>${u.range < 1 ? 'melee' : u.range}</b></span><span>⟳ <b>${u.squad}</b> / ${u.spawn}s</span>
    </div>`;
  }

  function renderDeck(save, onChange) {
    const slots = $('deckSlots'); slots.innerHTML = '';
    save.deck.forEach((type, i) => {
      const u = C().units[type];
      const el = document.createElement('div');
      el.className = 'slot' + (deckState.slot === i ? ' sel' : '') + (deckState.pending ? ' glow' : '');
      el.innerHTML = `<span class="lv">Lv${save.levels[type] + 1}</span><div class="ic">${u.icon}</div><div class="nm">${u.name}</div>`;
      el.onclick = () => {
        if (deckState.pending) { placeUnit(save, i, deckState.pending); onChange(); }
        else deckState.slot = deckState.slot === i ? -1 : i;
        renderDeck(save, onChange);
      };
      slots.appendChild(el);
    });
    const cards = $('deckCards'); cards.innerHTML = '';
    for (const type of C().unitOrder) {
      const u = C().units[type], inDeck = save.deck.includes(type);
      const el = document.createElement('div');
      el.className = 'ucard' + (inDeck ? ' indeck' : '') + (deckState.pending === type ? ' pending' : '');
      el.innerHTML = `${inDeck ? '<span class="badge">IN DECK</span>' : ''}
        <div class="hd"><div class="ic">${u.icon}</div><div><div class="nm">${u.name}</div><div class="rl">${u.role}</div></div><div class="lv">Lv ${save.levels[type] + 1}</div></div>
        ${statsHtml(type, save.levels[type])}<div class="desc">${u.desc}</div>`;
      el.onclick = () => {
        if (deckState.slot >= 0) { placeUnit(save, deckState.slot, type); onChange(); }
        else if (!inDeck) deckState.pending = deckState.pending === type ? null : type;
        renderDeck(save, onChange);
      };
      cards.appendChild(el);
    }
    $('deckHint').textContent = deckState.pending ? `Now tap the slot ${C().units[deckState.pending].name} should replace.`
      : deckState.slot >= 0 ? 'Now tap a unit to put it in the highlighted slot.'
      : 'Tap a slot, then a unit (or a unit, then a slot). Deck = exactly 5 different units.';
  }

  function placeUnit(save, slot, type) {
    const cur = save.deck.indexOf(type);
    if (cur === slot) { /* nothing */ }
    else if (cur >= 0) { const t = save.deck[slot]; save.deck[slot] = type; save.deck[cur] = t; } // swap
    else save.deck[slot] = type;
    deckState.slot = -1; deckState.pending = null;
  }

  // ---------------- permanent unit upgrades ----------------
  function renderUnits(save, onBuy) {
    $('unitsGems').textContent = save.gems;
    const list = $('unitList'); list.innerHTML = '';
    for (const type of C().unitOrder) {
      const u = C().units[type], lvl = save.levels[type], cost = CC.Save.unitUpgradeCost(lvl);
      const P = C().progression;
      const hp0 = Math.round(u.hp * (1 + P.hpPerLevel * lvl)), hp1 = Math.round(u.hp * (1 + P.hpPerLevel * (lvl + 1)));
      const d0 = Math.round(u.dmg * (1 + P.dmgPerLevel * lvl)), d1 = Math.round(u.dmg * (1 + P.dmgPerLevel * (lvl + 1)));
      const row = document.createElement('div'); row.className = 'urow'; row.id = 'urow-' + type;
      row.innerHTML = `<div class="ic">${u.icon}</div>
        <div class="info"><div class="nm">${u.name}<small>Lv ${lvl + 1}</small>${save.deck.includes(type) ? ' <small style="color:#8cc6ff">• deck</small>' : ''}</div>
        <div class="delta">❤️ ${hp0} → <b>${hp1}</b> &nbsp; ⚔️ ${d0} → <b>${d1}</b></div></div>`;
      const btn = document.createElement('button'); btn.className = 'gold';
      btn.innerHTML = `💎 ${cost}`; btn.disabled = save.gems < cost;
      btn.onclick = () => onBuy(type);
      row.appendChild(btn); list.appendChild(row);
    }
  }

  // ---------------- battle panel ----------------
  const panel = { btns: {}, last: {} };

  function buildUpgradePanel(onBuy) {
    const ups = $('ups'); ups.innerHTML = ''; panel.btns = {}; panel.last = {};
    for (const id of C().upgradeOrder) {
      const U = C().upgrades[id];
      const b = document.createElement('button'); b.className = 'up';
      b.innerHTML = `<div class="uic">${U.icon}</div><div class="unm">${U.name}</div><div class="ulv">Lv 0</div><div class="uds">${U.desc}</div><div class="uct">$50</div>`;
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (!b.disabled) onBuy(id); });
      ups.appendChild(b);
      panel.btns[id] = { el: b, lv: b.querySelector('.ulv'), ct: b.querySelector('.uct') };
    }
  }

  function flashUpgrade(id, level) {
    const p = panel.btns[id]; if (!p) return;
    p.el.classList.remove('bought'); void p.el.offsetWidth; p.el.classList.add('bought');
    const plus = document.createElement('div'); plus.className = 'plus'; plus.textContent = 'Lv ' + level;
    p.el.appendChild(plus); setTimeout(() => plus.remove(), 800);
  }

  function setText(el, key, v) { if (panel.last[key] !== v) { panel.last[key] = v; el.textContent = v; } }

  function updateHUD(b) {
    const me = b.sides.blue, foe = b.sides.red, eco = me.eco;
    setText($('money'), 'money', fmtMoney(eco.money));
    setText($('income'), 'inc', '+' + fmtMoney(CC.Economy.incomePerSecond(eco)) + '/s');
    setText($('hudTime'), 'time', fmtTime(b.time));
    setText($('redHpTxt'), 'rhp', Math.ceil(foe.base.hp));
    setText($('blueHpTxt'), 'bhp', Math.ceil(me.base.hp));
    $('redBar').firstChild.style.width = (foe.base.hp / foe.base.maxHp * 100) + '%';
    $('blueBar').firstChild.style.width = (me.base.hp / me.base.maxHp * 100) + '%';
    setText($('kills'), 'kills', me.kills);
    setText($('armies'), 'arm', me.alive + ' v ' + foe.alive);
    const L = foe.eco.levels;
    setText($('aiLv'), 'ai', `AI ⚔${L.power} 🛡${L.defense} 👥${L.tactic} ⚡${L.speed} 💰${L.income}`);
    setText($('squadInfo'), 'sq', '+' + me.mods.extraUnits);
    setText($('armyInfo'), 'army', me.alive);
    let next = Infinity; for (const s of me.deck) next = Math.min(next, s.timer);
    setText($('spawnInfo'), 'spawn', next.toFixed(1) + 's');
    for (const id of C().upgradeOrder) {
      const p = panel.btns[id], cost = CC.Economy.cost(eco, id);
      setText(p.lv, 'lv' + id, 'Lv ' + eco.levels[id]);
      setText(p.ct, 'ct' + id, fmtMoney(cost));
      const dis = eco.money < cost;
      if (p.el.disabled !== dis) p.el.disabled = dis;
    }
  }

  function bumpMoney() { const h = $('hudMoney'); h.classList.remove('bump'); void h.offsetWidth; h.classList.add('bump'); }

  function showResults(r) {
    const t = $('resTitle');
    t.textContent = r.win ? 'VICTORY' : 'DEFEAT'; t.className = r.win ? 'win' : 'lose';
    $('resKills').textContent = r.kills; $('resSpawned').textContent = r.spawned; $('resLost').textContent = r.lost;
    $('resTime').textContent = fmtTime(r.time); $('resGems').textContent = '+' + r.gems;
    $('resultOv').classList.add('on');
    const card = $('resultCard'); card.classList.remove('appear'); void card.offsetWidth; card.classList.add('appear');
  }

  CC.UI = { show, renderMenu, drawMenuArt, renderDeck, renderUnits, buildUpgradePanel, flashUpgrade, updateHUD, bumpMoney, showResults, fmtMoney, fmtTime, $ };
})(globalThis.CC = globalThis.CC || {});
