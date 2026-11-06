import { Match } from '../src/match.js';
import { regionsTouched } from '../src/grid.js';
import { ITEMS as IT } from '../src/items.js';
// Headless combat balance sim: runs many battles between builds and reports outcomes.
import { Inventory, newUid } from '../src/inventory.js';
import { resolveLoadout } from '../src/loadout.js';
import { Battle } from '../src/combat/battle.js';
import { buildOpponent, TEMPLATES } from '../src/opponents.js';

function inv(list) { const v = new Inventory(); for (const [id, x, y, level = 1, rot = 0] of list) { if (!v.place({ uid: newUid(), id, level, rot }, x, y, rot)) throw new Error('bad place ' + id); } return v; }
export function run(pInv, eInv, { maxT = 70, log = false } = {}) {
  const b = new Battle({ playerLoadout: resolveLoadout(pInv), enemyLoadout: resolveLoadout(eInv), intro: true });
  let hits = 0, kd = 0, blocks = 0, arrows = 0, light = 0;
  while (!b.done && b.t < maxT) {
    b.step(1 / 120);
    for (const e of b.events) { if (e.type === 'hit') { hits++; if (e.knockdown) kd++; if (e.blocked) blocks++; if (e.kind === 'arrow') arrows++; if (e.kind === 'lightning') light++; if (log) console.log(b.t.toFixed(2), e.att.team, '->', e.region, e.dmg, e.kind, e.blocked ? 'BLOCK' : '', e.knockdown ? 'KD' : ''); } }
    b.events.length = 0;
  }
  return { winner: b.winner?.team, reason: b.reason, t: b.t, hits, kd, blocks, arrows, light, pd: b.P.damageDealt, ed: b.E.damageDealt, php: b.P.hp, ehp: b.E.hp };
}
const builds = {
  swordHelm: [['sword', 0, 2], ['helmet', 2, 0]],
  sword2Helm: [['sword', 0, 2, 2], ['helmet', 2, 0]],
  naked: [],
};
if (process.argv[2] === 'log') { console.log(run(inv(builds.swordHelm), inv(builds.swordHelm), { log: true })); process.exit(0); }
if (process.argv[2] !== "match") {
const N = +process.argv[2] || 20;
const matchups = [['swordHelm', 'swordHelm'], ['sword2Helm', 'swordHelm'], ['swordHelm', 'naked']];
for (const t of TEMPLATES) matchups.push(['swordHelm', 'tpl:' + t.key]);
for (const [a, bk] of matchups) {
  const agg = { p: 0, e: 0, none: 0, t: 0, hits: 0, kd: 0, ko: 0, ring: 0, time: 0, blocks: 0, arrows: 0, light: 0 };
  for (let i = 0; i < N; i++) {
    let eInv;
    if (bk.startsWith('tpl:')) { const tpl = TEMPLATES.find(t => t.key === bk.slice(4)); eInv = inv(tpl.items.map(([id, x, y]) => [id, x, y])); }
    else eInv = inv(builds[bk]);
    const r = run(inv(builds[a]), eInv);
    agg[r.winner || 'none']++; agg.t += r.t; agg.hits += r.hits; agg.kd += r.kd; agg.blocks += r.blocks; agg.arrows += r.arrows; agg.light += r.light;
    agg[r.reason === 'ring-out' ? 'ring' : r.reason === 'ko' ? 'ko' : 'time']++;
  }
  console.log(`${a} vs ${bk}`.padEnd(30), `P ${agg.p} E ${agg.e} none ${agg.none} | avg ${(agg.t / N).toFixed(1)}s hits ${(agg.hits / N).toFixed(1)} kd ${(agg.kd / N).toFixed(1)} blk ${(agg.blocks / N).toFixed(1)} arr ${(agg.arrows / N).toFixed(1)} ltg ${(agg.light / N).toFixed(1)} | ko ${agg.ko} ring ${agg.ring} time ${agg.time}`);
}

}

// Full-match simulation with a simple greedy player policy vs generated opponents.
export function playerTurn(m) {
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < m.shop.length; i++) {
    if (!m.canAfford(i)) continue;
    const id = m.shop[i].id;
    const dest = m.inv.items.find(x => x.id === id && x.level === 1) || m.inv.items.find(x => x.id === id && x.level === 2 && false);
    if (dest) { m.buyAndMerge(i, dest.uid); continue; }
    const def = IT[id];
    const spot = m.inv.findSpot({ id, level: 1, rot: 0 }, def.regions, regionsTouched);
    if (spot) m.buyAndPlace(i, spot.x, spot.y, spot.rot);
  }
  // merge any pairs
  for (const a of [...m.inv.items]) for (const b of [...m.inv.items]) if (a !== b && m.inv.get(a.uid) && m.inv.get(b.uid) && m.inv.canMerge(a, b)) m.inv.merge(a.uid, b.uid);
}
if (process.argv[2] === 'match') {
  const N = +process.argv[3] || 40;
  const perRound = [0, 0, 0, 0, 0], perRoundN = [0, 0, 0, 0, 0]; let mw = 0;
  for (let k = 0; k < N; k++) {
    const m = new Match();
    // acceptance opening: sword + helmet
    m.buyAndPlace(m.shop.findIndex(o => o.id === 'sword'), 0, 2); m.buyAndPlace(m.shop.findIndex(o => o.id === 'helmet'), 2, 0);
    while (!m.over) {
      if (m.round > 1) playerTurn(m);
      const o = m.makeOpponent();
      const b = new Battle({ playerLoadout: resolveLoadout(m.inv), enemyLoadout: resolveLoadout(o.inv), enemyPurse: o.purse });
      while (!b.done && b.t < 80) { b.step(1 / 120); b.events.length = 0; }
      const won = b.winner === b.P;
      perRound[m.round - 1] += won; perRoundN[m.round - 1]++;
      const r = m.finishRound({ won, damage: b.P.damageDealt, stolen: b.P.stolen, lostToSteal: b.E.stolen });
      if (r.matchOver) { mw += r.matchWinner === 'p'; break; }
      m.nextRound();
    }
  }
  console.log('round win%', perRound.map((w, i) => perRoundN[i] ? Math.round(w / perRoundN[i] * 100) + '%' : '-').join(' '), '| match win', Math.round(mw / N * 100) + '%');
}
