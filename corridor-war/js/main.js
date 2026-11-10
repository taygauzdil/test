// Corridor War — app flow & fixed-timestep game loop.
(function (CC) {
  'use strict';
  const UI = CC.UI, $ = UI.$;
  const save = CC.Save.load();
  const map = CC.Map.create();
  const renderer = new CC.Renderer($('cv'), map);

  let battle = null, acc = 0, last = 0, paused = false, running = false, rewarded = false;

  // ---------- navigation ----------
  function go(id) {
    if (id === 'menu') UI.renderMenu(save);
    if (id === 'deck') UI.renderDeck(save, () => CC.Save.save(save));
    if (id === 'units') UI.renderUnits(save, buyUnit);
    UI.show(id);
  }
  for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go);
  $('btnPlay').onclick = startBattle;
  $('deckPlay').onclick = startBattle;
  $('btnDeck').onclick = () => go('deck');
  $('btnUnits').onclick = () => go('units');

  function buyUnit(type) {
    const cost = CC.Save.unitUpgradeCost(save.levels[type]);
    if (save.gems < cost) return;
    save.gems -= cost; save.levels[type]++; CC.Save.save(save);
    UI.renderUnits(save, buyUnit);
    const row = $('urow-' + type); if (row) row.classList.add('pop');
  }

  // ---------- battle ----------
  function aiLevels() {
    // The AI's units track the player's average deck level so progression stays meaningful but fair.
    const avg = save.deck.reduce((a, t) => a + save.levels[t], 0) / save.deck.length;
    const lv = Math.max(0, Math.floor(avg * 0.85));
    const levels = {}; for (const t of CC.CONFIG.unitOrder) levels[t] = lv;
    return levels;
  }

  function startBattle() {
    if (!CC.Save.validDeck(save.deck)) { go('deck'); return; }
    battle = CC.Battle.create({
      map, blueDeck: save.deck.slice(), redDeck: CC.CONFIG.aiDeck.slice(),
      blueLevels: save.levels, redLevels: aiLevels(),
    });
    battle.controllers.push(CC.AI.create('red'));
    $('resultOv').classList.remove('on'); $('pauseOv').classList.remove('on');
    UI.show('battle');
    UI.buildUpgradePanel(id => battle && !battle.over && !paused && battle.command({ side: 'blue', type: 'upgrade', id }));
    layout();
    renderer.particles.length = 0; renderer.texts.length = 0; renderer.rings.length = 0;
    acc = 0; paused = false; rewarded = false; running = true; last = performance.now();
    UI.updateHUD(battle);
  }

  function layout() {
    const f = $('field'), r = f.getBoundingClientRect();
    renderer.resize(Math.max(1, r.width), Math.max(1, r.height), Math.min(window.devicePixelRatio || 1, 2.5));
  }
  window.addEventListener('resize', () => { if (running) layout(); });

  $('pauseBtn').onclick = () => { if (!battle || battle.over) return; paused = true; $('pauseOv').classList.add('on'); };
  $('resumeBtn').onclick = () => { paused = false; $('pauseOv').classList.remove('on'); last = performance.now(); };
  $('quitBtn').onclick = () => { if (!battle) return; $('pauseOv').classList.remove('on'); paused = false; battle.sides.blue.base.hp = 0; };
  $('againBtn').onclick = startBattle;
  $('menuBtn').onclick = () => { running = false; go('menu'); };
  $('resUnitsBtn').onclick = () => { running = false; go('units'); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && battle && running && !battle.over) { paused = true; $('pauseOv').classList.add('on'); }
  });

  function finish() {
    if (rewarded) return; rewarded = true;
    const me = battle.sides.blue, win = battle.winner === 'blue', P = CC.CONFIG.progression;
    const gems = win ? Math.round(P.winReward + me.kills / P.killsPerGem + P.baseHpBonus * (me.base.hp / me.base.maxHp)) : 0;
    save.gems += gems; if (win) save.wins++; else save.losses++;
    CC.Save.save(save);
    setTimeout(() => UI.showResults({ win, kills: me.kills, spawned: me.spawned, lost: me.lost, time: battle.time, gems }), 900);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !battle) return;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    const DT = CC.CONFIG.sim.dt;
    if (!paused && !battle.over) {
      acc += dt;
      const moneyBefore = Math.floor(battle.sides.blue.eco.money);
      while (acc >= DT) {
        CC.Battle.step(battle, DT); acc -= DT;
        for (const e of battle.events) if (e.t === 'upgrade' && e.side === 'blue') UI.flashUpgrade(e.id, e.level);
        renderer.consume(battle.events); battle.events.length = 0;
      }
      if (Math.floor(battle.sides.blue.eco.money) > moneyBefore + 0.5 && battle.sides.blue.eco.payoutTimer < 0.1) UI.bumpMoney();
      if (battle.over) finish();
    } else if (battle.over) { renderer.consume(battle.events); battle.events.length = 0; }
    renderer.draw(battle, paused || battle.over ? 1 : acc / DT, paused ? 0 : dt);
    UI.updateHUD(battle);
  }

  UI.drawMenuArt();
  go('menu');
  requestAnimationFrame(frame);

  CC.app = { save, get battle() { return battle; }, startBattle, go }; // handy for debugging / tests
})(globalThis.CC = globalThis.CC || {});
