/**
 * The soundtrack is an instrument of the experiment. The dispenser click is a
 * conditioned stimulus, the consumption chime is the liking channel and never scales
 * with learning, and the adaptive pad reads the tonic estimate.
 *
 * Nothing plays before a user gesture, and every faint cue is written to the
 * disclosure log the moment it sounds.
 */

import { disclose } from './save.js';

let ac = null;
let gestured = false;
let master = null;

const onGesture = () => { gestured = true; };
// Guarded because the module is also imported under Node, by pages whose model and
// figure code the headless harness reuses.
if (typeof addEventListener === 'function') {
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    addEventListener(ev, onGesture, { once: true, passive: true });
  }
}

/** The audio context, created on the first gesture and never before it. */
function ctx() {
  if (!gestured) return null;
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 1;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

/** Call from a click handler to bring audio up on this page. */
export function unlock() { gestured = true; return ctx(); }

/** Overall level, 0 to 1. The shell's sound toggle drives this. */
export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

function blip({ type = 'sine', from, to, gain = 0.05, dur = 0.08, when = 0 }) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to && to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  /** The dispenser solenoid. This is the cue the subject learns. */
  click() { blip({ type: 'square', from: 2200, gain: 0.06, dur: 0.05 }); },
  /** Consumption. Constant magnitude forever: liking does not grow with learning. */
  crunch() { blip({ type: 'triangle', from: 660, to: 880, gain: 0.05, dur: 0.22 }); },
  /** The response itself. */
  poke() { blip({ type: 'sine', from: 340, gain: 0.03, dur: 0.04 }); },
  /** The lever. */
  press() { blip({ type: 'square', from: 180, to: 120, gain: 0.04, dur: 0.06 }); },
  /**
   * The conditioned tone. Call with `true` at CS onset and `false` at offset; a
   * duration in seconds plays it as a single burst.
   */
  tone(on = true, seconds = 0) {
    const a = ctx(); if (!a) return;
    if (on && seconds) {
      const t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.setValueAtTime(0.05, t + seconds - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      o.connect(g).connect(master); o.start(t); o.stop(t + seconds + 0.05);
      return;
    }
    if (on) blip({ type: 'sine', from: 880, gain: 0.05, dur: 0.4 });
  },
  /** The hedonic reaction that goes with the lip-lick animation. */
  lick() { blip({ type: 'sine', from: 520, to: 700, gain: 0.03, dur: 0.12 }); },
  /** The intracranial circuit closing: no chime, no warmth, just the contact. */
  zap() { blip({ type: 'sawtooth', from: 1400, to: 400, gain: 0.035, dur: 0.05 }); },
};

/**
 * The adaptive pad. Layer count, brightness, and tempo track the tonic estimate,
 * so musical thinness during extinction is the model's output rather than a mood.
 */
export const music = {
  _nodes: null,
  _tonic: 0.5,
  _running: false,

  /** Start the pad. Requires a prior gesture; silent otherwise. */
  start() {
    const a = ctx(); if (!a || this._running) return;
    const out = a.createGain();
    out.gain.value = 0.0001;
    out.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 2);
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(out); out.connect(master);

    const voices = [110, 164.81, 220, 246.94].map((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.value = i < 2 ? 0.5 : 0.0;
      o.connect(g).connect(filter);
      o.start();
      return { o, g, base: f };
    });
    this._nodes = { out, filter, voices };
    this._running = true;
    this.setTonic(this._tonic);
  },

  stop() {
    if (!this._nodes) return;
    for (const v of this._nodes.voices) v.o.stop();
    this._nodes = null;
    this._running = false;
  },

  /**
   * Set the tonic readout, 0 to 1. Low: two dark voices behind a closed filter.
   * High: four voices, open filter, a brighter mix.
   */
  setTonic(x) {
    this._tonic = Math.max(0, Math.min(1, x));
    const n = this._nodes; if (!n) return;
    const a = ac, t = a.currentTime;
    n.filter.frequency.setTargetAtTime(500 + this._tonic * 2200, t, 0.6);
    n.voices.forEach((v, i) => {
      const want = i < 2 ? 0.5 : Math.max(0, this._tonic - 0.35) * 0.6;
      v.g.gain.setTargetAtTime(want, t, 0.8);
      v.o.frequency.setTargetAtTime(v.base * (1 + this._shift), t, 0.4);
    });
  },

  _shift: 0,

  /**
   * The faint conditioned stimulus: a two-semitone lift in the pad, roughly 800 ms
   * before reward becomes available. Below the threshold of noticing and above the
   * threshold of learning (Pessiglione et al. 2008). Every call is disclosed.
   */
  faintCue(levelId) {
    disclose('faint-cue', { level: levelId || null, semitones: 2, leadMs: 800 });
    if (!this._nodes) return;
    this._shift = Math.pow(2, 2 / 12) - 1;
    this.setTonic(this._tonic);
    setTimeout(() => { this._shift = 0; this.setTonic(this._tonic); }, 1600);
  },
};
