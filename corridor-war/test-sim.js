// Headless balance / performance check: node corridor-war/test-sim.js
const path = require('path');
for (const f of ['config', 'map', 'economy', 'spawning', 'combat', 'battle', 'ai']) require(path.join(__dirname, 'js', f + '.js'));
const CC = globalThis.CC;
let t0 = Date.now();
const map = CC.Map.create();
console.log('map built in', Date.now() - t0, 'ms; torches', map.torches.length);
const N = +process.argv[2] || 6;
for (let g = 0; g < N; g++) {
  const b = CC.Battle.create({ map, blueDeck: CC.CONFIG.defaultDeck, redDeck: CC.CONFIG.aiDeck, seed: g + 1 });
  b.controllers.push(CC.AI.create('red'));
  if (g % 2) b.controllers.push(CC.AI.create('blue'));   // odd: AI vs AI; even: idle blue (never upgrades)
  t0 = Date.now(); let peak = 0, steps = 0;
  while (!b.over && b.time < 900) { CC.Battle.step(b, CC.CONFIG.sim.dt); b.events.length = 0; peak = Math.max(peak, b.units.length); steps++; }
  const ms = Date.now() - t0;
  console.log(`game ${g} ${g % 2 ? 'AIvAI ' : 'idleBlue'} winner=${b.winner} t=${b.time.toFixed(0)}s peakUnits=${peak} ms/step=${(ms / steps).toFixed(2)}`,
    'blueLv', JSON.stringify(b.sides.blue.eco.levels), 'redLv', JSON.stringify(b.sides.red.eco.levels),
    'baseHP', b.sides.blue.base.hp.toFixed(0), b.sides.red.base.hp.toFixed(0));
}
