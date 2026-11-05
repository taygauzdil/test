// Renders each item's 3D mesh into a transparent PNG so UI icons match the in-game models.
import * as THREE from '../../vendor/three.module.js';
import { ITEMS, MAX_LEVEL } from '../items.js';
import { buildItemMesh } from './models.js';

const PX = 96;
const icons = {};

function iconObject(id, lv) {
  const g = new THREE.Group();
  if (id === 'legs') {
    for (const s of [-1, 1]) { const m = buildItemMesh('greave', lv); m.position.x = s * 0.17; m.scale.setScalar(1.25); g.add(m); }
  } else if (id === 'chest') {
    const c = buildItemMesh('chest', lv); g.add(c);
    for (const s of [-1, 1]) { const p = buildItemMesh('pauldron', lv); p.position.set(s * 0.36, 0.48, 0); p.rotation.z = -s * 0.5; g.add(p); }
    g.rotation.y = 0.35;
  } else if (id === 'helmet') {
    const h = buildItemMesh('helmet', lv); h.rotation.y = 0.9; g.add(h);
  } else if (id === 'hammer') {
    const h = buildItemMesh('hammer', lv); h.rotation.z = -0.6; g.add(h);
  } else if (id === 'axe') {
    const h = buildItemMesh('axe', lv); h.rotation.y = 0; g.add(h);
  } else if (id === 'bow') {
    const b = buildItemMesh('bow', lv); b.rotation.y = Math.PI / 2; g.add(b);
  } else if (id === 'shield') {
    const s = buildItemMesh('shield', lv); s.rotation.y = 0.35; g.add(s);
  } else if (id === 'lightning' || id === 'coinsteal') {
    const m = buildItemMesh(id, lv); m.scale.setScalar(2.2); g.add(m);
  } else {
    const m = buildItemMesh(id, lv); m.rotation.y = 0.5; g.add(m);
  }
  return g;
}

export function buildIcons() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x886644, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 3, 4); scene.add(d);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  cam.position.set(0, 0, 8);
  for (const id of Object.keys(ITEMS)) {
    const def = ITEMS[id];
    icons[id] = [];
    for (let lv = 1; lv <= MAX_LEVEL; lv++) {
      const w = def.w * PX, h = def.h * PX;
      renderer.setSize(w, h, false);
      const obj = iconObject(id, lv);
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const aspect = w / h;
      const pad = 1.12;
      let hh = Math.max(sz.y, sz.x / aspect) * pad / 2;
      cam.left = -hh * aspect; cam.right = hh * aspect; cam.top = hh; cam.bottom = -hh;
      cam.position.set(c.x, c.y, 8); cam.lookAt(c.x, c.y, 0);
      cam.updateProjectionMatrix();
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, cam);
      icons[id][lv] = renderer.domElement.toDataURL('image/png');
      scene.remove(obj);
    }
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return icons;
}

export const iconUrl = (id, lv) => icons[id]?.[lv] || '';
