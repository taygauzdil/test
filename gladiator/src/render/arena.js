// Stylised Roman arena on a cliff: sandy platform, colonnade walls at both ends,
// a broken rear edge dropping into a misty chasm with mountains beyond.
import * as THREE from '../../vendor/three.module.js';
import { CONFIG } from '../config.js';
import { M } from './models.js';

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function buildArena() {
  const A = CONFIG.arena;
  const g = new THREE.Group();
  const r = rng(7);

  // sky dome with vertical gradient
  const skyGeo = new THREE.SphereGeometry(120, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x4aa3ff) }, mid: { value: new THREE.Color(0xffd7a8) }, bot: { value: new THREE.Color(0xffb27a) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vp; void main(){ float h = normalize(vp).y; vec3 c = h>0.0 ? mix(mid, top, smoothstep(0.0,0.55,h)) : mix(mid, bot, smoothstep(0.0,-0.4,-h)); gl_FragColor = vec4(c,1.0); }',
  });
  g.add(new THREE.Mesh(skyGeo, skyMat));

  // sun disc
  const sun = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false }));
  sun.position.set(-30, 22, -90); sun.lookAt(0, 0, 0); g.add(sun);

  // platform
  const depth = A.front - A.edge;
  const sand = M(0xf0c27a, { roughness: 0.95 });
  const plat = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 1.2, depth), sand);
  plat.position.set(0, -0.6, (A.front + A.edge) / 2); plat.receiveShadow = true; g.add(plat);
  // painted arena ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.45, 48), new THREE.MeshStandardMaterial({ color: 0xd99a4e, roughness: 1 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.005, 0.25); ring.receiveShadow = true; g.add(ring);
  const ringC = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshStandardMaterial({ color: 0xe3a95f, roughness: 1 }));
  ringC.rotation.x = -Math.PI / 2; ringC.position.set(0, 0.006, 0.25); g.add(ringC);
  // sand speckles
  const speck = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 5), new THREE.MeshStandardMaterial({ color: 0xc99350, roughness: 1 }), 220);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 220; i++) { m4.makeRotationX(-Math.PI / 2); m4.setPosition((r() - 0.5) * A.halfWidth * 2, 0.004, A.edge + 0.2 + r() * (depth - 0.4)); speck.setMatrixAt(i, m4); }
  speck.receiveShadow = true; g.add(speck);

  // broken rear edge: jagged stones and cliff face
  const rock = M(0xa77b52, { roughness: 0.95 });
  const rockDark = M(0x7a5638, { roughness: 1 });
  for (let x = -A.halfWidth - 1; x < A.halfWidth + 1; x += 0.7) {
    const s = 0.5 + r() * 0.5;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), r() > 0.5 ? rock : rockDark);
    st.position.set(x + r() * 0.3, -0.45 - r() * 0.3, A.edge + 0.05 - r() * 0.15);
    st.rotation.set(r() * 3, r() * 3, r() * 3); st.scale.y = 0.7; st.castShadow = true; st.receiveShadow = true;
    g.add(st);
  }
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(A.halfWidth + 1.5, 4, 22, 9, 3, true, Math.PI * 0.5, Math.PI), rockDark);
  cliff.position.set(0, -11.5, A.edge + A.halfWidth * 0.4); cliff.scale.z = 0.35; g.add(cliff);
  // cliff face directly under the edge
  const face = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 14, 1.2), rock);
  face.position.set(0, -8, A.edge + 0.4); g.add(face);
  // hazard stripe at edge
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2, 0.02, 0.18), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
  stripe.position.set(0, 0.01, A.edge + 0.25); g.add(stripe);

  // mist / depth below
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshBasicMaterial({ color: 0xffd9b0, fog: false }));
  mist.rotation.x = -Math.PI / 2; mist.position.set(0, -60, -80); g.add(mist);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 18; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 3, 10, 8), cloudMat);
    cl.position.set((r() - 0.5) * 90, -24 + r() * 4, -12 - r() * 55); cl.scale.y = 0.3; g.add(cl);
  }
  // far canyon walls dropping away so the depth reads below the edge
  const canyon = M(0x8f6242, { roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const w = 6 + r() * 8, h = 18 + r() * 10;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.8, w, h, 6), canyon);
    c.position.set((i - 4) * 11 + r() * 4, -6 - h / 2, -14 - r() * 6); g.add(c);
  }
  // distant mountains + rock spires
  for (let i = 0; i < 12; i++) {
    const h = 12 + r() * 14;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(8 + r() * 10, h, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.07, 0.3, 0.55 + r() * 0.12), roughness: 1, flatShading: true }));
    mtn.position.set((i - 6) * 14 + r() * 6, -16 + h / 2, -70 - r() * 25); g.add(mtn);
  }
  for (let i = 0; i < 4; i++) {
    const h = 8 + r() * 6;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.8 + r(), 2 + r() * 2, h, 6), new THREE.MeshStandardMaterial({ color: 0x9c6f48, roughness: 1, flatShading: true }));
    sp.position.set((i < 2 ? -1 : 1) * (14 + r() * 14), -16 + h / 2, -26 - r() * 18); g.add(sp);
  }

  // colonnade walls at each end (with gates)
  const stone = M(0xf2dfc0, { roughness: 0.85 });
  const stoneDark = M(0xd8bf98, { roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const wx = sx * (A.halfWidth + 0.6);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, depth + 1), stoneDark);
    wall.position.set(wx + sx * 0.3, 1.7, (A.front + A.edge) / 2); wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
    // gate arch
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 1.6), M(0x3a2414));
    gate.position.set(wx, 1.1, 0.3); g.add(gate);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 8, 16, Math.PI), stone);
    arch.position.set(wx - sx * 0.05, 2.2, 0.3); arch.rotation.y = Math.PI / 2; g.add(arch);
    for (const z of [A.edge + 0.3, -0.9, 1.5, A.front - 0.2]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 12), stone);
      col.position.set(wx - sx * 0.65, 1.8, z); col.castShadow = true; g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.6), stone); cap.position.set(wx - sx * 0.65, 3.65, z); g.add(cap);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, depth + 1), stone);
    lintel.position.set(wx - sx * 0.4, 3.9, (A.front + A.edge) / 2); g.add(lintel);
    // banner in team colour (player left blue, enemy right red)
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshStandardMaterial({ color: sx < 0 ? 0x2f7fe0 : 0xd8413a, side: THREE.DoubleSide, roughness: 0.9 }));
    ban.position.set(wx - sx * 0.62, 2.75, 1.5 + 0.0); ban.rotation.y = sx * Math.PI / 2; g.add(ban);
    const ban2 = ban.clone(); ban2.position.z = -0.9; g.add(ban2);
    // torches
    for (const z of [-1.6, 2.4]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), M(0xffa030, { emissive: 0xff7a00, emissiveIntensity: 1.5 }));
      t.position.set(wx - sx * 0.75, 2.6, z); g.add(t);
    }
    // stands rising behind the wall with a crowd
    for (let k = 0; k < 4; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, depth + 3), k % 2 ? stone : stoneDark);
      step.position.set(wx + sx * (1.2 + k * 1.1), 3.6 + k * 0.6, (A.front + A.edge) / 2); g.add(step);
      for (let c = 0; c < 9; c++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M(new THREE.Color().setHSL(r(), 0.55, 0.55).getHex()));
        p.position.set(wx + sx * (1.2 + k * 1.1), 4.1 + k * 0.6, A.edge + c * (depth / 8)); p.userData.crowd = r() * 6; g.add(p);
      }
    }
  }
  // front lip (low wall toward camera, mostly off-screen)
  const lip = new THREE.Mesh(new THREE.BoxGeometry(A.halfWidth * 2 + 2, 0.5, 0.4), stone);
  lip.position.set(0, 0.25, A.front + 0.2); lip.receiveShadow = true; g.add(lip);
  // outer sand + front stands toward the camera
  const outer = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 30), M(0xe0ae68, { roughness: 1 }));
  outer.position.set(0, -0.62, A.front + 15.4); outer.receiveShadow = true; g.add(outer);
  for (let x = -A.halfWidth; x <= A.halfWidth; x += 2.4) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), stone);
    post.position.set(x, 0.45, A.front + 0.2); post.castShadow = true; g.add(post);
  }

  g.userData.crowd = [];
  g.traverse(o => { if (o.userData && o.userData.crowd !== undefined && o.isMesh) g.userData.crowd.push(o); });
  return g;
}

export function animateArena(arena, t, cheer = 0) {
  for (const p of arena.userData.crowd) {
    if (p.userData.baseY === undefined) p.userData.baseY = p.position.y;
    p.position.y = p.userData.baseY + Math.abs(Math.sin(t * (3 + cheer * 5) + p.userData.crowd)) * (0.04 + cheer * 0.16);
  }
}

export function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0x9c7a5a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.3);
  sun.position.set(-4, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera; s.left = -9; s.right = 9; s.top = 7; s.bottom = -7; s.near = 1; s.far = 30;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun); scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 0.7); rim.position.set(3, 4, -8); scene.add(rim);
  return { hemi, sun, rim };
}
