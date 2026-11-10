// Corridor War — AI opponent. It only reads the battle state and issues the same
// 'upgrade' commands a human would; it obeys the same economy and combat rules.
(function (CC) {
  'use strict';

  function frontline(b, sideId) {
    // how far (0 = own base, 1 = enemy base) the most advanced 10% of this army has pushed
    const s = b.sides[sideId], f = b.map.fields[s.enemy][2], total = f.dist[b.map.idx(s.base.x, s.base.y)] || 1;
    const arr = [];
    for (const u of b.units) if (u.side === sideId && !u.dead) arr.push(1 - f.dist[b.map.idx(u.x, u.y)] / total);
    if (!arr.length) return 0;
    arr.sort((a, c) => c - a);
    const n = Math.max(1, Math.ceil(arr.length * 0.1));
    let sum = 0; for (let i = 0; i < n; i++) sum += arr[i];
    return sum / n;
  }

  function create(sideId) {
    const AI = CC.CONFIG.ai;
    const ai = { side: sideId, timer: 0.5, plan: null, lastState: null, rand: Math.random };

    ai.evaluate = function (b) {
      const me = b.sides[sideId], foe = b.sides[me.enemy];
      const myFront = frontline(b, sideId), foeFront = frontline(b, me.enemy);
      const spawned = me.spawnLog.reduce((a, e) => a + e.n, 0);
      return {
        time: b.time,
        losingGround: foeFront - myFront > 0.08 || foeFront > 0.62,
        winningGround: myFront - foeFront > 0.15,
        armyRatio: me.alive / Math.max(1, foe.alive),
        deathRate: me.deathLog.length / Math.max(1, spawned),
        baseRatio: me.base.hp / me.base.maxHp,
        myFront, foeFront,
      };
    };

    ai.scores = function (b, st) {
      const L = b.sides[sideId].eco.levels, t = st.time;
      const s = {};
      s.income = 1.0;
      if (t < 70) s.income = 3.2;                 // early game: build the economy
      if (L.income > t / 22) s.income *= 0.5;     // don't over-invest
      if (st.losingGround) s.income *= 0.35;

      const pressure = (st.losingGround ? 1.6 : 0) + (st.armyRatio < 0.85 ? 0.9 : 0) + (st.baseRatio < 0.6 ? 0.8 : 0);
      s.power = 1.0 + pressure;
      s.tactic = (1.0 + pressure) * ((L.tactic + 1) % CC.CONFIG.upgrades.tactic.levelsPerExtraUnit === 0 ? 1.7 : 0.9);
      s.defense = 0.8 + (st.deathRate > 0.85 ? 1.9 : st.deathRate > 0.65 ? 0.8 : 0);
      s.speed = 0.45 + ai.rand() * 0.35;
      if (st.winningGround) { s.power += 0.4; s.speed += 0.3; }
      return s;
    };

    ai.think = function (b) {
      const me = b.sides[sideId], eco = me.eco;
      const st = ai.evaluate(b); ai.lastState = st;
      const sc = ai.scores(b, st);
      const opts = CC.CONFIG.upgradeOrder.map(id => {
        const c = CC.Economy.cost(eco, id);
        return { id, cost: c, score: sc[id], value: sc[id] / Math.sqrt(c) };
      }).sort((a, c) => c.value - a.value);

      const best = opts[0];
      ai.plan = best.id;
      if (eco.money >= best.cost) { b.command({ side: sideId, type: 'upgrade', id: best.id }); return; }
      const wait = (best.cost - eco.money) / CC.Economy.incomePerSecond(eco);
      if (wait <= AI.saveWindow) return; // saving up is worth it
      const alt = opts.find(o => o.cost <= eco.money && o.score >= best.score * 0.6);
      if (alt) b.command({ side: sideId, type: 'upgrade', id: alt.id });
    };

    ai.update = function (b, dt) {
      ai.timer -= dt;
      if (ai.timer <= 0) { ai.timer += AI.thinkInterval; ai.think(b); }
    };
    return ai;
  }

  CC.AI = { create, frontline };
})(globalThis.CC = globalThis.CC || {});
