// Sci-fi mech arena: a steel deck plate suspended over a glowing factory pit, bulkhead walls with
// neon strips at both ends, spectator drones, and a dusk city skyline beyond the rear drop-off.
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../config.js';
import { M } from './models.js';

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Procedural deck-plate texture: panel seams, bolts, a few scuffs
function deckTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5a6470'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 1 + Math.random() * 3); }
  x.strokeStyle = '#2c333b'; x.lineWidth = 4;
  x.strokeRect(2, 2, 252, 252); x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2; x.strokeRect(6, 6, 244, 244);
  x.fillStyle = '#9aa5b1';
  for (const [bx, by] of [[14, 14], [242, 14], [14, 242], [242, 242], [114, 14], [142, 242]]) { x.beginPath(); x.arc(bx, by, 4, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function hazardTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#ffb000'; x.fillRect(0, 0, 128, 16);
  x.fillStyle = '#1b1b1b';
  for (let i = -16; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 16); x.lineTo(i + 16, 0); x.lineTo(i + 32, 0); x.lineTo(i + 16, 16); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildArena() {
  const A = CONFIG.arena;
  const g = new THREE.Group();
  const r = rng(7);
  const hasDOM = typeof document !== 'undefined';

  // dusk sky: deep blue top, magenta/orange horizon, dark below
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x141a46) }, mid: { value: new THREE.Color(0xff7a8a) }, bot: { value: new THREE.Color(0x2a1030) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vp; void main(){ float h = normalize(vp).y; vec3 c = h>0.0 ? mix(mid, top, smoothstep(0.0,0.5,h)) : mix(mid, bot, smoothstep(0.0,0.3,-h)); gl_FragColor = vec4(c,1.0); }',
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(120, 24, 12), skyMat));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ color: 0xffd9e6, fog: false }));
  moon.position.set(-28, 26, -90); moon.lookAt(0, 0, 0); g.add(moon);

  // deck plate
  const depth = A.front - A.edge;
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.55 });
  if (hasDOM) { const t = deckTexture(); t.repeat.set((A.halfWidth * 2 + 2) / 2, depth / 2); deckMat.map = t; }
  const plat = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 1.2, depth), [M(0x434b55, { metalness: 0.6, roughness: 0.5 }), M(0x434b55, { metalness: 0.6, roughness: 0.5 }), deckMat, M(0x434b55), M(0x434b55), M(0x434b55)]);
  plat.position.set(0, -0.6, (A.front + A.edge) / 2); plat.receiveShadow = true; g.add(plat);
  // glowing arena ring + centre emblem
  const neon = (c, i = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.4, 64), neon(0x35d6ff, 1.4));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.006, 0.25); g.add(ring);
  const ringC = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 6), neon(0x35d6ff, 1.0));
  ringC.rotation.x = -Math.PI / 2; ringC.position.set(0, 0.007, 0.25); g.add(ringC);
  // start pads in team colours
  for (const [x, c] of [[-2.8, 0x45e5ff], [2.8, 0xff9a3d]]) {
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), neon(c, 1.2));
    pad.rotation.x = -Math.PI / 2; pad.position.set(x, 0.006, 0.3); g.add(pad);
  }

  // rear drop-off: hazard stripe, red warning lights, broken girders sticking out
  const hz = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  if (hasDOM) { const t = hazardTexture(); t.repeat.set(A.halfWidth * 2 / 1.2, 1); hz.map = t; } else hz.color.set(0xffb000);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 0.03, 0.3), hz);
  stripe.position.set(0, 0.01, A.edge + 0.15); g.add(stripe);
  for (let x = -A.halfWidth + 0.5; x < A.halfWidth; x += 2.0) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), neon(0xff2a2a, 2.5));
    l.position.set(x, 0.05, A.edge + 0.02); g.add(l);
  }
  const steel = M(0x4b545f, { metalness: 0.7, roughness: 0.45 });
  const steelDark = M(0x2a3038, { metalness: 0.7, roughness: 0.5 });
  for (let x = -A.halfWidth; x <= A.halfWidth; x += 1.8) {
    const gd = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 1.2 + r() * 0.6), steelDark);
    gd.position.set(x + r() * 0.4, -0.75, A.edge - 0.3); gd.rotation.x = -0.2 - r() * 0.3; gd.castShadow = true; g.add(gd);
  }
  // support truss under the deck
  const face = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 14, 1.2), steelDark);
  face.position.set(0, -8, A.edge + 0.4); g.add(face);
  for (let x = -A.halfWidth; x <= A.halfWidth; x += 2.4) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 12, 0.2), steel);
    brace.position.set(x, -7, A.edge - 0.25); g.add(brace);
  }

  // factory pit far below: molten glow, smoke, foundry towers
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshBasicMaterial({ color: 0x2a1028, fog: false }));
  pit.rotation.x = -Math.PI / 2; pit.position.set(0, -60, -80); g.add(pit);
  for (let i = 0; i < 7; i++) {
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(3 + r() * 4, 60), new THREE.MeshBasicMaterial({ color: 0xff6a2a, fog: false }));
    lava.rotation.x = -Math.PI / 2; lava.position.set((i - 3) * 14 + r() * 6, -59.5, -60); g.add(lava);
  }
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x6a5a7a, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 18; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 3, 10, 8), smokeMat);
    cl.position.set((r() - 0.5) * 90, -24 + r() * 4, -12 - r() * 55); cl.scale.y = 0.3; g.add(cl);
  }
  const foundry = M(0x2a2f3a, { metalness: 0.5, roughness: 0.7, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const w = 3 + r() * 4, h = 16 + r() * 10;
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), foundry);
    c.position.set((i - 4) * 11 + r() * 4, -8 - h / 2, -14 - r() * 6); g.add(c);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.3, 0.1), neon(0xff7a2a, 2));
    vent.position.set(c.position.x, c.position.y + h / 2 - 1, c.position.z + w / 2 + 0.06); g.add(vent);
  }
  // distant city skyline with lit windows
  const towerMat = M(0x1c2240, { roughness: 0.8 });
  const winMat = neon(0xffd27a, 1.2);
  for (let i = 0; i < 16; i++) {
    const h = 10 + r() * 16, w = 3 + r() * 4;
    const tw = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
    tw.position.set((i - 8) * 9 + r() * 5, -22 + h / 2, -92 - r() * 14); g.add(tw);
    for (let k = 0; k < 4; k++) {
      const wn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.4, 0.1), r() > 0.4 ? winMat : neon(0x35d6ff, 1.2));
      wn.position.set(tw.position.x, -22 + h * (0.3 + k * 0.17), tw.position.z + w / 2 + 0.06); g.add(wn);
    }
    if (r() > 0.6) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), neon(0xff2a2a, 3)); b.position.set(tw.position.x, -22 + h + 0.6, tw.position.z); g.add(b); }
  }

  // bulkhead walls at each end with blast doors, neon strips and spectator drones
  const panel = M(0x5d6774, { metalness: 0.6, roughness: 0.45 });
  const panelDark = M(0x353c46, { metalness: 0.6, roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const wx = sx * (A.halfWidth + 0.6);
    const teamCol = sx < 0 ? 0x45e5ff : 0xff9a3d;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, depth + 1), panelDark);
    wall.position.set(wx + sx * 0.3, 1.7, (A.front + A.edge) / 2); wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
    // blast door with team-coloured frame
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.3, 1.7), M(0x20252c, { metalness: 0.5 }));
    door.position.set(wx, 1.15, 0.3); g.add(door);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.9), neon(teamCol, 2)); frameTop.position.set(wx - sx * 0.62, 2.35, 0.3); g.add(frameTop);
    for (const z of [-0.65, 1.25]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 0.1), neon(teamCol, 2)); f.position.set(wx - sx * 0.62, 1.15, z); g.add(f); }
    // pillars with light bars
    for (const z of [A.edge + 0.3, -0.9, 1.5, A.front - 0.2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.6, 0.4), panel);
      col.position.set(wx - sx * 0.65, 1.8, z); col.castShadow = true; g.add(col);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.8, 0.08), neon(teamCol, 1.6));
      lb.position.set(wx - sx * 0.86, 1.8, z); g.add(lb);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, depth + 1), panel);
    lintel.position.set(wx - sx * 0.4, 3.9, (A.front + A.edge) / 2); g.add(lintel);
    // holo screens
    for (const z of [-1.7, 2.4]) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: teamCol, emissive: teamCol, emissiveIntensity: 0.8, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      sc.position.set(wx - sx * 0.9, 2.8, z); sc.rotation.y = sx * Math.PI / 2; g.add(sc);
    }
    // tiered stands holding a crowd of hovering spectator drones
    for (let k = 0; k < 4; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, depth + 3), k % 2 ? panel : panelDark);
      step.position.set(wx + sx * (1.2 + k * 1.1), 3.6 + k * 0.6, (A.front + A.edge) / 2); g.add(step);
      for (let c = 0; c < 9; c++) {
        const d = new THREE.Group();
        d.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.3), M(new THREE.Color().setHSL(0.58 + r() * 0.1, 0.15, 0.35 + r() * 0.2).getHex(), { metalness: 0.6, roughness: 0.4 })));
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), neon(r() > 0.5 ? 0x45e5ff : 0xff9a3d, 2));
        eye.position.set(0, 0.02, 0); eye.rotation.y = 0; d.add(eye);
        eye.position.x = -sx * 0.18; eye.rotation.y = Math.PI / 2;
        d.position.set(wx + sx * (1.2 + k * 1.1), 4.15 + k * 0.6, A.edge + c * (depth / 8));
        d.userData.crowd = r() * 6;
        g.add(d);
      }
    }
  }
  // front barrier (toward the camera) and outer floor
  const lip = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 0.5, 0.4), panel);
  lip.position.set(0, 0.25, A.front + 0.2); lip.receiveShadow = true; g.add(lip);
  const lipLight = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 0.05, 0.05), neon(0x35d6ff, 1.6));
  lipLight.position.set(0, 0.45, A.front - 0.01); g.add(lipLight);
  const outer = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 30), M(0x2e343d, { metalness: 0.4, roughness: 0.7 }));
  outer.position.set(0, -0.62, A.front + 15.4); outer.receiveShadow = true; g.add(outer);
  for (let x = -A.halfWidth; x <= A.halfWidth; x += 2.4) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), panel);
    post.position.set(x, 0.45, A.front + 0.2); post.castShadow = true; g.add(post);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.24), neon(0xffb000, 2));
    tip.position.set(x, 0.93, A.front + 0.2); g.add(tip);
  }

  g.userData.crowd = [];
  g.traverse(o => { if (o.userData && o.userData.crowd !== undefined && o !== g) g.userData.crowd.push(o); });
  return g;
}

// spectator drones bob and spin up when the round ends
export function animateArena(arena, t, cheer = 0) {
  for (const p of arena.userData.crowd) {
    if (p.userData.baseY === undefined) p.userData.baseY = p.position.y;
    p.position.y = p.userData.baseY + Math.sin(t * (2 + cheer * 6) + p.userData.crowd) * (0.05 + cheer * 0.14);
    p.rotation.y = Math.sin(t * 0.7 + p.userData.crowd) * (0.2 + cheer * 0.6);
  }
}

export function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xb8c8ff, 0x3a2a40, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0d0, 2.4);
  sun.position.set(-4, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera; s.left = -9; s.right = 9; s.top = 7; s.bottom = -7; s.near = 1; s.far = 30;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun); scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0xff8acb, 1.0); rim.position.set(3, 4, -8); scene.add(rim);
  const pitGlow = new THREE.PointLight(0xff6a2a, 30, 25); pitGlow.position.set(0, -5, -6); scene.add(pitGlow);
  return { hemi, sun, rim };
}
