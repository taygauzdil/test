// Bootstrap, canvas scaling and fixed-timestep loop (60 Hz simulation, render every frame).
(function (B) {
  const CFG = B.CFG;
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  let scale = 1;

  function resize() {
    const s = Math.min(innerWidth / CFG.W, innerHeight / CFG.H), dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = CFG.W * s + 'px'; canvas.style.height = CFG.H * s + 'px';
    canvas.width = Math.round(CFG.W * s * dpr); canvas.height = Math.round(CFG.H * s * dpr);
    scale = canvas.width / CFG.W;
  }
  addEventListener('resize', resize); resize();

  B.Input.init(canvas);
  B.Game.newGame();

  const STEP = 1 / 60;
  let acc = 0, last = performance.now();
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    const steps = B.G.speed === 2 ? 2 : 1;
    while (acc >= STEP) { for (let i = 0; i < steps; i++) B.Game.step(STEP); acc -= STEP; }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    B.Render.draw(ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.BBB);
