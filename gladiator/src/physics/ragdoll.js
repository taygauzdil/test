// Active ragdoll: a Verlet particle skeleton held together by distance constraints and driven
// toward an animated target pose by PD "muscles". Lowering muscle strength lets physics take
// over (stagger, knockdown, falling off the cliff); raising it lets animation take back control.
import { Vector3 } from '../../vendor/three.module.js';
import { CONFIG } from '../config.js';

export const J = {
  pelvis: 0, chest: 1, head: 2,
  shL: 3, elL: 4, haL: 5, shR: 6, elR: 7, haR: 8,
  hipL: 9, knL: 10, ftL: 11, hipR: 12, knR: 13, ftR: 14,
};
export const JOINT_COUNT = 15;

// Rest pose, local space: facing +z, game "Left" side = -x.
export const REST = [
  [0, 0.95, 0], [0, 1.45, 0], [0, 1.88, 0],
  [-0.34, 1.45, 0], [-0.55, 1.2, 0], [-0.72, 0.95, 0],
  [0.34, 1.45, 0], [0.55, 1.2, 0], [0.72, 0.95, 0],
  [-0.15, 0.9, 0], [-0.17, 0.5, 0], [-0.18, 0.09, 0],
  [0.15, 0.9, 0], [0.17, 0.5, 0], [0.18, 0.09, 0],
].map(a => new Vector3(...a));

export const BONE = { upperArm: 0.32, foreArm: 0.31, thigh: 0.4, shin: 0.41 };

const MASS = [3, 3, 1.4, 1, 0.6, 0.5, 1, 0.6, 0.5, 1.2, 0.8, 0.7, 1.2, 0.8, 0.7];
export const RADIUS = [0.2, 0.25, 0.33, 0.12, 0.09, 0.1, 0.12, 0.09, 0.1, 0.12, 0.1, 0.08, 0.12, 0.1, 0.08];
// Per-joint muscle gain multipliers: core/legs stronger so the fighter stays upright under hits.
const GAIN = [1.6, 1.3, 0.7, 1, 0.8, 1.15, 1, 0.8, 1.15, 1.2, 1.2, 1.5, 1.2, 1.2, 1.5];

const PAIRS = [
  // bones
  [J.pelvis, J.chest], [J.chest, J.head], [J.chest, J.shL], [J.chest, J.shR],
  [J.shL, J.elL], [J.elL, J.haL], [J.shR, J.elR], [J.elR, J.haR],
  [J.pelvis, J.hipL], [J.pelvis, J.hipR], [J.hipL, J.knL], [J.knL, J.ftL], [J.hipR, J.knR], [J.knR, J.ftR],
  // stiffeners keep torso / hips / neck rigid
  [J.shL, J.shR], [J.hipL, J.hipR], [J.shL, J.pelvis], [J.shR, J.pelvis], [J.hipL, J.chest], [J.hipR, J.chest],
  [J.head, J.shL], [J.head, J.shR], [J.shL, J.hipR], [J.shR, J.hipL],
];
// Soft min-distance limits stop limbs folding through themselves when fully limp.
const MIN_DIST = [[J.shL, J.haL, 0.22], [J.shR, J.haR, 0.22], [J.hipL, J.ftL, 0.35], [J.hipR, J.ftR, 0.35], [J.head, J.pelvis, 0.8]];

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
      const isLeg = i >= J.hipL;
      const m = (isLeg ? Math.max(this.muscle, this.legMuscle) : this.muscle) * GAIN[i];
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
