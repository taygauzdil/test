// Active ragdoll: a Verlet particle skeleton held together by distance constraints and driven
// toward an animated target pose by PD "muscles". Lowering muscle strength lets physics take
// over (stagger, knockdown, falling off the cliff); raising it lets animation take back control.
import { Vector3 } from '../../vendor/three.module.js';
import { CONFIG } from '../config.js';
import { ARMS, ARM_INFO, TIER } from '../body.js';

// Joint layout: pelvis, chest, head, then (shoulder, elbow, hand) for each of the six arms, then legs.
export const J = { pelvis: 0, chest: 1, head: 2 };
export const ARM_J = {};
ARMS.forEach((a, i) => { ARM_J[a] = { sh: 3 + i * 3, el: 4 + i * 3, ha: 5 + i * 3 }; });
const LEG0 = 3 + ARMS.length * 3;
Object.assign(J, { hipL: LEG0, knL: LEG0 + 1, ftL: LEG0 + 2, hipR: LEG0 + 3, knR: LEG0 + 4, ftR: LEG0 + 5 });
export const JOINT_COUNT = LEG0 + 6;

export const BONE = { upperArm: 0.32, foreArm: 0.31, thigh: 0.4, shin: 0.41 };

// Rest pose, local space: facing +z, game "Left" side = -x.
export const REST = Array.from({ length: JOINT_COUNT }, () => new Vector3());
REST[J.pelvis].set(0, 0.95, 0); REST[J.chest].set(0, 1.45, 0); REST[J.head].set(0, 1.88, 0);
for (const a of ARMS) {
  const { side, tier } = ARM_INFO[a], T = TIER[tier], j = ARM_J[a];
  const sh = REST[j.sh].set(side * T.shoulder[0], 1.45 + T.shoulder[1], T.shoulder[2]);
  const hand = new Vector3(side * T.aHand[0], T.aHand[1], 0);
  const dir = hand.clone().sub(sh).normalize();
  REST[j.el].copy(sh).addScaledVector(dir, BONE.upperArm);
  REST[j.ha].copy(sh).addScaledVector(dir, BONE.upperArm + BONE.foreArm);
}
REST[J.hipL].set(-0.15, 0.9, 0); REST[J.knL].set(-0.17, 0.5, 0); REST[J.ftL].set(-0.18, 0.09, 0);
REST[J.hipR].set(0.15, 0.9, 0); REST[J.knR].set(0.17, 0.5, 0); REST[J.ftR].set(0.18, 0.09, 0);

const MASS = [], GAIN = [];
export const RADIUS = [];
const set = (i, m, r, g) => { MASS[i] = m; RADIUS[i] = r; GAIN[i] = g; };
set(J.pelvis, 4, 0.2, 1.6); set(J.chest, 4, 0.25, 1.3); set(J.head, 1.4, 0.33, 0.7);
for (const a of ARMS) { const j = ARM_J[a]; set(j.sh, 1, 0.12, 1); set(j.el, 0.6, 0.09, 0.8); set(j.ha, 0.5, 0.1, 1.15); }
for (const [h, k, f] of [[J.hipL, J.knL, J.ftL], [J.hipR, J.knR, J.ftR]]) { set(h, 1.2, 0.12, 1.2); set(k, 0.8, 0.1, 1.2); set(f, 0.7, 0.08, 1.5); }
export const isLegJoint = i => i >= LEG0;

const PAIRS = [
  [J.pelvis, J.chest], [J.chest, J.head],
  [J.pelvis, J.hipL], [J.pelvis, J.hipR], [J.hipL, J.knL], [J.knL, J.ftL], [J.hipR, J.knR], [J.knR, J.ftR],
  [J.hipL, J.hipR], [J.hipL, J.chest], [J.hipR, J.chest],
];
const MIN_DIST = [[J.hipL, J.ftL, 0.35], [J.hipR, J.ftR, 0.35], [J.head, J.pelvis, 0.8]];
for (const a of ARMS) {
  const j = ARM_J[a];
  // arm bones + rigid attachment of each shoulder to the torso (chest, pelvis, head)
  PAIRS.push([J.chest, j.sh], [j.sh, j.el], [j.el, j.ha], [j.sh, J.pelvis], [j.sh, J.head]);
  MIN_DIST.push([j.sh, j.ha, 0.22]);
}
// shoulders braced across and along each side so the six-armed torso stays rigid
for (const t of [1, 2, 3]) PAIRS.push([ARM_J[`armL${t}`].sh, ARM_J[`armR${t}`].sh]);
for (const s of ['L', 'R']) PAIRS.push([ARM_J[`arm${s}1`].sh, ARM_J[`arm${s}2`].sh], [ARM_J[`arm${s}2`].sh, ARM_J[`arm${s}3`].sh]);
PAIRS.push([ARM_J.armL1.sh, J.hipR], [ARM_J.armR1.sh, J.hipL]);

export class Ragdoll {
  constructor() {
    this.p = REST.map(v => v.clone());
    this.prev = REST.map(v => v.clone());
    this.target = REST.map(v => v.clone());
    this.targetVel = REST.map(() => new Vector3());
    this.invMass = MASS.map(m => 1 / m);
    this.cons = PAIRS.map(([a, b]) => ({ a, b, len: REST[a].distanceTo(REST[b]) }));
    this.muscle = 1;        // global 0..1
    this.legMuscle = 1;     // legs can stay strong while upper body is staggered
    this.onGround = REST.map(() => false);
    this._t = new Vector3(); this._v = new Vector3();
  }

  teleport(points) {
    for (let i = 0; i < JOINT_COUNT; i++) { this.p[i].copy(points[i]); this.prev[i].copy(points[i]); this.target[i].copy(points[i]); }
  }

  velocity(i, out = new Vector3()) { return out.subVectors(this.p[i], this.prev[i]).divideScalar(CONFIG.physics.dt); }

  // Instant velocity change (impulse / mass already applied by caller).
  addVelocity(i, dv) { this.prev[i].addScaledVector(dv, -CONFIG.physics.dt); }

  addImpulseAll(dv, scale = 1) { for (let i = 0; i < JOINT_COUNT; i++) this.addVelocity(i, this._v.copy(dv).multiplyScalar(scale)); }

  step(groundFn) {
    const { dt, gravity, kp, kd, iterations } = CONFIG.physics;
    const v = this._v, a = this._t;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const p = this.p[i], pr = this.prev[i];
      v.subVectors(p, pr).divideScalar(dt);
      const m = (isLegJoint(i) ? Math.max(this.muscle, this.legMuscle) : this.muscle) * GAIN[i];
      a.set(0, gravity, 0);
      if (m > 0.001) {
        // PD muscle toward animated target (mass-normalised so light limbs do not overshoot)
        a.x += m * (kp * (this.target[i].x - p.x) + kd * (this.targetVel[i].x - v.x));
        a.y += m * (kp * (this.target[i].y - p.y) + kd * (this.targetVel[i].y - v.y));
        a.z += m * (kp * (this.target[i].z - p.z) + kd * (this.targetVel[i].z - v.z));
      }
      const damp = this.onGround[i] ? 0.985 : 0.998;
      pr.copy(p);
      p.x += v.x * dt * damp + a.x * dt * dt;
      p.y += v.y * dt * damp + a.y * dt * dt;
      p.z += v.z * dt * damp + a.z * dt * dt;
    }
    for (let k = 0; k < iterations; k++) {
      for (const c of this.cons) this._solve(c.a, c.b, c.len, 1);
      for (const [x, y, d] of MIN_DIST) {
        if (this.p[x].distanceTo(this.p[y]) < d) this._solve(x, y, d, 0.5);
      }
      for (let i = 0; i < JOINT_COUNT; i++) this.onGround[i] = groundFn(this.p[i], this.prev[i], RADIUS[i]);
    }
  }

  _solve(ia, ib, len, stiff) {
    const pa = this.p[ia], pb = this.p[ib];
    const d = this._t.subVectors(pb, pa);
    const dist = d.length() || 1e-6;
    const wa = this.invMass[ia], wb = this.invMass[ib];
    const diff = (dist - len) / (dist * (wa + wb)) * stiff;
    pa.addScaledVector(d, wa * diff);
    pb.addScaledVector(d, -wb * diff);
  }
}
