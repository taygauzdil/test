// Stylised cartoon gladiator + equipment meshes, built from primitives.
// The visual is driven by 15 joint positions (from the ragdoll or a static pose).
import * as THREE from '../../vendor/three.module.js';
import { J } from '../physics/ragdoll.js';
import { footprint } from '../items.js';

const geoCache = new Map();
const G = (key, fn) => { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); };
const matCache = new Map();
export const M = (color, opts = {}) => {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts }));
  return matCache.get(k);
};

// Level look: Lv1 iron/wood, Lv2 polished steel + blue gem, Lv3 gold + glow
export const LEVEL_METAL = [
  { color: 0x9aa3ad, metalness: 0.55, roughness: 0.42 },
  { color: 0xd6e4f0, metalness: 0.75, roughness: 0.25, emissive: 0x1d4b8f, emissiveIntensity: 0.25 },
  { color: 0xffc93c, metalness: 0.85, roughness: 0.22, emissive: 0xff8a00, emissiveIntensity: 0.45 },
];
export const LEVEL_GEM = [0x7a5a3a, 0x3fa9ff, 0xff3df2];
const metal = lv => M(LEVEL_METAL[lv - 1].color, LEVEL_METAL[lv - 1]);
const gem = lv => M(LEVEL_GEM[lv - 1], { emissive: LEVEL_GEM[lv - 1], emissiveIntensity: lv > 1 ? 0.8 : 0.1, roughness: 0.2 });
const wood = M(0x8a5a32, { roughness: 0.8 });
const leather = M(0x6b3f24, { roughness: 0.9 });

const put = (g, m) => (g.add(m), m);
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- weapons: origin = grip, +Y = blade direction ----------
const BUILDERS = {
  sword(lv) {
    const g = new THREE.Group();
    const L = [0.95, 1.0, 1.08][lv - 1];
    const blade = mesh(G('blade' + lv, () => {
      const s = new THREE.Shape();
      s.moveTo(-0.055, 0); s.lineTo(0.055, 0); s.lineTo(0.05, L - 0.28); s.lineTo(0, L - 0.1); s.lineTo(-0.05, L - 0.28); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
      geo.translate(0, 0.1, -0.01); return geo;
    }), metal(lv));
    g.add(blade);
    g.add(mesh(G('guard', () => new THREE.BoxGeometry(0.3, 0.05, 0.07)), lv === 3 ? metal(3) : M(0xb5893c, { metalness: 0.6, roughness: 0.4 }), 0, 0.09, 0));
    g.add(mesh(G('grip', () => new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8)), leather, 0, -0.02, 0));
    g.add(mesh(G('pommel', () => new THREE.SphereGeometry(0.045, 10, 8)), gem(lv), 0, -0.13, 0));
    if (lv > 1) g.add(mesh(G('gemc', () => new THREE.OctahedronGeometry(0.035)), gem(lv), 0, 0.09, 0.045));
    return g;
  },
  axe(lv) {
    const g = new THREE.Group();
    g.add(mesh(G('axeh', () => new THREE.CylinderGeometry(0.035, 0.04, 0.95, 8)), wood, 0, 0.35, 0));
    const head = mesh(G('axeb' + lv, () => {
      const s = new THREE.Shape(); const r = [0.26, 0.29, 0.33][lv - 1];
      s.moveTo(0, -0.1); s.lineTo(0.12, -0.12); s.quadraticCurveTo(r + 0.05, 0, 0.12, 0.17); s.lineTo(0, 0.12); s.closePath();
      if (lv > 1) { s.moveTo(0, 0.1); }
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
      geo.translate(0, 0, -0.02); return geo;
    }), metal(lv), 0.02, 0.7, 0);
    g.add(head);
    if (lv >= 2) { const back = head.clone(); back.scale.x = -0.6; g.add(back); }
    g.add(mesh(G('axecap', () => new THREE.SphereGeometry(0.05, 8, 6)), gem(lv), 0, 0.83, 0));
    return g;
  },
  spear(lv) {
    const g = new THREE.Group();
    const L = [1.75, 1.85, 1.95][lv - 1];
    g.add(mesh(G('spsh' + lv, () => new THREE.CylinderGeometry(0.03, 0.03, L + 0.45, 8)), wood, 0, (L - 0.45) / 2 - 0.12, 0));
    g.add(mesh(G('sptip' + lv, () => new THREE.ConeGeometry(0.075, 0.32, 4)), metal(lv), 0, L - 0.05, 0));
    put(g, mesh(G('spring', () => new THREE.TorusGeometry(0.04, 0.015, 6, 12)), gem(lv), 0, L - 0.22, 0)).rotation.x = Math.PI / 2;
    if (lv === 3) g.add(mesh(G('sprib', () => new THREE.BoxGeometry(0.05, 0.25, 0.01)), M(0xff3355), 0.05, L - 0.3, 0));
    return g;
  },
  hammer(lv) {
    const g = new THREE.Group();
    g.add(mesh(G('hmh', () => new THREE.CylinderGeometry(0.04, 0.045, 1.0, 8)), wood, 0, 0.38, 0));
    const s = [1, 1.12, 1.25][lv - 1];
    const head = mesh(G('hmb', () => new THREE.BoxGeometry(0.42, 0.26, 0.26)), metal(lv), 0, 0.88, 0);
    head.scale.setScalar(s); g.add(head);
    g.add(mesh(G('hmband', () => new THREE.BoxGeometry(0.1, 0.3, 0.3)), M(0x5b3a1e), 0, 0.88, 0));
    if (lv > 1) g.add(mesh(G('hmgem', () => new THREE.OctahedronGeometry(0.07)), gem(lv), 0, 0.88, 0.15 * s));
    return g;
  },
  bow(lv) {
    const g = new THREE.Group();
    const arc = mesh(G('bowarc', () => new THREE.TorusGeometry(0.55, 0.03, 6, 20, Math.PI * 0.8)), lv === 3 ? metal(3) : wood);
    arc.rotation.z = -Math.PI * 0.4; arc.position.x = -0.55;
    g.add(arc);
    g.add(mesh(G('bowgrip', () => new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8)), leather, 0, 0, 0));
    const sp = 0.55 * Math.sin(Math.PI * 0.4);
    const sx = -0.55 + 0.55 * Math.cos(Math.PI * 0.4);
    const str = mesh(G('bowstr', () => new THREE.CylinderGeometry(0.006, 0.006, sp * 2, 4)), M(0xf3ecd8), sx, 0, 0);
    g.add(str); g.userData.string = str; g.userData.sx = sx;
    if (lv > 1) g.add(mesh(G('bowgem', () => new THREE.OctahedronGeometry(0.05)), gem(lv), 0.02, 0, 0.04));
    g.rotation.y = -Math.PI / 2;
    const w = new THREE.Group(); w.add(g); return w;
  },
  shield(lv) {
    const g = new THREE.Group();
    const r = [0.36, 0.4, 0.44][lv - 1];
    const disc = mesh(G('shd' + lv, () => new THREE.CylinderGeometry(r, r, 0.06, 24)), M([0xc0392b, 0x2f6fd6, 0x8e2bd6][lv - 1], { roughness: 0.55 }));
    disc.rotation.x = Math.PI / 2; g.add(disc);
    const rim = mesh(G('shr' + lv, () => new THREE.TorusGeometry(r, 0.03, 6, 28)), metal(lv)); g.add(rim);
    const boss = mesh(G('shb', () => new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), metal(lv), 0, 0, 0.03);
    boss.rotation.x = Math.PI / 2; g.add(boss);
    if (lv >= 2) {
      for (let i = 0; i < 4; i++) { const st = mesh(G('shstud', () => new THREE.SphereGeometry(0.03, 6, 4)), gem(lv)); const a = i * Math.PI / 2 + Math.PI / 4; st.position.set(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, 0.04); g.add(st); }
    }
    return g;
  },
  helmet(lv) {
    const g = new THREE.Group();
    g.add(mesh(G('hdome', () => new THREE.SphereGeometry(0.37, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.46)), metal(lv), 0, 0.02, 0));
    put(g, mesh(G('hbrim', () => new THREE.TorusGeometry(0.36, 0.035, 6, 24)), lv === 1 ? M(0xb5893c, { metalness: 0.6 }) : metal(lv), 0, 0.07, 0)).rotation.x = Math.PI / 2;
    const crestCol = [0xd62f2f, 0x2f6fd6, 0xffffff][lv - 1];
    const crest = mesh(G('hcrest' + lv, () => new THREE.BoxGeometry(0.09, [0.16, 0.2, 0.26][lv - 1], 0.62)), M(crestCol, { roughness: 0.9 }), 0, 0.42, -0.02);
    g.add(crest);
    for (const s of [-1, 1]) g.add(mesh(G('hcheek', () => new THREE.BoxGeometry(0.05, 0.2, 0.16)), metal(lv), s * 0.345, -0.06, 0.1));
    if (lv === 3) for (const s of [-1, 1]) put(g, mesh(G('hwing', () => new THREE.ConeGeometry(0.06, 0.3, 4)), M(0xffffff, { emissive: 0xffd27a, emissiveIntensity: 0.4 }), s * 0.38, 0.15, -0.05)).rotation.z = -s * 0.9;
    return g;
  },
  chest(lv) {
    const g = new THREE.Group();
    const plate = mesh(G('cplate', () => { const geo = new THREE.CylinderGeometry(0.31, 0.27, 0.48, 16, 1); return geo; }), metal(lv), 0, 0.27, 0);
    plate.scale.set(1, 1, 0.78); g.add(plate);
    put(g, mesh(G('cbelt', () => new THREE.TorusGeometry(0.27, 0.04, 6, 18)), leather, 0, 0.04, 0)).rotation.x = Math.PI / 2;
    g.children[1].scale.set(1, 0.78, 1);
    for (let i = 0; i < 3; i++) g.add(mesh(G('cab', () => new THREE.BoxGeometry(0.2, 0.03, 0.02)), lv === 1 ? M(0x6d757e, { metalness: 0.5 }) : gem(lv), 0, 0.12 + i * 0.09, 0.235));
    g.add(mesh(G('cemb', () => new THREE.OctahedronGeometry(0.06)), gem(lv), 0, 0.36, 0.24));
    return g;
  },
  pauldron(lv) {
    const g = new THREE.Group();
    const p = mesh(G('paul', () => new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), metal(lv));
    p.scale.set(1.1, 0.9, 1); g.add(p);
    return g;
  },
  greave(lv) {
    const g = new THREE.Group();
    g.add(mesh(G('grv', () => new THREE.CylinderGeometry(0.115, 0.095, 0.3, 12)), metal(lv), 0, 0, 0));
    g.add(mesh(G('grvk', () => new THREE.SphereGeometry(0.09, 10, 8)), lv === 1 ? metal(1) : gem(lv), 0, 0.17, 0.05));
    return g;
  },
  lightning(lv) {
    const g = new THREE.Group();
    const orb = mesh(G('ltorb', () => new THREE.IcosahedronGeometry(0.09, 0)), M(0x7fd4ff, { emissive: 0x3fb8ff, emissiveIntensity: 1.2 + lv * 0.4, roughness: 0.2 }));
    g.add(orb);
    const bolt = mesh(G('ltbolt', () => { const s = new THREE.Shape(); s.moveTo(0.02, 0.12); s.lineTo(-0.05, 0); s.lineTo(0.0, 0.0); s.lineTo(-0.03, -0.12); s.lineTo(0.05, 0.02); s.lineTo(0, 0.02); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); }), M(0xfff36b, { emissive: 0xffd400, emissiveIntensity: 1 }), 0, 0, 0.08);
    g.add(bolt);
    g.userData.spin = true;
    return g;
  },
  coinsteal(lv) {
    const g = new THREE.Group();
    const bag = mesh(G('cbag', () => new THREE.SphereGeometry(0.12, 12, 10)), M(0x8b5a2b, { roughness: 0.9 }));
    bag.scale.set(1, 0.9, 0.8); g.add(bag);
    g.add(mesh(G('cbagtie', () => new THREE.CylinderGeometry(0.04, 0.07, 0.06, 8)), M(0x5e3a17), 0, 0.12, 0));
    for (let i = 0; i < lv; i++) put(g, mesh(G('ccoin', () => new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12)), M(0xffcf3a, { metalness: 0.8, roughness: 0.3, emissive: 0x7a5200, emissiveIntensity: 0.3 }), -0.06 + i * 0.06, 0.16 + i * 0.02, 0.04)).rotation.x = 1.2;
    return g;
  },
};

export function buildItemMesh(id, level) {
  const fn = BUILDERS[id];
  return fn ? fn(level) : new THREE.Group();
}

// ---------- Gladiator ----------
const SKIN = [0xf2c29b, 0xd9a074, 0xb87b4f, 0x8d5a3b];
const TEAM = { p: { tunic: 0x2f7fe0, trim: 0xffd34d, hair: 0x5a3416 }, e: { tunic: 0xd8413a, trim: 0x2b2b2b, hair: 0x2a1a10 } };

function limb(len, r1, r2, mat) {
  const g = new THREE.Group();
  const m = mesh(G(`limb${len}${r1}${r2}`, () => { const geo = new THREE.CapsuleGeometry((r1 + r2) / 2, len, 4, 10); return geo; }), mat);
  m.position.y = len / 2;
  g.add(m);
  return g;
}

export class GladiatorView {
  constructor(team = 'p', skinIdx = 0) {
    const T = TEAM[team];
    this.team = team;
    this.root = new THREE.Group();
    const skin = M(SKIN[skinIdx % SKIN.length], { roughness: 0.75 });
    const tunic = M(T.tunic, { roughness: 0.85 });
    const trim = M(T.trim, { roughness: 0.6, metalness: 0.2 });
    this.mats = { skin, tunic, trim };
    this.highlightMats = {};

    // torso
    this.torso = new THREE.Group();
    const chestMesh = mesh(G('torso', () => { const g = new THREE.CapsuleGeometry(0.26, 0.28, 6, 14); return g; }), tunic, 0, 0.27, 0);
    chestMesh.scale.set(1.18, 1, 0.82);
    this.torso.add(chestMesh);
    const belt = mesh(G('belt', () => new THREE.CylinderGeometry(0.27, 0.29, 0.08, 16)), trim, 0, 0.03, 0); belt.scale.z = 0.8; this.torso.add(belt);
    const skirt = mesh(G('skirt', () => new THREE.CylinderGeometry(0.27, 0.36, 0.26, 12, 1, true)), M(0x8a5a32, { roughness: 0.9, side: THREE.DoubleSide }), 0, -0.1, 0); skirt.scale.z = 0.8; this.torso.add(skirt);
    // shoulders bulk (broad)
    const shoulders = mesh(G('shoulders', () => new THREE.CapsuleGeometry(0.15, 0.5, 4, 10)), tunic, 0, 0.47, 0); shoulders.rotation.z = Math.PI / 2; this.torso.add(shoulders);
    this.root.add(this.torso);
    this.bodyParts = { body: [chestMesh, shoulders] };

    // head
    this.head = new THREE.Group();
    const headMesh = mesh(G('head', () => new THREE.SphereGeometry(0.33, 24, 18)), skin);
    headMesh.scale.set(1, 1.02, 0.96);
    this.head.add(headMesh);
    const hair = mesh(G('hair', () => new THREE.SphereGeometry(0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), M(T.hair, { roughness: 0.95 }), 0, 0.04, -0.03);
    hair.rotation.x = -0.35; this.head.add(hair);
    this.hair = hair;
    const white = M(0xffffff, { roughness: 0.3 }), black = M(0x1b1b1b, { roughness: 0.3 });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = mesh(G('eye', () => new THREE.SphereGeometry(0.075, 12, 10)), white, s * 0.12, 0.05, 0.27); eye.scale.z = 0.6;
      const pup = mesh(G('pupil', () => new THREE.SphereGeometry(0.038, 10, 8)), black, 0, 0, 0.055);
      eye.add(pup); this.head.add(eye); this.eyes.push(eye);
    }
    this.brows = [];
    for (const s of [-1, 1]) {
      const b = mesh(G('brow', () => new THREE.BoxGeometry(0.13, 0.035, 0.04)), M(T.hair), s * 0.12, 0.15, 0.29);
      b.rotation.z = -s * 0.25; this.head.add(b); this.brows.push(b);
    }
    this.nose = mesh(G('nose', () => new THREE.SphereGeometry(0.06, 10, 8)), M(SKIN[skinIdx % SKIN.length] - 0x101010, { roughness: 0.7 }), 0, -0.04, 0.32); this.head.add(this.nose);
    this.mouth = mesh(G('mouth', () => new THREE.TorusGeometry(0.06, 0.018, 6, 12, Math.PI)), M(0x5a1a1a), 0, -0.15, 0.29);
    this.mouth.rotation.z = Math.PI; this.head.add(this.mouth);
    this.mouthO = mesh(G('mouthO', () => new THREE.SphereGeometry(0.05, 10, 8)), M(0x3a0a0a), 0, -0.15, 0.29); this.mouthO.scale.z = 0.4; this.mouthO.visible = false; this.head.add(this.mouthO);
    this.ears = [];
    for (const s of [-1, 1]) this.head.add(mesh(G('ear', () => new THREE.SphereGeometry(0.06, 8, 6)), skin, s * 0.32, 0, 0));
    this.root.add(this.head);
    this.bodyParts.head = [headMesh];

    // limbs
    this.upper = {}; this.fore = {}; this.handG = {}; this.thigh = {}; this.shin = {}; this.foot = {};
    for (const a of ['armL', 'armR']) {
      this.upper[a] = limb(0.3, 0.1, 0.1, skin); this.fore[a] = limb(0.28, 0.085, 0.085, skin);
      const bracer = mesh(G('bracer', () => new THREE.CylinderGeometry(0.095, 0.095, 0.14, 10)), M(0x6b3f24), 0, 0.17, 0); this.fore[a].add(bracer);
      this.handG[a] = new THREE.Group();
      const fist = mesh(G('fist', () => new THREE.SphereGeometry(0.1, 12, 10)), skin); this.handG[a].add(fist);
      this.root.add(this.upper[a], this.fore[a], this.handG[a]);
      this.bodyParts[a] = [this.upper[a].children[0], this.fore[a].children[0], fist];
    }
    for (const l of ['legL', 'legR']) {
      this.thigh[l] = limb(0.32, 0.12, 0.12, skin); this.shin[l] = limb(0.33, 0.1, 0.1, skin);
      const sandal = mesh(G('sandal', () => new THREE.CylinderGeometry(0.105, 0.1, 0.12, 10)), M(0x6b3f24), 0, 0.08, 0); this.shin[l].add(sandal);
      this.foot[l] = new THREE.Group();
      const ft = mesh(G('foot', () => new THREE.BoxGeometry(0.17, 0.1, 0.3)), M(0x6b3f24, { roughness: 0.9 }), 0, -0.03, 0.06); this.foot[l].add(ft);
      this.root.add(this.thigh[l], this.shin[l], this.foot[l]);
      this.bodyParts[l] = [this.thigh[l].children[0], this.shin[l].children[0]];
    }

    this.equip = new THREE.Group(); this.root.add(this.equip);
    this.weaponG = { armL: new THREE.Group(), armR: new THREE.Group() };
    this.root.add(this.weaponG.armL, this.weaponG.armR);
    this.attached = [];
    this.spinners = [];
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this.up = new THREE.Vector3(0, 1, 0);
    this.frames = {};
    this.root.traverse(o => { if (o.isMesh) o.userData.baseMat = o.material; });
  }

  // Equip from a resolved loadout; inactive items are not shown on the body.
  setLoadout(lo, inv) {
    for (const a of this.attached) a.parent && a.parent.remove(a);
    this.attached = []; this.spinners = [];
    this.weapons = { armL: null, armR: null };
    const add = (parent, obj) => { parent.add(obj); this.attached.push(obj); obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); return obj; };
    for (const it of inv.items) {
      const s = lo.status[it.uid]; if (!s || !s.active) continue;
      const lv = it.level;
      switch (it.id) {
        case 'helmet': { const h = add(this.head, buildItemMesh('helmet', lv)); h.position.y = 0.06; break; }
        case 'chest': {
          if (s.regions.includes('body')) { const c = add(this.torso, buildItemMesh('chest', lv)); c.scale.set(1.12, 1, 1.05); }
          for (const a of ['armL', 'armR']) if (s.regions.includes(a)) { const p = add(this.upper[a], buildItemMesh('pauldron', lv)); p.position.y = 0.3; p.rotation.z = a === 'armL' ? 0.5 : -0.5; }
          break;
        }
        case 'legs': for (const l of ['legL', 'legR']) if (s.regions.includes(l)) { const g = add(this.shin[l], buildItemMesh('greave', lv)); g.position.y = 0.26; } break;
        case 'lightning': {
          const g = add(this.root, buildItemMesh('lightning', lv)); g.userData.follow = s.regions.includes('head') ? 'head' : 'body'; this.spinners.push(g); break;
        }
        case 'coinsteal': {
          const g = add(this.torso, buildItemMesh('coinsteal', lv)); g.position.set(s.regions.includes('legR') && !s.regions.includes('legL') ? 0.25 : -0.25, -0.02, 0.12); break;
        }
        case 'shield': {
          const g = add(this.fore[s.arm], buildItemMesh('shield', lv)); g.position.set(0, 0.18, 0); g.userData.shield = true; this.weapons[s.arm] = { id: 'shield', obj: g };
          break;
        }
        default: {
          // weapons in hand
          const arms = s.arm === 'both' ? [lo.twoHanded.primary] : [s.arm];
          for (const a of arms) { const w = add(this.weaponG[a], buildItemMesh(it.id, lv)); this.weapons[a] = { id: it.id, obj: w, level: lv }; }
        }
      }
    }
  }

  // Place limbs from joint positions. dirs: optional world weapon directions per arm.
  update(p, opts = {}) {
    const v = this._v, v2 = this._v2;
    // torso basis
    const up = v.subVectors(p[J.chest], p[J.pelvis]).normalize();
    const right = new THREE.Vector3().subVectors(p[J.shR], p[J.shL]);
    right.addScaledVector(up, -right.dot(up)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
    this._m.makeBasis(right, up, fwd);
    this.torso.quaternion.setFromRotationMatrix(this._m);
    this.torso.position.copy(p[J.pelvis]);
    this.frames.fwd = fwd; this.frames.right = right;
    // head basis
    const hu = v2.subVectors(p[J.head], p[J.chest]).normalize();
    const hr = right.clone().addScaledVector(hu, -right.dot(hu)).normalize();
    const hf = new THREE.Vector3().crossVectors(hr, hu);
    this._m.makeBasis(hr, hu, hf);
    this.head.quaternion.setFromRotationMatrix(this._m);
    this.head.position.copy(p[J.head]);

    const seg = (obj, a, b, side) => {
      obj.position.copy(a);
      const d = this._v.subVectors(b, a).normalize();
      // build basis with stable roll using torso forward
      const x = new THREE.Vector3().crossVectors(d, fwd);
      if (x.lengthSq() < 1e-4) x.copy(right);
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, d);
      this._m.makeBasis(x, d, z);
      obj.quaternion.setFromRotationMatrix(this._m);
    };
    seg(this.upper.armL, p[J.shL], p[J.elL]); seg(this.fore.armL, p[J.elL], p[J.haL]);
    seg(this.upper.armR, p[J.shR], p[J.elR]); seg(this.fore.armR, p[J.elR], p[J.haR]);
    seg(this.thigh.legL, p[J.hipL], p[J.knL]); seg(this.shin.legL, p[J.knL], p[J.ftL]);
    seg(this.thigh.legR, p[J.hipR], p[J.knR]); seg(this.shin.legR, p[J.knR], p[J.ftR]);
    this.handG.armL.position.copy(p[J.haL]); this.handG.armR.position.copy(p[J.haR]);
    for (const [l, j] of [['legL', J.ftL], ['legR', J.ftR]]) {
      this.foot[l].position.copy(p[j]);
      this._m.makeBasis(right, new THREE.Vector3(0, 1, 0), new THREE.Vector3().crossVectors(right, new THREE.Vector3(0, 1, 0)));
      this.foot[l].quaternion.setFromRotationMatrix(this._m);
    }
    // shields face forward-out on the forearm
    for (const a of ['armL', 'armR']) {
      const w = this.weapons && this.weapons[a];
      if (w && w.id === 'shield') {
        // orient shield disc normal along torso forward in forearm-local space
        const inv = this.fore[a].quaternion.clone().invert();
        const n = fwd.clone().applyQuaternion(inv);
        const yAxis = new THREE.Vector3(0, 1, 0);
        const xAx = new THREE.Vector3().crossVectors(yAxis, n).normalize();
        const zAx = n.clone().addScaledVector(yAxis, -n.dot(yAxis)).normalize();
        this._m.makeBasis(xAx, new THREE.Vector3().crossVectors(zAx, xAx), zAx);
        w.obj.quaternion.setFromRotationMatrix(this._m);
        w.obj.position.set(0, 0.17, 0).addScaledVector(zAx, 0.1);
      }
    }
    // weapons
    for (const [a, hj] of [['armL', J.haL], ['armR', J.haR]]) {
      const g = this.weaponG[a];
      g.position.copy(p[hj]);
      let d = opts.dirs && opts.dirs[a];
      if (!d) d = this._v.subVectors(p[hj], p[a === 'armL' ? J.elL : J.elR]).normalize();
      const w = this.weapons && this.weapons[a];
      if (w && w.id === 'bow') {
        // bow: stave vertical-ish in front, string toward body
        const yb = new THREE.Vector3(0, 1, 0).addScaledVector(fwd, 0.15).normalize();
        const zb = fwd.clone(); const xb = new THREE.Vector3().crossVectors(yb, zb).normalize();
        this._m.makeBasis(xb, yb, new THREE.Vector3().crossVectors(xb, yb));
        g.quaternion.setFromRotationMatrix(this._m);
        const inner = w.obj.children[0];
        if (inner.userData.string) inner.userData.string.position.x = inner.userData.sx - (opts.draws?.[a] || 0) * 0.3;
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
      s.position.set(base.x + Math.cos(t * 3) * 0.45, base.y + 0.25 + Math.sin(t * 5) * 0.05, base.z + Math.sin(t * 3) * 0.45);
      s.rotation.y = t * 4;
    }
    // face
    const hurt = opts.hurt || 0;
    this.mouth.visible = hurt < 0.3; this.mouthO.visible = hurt >= 0.3;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      this.brows[i].rotation.z = -s * (0.25 - hurt * 0.7) + (opts.victory ? s * 0.2 : 0);
      this.brows[i].position.y = 0.15 + hurt * 0.03;
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

  dim(on) { this.root.traverse(o => { if (o.isMesh && o.material) o.material.transparent = false; }); }
}

export { footprint };
