// Tiny WebAudio synth for feedback sounds (no asset files).
let ctx = null, master = null, muted = false;
function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur, { type = 'sine', vol = 0.5, slide = 0, delay = 0 } = {}) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.5, freq = 1200, q = 1, delay = 0, type = 'bandpass' } = {}) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

export const SFX = {
  unlock: () => ac(),
  toggleMute() { muted = !muted; return muted; },
  get muted() { return muted; },
  click: () => tone(660, 0.06, { type: 'triangle', vol: 0.25 }),
  pick: () => tone(520, 0.08, { type: 'triangle', vol: 0.25, slide: 1.4 }),
  drop: () => { tone(300, 0.1, { type: 'triangle', vol: 0.35, slide: 0.7 }); noise(0.06, { vol: 0.2, freq: 900 }); },
  bad: () => tone(160, 0.18, { type: 'square', vol: 0.15, slide: 0.7 }),
  coin: (d = 0) => { tone(1320, 0.08, { type: 'square', vol: 0.12, delay: d }); tone(1760, 0.14, { type: 'square', vol: 0.1, delay: d + 0.06 }); },
  buy: () => { tone(880, 0.08, { type: 'triangle', vol: 0.3 }); tone(1175, 0.12, { type: 'triangle', vol: 0.3, delay: 0.07 }); },
  sell: () => { tone(700, 0.08, { type: 'triangle', vol: 0.3 }); tone(520, 0.12, { type: 'triangle', vol: 0.3, delay: 0.07 }); },
  merge: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.3, delay: i * 0.07 })); noise(0.4, { vol: 0.15, freq: 4000, delay: 0.25, type: 'highpass' }); },
  swing: (heavy) => noise(heavy ? 0.28 : 0.16, { vol: heavy ? 0.35 : 0.22, freq: heavy ? 500 : 1400, q: 0.8 }),
  hit: (heavy) => { tone(heavy ? 90 : 160, heavy ? 0.25 : 0.12, { type: 'sine', vol: 0.7, slide: 0.5 }); noise(0.12, { vol: 0.4, freq: heavy ? 400 : 900 }); },
  block: () => { tone(1100, 0.2, { type: 'square', vol: 0.12, slide: 0.9 }); tone(1650, 0.25, { type: 'sine', vol: 0.15 }); noise(0.08, { vol: 0.3, freq: 3000 }); },
  bow: () => { tone(220, 0.15, { type: 'triangle', vol: 0.25, slide: 2 }); noise(0.1, { vol: 0.15, freq: 2500 }); },
  zap: () => { noise(0.35, { vol: 0.45, freq: 2500, q: 0.5, type: 'highpass' }); tone(80, 0.3, { type: 'sawtooth', vol: 0.2, slide: 0.5 }); },
  steal: () => { tone(1500, 0.06, { type: 'square', vol: 0.1 }); tone(1900, 0.1, { type: 'square', vol: 0.1, delay: 0.05 }); },
  fall: () => tone(600, 1.2, { type: 'triangle', vol: 0.25, slide: 0.15 }),
  fight: () => { tone(392, 0.15, { type: 'square', vol: 0.18 }); tone(523, 0.3, { type: 'square', vol: 0.18, delay: 0.15 }); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.3, delay: i * 0.11 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.3, delay: i * 0.16 })),
};
