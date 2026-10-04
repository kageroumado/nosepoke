/**
 * All sound is synthesized. Nothing plays before the first gesture.
 *
 * The pellet chime and the phone on the researcher's desk are the same sound.
 * The garden's birdsong is one recorded-sounding phrase on an exact loop.
 */
let ac = null, master = null, room = null, verbIn = null;
const listenerState = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };

export function start() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(ac.destination);
  verbIn = ac.createGain();
  const verb = ac.createConvolver(); verb.buffer = impulse(2.6, 2.2);
  const verbOut = ac.createGain(); verbOut.gain.value = 0.35;
  verbIn.connect(verb).connect(verbOut).connect(master);
  room = ac.createGain(); room.gain.value = 0; room.connect(master);
  roomTone();
  return ac;
}

export function setMuted(muted) { if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.1); }

function impulse(seconds, decay) {
  const len = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
function noiseBuffer(seconds = 2, brown = false) {
  const len = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}

let hum;
function roomTone() {
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(4, true); src.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
  const g = ac.createGain(); g.gain.value = 0.5;
  src.connect(lp).connect(g).connect(room); src.start();
  const mains = ac.createOscillator(); mains.frequency.value = 100;
  const mg = ac.createGain(); mg.gain.value = 0.012;
  mains.connect(mg).connect(room); mains.start();
  hum = { lp, g };
}

/** Room tone level and brightness: 'cage', 'maze', 'garden', 'city', 'silent'. */
export function ambience(kind) {
  if (!ac) return;
  const t = ac.currentTime;
  const levels = { cage: [0.55, 180], maze: [0.7, 260], chamber: [0.9, 320], garden: [0.35, 500], city: [0.5, 140], silent: [0, 100] };
  const [level, freq] = levels[kind] ?? levels.maze;
  room.gain.setTargetAtTime(level, t, 0.8);
  hum.lp.frequency.setTargetAtTime(freq, t, 0.8);
  if (kind === 'garden') startBirds(); else stopBirds();
}

function panner(x, y, z) {
  const p = ac.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.2; p.rolloffFactor = 1.1;
  p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
  p.connect(master); p.connect(verbIn);
  return p;
}

export function setListener(x, y, z, fx, fz) {
  if (!ac) return;
  Object.assign(listenerState, { x, y, z, fx, fz });
  const l = ac.listener, t = ac.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(x, t, 0.02); l.positionY.setTargetAtTime(y, t, 0.02); l.positionZ.setTargetAtTime(z, t, 0.02);
    l.forwardX.setTargetAtTime(fx, t, 0.02); l.forwardY.setTargetAtTime(0, t, 0.02); l.forwardZ.setTargetAtTime(fz, t, 0.02);
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
}

function tone(dest, { type = 'sine', freq, to, gain = 0.1, attack = 0.005, dur = 0.3, when = 0 }) {
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function burst(dest, { freq = 1000, q = 1, gain = 0.2, dur = 0.1, when = 0, type = 'bandpass' }) {
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuffer(Math.max(0.05, dur + 0.05));
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.05);
}

/** Bell with an inharmonic partial: C6 then G6. */
function chimeInto(dest, gain = 0.18) {
  for (const [f, w] of [[1046.5, 0], [1567.98, 0.13]]) {
    tone(dest, { freq: f, gain, dur: 1.4, when: w });
    tone(dest, { freq: f * 2.76, gain: gain * 0.25, dur: 0.5, when: w });
  }
}

export const sfx = {
  chime(at) { if (!ac) return; chimeInto(at ? panner(at.x, at.y, at.z) : master); },
  /** The same chime from a phone on a desk somewhere above. */
  phone(at) {
    if (!ac) return;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = ac.createGain(); g.gain.value = 0.55;
    lp.connect(g).connect(at ? panner(at.x, at.y, at.z) : master);
    g.connect(verbIn);
    chimeInto(lp, 0.16);
  },
  solenoid(at) { if (!ac) return; const d = at ? panner(at.x, at.y, at.z) : master; burst(d, { freq: 3200, q: 3, gain: 0.5, dur: 0.03 }); tone(d, { type: 'square', freq: 90, gain: 0.08, dur: 0.05 }); },
  pelletDrop(at) { if (!ac) return; const d = at ? panner(at.x, at.y, at.z) : master; for (let i = 0; i < 3; i++) burst(d, { freq: 2600 - i * 400, q: 8, gain: 0.25 / (i + 1), dur: 0.04, when: 0.18 + i * 0.07 }); },
  lever(at) { if (!ac) return; const d = at ? panner(at.x, at.y, at.z) : master; burst(d, { freq: 1800, q: 4, gain: 0.35, dur: 0.05 }); tone(d, { type: 'triangle', freq: 220, to: 140, gain: 0.12, dur: 0.08 }); },
  crunch() { if (!ac) return; for (let i = 0; i < 5; i++) burst(master, { freq: 2500 + Math.random() * 2500, q: 2, gain: 0.12, dur: 0.035, when: i * 0.11 + Math.random() * 0.03 }); },
  sip() { if (!ac) return; for (let i = 0; i < 3; i++) tone(master, { freq: 900 + i * 60, to: 1400, gain: 0.05, dur: 0.07, when: i * 0.16 }); },
  door(at) {
    if (!ac) return;
    const d = at ? panner(at.x, at.y, at.z) : master;
    burst(d, { freq: 700, q: 0.7, gain: 0.12, dur: 0.18, type: 'lowpass' });
    burst(d, { freq: 160, q: 1, gain: 0.9, dur: 0.22, when: 0.12, type: 'lowpass' });
    tone(d, { freq: 70, to: 45, gain: 0.35, dur: 0.3, when: 0.12 });
  },
  sniff() { if (!ac) return; for (let i = 0; i < 3; i++) burst(master, { freq: 4200, q: 1.2, gain: 0.03, dur: 0.05, when: i * 0.09 }); },
  step() { if (!ac) return; burst(master, { freq: 5200, q: 2, gain: 0.012 + Math.random() * 0.01, dur: 0.02 }); },
  lid() { if (!ac) return; burst(master, { freq: 1300, q: 6, gain: 0.25, dur: 0.4 }); burst(master, { freq: 400, q: 1, gain: 0.3, dur: 0.3, when: 0.1, type: 'lowpass' }); for (let i = 0; i < 6; i++) tone(master, { type: 'triangle', freq: 2400 + i * 330, gain: 0.03, dur: 0.2, when: 0.05 * i }); },
  glove() { if (!ac) return; burst(master, { freq: 900, q: 0.5, gain: 0.18, dur: 0.6, type: 'lowpass' }); burst(master, { freq: 5000, q: 3, gain: 0.05, dur: 0.25, when: 0.2 }); },
  whoosh() { if (!ac) return; const s = ac.createBufferSource(); s.buffer = noiseBuffer(2.5); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; const g = ac.createGain(); const t = ac.currentTime; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(1600, t + 1.1); f.frequency.exponentialRampToValueAtTime(300, t + 2.3); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 1); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); s.connect(f).connect(g).connect(master); s.start(); },
  /** Rat calls pitched down into hearing; the real ones are near 50 kHz. */
  chirp(at) { if (!ac) return; const d = panner(at.x, at.y, at.z); for (let i = 0; i < 3; i++) { const f = 2600 + Math.random() * 900; tone(d, { freq: f, to: f * (1.25 + Math.random() * 0.3), gain: 0.07, dur: 0.06, when: i * 0.1 }); } },
  wind(at, seconds = 3) { if (!ac) return; const d = panner(at.x, at.y, at.z); const s = ac.createBufferSource(); s.buffer = noiseBuffer(seconds + 0.2); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.6; const g = ac.createGain(); const t = ac.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + seconds * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds); s.connect(f).connect(g).connect(d); s.start(); },
  thump(at) { if (!ac) return; const d = at ? panner(at.x, at.y, at.z) : master; tone(d, { freq: 55, to: 38, gain: 0.3, dur: 0.25 }); burst(d, { freq: 180, gain: 0.25, dur: 0.12, type: 'lowpass' }); },
  denied() { if (!ac) return; tone(master, { type: 'triangle', freq: 180, gain: 0.05, dur: 0.12 }); },
  seal() { if (!ac) return; tone(master, { freq: 660, gain: 0.05, dur: 0.12 }); tone(master, { freq: 990, gain: 0.04, dur: 0.18, when: 0.06 }); },
  tick() { if (!ac) return; burst(master, { freq: 6000, q: 5, gain: 0.05, dur: 0.015 }); },
};

/** Two people talking somewhere above: formant-filtered pulses, too muffled for words. */
export function voices(at, seconds = 4, pitch = 110) {
  if (!ac) return;
  const d = panner(at.x, at.y, at.z);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(d);
  const t0 = ac.currentTime;
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = pitch;
  const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
  const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6;
  const env = ac.createGain(); env.gain.value = 0;
  o.connect(f1); o.connect(f2); f1.connect(env); f2.connect(env); env.connect(lp);
  let t = t0;
  while (t < t0 + seconds) {
    const syl = 0.11 + Math.random() * 0.16;
    const vowel = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [640, 1190]][Math.floor(Math.random() * 5)];
    f1.frequency.setTargetAtTime(vowel[0], t, 0.03); f2.frequency.setTargetAtTime(vowel[1], t, 0.03);
    o.frequency.setTargetAtTime(pitch * (0.85 + Math.random() * 0.35), t, 0.05);
    env.gain.setTargetAtTime(Math.random() < 0.12 ? 0 : 0.55, t, 0.02);
    env.gain.setTargetAtTime(0.05, t + syl * 0.7, 0.03);
    t += syl + (Math.random() < 0.15 ? 0.3 : 0);
  }
  env.gain.setTargetAtTime(0, t, 0.05);
  o.start(t0); o.stop(t + 0.3);
}

let birdTimer = null;
const phrase = Array.from({ length: 7 }, (_, i) => ({ f: 3200 + Math.sin(i * 2.3) * 900, to: 3900 + Math.cos(i * 1.7) * 700, when: i * 0.13 + (i > 3 ? 0.25 : 0), dur: 0.09 + (i % 3) * 0.03 }));
function startBirds() {
  if (birdTimer) return;
  const sing = () => {
    const d = panner(listenerState.x + 6, 7, listenerState.z - 4);
    for (const n of phrase) tone(d, { freq: n.f, to: n.to, gain: 0.05, dur: n.dur, when: n.when });
  };
  sing(); birdTimer = setInterval(sing, 6400);
}
function stopBirds() { clearInterval(birdTimer); birdTimer = null; }

/** Many phones in many rooms, near and far. */
export function chorus(count = 30, spread = 6) {
  if (!ac) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800 + Math.random() * 2500;
      const g = ac.createGain(); g.gain.value = 0.08 + Math.random() * 0.25;
      const p = ac.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
      lp.connect(g).connect(p).connect(master); g.connect(verbIn);
      chimeInto(lp, 0.12);
    }, Math.pow(Math.random(), 0.7) * spread * 1000);
  }
}
