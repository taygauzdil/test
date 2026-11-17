// Stylised six-armed battle mech + mecha equipment meshes, built from primitives.
// The visual is driven by the ragdoll joint positions (or a static pose on the prep screen).
import * as THREE from '../../vendor/three.module.js';
import { J, ARM_J } from '../physics/ragdoll.js';
import { ARMS, ARM_INFO } from '../body.js';
import { footprint } from '../items.js';

const geoCache = new Map();
const G = (key, fn) => { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); };
const matCache = new Map();
export const M = (color, opts = {}) => {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts }));
  return matCache.get(k);
};

// Level look: Lv1 gunmetal + cyan energy, Lv2 chrome + magenta energy, Lv3 gold + white-hot energy
const LEVEL_METAL = [
  { color: 0x7d8792, metalness: 0.7, roughness: 0.38 },
  { color: 0xd9e2ea, metalness: 0.85, roughness: 0.22 },
  { color: 0xffc93c, metalness: 0.9, roughness: 0.2, emissive: 0xff8a00, emissiveIntensity: 0.3 },
];
const LEVEL_ENERGY = [0x35d6ff, 0xff3df2, 0xfff1a0];
const metal = lv => M(LEVEL_METAL[lv - 1].color, LEVEL_METAL[lv - 1]);
const energy = lv => M(LEVEL_ENERGY[lv - 1], { emissive: LEVEL_ENERGY[lv - 1], emissiveIntensity: 1.6 + lv * 0.4, roughness: 0.2 });
const glowShell = lv => M(LEVEL_ENERGY[lv - 1], { emissive: LEVEL_ENERGY[lv - 1], emissiveIntensity: 1.2, transparent: true, opacity: 0.35, depthWrite: false });
const gunmetal = M(0x3a414a, { metalness: 0.75, roughness: 0.4 });
const rubber = M(0x1f2329, { roughness: 0.8 });
const hazard = M(0xffb000, { metalness: 0.3, roughness: 0.5 });

const put = (g, m) => (g.add(m), m);
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
const box = (key, w, h, d) => G(key, () => new THREE.BoxGeometry(w, h, d));
const cyl = (key, r1, r2, h, s = 12) => G(key, () => new THREE.CylinderGeometry(r1, r2, h, s));

// ---------- weapons: origin = grip, +Y = blade direction ----------
const BUILDERS = {
  // Laser Blade
  sword(lv) {
    const g = new THREE.Group();
    const L = [0.95, 1.0, 1.08][lv - 1];
    g.add(mesh(cyl('lbhilt', 0.035, 0.035, 0.22), gunmetal, 0, -0.02, 0));
    g.add(mesh(box('lbguard', 0.2, 0.06, 0.08), metal(lv), 0, 0.1, 0));
    g.add(mesh(box('lbcore' + lv, 0.05, L - 0.12, 0.02), energy(lv), 0, 0.12 + (L - 0.12) / 2, 0));
    g.add(mesh(box('lbglow' + lv, 0.11, L - 0.08, 0.06), glowShell(lv), 0, 0.12 + (L - 0.1) / 2, 0));
    g.add(mesh(G('lbcap', () => new THREE.SphereGeometry(0.04, 8, 6)), energy(lv), 0, -0.14, 0));
    return g;
  },
  // Plasma Axe
  axe(lv) {
    const g = new THREE.Group();
    g.add(mesh(cyl('paxs', 0.035, 0.04, 0.95, 8), gunmetal, 0, 0.35, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(cyl('paxr', 0.045, 0.045, 0.03, 8), metal(lv), 0, 0.05 + i * 0.12, 0));
    const r = [0.26, 0.29, 0.33][lv - 1];
    const head = mesh(G('paxh' + lv, () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.1); s.lineTo(0.12, -0.13); s.lineTo(r, -0.05); s.lineTo(r + 0.02, 0.08); s.lineTo(0.12, 0.18); s.lineTo(0, 0.12); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
      geo.translate(0, 0, -0.02); return geo;
    }), metal(lv), 0.02, 0.7, 0);
    g.add(head);
    const edge = mesh(box('paxe' + lv, 0.05, 0.24, 0.06), energy(lv), r + 0.02, 0.71, 0);
    edge.rotation.z = 0.1; g.add(edge);
    if (lv >= 2) { const back = head.clone(); back.scale.x = -0.55; g.add(back); }
    return g;
  },
  // Rail Lance
  spear(lv) {
    const g = new THREE.Group();
    const L = [1.75, 1.85, 1.95][lv - 1];
    g.add(mesh(cyl('rlsh' + lv, 0.03, 0.03, L + 0.45, 8), gunmetal, 0, (L - 0.45) / 2 - 0.12, 0));
    for (const f of [0.35, 0.6, 0.85]) g.add(mesh(box('rlrail', 0.09, 0.08, 0.05), metal(lv), 0, L * f, 0));
    g.add(mesh(G('rltip' + lv, () => new THREE.ConeGeometry(0.06, 0.34, 6)), energy(lv), 0, L - 0.04, 0));
    g.add(mesh(G('rltipg' + lv, () => new THREE.ConeGeometry(0.11, 0.42, 6)), glowShell(lv), 0, L - 0.04, 0));
    return g;
  },
  // Piston Hammer
  hammer(lv) {
    const g = new THREE.Group();
    g.add(mesh(cyl('phs', 0.045, 0.05, 1.0, 8), gunmetal, 0, 0.38, 0));
    const s = [1, 1.12, 1.25][lv - 1];
    const head = new THREE.Group(); head.position.y = 0.88; head.scale.setScalar(s); g.add(head);
    const drum = mesh(cyl('phd', 0.16, 0.16, 0.46, 14), metal(lv)); drum.rotation.z = Math.PI / 2; head.add(drum);
    for (const x of [-0.17, 0.17]) { const band = mesh(cyl('phb', 0.17, 0.17, 0.05, 14), hazard, x, 0, 0); band.rotation.z = Math.PI / 2; head.add(band); }
    const face = mesh(cyl('phf', 0.13, 0.13, 0.04, 14), energy(lv), 0.25, 0, 0); face.rotation.z = Math.PI / 2; head.add(face);
    head.add(mesh(box('phv', 0.18, 0.05, 0.34), rubber, 0, 0.15, 0));
    return g;
  },
  // Blaster Cannon (two-handed ranged weapon; barrel along inner +x, mapped to forward)
  bow(lv) {
    const g = new THREE.Group();
    const barrel = mesh(cyl('blb', 0.06, 0.07, 0.7, 12), metal(lv), 0.25, 0, 0); barrel.rotation.z = Math.PI / 2; g.add(barrel);
    g.add(mesh(box('blbody', 0.36, 0.18, 0.16), gunmetal, -0.05, -0.02, 0));
    const muzzle = mesh(G('blm', () => new THREE.TorusGeometry(0.075, 0.025, 6, 14)), energy(lv), 0.6, 0, 0); muzzle.rotation.y = Math.PI / 2; g.add(muzzle);
    const coil = mesh(cyl('blc', 0.085, 0.085, 0.2, 12), energy(lv), 0.12, 0, 0); coil.rotation.z = Math.PI / 2; coil.scale.set(1, 1, 1); g.add(coil);
    g.add(mesh(box('blgrip', 0.06, 0.16, 0.06), rubber, -0.02, -0.14, 0));
    const charge = mesh(G('blch', () => new THREE.SphereGeometry(0.07, 10, 8)), energy(lv), 0.62, 0, 0);
    g.add(charge); g.userData.charge = charge;
    g.rotation.y = -Math.PI / 2;
    const w = new THREE.Group(); w.add(g); return w;
  },
  // Energy Shield: emitter frame + translucent hard-light disc
  shield(lv) {
    const g = new THREE.Group();
    const r = [0.36, 0.4, 0.44][lv - 1];
    const disc = mesh(G('esd' + lv, () => new THREE.CircleGeometry(r, 6)), M(LEVEL_ENERGY[lv - 1], { emissive: LEVEL_ENERGY[lv - 1], emissiveIntensity: 0.9, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    disc.castShadow = false; g.add(disc);
    const rim = mesh(G('esr' + lv, () => new THREE.TorusGeometry(r, 0.03, 4, 6)), metal(lv)); g.add(rim);
    const hub = mesh(cyl('esh', 0.09, 0.11, 0.06, 6), gunmetal, 0, 0, 0.02); hub.rotation.x = Math.PI / 2; g.add(hub);
    g.add(mesh(G('esc', () => new THREE.SphereGeometry(0.04, 8, 6)), energy(lv), 0, 0, 0.06));
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.add(mesh(box('esn', 0.05, 0.05, 0.05), energy(lv), Math.cos(a) * r, Math.sin(a) * r, 0.02)); }
    g.scale.y = 1.3;
    const w = new THREE.Group(); w.add(g); return w;
  },
  // Sensor Helm: armored crown, visor shield and antennas over the box head
  helmet(lv) {
    const g = new THREE.Group();
    g.add(mesh(box('shcrown', 0.56, 0.12, 0.52), metal(lv), 0, 0.17, 0));
    g.add(mesh(box('shridge', 0.1, 0.1, 0.5), lv === 1 ? hazard : energy(lv), 0, 0.26, 0));
    for (const s of [-1, 1]) g.add(mesh(box('shside', 0.05, 0.3, 0.42), metal(lv), s * 0.29, 0.02, 0));
    g.add(mesh(box('shvis', 0.46, 0.12, 0.03), M(LEVEL_ENERGY[lv - 1], { emissive: LEVEL_ENERGY[lv - 1], emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }), 0, 0.0, 0.27));
    const n = lv === 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0.2 : (i ? 0.2 : -0.2);
      g.add(mesh(cyl('shant', 0.012, 0.012, 0.3, 6), gunmetal, x, 0.4, -0.12));
      g.add(mesh(G('shtip', () => new THREE.SphereGeometry(0.03, 8, 6)), energy(lv), x, 0.56, -0.12));
    }
    return g;
  },
  // Armor Plating for the chassis
  chest(lv) {
    const g = new THREE.Group();
    g.add(mesh(box('apfront', 0.62, 0.44, 0.06), metal(lv), 0, 0.33, 0.24));
    for (const s of [-1, 1]) g.add(mesh(box('apside', 0.06, 0.4, 0.4), metal(lv), s * 0.33, 0.33, 0.02));
    for (let i = 0; i < 3; i++) g.add(mesh(box('apstripe', 0.5, 0.03, 0.02), i === 1 ? energy(lv) : hazard, 0, 0.2 + i * 0.12, 0.28));
    for (const s of [-1, 1]) for (const y of [0.15, 0.51]) g.add(mesh(G('aprivet', () => new THREE.SphereGeometry(0.02, 6, 4)), gunmetal, s * 0.26, y, 0.275));
    return g;
  },
  pauldron(lv) {
    const g = new THREE.Group();
    const p = mesh(box('pauld', 0.26, 0.12, 0.26), metal(lv)); p.rotation.z = 0.15; g.add(p);
    g.add(mesh(box('pauldl', 0.22, 0.02, 0.22), energy(lv), 0, 0.07, 0));
    return g;
  },
  greave(lv) {
    const g = new THREE.Group();
    g.add(mesh(box('grv', 0.24, 0.3, 0.24), metal(lv)));
    g.add(mesh(box('grvl', 0.04, 0.22, 0.02), energy(lv), 0, 0, 0.125));
    g.add(mesh(box('grvk', 0.18, 0.1, 0.12), gunmetal, 0, 0.18, 0.08));
    return g;
  },
  // Tesla Coil
  lightning(lv) {
    const g = new THREE.Group();
    g.add(mesh(cyl('tcb', 0.06, 0.08, 0.06, 10), gunmetal, 0, -0.1, 0));
    for (let i = 0; i < 3; i++) { const ring = mesh(G('tcr', () => new THREE.TorusGeometry(0.06 - 0.008 * 0, 0.015, 6, 14)), metal(lv), 0, -0.05 + i * 0.05, 0); ring.rotation.x = Math.PI / 2; g.add(ring); }
    g.add(mesh(cyl('tcs', 0.025, 0.025, 0.16, 8), metal(lv), 0, -0.01, 0));
    g.add(mesh(G('tco', () => new THREE.IcosahedronGeometry(0.07, 0)), M(0x9fe8ff, { emissive: 0x3fb8ff, emissiveIntensity: 1.6 + lv * 0.4, roughness: 0.2 }), 0, 0.12, 0));
    g.userData.spin = true;
    return g;
  },
  // Hack Module (steals credits)
  coinsteal(lv) {
    const g = new THREE.Group();
    g.add(mesh(box('hmbody', 0.2, 0.16, 0.1), gunmetal));
    g.add(mesh(box('hmscreen', 0.15, 0.1, 0.01), M(0x3dff8a, { emissive: 0x3dff8a, emissiveIntensity: 1.2 + lv * 0.3 }), 0, 0.01, 0.055));
    g.add(mesh(cyl('hmant', 0.008, 0.008, 0.14, 6), metal(lv), 0.07, 0.15, 0));
    for (let i = 0; i < lv; i++) g.add(mesh(box('hmled', 0.025, 0.025, 0.01), M(0xffcf3a, { emissive: 0xffcf3a, emissiveIntensity: 1.5 }), -0.06 + i * 0.04, -0.06, 0.055));
    return g;
  },
};

export function buildItemMesh(id, level) {
  const fn = BUILDERS[id];
  return fn ? fn(level) : new THREE.Group();
}

// ---------- Six-armed battle mech ----------
const PLATES = {
  p: [0x3d8bff, 0x2fb3c9, 0x5a7dff, 0x3dbf8f],
  e: [0xe04a3a, 0xb04ae0, 0xe08a2a, 0xd83a7a],
};
const TEAM = { p: { glow: 0x45e5ff, accent: 0xffd34d }, e: { glow: 0xff9a3d, accent: 0x2b2b2b } };

function limb(len, r, mat) {
  const g = new THREE.Group();
  const m = mesh(G(`limb${len}${r}`, () => new THREE.CapsuleGeometry(r, len, 4, 10)), mat);
  m.position.y = len / 2;
  g.add(m);
  return g;
}

export class GladiatorView {
  constructor(team = 'p', skinIdx = 0) {
    const T = TEAM[team];
    this.team = team;
    this.root = new THREE.Group();
    const plate = M(PLATES[team][skinIdx % 4], { metalness: 0.55, roughness: 0.35 });
    const frame = gunmetal;
    const glow = M(T.glow, { emissive: T.glow, emissiveIntensity: 1.8 });
    const accent = M(T.accent, { metalness: 0.4, roughness: 0.45 });
    this.glowMat = glow;
    this.hurtGlow = M(0xff2a2a, { emissive: 0xff2a2a, emissiveIntensity: 2.2 });
    this.mats = { plate, frame, glow };
    this.highlightMats = {};

    // chassis: armored chest block, glowing reactor core, waist, hip plates, back thrusters
    this.torso = new THREE.Group();
    const chassis = mesh(box('mchassis', 0.62, 0.42, 0.42), plate, 0, 0.32, 0);
    this.torso.add(chassis);
    const upper = mesh(box('mupper', 0.74, 0.2, 0.46), plate, 0, 0.52, 0);
    this.torso.add(upper);
    const core = mesh(cyl('mcore', 0.09, 0.09, 0.05, 16), glow, 0, 0.36, 0.22); core.rotation.x = Math.PI / 2; this.torso.add(core);
    const coreRing = mesh(G('mcorering', () => new THREE.TorusGeometry(0.11, 0.025, 6, 18)), accent, 0, 0.36, 0.225); this.torso.add(coreRing);
    this.core = core;
    this.torso.add(mesh(cyl('mwaist', 0.2, 0.24, 0.16, 10), frame, 0, 0.04, 0));
    for (const s of [-1, 1]) { const hp = mesh(box('mhip', 0.2, 0.18, 0.3), plate, s * 0.2, -0.08, 0.02); hp.rotation.z = s * 0.15; this.torso.add(hp); }
    for (const s of [-1, 1]) {
      const th = mesh(cyl('mthr', 0.07, 0.09, 0.26, 10), frame, s * 0.15, 0.42, -0.26); this.torso.add(th);
      this.torso.add(mesh(cyl('mthrg', 0.055, 0.055, 0.02, 10), glow, s * 0.15, 0.28, -0.26));
    }
    // side rails where the six arms mount
    for (const s of [-1, 1]) this.torso.add(mesh(box('mrail', 0.06, 0.5, 0.24), frame, s * 0.36, 0.3, 0));
    this.root.add(this.torso);
    this.bodyParts = { body: [chassis, upper] };

    // head: box head with visor, brow plates, mouth grille, side receptors and an antenna
    this.head = new THREE.Group();
    const headMesh = mesh(box('mhead', 0.5, 0.4, 0.46), plate, 0, 0, 0);
    this.head.add(headMesh);
    this.head.add(mesh(box('mface', 0.42, 0.3, 0.02), frame, 0, -0.01, 0.235));
    this.visor = mesh(box('mvisor', 0.38, 0.09, 0.02), glow, 0, 0.05, 0.25);
    this.head.add(this.visor);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = mesh(box('meye', 0.1, 0.06, 0.02), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1.5 }), s * 0.1, 0.05, 0.262);
      this.head.add(eye); this.eyes.push(eye);
    }
    this.brows = [];
    for (const s of [-1, 1]) {
      const b = mesh(box('mbrow', 0.18, 0.04, 0.06), accent, s * 0.11, 0.14, 0.24);
      b.rotation.z = -s * 0.25; this.head.add(b); this.brows.push(b);
    }
    this.mouth = new THREE.Group(); this.mouth.position.set(0, -0.1, 0.25); this.head.add(this.mouth);
    for (let i = 0; i < 4; i++) this.mouth.add(mesh(box('mgrille', 0.05, 0.04, 0.02), rubber, -0.09 + i * 0.06, 0, 0));
    this.mouthO = mesh(box('mmouthO', 0.22, 0.06, 0.02), this.hurtGlow, 0, -0.1, 0.26); this.mouthO.visible = false; this.head.add(this.mouthO);
    for (const s of [-1, 1]) { const ear = mesh(cyl('mear', 0.08, 0.08, 0.06, 12), frame, s * 0.27, 0, 0); ear.rotation.z = Math.PI / 2; this.head.add(ear); }
    this.head.add(mesh(cyl('mant', 0.012, 0.012, 0.28, 6), frame, -0.17, 0.32, -0.1));
    this.head.add(mesh(G('mantt', () => new THREE.SphereGeometry(0.03, 8, 6)), glow, -0.17, 0.47, -0.1));
    this.root.add(this.head);
    this.bodyParts.head = [headMesh];

    // six arms: dark frame limbs, armored forearms, ball joints, gripper hands
    this.upper = {}; this.fore = {}; this.handG = {}; this.shoulderBall = {}; this.thigh = {}; this.shin = {}; this.foot = {};
    for (const a of ARMS) {
      const tier = ARM_INFO[a].tier;
      const r = [0.085, 0.08, 0.075][tier];
      this.upper[a] = limb(0.3, r, frame); this.fore[a] = limb(0.28, r * 0.85, frame);
      const shell = mesh(box('mfore' + tier, r * 2.4, 0.2, r * 2.4), plate, 0, 0.15, 0); this.fore[a].add(shell);
      this.fore[a].add(mesh(box('mforel' + tier, r * 2.5, 0.025, r * 2.5), glow, 0, 0.26, 0));
      const upperShell = mesh(box('mupp' + tier, r * 2.2, 0.16, r * 2.2), plate, 0, 0.13, 0); this.upper[a].add(upperShell);
      this.handG[a] = new THREE.Group();
      const palm = mesh(box('mpalm', 0.14, 0.1, 0.12), frame); this.handG[a].add(palm);
      for (const s of [-1, 1]) this.handG[a].add(mesh(box('mfinger', 0.035, 0.1, 0.05), accent, s * 0.045, 0.08, 0.02));
      this.shoulderBall[a] = mesh(G('mshoulder', () => new THREE.SphereGeometry(0.11, 12, 10)), frame);
      this.root.add(this.upper[a], this.fore[a], this.handG[a], this.shoulderBall[a]);
      this.bodyParts[a] = [shell, upperShell, palm];
    }
    for (const l of ['legL', 'legR']) {
      this.thigh[l] = limb(0.32, 0.11, frame); this.shin[l] = limb(0.33, 0.1, frame);
      const thighShell = mesh(box('mthigh', 0.24, 0.22, 0.24), plate, 0, 0.17, 0); this.thigh[l].add(thighShell);
      const shinShell = mesh(box('mshin', 0.22, 0.26, 0.26), plate, 0, 0.2, 0.01); this.shin[l].add(shinShell);
      this.shin[l].add(mesh(box('mshinl', 0.03, 0.2, 0.02), glow, 0, 0.2, 0.14));
      this.foot[l] = new THREE.Group();
      this.foot[l].add(mesh(box('mfoot', 0.22, 0.1, 0.34), frame, 0, -0.03, 0.06));
      this.foot[l].add(mesh(box('mtoe', 0.2, 0.06, 0.08), accent, 0, -0.04, 0.24));
      this.root.add(this.thigh[l], this.shin[l], this.foot[l]);
      this.bodyParts[l] = [thighShell, shinShell];
    }

    this.weaponG = {};
    for (const a of ARMS) { this.weaponG[a] = new THREE.Group(); this.root.add(this.weaponG[a]); }
    this.attached = [];
    this.spinners = [];
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this.frames = {};
    this.root.traverse(o => { if (o.isMesh) o.userData.baseMat = o.material; });
  }

  // Equip from a resolved loadout; inactive items are not shown on the body.
  setLoadout(lo, inv) {
    for (const a of this.attached) a.parent && a.parent.remove(a);
    this.attached = []; this.spinners = [];
    this.weapons = {};
    // limbs that broke off in an earlier round are missing: hide them, the socket glows red
    const broken = new Set(lo.broken || []);
    for (const a of ARMS) {
      const gone = broken.has(a);
      for (const o of [this.upper[a], this.fore[a], this.handG[a], this.weaponG[a]]) o.visible = !gone;
      this.shoulderBall[a].material = gone ? this.hurtGlow : this.shoulderBall[a].userData.baseMat;
    }
    for (const l of ['legL', 'legR']) for (const o of [this.thigh[l], this.shin[l], this.foot[l]]) o.visible = !broken.has(l);
    const add = (parent, obj) => { parent.add(obj); this.attached.push(obj); obj.traverse(o => { if (o.isMesh && o.material && !o.material.transparent) { o.castShadow = true; } }); return obj; };
    for (const it of inv.items) {
      const s = lo.status[it.uid]; if (!s || !s.active) continue;
      const lv = it.level;
      switch (it.id) {
        case 'helmet': add(this.head, buildItemMesh('helmet', lv)); break;
        case 'chest': {
          if (s.regions.includes('body')) { const c = add(this.torso, buildItemMesh('chest', lv)); c.scale.set(1.05, 1.05, 1.08); }
          for (const a of ARMS) if (s.regions.includes(a)) { const p = add(this.upper[a], buildItemMesh('pauldron', lv)); p.position.y = 0.3; p.rotation.z = -ARM_INFO[a].side * 0.4; }
          break;
        }
        case 'legs': for (const l of ['legL', 'legR']) if (s.regions.includes(l)) { const g = add(this.shin[l], buildItemMesh('greave', lv)); g.position.y = 0.2; } break;
        case 'lightning': {
          const g = add(this.root, buildItemMesh('lightning', lv)); g.userData.follow = s.regions.includes('head') ? 'head' : 'body'; g.userData.phase = this.spinners.length * 2.1; this.spinners.push(g); break;
        }
        case 'coinsteal': {
          const g = add(this.torso, buildItemMesh('coinsteal', lv)); g.position.set(s.regions.includes('legR') && !s.regions.includes('legL') ? 0.3 : -0.3, 0.0, 0.16); break;
        }
        case 'shield': {
          const g = add(this.fore[s.arm], buildItemMesh('shield', lv)); g.position.set(0, 0.18, 0); this.weapons[s.arm] = { id: 'shield', obj: g };
          break;
        }
        default: {
          const w = add(this.weaponG[s.arm], buildItemMesh(it.id, lv)); this.weapons[s.arm] = { id: it.id, obj: w, level: lv };
        }
      }
    }
  }

  // Place limbs from joint positions. dirs: optional world weapon directions per arm.
  update(p, opts = {}) {
    const v2 = this._v2;
    const up = new THREE.Vector3().subVectors(p[J.chest], p[J.pelvis]).normalize();
    const right = new THREE.Vector3().subVectors(p[ARM_J.armR1.sh], p[ARM_J.armL1.sh]);
    right.addScaledVector(up, -right.dot(up)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
    this._m.makeBasis(right, up, fwd);
    this.torso.quaternion.setFromRotationMatrix(this._m);
    this.torso.position.copy(p[J.pelvis]);
    this.frames.fwd = fwd; this.frames.right = right;
    const hu = v2.subVectors(p[J.head], p[J.chest]).normalize();
    const hr = right.clone().addScaledVector(hu, -right.dot(hu)).normalize();
    const hf = new THREE.Vector3().crossVectors(hr, hu);
    this._m.makeBasis(hr, hu, hf);
    this.head.quaternion.setFromRotationMatrix(this._m);
    this.head.position.copy(p[J.head]);

    const seg = (obj, a, b) => {
      obj.position.copy(a);
      const d = this._v.subVectors(b, a).normalize();
      const x = new THREE.Vector3().crossVectors(d, fwd);
      if (x.lengthSq() < 1e-4) x.copy(right);
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, d);
      this._m.makeBasis(x, d, z);
      obj.quaternion.setFromRotationMatrix(this._m);
    };
    for (const a of ARMS) {
      const j = ARM_J[a];
      seg(this.upper[a], p[j.sh], p[j.el]); seg(this.fore[a], p[j.el], p[j.ha]);
      this.handG[a].position.copy(p[j.ha]);
      this.handG[a].quaternion.copy(this.fore[a].quaternion);
      this.shoulderBall[a].position.copy(p[j.sh]);
    }
    seg(this.thigh.legL, p[J.hipL], p[J.knL]); seg(this.shin.legL, p[J.knL], p[J.ftL]);
    seg(this.thigh.legR, p[J.hipR], p[J.knR]); seg(this.shin.legR, p[J.knR], p[J.ftR]);
    const yUp = new THREE.Vector3(0, 1, 0);
    for (const [l, jj] of [['legL', J.ftL], ['legR', J.ftR]]) {
      this.foot[l].position.copy(p[jj]);
      this._m.makeBasis(right, yUp, new THREE.Vector3().crossVectors(right, yUp));
      this.foot[l].quaternion.setFromRotationMatrix(this._m);
    }
    for (const a of ARMS) {
      const w = this.weapons && this.weapons[a];
      const j = ARM_J[a];
      if (w && w.id === 'shield') {
        const inv = this.fore[a].quaternion.clone().invert();
        const n = fwd.clone().applyQuaternion(inv);
        const xAx = new THREE.Vector3().crossVectors(yUp, n).normalize();
        const zAx = n.clone().addScaledVector(yUp, -n.dot(yUp)).normalize();
        this._m.makeBasis(xAx, new THREE.Vector3().crossVectors(zAx, xAx), zAx);
        w.obj.quaternion.setFromRotationMatrix(this._m);
        w.obj.position.set(0, 0.17, 0).addScaledVector(zAx, 0.1);
        continue;
      }
      const g = this.weaponG[a];
      g.position.copy(p[j.ha]);
      let d = opts.dirs && opts.dirs[a];
      if (!d) d = this._v.subVectors(p[j.ha], p[j.el]).normalize();
      if (w && w.id === 'bow') {
        // blaster: barrel points forward, slightly raised
        const yb = new THREE.Vector3(0, 1, 0).addScaledVector(fwd, 0.15).normalize();
        const xb = new THREE.Vector3().crossVectors(yb, fwd).normalize();
        this._m.makeBasis(xb, yb, new THREE.Vector3().crossVectors(xb, yb));
        g.quaternion.setFromRotationMatrix(this._m);
        const inner = w.obj.children[0];
        if (inner.userData.charge) inner.userData.charge.scale.setScalar(0.2 + (opts.draws?.[a] || 0) * 1.4);
        continue;
      }
      const x = new THREE.Vector3().crossVectors(d, fwd);
      if (x.lengthSq() < 1e-4) x.copy(right);
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, d);
      this._m.makeBasis(x, d, z);
      g.quaternion.setFromRotationMatrix(this._m);
    }
    const t = opts.time || 0;
    for (const s of this.spinners) {
      const base = s.userData.follow === 'head' ? p[J.head] : p[J.chest];
      const ph = t * 3 + s.userData.phase;
      s.position.set(base.x + Math.cos(ph) * 0.5, base.y + 0.32 + Math.sin(t * 5) * 0.05, base.z + Math.sin(ph) * 0.5);
      s.rotation.y = t * 4;
    }
    // face: visor flashes red and flickers when damaged, brow plates tilt
    const hurt = opts.hurt || 0;
    const flicker = hurt > 0.3 && Math.sin(t * 40) > 0;
    this.visor.material = flicker ? this.hurtGlow : this.glowMat;
    this.core.material = hurt > 0.6 && Math.sin(t * 25) > 0 ? this.hurtGlow : this.glowMat;
    this.mouth.visible = hurt < 0.3; this.mouthO.visible = hurt >= 0.3;
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      this.brows[i].rotation.z = -sd * (0.25 - hurt * 0.7) + (opts.victory ? sd * 0.25 : 0);
      this.brows[i].position.y = 0.14 + hurt * 0.03;
      this.eyes[i].scale.y = hurt > 0.5 ? 0.35 : (Math.sin(t * 1.3 + i * 0.01) > 0.985 ? 0.15 : 1);
    }
  }

  // Region highlight (prep screen): color = hex or null
  highlight(region, color, strength = 0.5) {
    for (const m of this.bodyParts[region] || []) {
      if (color == null) { m.material = m.userData.baseMat; continue; }
      const k = region + color + strength + m.userData.baseMat.uuid;
      if (!this.highlightMats[k]) { const mm = m.userData.baseMat.clone(); mm.emissive = new THREE.Color(color); mm.emissiveIntensity = strength; this.highlightMats[k] = mm; }
      m.material = this.highlightMats[k];
    }
  }
}

export { footprint };
