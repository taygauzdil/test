// Matter.js ball physics. One engine per backpack (no gravity); balls bounce off walls and unit bodies.
(function (B) {
  const CFG = B.CFG, L = B.L;
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const worlds = [null, null];
  const P = { balls: [[], []] };

  function makeWorld(side) {
    const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 }, positionIterations: 8, velocityIterations: 6 });
    const z = L.zone(side), t = 60, W = CFG.W;
    const wallOpts = { isStatic: true, restitution: 1, friction: 0, frictionStatic: 0, label: 'wall' };
    Composite.add(engine.world, [
      Bodies.rectangle(-t / 2, (z.y0 + z.y1) / 2, t, 600, wallOpts),
      Bodies.rectangle(W + t / 2, (z.y0 + z.y1) / 2, t, 600, wallOpts),
      Bodies.rectangle(W / 2, z.y0 - t / 2, W + 200, t, wallOpts),
      Bodies.rectangle(W / 2, z.y1 + t / 2, W + 200, t, wallOpts),
    ]);
    Events.on(engine, 'collisionStart', ev => {
      for (const p of ev.pairs) {
        const a = p.bodyA, b = p.bodyB;
        let ball, other;
        if (a.label === 'ball') { ball = a; other = b; } else if (b.label === 'ball') { ball = b; other = a; } else continue;
        if (ball.bb.dead) continue;
        if (other.label === 'unit') B.Game.onBallHitUnit(side, ball.bb, other.bbRef);
        else B.FX.burst(ball.position.x, ball.position.y, B.TEAM[side].ball, 2, 40, 0.25, 1.5);
      }
    });
    return { engine, unitBodies: [] };
  }

  P.reset = function () {
    for (let s = 0; s < 2; s++) { worlds[s] = makeWorld(s); P.balls[s] = []; }
  };

  // Rebuild static unit bodies from the current backpack grid (called when a battle starts).
  P.buildUnits = function (side) {
    const w = worlds[side], grid = B.G.sides[side].grid;
    for (const b of w.unitBodies) Composite.remove(w.engine.world, b);
    w.unitBodies = [];
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const u = grid[r][c]; if (!u) continue;
      const q = L.cellRect(side, r, c);
      const body = Bodies.rectangle(q.cx, q.cy, CFG.UNIT_BODY, CFG.UNIT_BODY, {
        isStatic: true, restitution: 1, friction: 0, frictionStatic: 0, label: 'unit', chamfer: { radius: 9 },
      });
      body.bbRef = { unit: u, r, c };
      w.unitBodies.push(body);
    }
    Composite.add(w.engine.world, w.unitBodies);
  };

  P.fire = function (side, x, y, angle, hitsAllowed) {
    const body = Bodies.circle(x, y, CFG.BALL_R, {
      restitution: 1, friction: 0, frictionStatic: 0, frictionAir: 0, inertia: Infinity, label: 'ball',
      collisionFilter: { group: -1 },
    });
    const bb = { body, side, age: 0, hitsLeft: hitsAllowed, hitSet: new Set(), trail: [], dead: false, pierce: hitsAllowed > 1 };
    body.bb = bb;
    Body.setVelocity(body, { x: Math.cos(angle) * CFG.BALL_SPEED, y: Math.sin(angle) * CFG.BALL_SPEED });
    Composite.add(worlds[side].engine.world, body);
    P.balls[side].push(bb);
    return bb;
  };

  P.step = function (side) {
    const w = worlds[side], list = P.balls[side];
    Engine.update(w.engine, 1000 / 60);
    for (let i = list.length - 1; i >= 0; i--) {
      const bb = list[i], body = bb.body;
      bb.age += 1 / 60;
      if (bb.age > CFG.BALL_LIFE) bb.dead = true;
      if (!bb.dead) {
        // keep constant speed; avoid near-horizontal infinite loops
        let vx = body.velocity.x, vy = body.velocity.y;
        const sp = Math.hypot(vx, vy) || 1;
        vx = vx / sp * CFG.BALL_SPEED; vy = vy / sp * CFG.BALL_SPEED;
        const minV = CFG.BALL_SPEED * 0.22;
        if (Math.abs(vy) < minV) { vy = (vy < 0 ? -1 : 1) * minV; const k = Math.sqrt(Math.max(0, CFG.BALL_SPEED ** 2 - vy * vy)); vx = (vx < 0 ? -1 : 1) * k; }
        Body.setVelocity(body, { x: vx, y: vy });
        bb.trail.push({ x: body.position.x, y: body.position.y });
        if (bb.trail.length > 9) bb.trail.shift();
      } else {
        Composite.remove(w.engine.world, body);
        list.splice(i, 1);
      }
    }
  };

  P.count = function (side) { return P.balls[side].length; };
  P.pos = function (bb) { return bb.body.position; };

  B.Physics = P;
})(window.BBB);
