// Capsule / segment collision helpers used for weapon hits, shield blocks and arrows.
import { Vector3 } from '../../vendor/three.module.js';

const d1 = new Vector3(), d2 = new Vector3(), r = new Vector3();
const c1 = new Vector3(), c2 = new Vector3();

// Closest points between segments p1-q1 and p2-q2. Returns distance; writes points to outA/outB.
export function segSegDist(p1, q1, p2, q2, outA = c1, outB = c2) {
  d1.subVectors(q1, p1); d2.subVectors(q2, p2); r.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { outA.copy(p1); outB.copy(p2); return outA.distanceTo(outB); }
  if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  outA.copy(p1).addScaledVector(d1, s);
  outB.copy(p2).addScaledVector(d2, t);
  return outA.distanceTo(outB);
}

export function segPointDist(p, q, pt, out = c1) {
  d1.subVectors(q, p);
  const l = d1.lengthSq();
  const t = l > 1e-9 ? Math.min(1, Math.max(0, r.subVectors(pt, p).dot(d1) / l)) : 0;
  out.copy(p).addScaledVector(d1, t);
  return out.distanceTo(pt);
}
