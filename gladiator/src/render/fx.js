// Visual effects: pooled particles, lightning bolts, arrows, floating text, screen shake.
import * as THREE from '../../vendor/three.module.js';

export class FX {
  constructor(scene, camera, overlay) {
    this.scene = scene; this.camera = camera; this.overlay = overlay;
    this.max = 400;
    const geo = new THREE.OctahedronGeometry(0.06, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
    this.inst = new THREE.InstancedMesh(geo, mat, this.max);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.frustumCulled = false;
    const col = new Float32Array(this.max * 3);
    this.inst.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    scene.add(this.inst);
    this.parts = [];
    this.bolts = [];
    this.texts = [];
    this.rings = [];
    this.shake = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this.arrowMeshes = new Map();
    this.flash = new THREE.PointLight(0x9fdcff, 0, 8); scene.add(this.flash);
    this.ringGeo = new THREE.RingGeometry(0.2, 0.32, 24);
  }

  burst(pos, { n = 14, color = 0xffe066, speed = 4, life = 0.5, size = 1, gravity = -9, up = 1.5 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      v.y += up;
      this.parts.push({ p: pos.clone(), v, life, max: life, size: size * (0.6 + Math.random() * 0.8), c, g: gravity, rot: Math.random() * 6 });
    }
  }

  impactRing(pos, color = 0xffffff, scale = 1) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(pos); m.lookAt(this.camera.position);
    this.scene.add(m);
    this.rings.push({ m, t: 0, scale });
  }

  lightning(from, to, level = 1) {
    const pts = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Vector3().lerpVectors(from, to, i / n);
      if (i > 0 && i < n) { p.x += (Math.random() - 0.5) * 0.6; p.z += (Math.random() - 0.5) * 0.4; }
      pts.push(p);
    }
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: level === 3 ? 0xff9bff : 0xbfeaff, transparent: true, opacity: 1, depthWrite: false });
    const glow = new THREE.MeshBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      for (const [m, r] of [[mat, 0.035 + level * 0.01], [glow, 0.11 + level * 0.02]]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), m);
        s.position.lerpVectors(a, b, 0.5);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(b, a).normalize());
        group.add(s);
      }
    }
    this.scene.add(group);
    this.bolts.push({ group, t: 0, mats: [mat, glow] });
    this.flash.position.copy(to); this.flash.intensity = 30;
    this.burst(to, { n: 18, color: 0x9fe8ff, speed: 5, life: 0.45 });
  }

  // DOM floating text anchored to a world position
  text(pos, str, cls = '', life = 0.9) {
    const el = document.createElement('div');
    el.className = 'float-text ' + cls;
    el.textContent = str;
    this.overlay.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), t: 0, life, dx: (Math.random() - 0.5) * 30 });
  }

  addShake(a) { this.shake = Math.min(0.6, this.shake + a); }

  syncArrows(arrows, buildArrow) {
    const seen = new Set();
    for (const a of arrows) {
      seen.add(a);
      let m = this.arrowMeshes.get(a);
      if (!m) { m = buildArrow(); this.scene.add(m); this.arrowMeshes.set(a, m); a._dir = a.vel.clone().normalize(); }
      m.position.copy(a.pos);
      if (!a.stuck && a.alive) a._dir.copy(a.vel).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a._dir);
    }
    for (const [a, m] of this.arrowMeshes) if (!seen.has(a)) { this.scene.remove(m); this.arrowMeshes.delete(a); }
  }

  clear() {
    for (const b of this.bolts) this.scene.remove(b.group);
    for (const r of this.rings) this.scene.remove(r.m);
    for (const t of this.texts) t.el.remove();
    for (const [, m] of this.arrowMeshes) this.scene.remove(m);
    this.arrowMeshes.clear();
    this.bolts = []; this.rings = []; this.texts = []; this.parts = [];
  }

  update(dt, w, h) {
    let k = 0;
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.v.y += p.g * dt; p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.02 && p.p.z > -2.7) { p.p.y = 0.02; p.v.multiplyScalar(0.4); p.v.y *= -0.3; }
      const s = p.size * Math.min(1, p.life / p.max * 2);
      p.rot += dt * 8;
      this._q.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), p.rot);
      this._m.compose(p.p, this._q, this._s.set(s, s, s));
      this.inst.setMatrixAt(k, this._m);
      this.inst.setColorAt(k, p.c);
      k++;
    }
    this.parts = this.parts.filter(p => p.life > 0);
    this.inst.count = k;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    for (const b of this.bolts) {
      b.t += dt;
      const o = Math.max(0, 1 - b.t / 0.35) * (Math.random() > 0.3 ? 1 : 0.4);
      b.mats[0].opacity = o; b.mats[1].opacity = o * 0.45;
      if (b.t > 0.35) this.scene.remove(b.group);
    }
    this.bolts = this.bolts.filter(b => b.t <= 0.35);
    this.flash.intensity *= Math.exp(-dt * 10);

    for (const r of this.rings) {
      r.t += dt;
      const s = (1 + r.t * 9) * r.scale;
      r.m.scale.set(s, s, s);
      r.m.material.opacity = Math.max(0, 0.9 - r.t * 3.5);
      if (r.t > 0.3) this.scene.remove(r.m);
    }
    this.rings = this.rings.filter(r => r.t <= 0.3);

    const v = new THREE.Vector3();
    for (const t of this.texts) {
      t.t += dt;
      v.copy(t.pos).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w + t.dx * t.t;
      const y = (-v.y * 0.5 + 0.5) * h - t.t * 70;
      t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${t.t < 0.12 ? 0.6 + t.t * 5 : 1.2 - Math.min(0.2, t.t * 0.3)})`;
      t.el.style.opacity = Math.max(0, 1 - Math.max(0, t.t - t.life * 0.6) / (t.life * 0.4));
      if (t.t > t.life) t.el.remove();
    }
    this.texts = this.texts.filter(t => t.t <= t.life);
    this.shake *= Math.exp(-dt * 7);
  }
}
