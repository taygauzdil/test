// Procedural animation: produces local-space target poses that the active ragdoll muscles chase.
// Attack profiles are keyframed hand positions + blade directions; x values are mirrored per arm.
import { Vector3 } from '../../vendor/three.module.js';
import { J, BONE, JOINT_COUNT } from '../physics/ragdoll.js';

const V = (x, y, z) => new Vector3(x, y, z);

// h = hand position (root-local, x mirrored by arm side), b = blade direction.
export const ATTACKS = {
  fist: { dur: 0.4, w: 0.32, k: 0.6, guard: { h: V(0.2, 1.33, 0.34), b: V(0, 0.3, 1) }, wind: { h: V(0.26, 1.38, 0.0), b: V(0, 0.2, 1) },
    strike: { h: V(0.02, 1.42, 0.82), b: V(0, 0, 1) }, twist: [0.35, -0.5], lean: [0, 0.2], lunge: 0.35 },
  slash: { dur: 0.5, w: 0.36, k: 0.62, guard: { h: V(0.3, 1.2, 0.35), b: V(-0.2, 0.75, 0.65) }, wind: { h: V(0.36, 1.8, -0.05), b: V(0.35, 0.7, -0.6) },
    strike: { h: V(-0.1, 1.12, 0.64), b: V(-0.35, -0.12, 0.93) }, twist: [0.5, -0.6], lean: [-0.05, 0.28], lunge: 0.38 },
  chop: { dur: 0.72, w: 0.45, k: 0.68, guard: { h: V(0.32, 1.25, 0.28), b: V(0, 1, 0.3) }, wind: { h: V(0.14, 2.0, -0.12), b: V(0, 0.45, -0.9) },
    strike: { h: V(0.04, 0.98, 0.6), b: V(0, -0.55, 0.84) }, twist: [0.3, -0.3], lean: [-0.15, 0.38], lunge: 0.38 },
  slam: { dur: 1.05, w: 0.55, k: 0.74, guard: { h: V(0.3, 1.05, 0.28), b: V(0.15, 1, 0.2) }, wind: { h: V(0.08, 2.1, -0.28), b: V(0, 0.25, -1) },
    strike: { h: V(0, 0.8, 0.64), b: V(0, -0.8, 0.6) }, twist: [0.25, -0.2], lean: [-0.25, 0.55], lunge: 0.42 },
  thrust: { dur: 0.58, w: 0.4, k: 0.66, guard: { h: V(0.28, 1.15, 0.2), b: V(-0.08, 0.12, 1) }, wind: { h: V(0.3, 1.2, -0.25), b: V(-0.06, 0.05, 1) },
    strike: { h: V(0.05, 1.32, 0.8), b: V(-0.06, 0.0, 1) }, twist: [0.4, -0.35], lean: [-0.05, 0.22], lunge: 0.45 },
};

export const SHIELD_GUARD = { h: V(0.32, 1.1, 0.3), raise: V(0.08, 1.42, 0.5) };
export const BOW = { dur: 0.95, release: 0.7, bowHand: V(0.1, 1.45, 0.62), drawFrom: V(-0.02, 1.45, 0.5), drawTo: V(-0.06, 1.47, 0.08) };

// Damaging part of each weapon along the blade axis (from, to, radius)
export const WEAPON_SHAPE = {
  fist: [0, 0.02, 0.12], slash: [0.15, 1, 0.07], chop: [0.5, 1, 0.14], slam: [0.6, 1, 0.19], thrust: [0.95, 1, 0.07],
};

const ease = t => t * t * (3 - 2 * t);
const easeIn = t => t * t;
const tmp = new Vector3(), tmp2 = new Vector3();

// Evaluate an attack at normalised time u for an arm side s (-1 left, +1 right).
export function sampleAttack(prof, u, s, outHand, outBlade) {
  let a, b, f, arc = 0;
  if (u < prof.w) { a = prof.guard; b = prof.wind; f = ease(u / prof.w); }
  else if (u < prof.k) { a = prof.wind; b = prof.strike; const g = (u - prof.w) / (prof.k - prof.w); f = easeIn(g); arc = Math.sin(Math.PI * g); }
  else { a = prof.strike; b = prof.guard; f = ease((u - prof.k) / (1 - prof.k)); }
  outHand.lerpVectors(a.h, b.h, f); outHand.x *= s; outHand.z += arc * 0.22;
  outBlade.lerpVectors(a.b, b.b, f); outBlade.x *= s; outBlade.normalize();
  const tw = u < prof.w ? prof.twist[0] * ease(u / prof.w) : u < prof.k ? prof.twist[0] + (prof.twist[1] - prof.twist[0]) * ease((u - prof.w) / (prof.k - prof.w)) : prof.twist[1] * (1 - ease((u - prof.k) / (1 - prof.k)));
  const ln = u < prof.w ? prof.lean[0] * ease(u / prof.w) : u < prof.k ? prof.lean[0] + (prof.lean[1] - prof.lean[0]) * ease((u - prof.w) / (prof.k - prof.w)) : prof.lean[1] * (1 - ease((u - prof.k) / (1 - prof.k)));
  return { twist: tw * -s, lean: ln, lunge: u > prof.w && u < prof.k + 0.1 ? prof.lunge : 0 };
}

// Two-bone IK: returns middle joint for a chain start->end with lengths l1,l2, bending toward pole.
export function ik2(a, c, l1, l2, pole, outMid, outEnd) {
  tmp.subVectors(c, a);
  let d = tmp.length();
  const maxD = (l1 + l2) * 0.995;
  if (d > maxD) { tmp.multiplyScalar(maxD / d); d = maxD; }
  if (d < 0.05) { tmp.set(0, -0.05, 0); d = 0.05; }
  outEnd.copy(a).add(tmp);
  const n = tmp.divideScalar(d);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  tmp2.subVectors(pole, a);
  tmp2.addScaledVector(n, -tmp2.dot(n));
  if (tmp2.lengthSq() < 1e-6) tmp2.set(0, 0, 1);
  tmp2.normalize();
  outMid.copy(a).addScaledVector(n, x).addScaledVector(tmp2, h);
  return outMid;
}

// Build a full local-space pose from high level parameters.
// p: { pelvisY, lean, twist, side lean, hands:[L,R] local, feet:[L,R] local, headTilt }
const pole = new Vector3();
export function buildPose(p, out) {
  const pel = out[J.pelvis].set(p.px || 0, p.pelvisY, p.pz || 0);
  const cl = Math.cos(p.lean), sl = Math.sin(p.lean);
  out[J.chest].set(pel.x + (p.roll || 0) * 0.5, pel.y + 0.5 * cl, pel.z + 0.5 * sl);
  const ch = out[J.chest];
  const ct = Math.cos(p.twist), st = Math.sin(p.twist);
  // rotY(twist) applied to (+-0.34,0,0): x' = x cos, z' = -x sin
  out[J.shL].set(ch.x - 0.34 * ct, ch.y - 0.0, ch.z + 0.34 * st);
  out[J.shR].set(ch.x + 0.34 * ct, ch.y, ch.z - 0.34 * st);
  const hl = 0.43, hlean = p.lean * 0.6 + (p.headTilt || 0);
  out[J.head].set(ch.x + (p.roll || 0) * 0.3, ch.y + hl * Math.cos(hlean), ch.z + hl * Math.sin(hlean));
  const ht = p.twist * 0.3, hc = Math.cos(ht), hs = Math.sin(ht);
  out[J.hipL].set(pel.x - 0.15 * hc, pel.y - 0.05, pel.z + 0.15 * hs);
  out[J.hipR].set(pel.x + 0.15 * hc, pel.y - 0.05, pel.z - 0.15 * hs);
  // arms
  for (const [sh, el, ha, s, hand] of [[J.shL, J.elL, J.haL, -1, p.hands[0]], [J.shR, J.elR, J.haR, 1, p.hands[1]]]) {
    pole.copy(out[sh]).add(tmp.set(s * 0.55, -0.55, -0.35));
    ik2(out[sh], hand, BONE.upperArm, BONE.foreArm, pole, out[el], out[ha]);
  }
  for (const [hip, kn, ft, s, foot] of [[J.hipL, J.knL, J.ftL, -1, p.feet[0]], [J.hipR, J.knR, J.ftR, 1, p.feet[1]]]) {
    pole.copy(out[hip]).add(tmp.set(s * 0.12, -0.2, 0.9));
    ik2(out[hip], foot, BONE.thigh, BONE.shin, pole, out[kn], out[ft]);
  }
  return out;
}

export const makePose = () => Array.from({ length: JOINT_COUNT }, () => new Vector3());

// Prep-screen A-pose with gentle breathing.
export function aPose(t, out) {
  const b = Math.sin(t * 2) * 0.012;
  return buildPose({
    pelvisY: 0.95 + b * 0.5, lean: 0, twist: Math.sin(t * 0.7) * 0.03,
    hands: [V(-0.84, 1.0 + b, 0.06), V(0.84, 1.0 + b, 0.06)],
    feet: [V(-0.3, 0.09, 0.02), V(0.3, 0.09, 0.02)], headTilt: Math.sin(t * 0.9) * 0.03,
  }, out);
}
