// PvP balance check: scripted player policies vs the bot, first to 3 round wins.
const S = require('./sim.js');
let BG = 10;
const pick = (deck, pol) => {
  if (pol === 'bot') return S.draftBot(deck, BG);
  let disc = S.MAX_DISCARDS, pool = S.drawPool(deck, BG), b = BG, got = [];
  while (pool.length) { pool = pool.filter(id => S.UNITS[id].cost <= b); if (!pool.length) break; const id = pool.shift(); if (pol === 'greedy' || disc <= 0 || S.UNITS[id].cost >= 2 || Math.random() < .5) { b -= S.UNITS[id].cost; got.push(id); } else disc--; }
  return got;
};
const mk = id => ({ uid: Math.random(), id, hp: S.UNITS[id].hp, maxHp: S.UNITS[id].hp });
function match(deckA, polA, deckB) {
  let A = [], B = [], wa = 0, wb = 0;
  for (let r = 0; r < S.ROUNDS && wa < 3 && wb < 3; r++) {
    BG = S.budgetFor(r + 1); A.push(...pick(deckA, polA).map(mk)); B.push(...S.draftBot(deckB, BG).map(mk));
    const st = S.createBattle(A, B); let n = 0; while (!st.winner && n++ < 4000) S.step(st, 1 / 30);
    const heal = u => ({ uid: u.srcUid, id: u.id, hp: Math.min(u.maxHp, Math.ceil(u.hp + u.maxHp * .4)), maxHp: u.maxHp });
    const keep = t => st.units.filter(u => u.team === t).map(u => u.alive ? heal(u) : { uid: u.srcUid, id: u.id, maxHp: u.maxHp, hp: Math.ceil(u.maxHp * .5) });
    if (st.winner === 'p') wa++; else wb++; A = keep('p'); B = keep('e');
  }
  return wa > wb;
}
const starter = ['deckhand', 'raider', 'guard', 'archer', 'bomber'];
const all = ['raider', 'guard', 'longbow', 'bomber', 'cannon'];
const elite = ['captain', 'elitebomb', 'cannon', 'sharp', 'guard'];
const botStarter = () => S.genOpponentDeck(['deckhand', 'raider', 'guard', 'archer', 'longbow', 'bomber']);
for (const [n, d, bd] of [['starter vs starter-bot', starter, botStarter], ['elite vs starter-bot', elite, botStarter], ['starter vs elite-bot', starter, () => elite], ['all vs all-bot', all, () => S.genOpponentDeck(S.ORDER)]])
  for (const pol of ['greedy', 'pick', 'bot']) {
    let w = 0; for (let i = 0; i < 300; i++) w += match(d, pol, bd());
    console.log(n.padEnd(24), pol.padEnd(7), 'win', (w / 3).toFixed(0) + '%');
  }
