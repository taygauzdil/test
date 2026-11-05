// Bootstrap: renderer, scenes, screen flow (title -> prep -> combat -> results -> ...).
import * as THREE from '../vendor/three.module.js';
import { Match } from './match.js';
import { PrepUI, scoreboardHTML } from './ui/prep.js';
import { GladiatorView, M } from './render/models.js';
import { buildArena, animateArena, makeLights } from './render/arena.js';
import { FX } from './render/fx.js';
import { buildIcons } from './render/icons.js';
import { aPose, makePose } from './combat/animation.js';
import { Battle } from './combat/battle.js';
import { resolveLoadout } from './loadout.js';
import { J } from './physics/ragdoll.js';
import { ITEMS } from './items.js';
import { CONFIG } from './config.js';
import { SFX } from './audio.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const canvas = $('#gl');

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

buildIcons();

// simple procedural environment map so metals read as shiny
function makeEnv() {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = mix(vec3(0.55,0.36,0.22), vec3(1.0,0.86,0.66), smoothstep(-0.3,0.1,h)); c = mix(c, vec3(0.45,0.7,1.0), smoothstep(0.2,0.9,h)); gl_FragColor = vec4(c,1.0); }' }));
  env.add(sky);
  for (const [x, y, z, s] of [[3, 5, 4, 2.5], [-4, 3, 2, 1.5], [0, 6, -3, 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    b.position.set(x, y, z); b.lookAt(0, 0, 0); env.add(b);
  }
  const tex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return tex;
}
const envMap = makeEnv();

// ---------------- prep scene ----------------
const prepScene = new THREE.Scene();
prepScene.environment = envMap; prepScene.environmentIntensity = 0.7;
prepScene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a5a3a, 1.6));
const key = new THREE.DirectionalLight(0xffe8c8, 2.2); key.position.set(-2, 4, 6); prepScene.add(key);
const fill = new THREE.DirectionalLight(0x9fd0ff, 0.6); fill.position.set(3, 1, 3); prepScene.add(fill);
const prepCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
prepCam.position.set(0, 1.2, 10); prepCam.lookAt(0, 1.2, 0);
const prepHero = new GladiatorView('p');
prepScene.add(prepHero.root);
const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x3a1a08, transparent: true, opacity: 0.25 }));
shadowDisc.rotation.x = -Math.PI / 2; shadowDisc.scale.y = 0.5; shadowDisc.position.y = 0.01; prepScene.add(shadowDisc);
const prepPose = makePose();
const CELL_WORLD = 1.88 / 6.5;
const PREP_DIRS = { armL: new THREE.Vector3(-0.3, -1, 0.35).normalize(), armR: new THREE.Vector3(0.3, -1, 0.35).normalize() };      // head centre at row 1.5, feet at row 8

// ---------------- combat scene ----------------
const combatScene = new THREE.Scene();
combatScene.environment = envMap; combatScene.environmentIntensity = 0.6;
combatScene.fog = new THREE.Fog(0xffd9b0, 30, 110);
const arena = buildArena();
combatScene.add(arena);
makeLights(combatScene);
const combatCam = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 300);
combatCam.position.set(0, 3, 10);
const fx = new FX(combatScene, combatCam, $('#overlay'));
let views = null;
let battle = null;
let battleSpeed = 1;
let camState = { x: 0, y: 1.6, dist: 8, shakeT: 0 };

function buildArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), M(0x8a5a32));
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), M(0xb0b8c0, { metalness: 0.7 })); tip.position.y = 0.39; g.add(tip);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.005), M(0xffffff)); fl.position.y = -0.3; g.add(fl);
  const fl2 = fl.clone(); fl2.rotation.y = Math.PI / 2; g.add(fl2);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------- state / UI ----------------
const match = new Match();
let mode = 'title';
let hoverRegions = [];
let hoverMode = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1700);
}

function flyCoins(fromX, fromY, n, delay = 0) {
  const a = app.getBoundingClientRect();
  const to = $('#coinBox').getBoundingClientRect();
  const count = Math.min(10, Math.max(1, n));
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'coin-ico fly-coin';
    c.style.left = (fromX - a.left - 11 + (Math.random() - 0.5) * 30) + 'px';
    c.style.top = (fromY - a.top - 11 + (Math.random() - 0.5) * 20) + 'px';
    app.appendChild(c);
    setTimeout(() => {
      c.style.transform = `translate(${to.left - a.left + 8 - parseFloat(c.style.left)}px, ${to.top - a.top + 6 - parseFloat(c.style.top)}px) scale(.8)`;
      c.style.opacity = '0.2';
      setTimeout(() => { c.remove(); SFX.coin(); $('#coinBox').classList.remove('bump'); void $('#coinBox').offsetWidth; $('#coinBox').classList.add('bump'); }, 700);
    }, delay + i * 70);
  }
}

const prep = new PrepUI({
  match,
  toast, flyCoins,
  onChange: lo => prepHero.setLoadout(lo, match.inv),
  onHover: (regions, m) => { hoverRegions = regions; hoverMode = m; },
  onFight: () => startBattle(),
});

function show(id) {
  for (const s of ['#prep', '#hud']) $(s).classList.toggle('on', s === id);
}

function goPrep() {
  mode = 'prep';
  show('#prep');
  $('#modal').classList.add('hidden');
  requestAnimationFrame(() => { prep.layout(); });
}

// ---------------- combat flow ----------------
function startBattle() {
  const opp = match.makeOpponent();
  const pl = resolveLoadout(match.inv), el = resolveLoadout(opp.inv);
  battle = new Battle({ playerLoadout: pl, enemyLoadout: el, playerName: 'YOU', enemyName: opp.name.toUpperCase(), enemyPurse: opp.purse, playerPurse: 6 + match.round * 2 });
  battle.opp = opp;
  if (views) for (const v of views) combatScene.remove(v.root);
  const pv = new GladiatorView('p', 0), ev = new GladiatorView('e', 1 + (match.round % 3));
  pv.setLoadout(pl, match.inv); ev.setLoadout(el, opp.inv);
  for (const v of [pv, ev]) { v.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); combatScene.add(v.root); }
  views = [pv, ev];
  fx.clear();
  camState = { x: 0, y: 1.4, dist: 9, shakeT: 0 };
  $('#pName').textContent = 'YOU';
  $('#eName').textContent = `${opp.name.toUpperCase()}`;
  $('#hudSub').textContent = `ROUND ${match.round} · vs ${opp.template.name}`;
  $('#hudScore').innerHTML = hudScore();
  perkHud($('#pPerks'), battle.P); perkHud($('#ePerks'), battle.E);
  battleSpeed = 1; $('#speedBtn').textContent = '▶ 1x';
  mode = 'combat';
  show('#hud');
  banner(`ROUND ${match.round}<small>${opp.name} enters the arena!</small>`, 'b-fight');
  updateHpBars(true);
}

function hudScore() {
  const dots = n => Array.from({ length: CONFIG.maxRounds }, (_, i) => `<i class="dot${i < n ? ' on' : ''}"></i>`).join('');
  return `R${match.round}<div class="dots p">${dots(match.wins.p)}</div><div class="dots e">${dots(match.wins.e)}</div>`;
}

function perkHud(el, f) {
  el.innerHTML = f.perks.map((p, i) => `<div class="perk" data-i="${i}"><span>${p.id === 'lightning' ? '⚡' : '💰'}</span></div>`).join('');
}

function banner(html, cls, stay = false) {
  const b = $('#banner');
  b.className = ''; void b.offsetWidth;
  b.innerHTML = html; b.className = `${cls} ${stay ? 'stay' : 'show'}`;
}

function updateHpBars(instant) {
  for (const [f, k] of [[battle.P, 'p'], [battle.E, 'e']]) {
    const pct = Math.max(0, f.hp / f.maxHp * 100);
    $(`#${k}Hp`).style.width = pct + '%';
    $(`#${k}HpLag`).style.width = pct + '%';
    $(`#${k}HpTxt`).textContent = `${Math.ceil(f.hp)} / ${f.maxHp}`;
    const perks = $(`#${k}Perks`).children;
    f.perks.forEach((p, i) => {
      const el = perks[i]; if (!el) return;
      const prog = 1 - Math.max(0, p.t) / p.st.cooldown;
      el.style.setProperty('--p', prog.toFixed(3));
      el.classList.toggle('ready', prog > 0.97);
    });
  }
}

function handleEvents() {
  for (const e of battle.events) {
    switch (e.type) {
      case 'hit': {
        const toEnemy = e.def === battle.E;
        if (e.blocked) {
          fx.burst(e.pos, { n: 12, color: 0xcfe8ff, speed: 5, life: 0.35 });
          fx.impactRing(e.pos, 0xbfe6ff, 0.8);
          fx.text(e.pos, `BLOCK ${e.dmg}`, 'block');
          SFX.block();
        } else if (e.magic) {
          fx.text(e.pos, `⚡${e.dmg}`, 'magic big');
        } else {
          fx.burst(e.pos, { n: e.heavy ? 26 : 14, color: e.heavy ? 0xffa040 : 0xffe066, speed: e.heavy ? 6 : 4, life: 0.45, size: e.heavy ? 1.4 : 1 });
          fx.burst(e.pos, { n: 6, color: 0xffffff, speed: 3, life: 0.25 });
          fx.impactRing(e.pos, e.heavy ? 0xffc04d : 0xffffff, e.heavy ? 1.4 : 0.9);
          fx.text(e.pos, `${e.dmg}${e.region === 'head' ? '!' : ''}`, (toEnemy ? 'dmg-p' : 'dmg-e') + (e.heavy || e.region === 'head' ? ' big' : ''));
          SFX.hit(e.heavy);
          fx.addShake(e.heavy ? 0.3 : 0.08);
        }
        if (e.knockdown && e.def.hp > 0) { fx.text(e.def.headPos.clone().add(new THREE.Vector3(0, 0.6, 0)), 'KNOCKDOWN!', 'call'); fx.addShake(0.25); }
        break;
      }
      case 'swing': SFX.swing(e.kind === 'slam' || e.kind === 'chop'); break;
      case 'arrow': SFX.bow(); break;
      case 'lightning': {
        const from = e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 9, -1));
        fx.lightning(from, e.pos, e.level); SFX.zap(); fx.addShake(0.15);
        const pe = $(`#${e.f.team}Perks .perk[data-i="${e.f.perks.findIndex(p => p.id === 'lightning')}"]`);
        if (pe) { pe.classList.remove('fire'); void pe.offsetWidth; pe.classList.add('fire'); }
        break;
      }
      case 'steal': {
        fx.text(e.f.headPos.clone().add(new THREE.Vector3(0, 0.5, 0)), `+${e.n} 🪙`, 'gold');
        fx.text(e.foe.headPos.clone().add(new THREE.Vector3(0, 0.5, 0)), `-${e.n} 🪙`, 'dmg-e');
        fx.burst(e.foe.headPos, { n: 8, color: 0xffcf3a, speed: 3, life: 0.6 });
        SFX.steal();
        break;
      }
      case 'edge': fx.text(e.f.headPos.clone().add(new THREE.Vector3(0, 0.6, 0)), 'WHOAAA!', 'call'); SFX.fall(); break;
      case 'fight': banner('FIGHT!', 'b-fight'); SFX.fight(); break;
      case 'end': {
        const won = e.winner === battle.P;
        const why = e.reason === 'ring-out' ? 'RING OUT!' : e.reason === 'ko' ? 'K.O.!' : 'TIME!';
        setTimeout(() => { banner(`${won ? 'VICTORY' : 'DEFEAT'}<small>${why}</small>`, won ? 'win' : 'lose', true); won ? SFX.win() : SFX.lose(); }, 350);
        battle.hitStop = 0.25;
        fx.addShake(0.3);
        break;
      }
    }
  }
  battle.events.length = 0;
}

function finishBattle() {
  const won = battle.winner === battle.P;
  const res = match.finishRound({ won, damage: battle.P.damageDealt, stolen: battle.P.stolen, lostToSteal: battle.E.stolen, reason: battle.reason, foe: battle.opp.name });
  mode = 'results';
  const rows = res.rewards.rows.map(([k, v]) => `<tr><td>${k}</td><td class="${v < 0 ? 'neg' : ''}">${v >= 0 ? '+' : ''}${v}</td></tr>`).join('');
  const reason = battle.reason === 'ring-out' ? (won ? `${battle.opp.name} fell off the cliff!` : 'You fell off the cliff!') : battle.reason === 'ko' ? (won ? `${battle.opp.name} was knocked out` : 'You were knocked out') : 'Time ran out - higher HP wins';
  const modal = $('#modal');
  modal.innerHTML = `<div class="mcard"><h2 class="${won ? 'win' : 'lose'}">${won ? 'ROUND WON' : 'ROUND LOST'}</h2><div class="sub">${reason}</div>
    <div class="hist"><span class="w">YOU ${match.wins.p}</span><span class="l">ENEMY ${match.wins.e}</span></div>
    <table>${rows}<tr class="total"><td>Total</td><td>${res.rewards.total >= 0 ? '+' : ''}${res.rewards.total} 🪙</td></tr></table>
    <div class="big-coins"><span class="coin-ico" style="width:26px;height:26px"></span><span id="coinCount">${match.coins - res.gained}</span></div>
    <button id="contBtn">${res.matchOver ? 'SEE RESULT' : 'CONTINUE'}</button></div>`;
  modal.classList.remove('hidden');
  // count-up animation
  const from = match.coins - res.gained, to = match.coins;
  let k = 0; const steps = Math.max(1, Math.abs(to - from));
  const iv = setInterval(() => { k++; $('#coinCount').textContent = Math.round(from + (to - from) * Math.min(1, k / steps)); if (to > from) SFX.coin(); if (k >= steps) clearInterval(iv); }, 90);
  $('#contBtn').onclick = () => {
    SFX.click(); clearInterval(iv);
    if (res.matchOver) showMatchEnd(res.matchWinner);
    else { match.nextRound(); goPrep(); }
  };
}

function showMatchEnd(w) {
  mode = 'matchEnd';
  const won = w === 'p';
  const hist = match.history.map(h => `<span class="${h.won ? 'w' : 'l'}">R${h.round} ${h.won ? 'WIN' : 'LOSS'}</span>`).join('');
  $('#modal').innerHTML = `<div class="mcard"><h2 class="${won ? 'win' : 'lose'}">${won ? 'CHAMPION!' : 'DEFEATED'}</h2>
    <div class="sub">${won ? 'The crowd chants your name!' : 'The arena claims another hero...'}</div>
    <div class="score-big"><span class="p">${match.wins.p}</span> – <span class="e">${match.wins.e}</span></div>
    <div class="hist">${hist}</div>
    <button id="againBtn">PLAY AGAIN</button></div>`;
  $('#modal').classList.remove('hidden');
  won ? SFX.win() : SFX.lose();
  $('#againBtn').onclick = () => { SFX.click(); match.reset(); goPrep(); };
}

function showTitle() {
  mode = 'title';
  show('#prep');
  $('#modal').innerHTML = `<div class="mcard"><div class="title-logo">GLADIATOR<small>BACKPACK</small></div>
    <ol class="howto"><li>Buy gear in the shop and drag it into the backpack grid.</li><li>Gear only works if its cells <b>touch the right body part</b> - weapons need an arm, helmets the head.</li><li>One active weapon per arm. Drop identical items on each other to <b>merge</b>.</li><li>Press FIGHT and watch the brawl. Knock foes off the cliff or KO them.</li><li>First to <b>3 round wins</b> takes the match.</li></ol>
    <button id="startBtn">PLAY</button></div>`;
  $('#modal').classList.remove('hidden');
  prep.layout();
  $('#startBtn').onclick = () => { SFX.unlock(); SFX.click(); goPrep(); };
}

$('#speedBtn').onclick = () => { battleSpeed = battleSpeed === 1 ? 2 : battleSpeed === 2 ? 3 : 1; $('#speedBtn').textContent = `▶ ${battleSpeed}x`; SFX.click(); };
$('#muteBtn').onclick = () => { const m = SFX.toggleMute(); $('#muteBtn').textContent = m ? '🔇' : '🔊'; };

// ---------------- resize / loop ----------------
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  combatCam.aspect = w / h; combatCam.updateProjectionMatrix();
  if (mode === 'prep' || mode === 'title') prep.layout();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let t = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  const w = app.clientWidth, h = app.clientHeight;
  if (mode === 'prep' || mode === 'title') renderPrep(dt, w, h);
  else renderCombat(dt, w, h);
}

function renderPrep(dt, w, h) {
  const r = prep.gridRect();
  aPose(t, prepPose);
  prepHero.update(prepPose, { time: t, dirs: PREP_DIRS });
  // region highlight while dragging
  for (const reg of ['head', 'body', 'armL', 'armR', 'legL', 'legR']) {
    const on = hoverRegions.includes(reg);
    prepHero.highlight(reg, on ? (hoverMode === 'bad' ? 0xff3b3b : hoverMode === 'merge' ? 0xffc800 : 0x29ff8a) : null, 0.35 + 0.25 * Math.sin(t * 10));
  }
  // ortho camera: 1 grid cell = CELL_WORLD, aligned so the body sits in the grid hole
  const C = CELL_WORLD, k = C / r.cell;
  const gridTop = 1.88 + 1.5 * C, gridLeft = -3 * C;
  prepCam.left = gridLeft - r.x * k; prepCam.right = prepCam.left + w * k;
  prepCam.top = gridTop + r.y * k; prepCam.bottom = prepCam.top - h * k;
  prepCam.position.set(0, 0, 10); prepCam.lookAt(0, 0, 0);
  prepCam.updateProjectionMatrix();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  renderer.render(prepScene, prepCam);
}

function renderCombat(dt, w, h) {
  renderer.shadowMap.enabled = true;
  if (battle && mode === 'combat') {
    battle.update(dt * battleSpeed);
    handleEvents();
    updateHpBars();
    if (battle.done) finishBattle();
  }
  if (battle) {
    battle.fighters.forEach((f, i) => {
      const draws = {};
      if (f.attacking && f.attacking.kind === 'shoot') draws[f.bowArm] = Math.min(1, f.attacking.t / f.attacking.dur / 0.7) * (f.attacking.fired ? 0 : 1);
      views[i].update(f.rd.p, { dirs: { armL: f.arms.armL.wdir, armR: f.arms.armR.wdir }, hurt: f.state === 'ko' || f.state === 'falling' || f.state === 'fallen' ? 1 : f.face.hurt, time: t + i, draws, victory: f.state === 'victory' });
    });
    fx.syncArrows(battle.arrows, buildArrow);
    updateCamera(dt);
  }
  animateArena(arena, t, battle && battle.winner ? 1 : 0.2);
  fx.update(dt, w, h);
  renderer.setClearColor(0x000000, 1);
  renderer.render(combatScene, combatCam);
}

function updateCamera(dt) {
  const [P, E] = battle.fighters;
  const pa = P.rd.p[J.pelvis], pb = E.rd.p[J.pelvis];
  const fallen = [P, E].find(f => f.state === 'falling' || f.state === 'fallen');
  const mx = (pa.x + pb.x) / 2;
  const sep = Math.abs(pa.x - pb.x);
  // fit both fighters horizontally in a portrait frustum
  const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(combatCam.fov / 2)) * combatCam.aspect);
  const need = sep + 2.6;
  let dist = Math.max(6.5, need / 2 / Math.tan(hf));
  dist = Math.min(dist, 16);
  let ty = 1.1, tz = Math.min(pa.z, pb.z) * 0.4;
  if (fallen) {
    // falling sequence: hang over the cliff edge and watch them drop
    const fp = fallen.rd.p[J.pelvis];
    const k2 = 1 - Math.exp(-dt * 2.5);
    camState.fall = camState.fall || { x: combatCam.position.x, y: combatCam.position.y, z: combatCam.position.z, lx: camState.x, ly: 1, lz: 0 };
    const F = camState.fall;
    F.x += (fp.x + 3.4 - F.x) * k2; F.y += (3.4 - F.y) * k2; F.z += (CONFIG.arena.edge - 0.1 - F.z) * k2;
    F.lx += (fp.x - F.lx) * k2; F.ly += (Math.max(-14, fp.y) - F.ly) * k2; F.lz += (fp.z - F.lz) * k2;
    const s = fx.shake;
    combatCam.position.set(F.x + (Math.random() - 0.5) * s, F.y, F.z);
    combatCam.lookAt(F.lx, F.ly, F.lz);
    return;
  }
  camState.fall = null;
  const k = 1 - Math.exp(-dt * 3);
  camState.x += (mx - camState.x) * k;
  camState.dist += (dist - camState.dist) * k;
  camState.y += (ty - camState.y) * k;
  camState.z = (camState.z ?? tz) + (tz - (camState.z ?? tz)) * k;
  const s = fx.shake;
  const sx = (Math.random() - 0.5) * s, sy = (Math.random() - 0.5) * s;
  combatCam.position.set(camState.x + sx, camState.y + 1.2 + camState.dist * 0.36 + sy, camState.z + camState.dist);
  combatCam.lookAt(camState.x, camState.y - 0.15, camState.z - 1.0);
}

showTitle();
frame();

// debug / automation hooks
// debug: fight a given build vs a template (used by automated screenshots)
window.__debugFight = async (playerItems, tplKey, level = 1) => {
  const { Inventory, newUid } = await import('./inventory.js');
  const { TEMPLATES } = await import('./opponents.js');
  match.inv = new Inventory();
  for (const [id, x, y, lv = 1, rot = 0] of playerItems) match.inv.place({ uid: newUid(), id, level: lv, rot }, x, y, rot);
  const tpl = TEMPLATES.find(t => t.key === tplKey);
  const oi = new Inventory();
  for (const [id, x, y] of tpl.items) oi.place({ uid: newUid(), id, level, rot: 0 }, x, y, 0);
  match.makeOpponent = () => ({ inv: oi, template: tpl, name: tpl.names[0], purse: 10 });
  $('#modal').classList.add('hidden');
  startBattle();
};
window.__game = { match, prep, get battle() { return battle; }, startBattle, goPrep, get mode() { return mode; }, setSpeed: s => (battleSpeed = s) };
