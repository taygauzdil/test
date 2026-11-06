// A gladiator in combat: active ragdoll body + animation state + AI brain.
import { Vector3 } from '../../vendor/three.module.js';
import { Ragdoll, J, ARM_J, JOINT_COUNT } from '../physics/ragdoll.js';
import { ARMS, ARM_INFO, TIER } from '../body.js';
import { ATTACKS, SHIELD_GUARD, BOW, sampleAttack, buildPose, makePose } from './animation.js';
import { CONFIG } from '../config.js';
import { ITEMS } from '../items.js';

const ARM_KEYS = ARMS;
const HAND = Object.fromEntries(ARMS.map(a => [a, ARM_J[a].ha]));
const ELBOW = Object.fromEntries(ARMS.map(a => [a, ARM_J[a].el]));
const SIDE = Object.fromEntries(ARMS.map(a => [a, ARM_INFO[a].side]));
const UPPER_JOINTS = [J.chest, J.head, ...ARMS.flatMap(a => [ARM_J[a].sh, ARM_J[a].el, ARM_J[a].ha])];
// shift a root-local hand target into this arm's tier so the three arm pairs fan out
const tierShift = (v, arm) => { const T = TIER[arm.tier]; v.x += arm.side * T.dx; v.y += T.dy; v.z += T.dz; return v; };

export class Fighter {
  constructor({ team, loadout, x, z = 0.3, yaw, name, purse = 0, rng = Math.random }) {
    this.team = team; this.name = name; this.lo = loadout; this.rng = rng;
    this.rd = new Ragdoll();
    this.root = new Vector3(x, 0, z);
    this.yaw = yaw;
    this.vel = new Vector3();     // AI locomotion velocity (world xz)
    this.kv = new Vector3();      // knockback slide velocity
    this.maxHp = loadout.stats.maxHp; this.hp = this.maxHp;
    this.st = loadout.stats;
    this.state = 'fight'; this.stateT = 0;
    this.poise = 0; this.flinch = 0; this.stun = 0;
    this.walkPhase = rng() * 6;
    this.strafeSeed = rng() * 10;
    this.purse = purse; this.stolen = 0;
    this.damageDealt = 0;
    this.globalCd = 0.4 + rng() * 0.3;
    this.arms = {};
    for (const a of ARM_KEYS) {
      const src = loadout.arms[a];
      this.arms[a] = {
        key: a, side: SIDE[a], tier: ARM_INFO[a].tier, type: src.type, st: src.st, item: src.item, twoHanded: src.twoHanded,
        drawArm: src.drawArm, bowArm: src.bowArm,
        cd: 0.3 + rng() * 0.5, anim: null, wdir: new Vector3(0, 1, 0), bladeLocal: new Vector3(0, 1, 0),
      };
    }
    this.hasWeapons = ARMS.some(a => this.arms[a].item && this.arms[a].type !== 'shield');
    this.perks = loadout.perks.map(p => ({ ...p, t: p.st.cooldown * (0.5 + rng() * 0.3) }));
    this.pose = makePose();
    this.prevTarget = makePose();
    this.worldTarget = makePose();
    this.face = { hurt: 0, angry: 0 };
    this.lean = 0; this.twist = 0; this.lunge = 0;
    this.attacking = null;
    this.mood = 0;
    this._init();
  }

  _init() {
    this._computeTargets(0);
    this.rd.teleport(this.worldTarget);
  }

  get alive() { return this.hp > 0 && this.state !== 'fallen'; }
  get standing() { return this.state === 'fight' || this.state === 'victory' || this.state === 'intro'; }
  get pelvis() { return this.rd.p[J.pelvis]; }
  get headPos() { return this.rd.p[J.head]; }
  forward(out = new Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  meleeReach() {
    let r = 0;
    for (const a of ARM_KEYS) { const arm = this.arms[a]; if (arm.type !== 'shield' && arm.type !== 'draw' && arm.type !== 'shoot') r = Math.max(r, arm.st.reach); }
    return r || 1.1;
  }
  isRanged() { return ARMS.some(a => this.arms[a].type === 'shoot') && this.meleeReach() < 1.2; }

  // ---------- AI ----------
  think(dt, foe, t) {
    if (this.state === 'intro') {
      const dir = Math.sign(this.introTo - this.root.x);
      this.vel.set(dir * this.st.moveSpeed * 0.9, 0, 0);
      if (Math.abs(this.introTo - this.root.x) < 0.1) { this.vel.set(0, 0, 0); }
      this._faceToward(foe.root, dt, 8);
      return;
    }
    if (this.state !== 'fight') { this.vel.multiplyScalar(Math.exp(-8 * dt)); return; }
    const d = new Vector3().subVectors(foe.root, this.root); d.y = 0;
    const dist = d.length(); d.normalize();
    this._faceToward(foe.root, dt, this.attacking ? 3 : 7);

    const A = CONFIG.arena;
    let desired;
    if (this.isRanged()) desired = 5.0;   // keep range; if caught, bash
    else desired = this.meleeReach() * 0.86;
    let speed = Math.max(this.isRanged() ? -0.65 : -0.3, Math.min(1, (dist - desired) * 1.6));
    if (this.attacking) speed *= 0.25;
    if (!foe.standing && !this.isRanged()) speed = Math.min(speed, (dist - desired - 0.2));   // don't trample a fallen foe
    const v = new Vector3().copy(d).multiplyScalar(speed);
    // strafe a little so fights are not perfectly collinear, but stay away from the cliff
    const perp = new Vector3(-d.z, 0, d.x);
    v.addScaledVector(perp, Math.sin(t * 0.6 + this.strafeSeed) * 0.3);
    const edgeDanger = (A.edge + 1.6) - this.root.z;
    if (edgeDanger > 0) v.z += Math.min(1.2, edgeDanger * 1.4);
    v.z += (0.3 - this.root.z) * 0.15;
    if (Math.abs(this.root.x) > A.halfWidth - 1.2 && this.isRanged()) v.x -= Math.sign(this.root.x) * 0.8;
    if (v.length() > 1) v.normalize();
    const ms = this.st.moveSpeed * (this.stun > 0 ? 0.3 : 1);
    this.vel.lerp(v.multiplyScalar(ms), 1 - Math.exp(-6 * dt));

    // attacks
    this.globalCd -= dt;
    for (const a of ARM_KEYS) this.arms[a].cd -= dt;
    if (this.attacking || this.globalCd > 0 || this.stun > 0) return;
    const facing = this.forward().dot(d) > 0.8;
    if (!facing) return;
    const options = [];
    for (const a of ARM_KEYS) {
      const arm = this.arms[a];
      if (arm.cd > 0) continue;
      if (arm.type === 'shield' || arm.type === 'draw') continue;
      if (arm.type === 'shoot') {
        if (dist > 1.0) options.push({ arm, kind: 'shoot' });
        else options.push({ arm, kind: 'fist', st: { dmg: 6, cooldown: 0.9, reach: 1.15, kb: 0.9 } });
        continue;
      }
      if (arm.type === 'fist' && this.hasWeapons && this.rng() < 0.6) continue;   // weapons first
      const reach = arm.st.reach + 0.25;
      if (dist <= reach) options.push({ arm, kind: arm.type });
    }
    if (!options.length) return;
    // prefer real weapons; fists only fill gaps
    options.sort((x, y) => ((y.st || y.arm.st).dmg + this.rng() * 4) - ((x.st || x.arm.st).dmg + this.rng() * 4));
    const o = options[0];
    this.startAttack(o.arm, o.kind, o.st);
  }

  _faceToward(p, dt, rate) {
    const target = Math.atan2(p.x - this.root.x, p.z - this.root.z);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }

  startAttack(arm, kind, stOverride) {
    const st = stOverride || arm.st;
    const prof = kind === 'shoot' ? BOW : ATTACKS[kind];
    const speedMul = kind === 'shoot' ? 1 : Math.max(0.75, Math.min(1.2, st.cooldown / (prof.dur * 1.6)));
    this.attacking = { arm, kind, st, t: 0, dur: prof.dur * speedMul, hit: false, fired: false, prof, guarded: this.rng() < 0.5 };
    arm.cd = st.cooldown;
    this.globalCd = kind === 'fist' ? 0.22 : 0.28;
    this.events?.push({ type: 'swing', f: this, kind });
  }

  // ---------- pose ----------
  _computeTargets(dt) {
    const out = this.pose;
    const lv = new Vector3().copy(this.vel);
    // local velocity: rotate by -yaw
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = lv.x * c - lv.z * s, lz = lv.x * s + lv.z * c;
    const spd = Math.hypot(lx, lz);
    this.walkPhase += dt * (4 + spd * 4.5) * (spd > 0.15 ? 1 : 0.2);
    const ph = this.walkPhase;
    const stride = Math.min(0.28, spd * 0.16);
    const lift = spd > 0.15 ? 0.13 : 0;
    const dirx = spd > 0.01 ? lx / spd : 0, dirz = spd > 0.01 ? lz / spd : 1;

    let lean = 0.06 + lz * 0.05, twist = 0, lunge = 0, pelvisY = 0.9 - Math.abs(Math.sin(ph)) * 0.03 * (spd > 0.15 ? 1 : 0.3);
    const hands = this._hands || (this._hands = Object.fromEntries(ARMS.map(a => [a, new Vector3()])));
    const blade = new Vector3();
    let headTilt = 0;
    const A = this.attacking;
    const bowAttack = A && A.kind === 'shoot' ? A.arm : null;

    for (const key of ARMS) {
      const arm = this.arms[key];
      const sd = arm.side, h = hands[key];
      if (A && A.arm === arm && A.kind !== 'shoot') {
        const r = sampleAttack(A.prof, Math.min(1, A.t / A.dur), sd, h, blade);
        tierShift(h, arm);
        twist += r.twist; lean += r.lean; lunge = Math.max(lunge, r.lunge);
      } else if (bowAttack && (arm === bowAttack || key === bowAttack.drawArm)) {
        const u = A.t / A.dur;
        if (arm === bowAttack) { h.copy(BOW.bowHand); h.x *= sd; blade.set(0, 1, 0.15).normalize(); }
        else {
          const f = u < BOW.release ? u / BOW.release : Math.max(0, 1 - (u - BOW.release) * 4);
          h.lerpVectors(BOW.drawFrom, BOW.drawTo, f); h.x *= -sd; h.x += sd * 0.02;
          blade.set(0, 0, 1);
        }
        tierShift(h, this.arms[bowAttack.key]);
        twist += -bowAttack.side * 0.2;
      } else if (arm.type === 'shield') {
        // raise the shield on the same tier as the incoming swing
        const raise = this.foeAttacking && this.foe?.attacking && Math.abs(this.foe.attacking.arm.tier - arm.tier) <= 1 ? 1 : 0;
        h.lerpVectors(SHIELD_GUARD.h, SHIELD_GUARD.raise, raise); h.x *= sd;
        tierShift(h, arm);
        blade.set(0, 1, 0);
      } else if (arm.type === 'shoot' || arm.type === 'draw') {
        // idle bow: held low-forward
        if (arm.type === 'shoot') { h.set(0.24 * sd, 1.15, 0.38); blade.set(0, 1, 0.3).normalize(); }
        else { h.set(0.1 * sd, 1.2, 0.3); blade.set(0, 0, 1); }
        tierShift(h, arm);
      } else {
        const prof = ATTACKS[arm.type] || ATTACKS.fist;
        h.copy(prof.guard.h); h.x *= sd; blade.copy(prof.guard.b); blade.x *= sd; blade.normalize();
        tierShift(h, arm);
        // idle sway, each arm on its own rhythm so the monster looks alive
        h.y += Math.sin(ph * 0.5 + arm.tier * 2.1 + sd) * 0.03;
        h.z += Math.sin(ph + arm.tier + (sd > 0 ? Math.PI : 0)) * (stride * 0.4 + 0.02);
      }
      arm.bladeLocal.copy(blade);
    }

    // feet (fighting stance, staggered) + walk cycle
    const feet = [new Vector3(-0.2, 0.09, 0.12), new Vector3(0.2, 0.09, -0.12)];
    for (let i = 0; i < 2; i++) {
      const p = ph + i * Math.PI;
      feet[i].x += dirx * Math.sin(p) * stride;
      feet[i].z += dirz * Math.sin(p) * stride;
      feet[i].y += Math.max(0, Math.cos(p)) * lift;
    }

    if (this.state === 'victory') {
      const b = Math.abs(Math.sin(this.stateT * 6));
      for (const key of ARMS) {
        const arm = this.arms[key];
        hands[key].set(arm.side * (0.35 + arm.tier * 0.3), 2.15 - arm.tier * 0.35 + b * 0.1 * (arm.tier % 2 ? -1 : 1), 0.1);
        arm.bladeLocal.set(arm.side * (0.2 + arm.tier * 0.4), 1, 0).normalize();
      }
      pelvisY = 0.9 + b * 0.12; lean = -0.1; twist = 0;
      feet[0].set(-0.2, 0.09 + b * 0.1, 0); feet[1].set(0.2, 0.09 + b * 0.1, 0);
    }
    if (this.state === 'getup') {
      const g = Math.min(1, this.stateT / 0.75);
      pelvisY = 0.45 + 0.45 * g; lean = 0.6 * (1 - g) + 0.06;
      feet[0].set(-0.22, 0.09, 0.25 * (1 - g)); feet[1].set(0.22, 0.09, -0.1);
    }
    if (this.flinch > 0) { lean -= this.flinch * 0.6; headTilt -= this.flinch * 0.7; }

    this.lean += (lean - this.lean) * Math.min(1, dt * 14);
    this.twist += (twist - this.twist) * Math.min(1, dt * 16);
    this.lunge += (lunge - this.lunge) * Math.min(1, dt * 10);

    buildPose({ pelvisY, lean: this.lean, twist: this.twist, pz: this.lunge * 0.35, hands, feet, headTilt }, out);
    // apply lunge to upper body + hands
    for (const j of UPPER_JOINTS) out[j].z += this.lunge * 0.2;

    // local -> world
    for (let i = 0; i < JOINT_COUNT; i++) {
      const p = out[i];
      this.prevTarget[i].copy(this.worldTarget[i]);
      this.worldTarget[i].set(this.root.x + p.x * c + p.z * s, p.y, this.root.z - p.x * s + p.z * c);
      if (dt > 0) this.rd.targetVel[i].subVectors(this.worldTarget[i], this.prevTarget[i]).divideScalar(dt);
      else this.rd.targetVel[i].set(0, 0, 0);
      this.rd.target[i].copy(this.worldTarget[i]);
    }
  }

  // world-space blade direction blending animation intent with the physical forearm
  updateWeaponDirs(dt) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fa = new Vector3(), want = new Vector3();
    for (const key of ARM_KEYS) {
      const arm = this.arms[key];
      const bl = arm.bladeLocal;
      want.set(bl.x * c + bl.z * s, bl.y, -bl.x * s + bl.z * c);
      fa.subVectors(this.rd.p[HAND[key]], this.rd.p[ELBOW[key]]).normalize();
      const m = Math.min(1, this.rd.muscle);
      want.multiplyScalar(m * 0.8).addScaledVector(fa, 1 - m * 0.8 + 0.15).normalize();
      arm.wdir.lerp(want, 1 - Math.exp(-30 * dt)).normalize();
    }
  }

  // Weapon damaging segment in world space
  weaponSegment(arm, kind, a = new Vector3(), b = new Vector3()) {
    const hand = this.rd.p[HAND[arm.key]];
    const shape = WEAPON_SHAPE_LOOKUP(kind);
    const len = kind === 'fist' ? 0 : (arm.st.length || 1);
    a.copy(hand).addScaledVector(arm.wdir, shape[0] * len);
    b.copy(hand).addScaledVector(arm.wdir, Math.max(shape[1] * len, 0.02));
    return shape[2];
  }

  setState(s) { this.state = s; this.stateT = 0; }

  update(dt) {
    this.stateT += dt;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    this.stun = Math.max(0, this.stun - dt);
    this.kdImmune = Math.max(0, (this.kdImmune || 0) - dt);
    this.poise = Math.max(0, this.poise - dt * 1.0);
    this.face.hurt = Math.max(0, this.face.hurt - dt * 1.5);
    const rd = this.rd;
    if (this.attacking) {
      this.attacking.t += dt;
      if (this.attacking.t >= this.attacking.dur || !this.standing) this.attacking = null;
    }
    switch (this.state) {
      case 'fight': case 'intro': case 'victory':
        rd.muscle = Math.min(1, rd.muscle + dt * 2.2);
        rd.legMuscle = 1;
        break;
      case 'down':
        rd.muscle = 0.035; rd.legMuscle = 0.035;
        if (this.stateT > 0.8 / Math.max(0.6, this.st.stability) + 0.3 && this.hp > 0) {
          this.setState('getup');
          this.root.set(rd.p[J.pelvis].x, 0, rd.p[J.pelvis].z);
        }
        break;
      case 'getup':
        rd.muscle = Math.min(1, 0.2 + this.stateT * 1.2); rd.legMuscle = rd.muscle;
        this.root.x += (rd.p[J.pelvis].x - this.root.x) * Math.min(1, dt * 2);
        this.root.z += (rd.p[J.pelvis].z - this.root.z) * Math.min(1, dt * 2);
        if (this.stateT > 0.85) { this.setState('fight'); this.kdImmune = 2.2; this.poise = 0; }
        break;
      case 'falling': case 'ko': case 'fallen':
        rd.muscle = this.state === 'ko' ? 0.02 : 0.0; rd.legMuscle = rd.muscle;
        break;
    }

    // root motion (standing states)
    if (this.standing || this.state === 'getup') {
      this.root.addScaledVector(this.vel, dt).addScaledVector(this.kv, dt);
    } else if (this.state === 'down') {
      this.root.set(rd.p[J.pelvis].x, 0, rd.p[J.pelvis].z);
    }
    this.kv.multiplyScalar(Math.exp(-3.4 * dt));
    const A = CONFIG.arena;
    this.root.x = Math.max(-A.halfWidth + 0.4, Math.min(A.halfWidth - 0.4, this.root.x));
    this.root.z = Math.min(A.front - 0.4, this.root.z);

    // lost footing: standing over the void -> fall
    if ((this.standing || this.state === 'getup') && this.root.z < A.edge - 0.15) {
      this.setState('falling');
      this.events?.push({ type: 'edge', f: this });
    }

    this._computeTargets(dt);
  }
}

function WEAPON_SHAPE_LOOKUP(kind) {
  return { fist: [0, 0.02, 0.13], slash: [0.15, 1, 0.07], chop: [0.55, 1, 0.15], slam: [0.62, 1, 0.2], thrust: [0.68, 1, 0.08] }[kind] || [0, 0.02, 0.12];
}

export { ARM_KEYS, HAND, ELBOW, SIDE };
export const itemName = it => (it ? ITEMS[it.id].name : 'Fist');
