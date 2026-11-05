// Battle simulation: fixed-step physics, collision-based melee hits, shields, arrows,
// perks, knockback, knockdowns, cliff falls and victory conditions. Render-independent
// (runs headless in Node for balance tests).
import { Vector3 } from '../../vendor/three.module.js';
import { Fighter, ARM_KEYS } from './fighter.js';
import { J } from '../physics/ragdoll.js';
import { segSegDist, segPointDist } from '../physics/collide.js';
import { CONFIG } from '../config.js';

// Body hit volumes: [jointA, jointB, radius, region(L/R resolved per fighter)]
const BODY_PARTS = [
  [J.head, J.head, 0.33, 'head'],
  [J.pelvis, J.chest, 0.27, 'body'],
  [J.shL, J.elL, 0.1, 'armL'], [J.elL, J.haL, 0.09, 'armL'],
  [J.shR, J.elR, 0.1, 'armR'], [J.elR, J.haR, 0.09, 'armR'],
  [J.hipL, J.knL, 0.12, 'legL'], [J.knL, J.ftL, 0.1, 'legL'],
  [J.hipR, J.knR, 0.12, 'legR'], [J.knR, J.ftR, 0.1, 'legR'],
];
const PART_JOINTS = BODY_PARTS.map(p => [p[0], p[1]]);

export function groundFn(p, prev, r) {
  const A = CONFIG.arena;
  // walls and front lip
  if (p.x > A.halfWidth) { p.x = A.halfWidth; prev.x = p.x + (p.x - prev.x) * 0.3; }
  if (p.x < -A.halfWidth) { p.x = -A.halfWidth; prev.x = p.x + (p.x - prev.x) * 0.3; }
  if (p.z > A.front) { p.z = A.front; prev.z = p.z; }
  const onPlatform = p.z > A.edge;
  if (onPlatform && p.y < r && p.y > -0.6) {
    p.y = r;
    if (prev.y < p.y) prev.y = p.y - (p.y - prev.y) * 0;   // kill downward velocity
    // ground friction
    prev.x += (p.x - prev.x) * 0.12;
    prev.z += (p.z - prev.z) * 0.12;
    return true;
  }
  // cliff face: anything below the platform is pushed outward over the void
  if (!onPlatform && p.y < 0 && p.z > A.edge - 0.25 && p.y > -0.6) { p.z = A.edge - 0.25; }
  return false;
}

export class Battle {
  constructor({ playerLoadout, enemyLoadout, playerName = 'You', enemyName = 'Rival', enemyPurse = 8, playerPurse = 8, rng = Math.random, intro = true }) {
    this.rng = rng;
    this.events = [];
    this.t = 0;
    this.acc = 0;
    this.hitStop = 0;
    this.arrows = [];
    this.winner = null; this.reason = '';
    this.endT = 0;
    const P = new Fighter({ team: 'p', loadout: playerLoadout, x: -2.8, yaw: Math.PI / 2, name: playerName, purse: playerPurse, rng });
    const E = new Fighter({ team: 'e', loadout: enemyLoadout, x: intro ? 6.6 : 2.8, yaw: -Math.PI / 2, name: enemyName, purse: enemyPurse, rng });
    P.events = this.events; E.events = this.events;
    P.foe = E; E.foe = P;
    this.fighters = [P, E];
    this.P = P; this.E = E;
    if (intro) { E.setState('intro'); E.introTo = 2.8; P.setState('intro'); P.introTo = -2.8; this.phase = 'intro'; }
    else this.phase = 'fight';
  }

  // Advance real time (seconds). Runs fixed sub-steps.
  update(realDt) {
    const dt = CONFIG.physics.dt;
    if (this.hitStop > 0) { this.hitStop -= realDt; realDt *= 0.15; }
    this.acc += Math.min(realDt, 0.1);
    while (this.acc >= dt) { this.acc -= dt; this.step(dt); }
  }

  step(dt) {
    this.t += dt;
    const [P, E] = this.fighters;
    if (this.phase === 'intro') {
      if (Math.abs(E.root.x - E.introTo) < 0.15 && this.t > 1.2) {
        this.phase = 'fight'; P.setState('fight'); E.setState('fight');
        this.fightStart = this.t;
        this.events.push({ type: 'fight' });
      }
    }
    for (const f of this.fighters) {
      f.foeAttacking = !!(f.foe.attacking && f.foe.attacking.guarded && f.foe.attacking.t < f.foe.attacking.dur * 0.75);
      if (!this.winner || f.state === 'victory') f.think(dt, f.foe, this.t);
      else f.vel.multiplyScalar(0.9);
      f.update(dt);
      f.rd.step(groundFn);
      f.updateWeaponDirs(dt);
    }
    this._separate(P, E);
    if (this.phase === 'fight' && !this.winner) {
      for (const f of this.fighters) { this._meleeCheck(f, f.foe); this._bow(f, f.foe); this._perks(f, f.foe, dt); }
    }
    this._arrows(dt);
    this._checkEnd();
  }

  _separate(A, B) {
    // keep controllers apart
    const d = new Vector3().subVectors(B.root, A.root); d.y = 0;
    const dist = d.length();
    const min = 0.78;
    if (dist < min && dist > 1e-4 && A.state !== 'falling' && B.state !== 'falling') {
      d.multiplyScalar((min - dist) / dist * 0.5);
      if (A.standing) A.root.sub(d);
      if (B.standing) B.root.add(d);
    }
    // body particle repulsion so ragdolls physically collide
    for (const i of [J.pelvis, J.chest, J.head]) for (const j of [J.pelvis, J.chest, J.head]) {
      const pa = A.rd.p[i], pb = B.rd.p[j];
      const dd = new Vector3().subVectors(pb, pa);
      const l = dd.length(), r = 0.5;
      if (l < r && l > 1e-4) { dd.multiplyScalar((r - l) / l * 0.5); pa.sub(dd); pb.add(dd); }
    }
  }

  // Collision-based melee damage during the strike window of an attack
  _meleeCheck(att, def) {
    const A = att.attacking;
    if (!A || A.hit || A.kind === 'shoot') return;
    const u = A.t / A.dur;
    if (u < A.prof.w || u > A.prof.k + 0.06) return;
    const a = new Vector3(), b = new Vector3();
    const wr = att.weaponSegment(A.arm, A.kind, a, b);
    const ca = new Vector3(), cb = new Vector3();
    // shield first: a physical block if the weapon strikes the shield disc
    const sh = this._shieldOf(def);
    if (sh && segPointDist(a, b, sh.center, ca) < sh.radius + wr) {
      A.hit = true;
      this._applyHit(att, def, { region: sh.arm, point: ca.clone(), joint: sh.joint, blocked: sh.block, kind: A.kind, st: A.st });
      return;
    }
    let best = null;
    for (let k = 0; k < BODY_PARTS.length; k++) {
      const [ja, jb, r, region] = BODY_PARTS[k];
      const d = segSegDist(a, b, def.rd.p[ja], def.rd.p[jb], ca, cb);
      const pen = r + wr - d;
      if (pen > 0 && (!best || pen > best.pen)) best = { pen, region, point: cb.clone(), joint: ja === jb ? ja : (ca.distanceTo(def.rd.p[ja]) < ca.distanceTo(def.rd.p[jb]) ? ja : jb), k };
    }
    if (best) {
      A.hit = true;
      this._applyHit(att, def, { ...best, kind: A.kind, st: A.st });
    }
  }

  _shieldOf(f) {
    for (const key of ARM_KEYS) {
      const arm = f.arms[key];
      if (arm.type !== 'shield') continue;
      const el = f.rd.p[key === 'armL' ? J.elL : J.elR], ha = f.rd.p[key === 'armL' ? J.haL : J.haR];
      const center = new Vector3().lerpVectors(el, ha, 0.6).addScaledVector(f.forward(), 0.12);
      return { center, radius: arm.st.radius, block: arm.st.block, arm: key, joint: key === 'armL' ? J.haL : J.haR };
    }
    return null;
  }

  _applyHit(att, def, h) {
    const C = CONFIG.combat;
    if (def.hp <= 0) return;
    const armor = def.lo.armor[h.region] || 0;
    const red = armor / (armor + C.armorK);
    const crit = !h.magic && !h.blocked && this.rng() < 0.1;
    let dmg = h.st.dmg * (C.regionDamageMult[h.region] || 1) * (1 - red) * (0.8 + this.rng() * 0.4) * (crit ? 1.6 : 1);
    if (h.magic) dmg = h.st.dmg * (0.85 + this.rng() * 0.3);
    let kb = (h.st.kb || 0.5) * (crit ? 1.5 : 1);
    if (h.blocked) { dmg *= 1 - h.blocked; kb *= 0.4; }
    dmg = Math.max(1, Math.round(dmg));
    def.hp = Math.max(0, def.hp - dmg);
    att.damageDealt += dmg;

    // knockback direction: attacker -> defender, biased toward the rear cliff
    const dir = new Vector3().subVectors(def.root, att.root); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.copy(att.forward());
    const kbEff = kb / def.st.stability;
    // heavier blows are angled more toward the cliff: knockback builds win by ring-out
    const bias = Math.min(0.55, C.cliffBias + 0.06 * kbEff);
    dir.normalize().multiplyScalar(1 - bias).add(new Vector3(0, 0, -bias)).normalize();
    if (!h.magic || true) def.kv.addScaledVector(dir, kbEff * C.knockbackScale);

    // physical reaction: impulse at the struck joint + neighbours, scaled by weapon knockback
    const imp = new Vector3().copy(dir).multiplyScalar(1.2 + kbEff * 0.8);
    imp.y += h.region === 'head' ? 1.2 : 0.4;
    def.rd.addVelocity(h.joint, imp.clone().multiplyScalar(1.3));
    for (const j of [J.chest, J.head, J.pelvis]) def.rd.addVelocity(j, imp.clone().multiplyScalar(j === J.pelvis ? 0.3 : 0.6));
    if (h.region === 'head') def.rd.addVelocity(J.head, new Vector3(0, 1.5, 0).addScaledVector(dir, 2.5));
    // recoil on the attacker's weapon hand
    if (h.kind && h.kind !== 'arrow' && h.kind !== 'lightning') {
      const hand = att.rd.p[h.kind ? (att.attacking?.arm.key === 'armR' ? J.haR : J.haL) : J.haL];
      att.rd.addVelocity(hand === att.rd.p[J.haR] ? J.haR : J.haL, dir.clone().multiplyScalar(-2.5 * (h.blocked ? 2 : 1)));
    }
    def.flinch = Math.min(1, def.flinch + 0.35 + kbEff * 0.15);
    def.face.hurt = 1;
    def.rd.muscle = Math.min(def.rd.muscle, h.blocked ? 0.7 : 0.35);
    def.stun = Math.max(def.stun, h.blocked ? 0.05 : 0.06 + kbEff * 0.08);
    def.poise += kbEff;
    const heavy = kbEff >= 2;
    let knockdown = false;
    if (def.kdImmune > 0 && def.hp > 0) def.poise = Math.min(def.poise, C.knockdownThreshold * 0.6);
    if ((def.poise >= C.knockdownThreshold || def.hp <= 0) && def.standing) {
      knockdown = true; def.poise = 0;
      def.setState(def.hp <= 0 ? 'ko' : 'down');
      def.attacking = null;
      const fly = new Vector3().copy(dir).multiplyScalar(1.2 + kbEff * 0.7); fly.y = 2.0 + kbEff * 0.35;
      def.rd.addImpulseAll(fly, 1);
      def.kv.set(0, 0, 0);
    } else if (def.hp <= 0) {
      def.setState('ko');
    }
    if (heavy || knockdown) this.hitStop = C.hitStop * (knockdown ? 2 : 1);
    this.events.push({ type: 'hit', att, def, dmg, region: h.region, pos: h.point.clone(), blocked: !!h.blocked, heavy: heavy || knockdown || crit, knockdown, crit, kind: h.kind, magic: !!h.magic });
  }

  _bow(att, def) {
    const A = att.attacking;
    if (!A || A.kind !== 'shoot' || A.fired) return;
    if (A.t / A.dur < 0.7) return;
    A.fired = true;
    const bowHand = att.rd.p[att.bowArm === 'armL' ? J.haL : J.haR];
    const from = bowHand.clone().addScaledVector(att.forward(), 0.25); from.y += 0.05;
    const target = def.rd.p[J.chest].clone().addScaledVector(def.vel, 0.25);
    target.x += (this.rng() - 0.5) * 0.3; target.y += (this.rng() - 0.5) * 0.5;
    const speed = A.st.speed || 15;
    const d = new Vector3().subVectors(target, from);
    const flat = Math.hypot(d.x, d.z), tFlight = flat / speed;
    const vel = new Vector3(d.x / tFlight, (d.y - 0.5 * CONFIG.physics.gravity * 0.6 * tFlight * tFlight) / tFlight, d.z / tFlight);
    this.arrows.push({ pos: from, prev: from.clone(), vel, owner: att, st: A.st, alive: true, stuck: null, life: 3 });
    this.events.push({ type: 'arrow', att });
  }

  _arrows(dt) {
    const g = CONFIG.physics.gravity * 0.6;
    const ca = new Vector3(), cb = new Vector3();
    for (const ar of this.arrows) {
      ar.life -= dt;
      if (ar.stuck) {
        const f = ar.stuck.f;
        ar.pos.copy(f.rd.p[ar.stuck.j]).add(ar.stuck.off);
        continue;
      }
      if (!ar.alive) continue;
      ar.prev.copy(ar.pos);
      ar.vel.y += g * dt;
      ar.pos.addScaledVector(ar.vel, dt);
      const def = ar.owner.foe;
      if (!this.winner && def.hp > 0) {
        const sh = this._shieldOf(def);
        if (sh && segPointDist(ar.prev, ar.pos, sh.center, ca) < sh.radius) {
          this._applyHit(ar.owner, def, { region: sh.arm, point: ca.clone(), joint: sh.joint, blocked: sh.block, kind: 'arrow', st: ar.st });
          ar.alive = false; ar.stuck = { f: def, j: sh.joint, off: ca.clone().sub(def.rd.p[sh.joint]) };
          continue;
        }
        for (const [ja, jb, r, region] of BODY_PARTS) {
          if (segSegDist(ar.prev, ar.pos, def.rd.p[ja], def.rd.p[jb], ca, cb) < r + 0.03) {
            this._applyHit(ar.owner, def, { region, point: cb.clone(), joint: ja, kind: 'arrow', st: ar.st });
            ar.alive = false; ar.stuck = { f: def, j: ja, off: ca.clone().sub(def.rd.p[ja]) };
            break;
          }
        }
      }
      if (ar.alive && ar.pos.y < 0.03 && ar.pos.z > CONFIG.arena.edge) { ar.alive = false; ar.pos.y = 0.03; }
      if (ar.pos.y < -10) ar.alive = false;
    }
    this.arrows = this.arrows.filter(a => a.life > 0);
  }

  _perks(f, foe, dt) {
    if (f.hp <= 0) return;
    for (const p of f.perks) {
      p.t -= dt;
      if (p.t > 0) continue;
      p.t = p.st.cooldown;
      if (p.id === 'lightning') {
        const at = foe.rd.p[J.head].clone();
        this._applyHit(f, foe, { region: 'head', point: at, joint: J.head, kind: 'lightning', st: { dmg: p.st.dmg, kb: 0.6 }, magic: true });
        this.events.push({ type: 'lightning', f, foe, pos: at.clone(), level: p.level });
      } else if (p.id === 'coinsteal') {
        const n = Math.min(p.st.steal, foe.purse);
        if (n > 0) { foe.purse -= n; f.stolen += n; this.events.push({ type: 'steal', f, foe, n }); }
      }
    }
  }

  _checkEnd() {
    if (this.winner) {
      this.endT += CONFIG.physics.dt;
      return;
    }
    const A = CONFIG.arena;
    for (const f of this.fighters) {
      if (f.rd.p[J.pelvis].y < A.fallY && f.state !== 'fallen') {
        f.setState('fallen');
        return this._end(f.foe, 'ring-out');
      }
      if (f.hp <= 0 && f.state !== 'ko' && f.state !== 'fallen' && f.state !== 'falling') f.setState('ko');
    }
    // KO: wait a moment for the ragdoll, unless it is also falling off
    for (const f of this.fighters) if (f.hp <= 0) return this._end(f.foe, 'ko');
    if (this.phase === 'fight' && this.t - this.fightStart > CONFIG.combat.roundTimeLimit) {
      const [P, E] = this.fighters;
      const w = P.hp / P.maxHp >= E.hp / E.maxHp ? P : E;
      this._end(w, 'time');
    }
  }

  _end(winner, reason) {
    this.winner = winner; this.reason = reason;
    const loser = winner.foe;
    if (loser.hp > 0 && reason === 'time') { loser.setState('down'); }
    winner.attacking = null;
    if (winner.standing) winner.setState('victory');
    this.events.push({ type: 'end', winner, reason });
  }

  get done() { return this.winner && this.endT > 2.6; }
}
