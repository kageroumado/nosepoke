/**
 * The nosepoke model: a TD(λ) critic over complete-serial-compound stimulus clocks,
 * a tonic dopamine estimate that becomes response latency, and one small state machine
 * per reinforcement schedule.
 *
 * The module is pure: a virtual clock, a seeded generator, no DOM. It runs unchanged
 * under Node, which is what the headless harness and the behavioral-signature tests use.
 */

/** Seeded generator (mulberry32). Same seed, same session, every time. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A clock reading this large counts as "the stimulus is not present". */
const EXPIRED = 999;

/**
 * Strain table (PLAN §5). `alpha` is the learning rate, `tonicBaseline` sets resting
 * vigor, `perception` is read by the renderer for arena blur and by audio for gain.
 */
export const STRAINS = {
  'sprague-dawley': { alpha: 0.12, tonicBaseline: 0.5, perception: { blur: 1.0, audio: 1.0 }, label: 'Sprague-Dawley', note: 'the tutorial rat' },
  'wistar':         { alpha: 0.12, tonicBaseline: 0.5, perception: { blur: 0.6, audio: 1.2 }, label: 'Wistar', note: 'albino: visual cues weak' },
  'long-evans':     { alpha: 0.14, tonicBaseline: 0.55, perception: { blur: 1.2, audio: 1.0 }, label: 'Long-Evans', note: 'hooded, bold' },
  'lister-hooded':  { alpha: 0.12, tonicBaseline: 0.7, perception: { blur: 1.0, audio: 1.0 }, label: 'Lister Hooded', note: 'high vigor' },
  'lewis':          { alpha: 0.12, alphaSA: 0.18, tonicBaseline: 0.5, perception: { blur: 1.0, audio: 1.0 }, label: 'Lewis', note: 'addiction-vulnerable' },
  'fischer-344':    { alpha: 0.10, tonicBaseline: 0.4, perception: { blur: 1.0, audio: 1.0 }, label: 'Fischer 344', note: 'stress-reactive: freezes on novel cues' },
};

/** Order used by the share code, so a code stays readable across versions. */
const STRAIN_ORDER = Object.keys(STRAINS);

/** Every schedule kind the runtime knows how to run. */
export const SCHEDULE_KINDS = ['MAG', 'PAV', 'EXT', 'BLOCK', 'FR', 'VR', 'FI', 'PR', 'CHOICE', 'ICSS', 'SA', 'FREE'];

/** Richardson & Roberts progressive-ratio steps: round(5·e^(0.2n)) − 5. */
export function prRatio(n) {
  return Math.max(1, Math.round(5 * Math.exp(0.2 * (n + 1))) - 5);
}

const DEFAULT_STIMULI = {
  eat: { bins: 44, width: 0.5 },
  click: { bins: 14, width: 0.25 },
};

/** Satiety added per reinforcer, by schedule kind. Long sessions get small drops. */
const SATIETY_GAIN = { PAV: 0.025, EXT: 0.025, BLOCK: 0.02, CHOICE: 0.008, ICSS: 0, SA: 0 };

/** The tray counts as clear once it is empty or the subject will not eat again. */
const SATED = 0.98;

/**
 * Create a simulation.
 *
 * @param {object} config
 * @param {number} [config.seed] seed for the session generator
 * @param {string} [config.strain] key into `STRAINS`
 * @param {number} [config.gamma] TD discount
 * @param {number} [config.alpha] learning rate; defaults to the strain's
 * @param {number} [config.lambda] eligibility decay
 * @param {number} [config.tick] model timestep in seconds; pages never change this
 * @param {object} [config.stimuli] name → `{ bins, width }` CSC clock spec
 * @param {object} [config.schedule] `{ kind, ... }`, see `SCHEDULE_KINDS`
 * @param {Function} [config.policy] synthetic rat: `(S) => action | null`, sampled each tick
 * @returns {object} the sim
 */
export function createSim(config = {}) {
  const cfg = {
    seed: 23,
    strain: 'sprague-dawley',
    gamma: 0.97,
    lambda: 0.9,
    tick: 0.1,
    effortCost: 0.03,
    pelletValue: 1.0,
    stimuli: DEFAULT_STIMULI,
    schedule: { kind: 'FREE' },
    policy: null,
    autoEat: false,
    ...config,
  };
  // Classical conditioning levels feed the subject without asking: the measured
  // behavior there is where it goes, not whether it collects.
  if (config.autoEat == null && (cfg.schedule.kind || '') === 'BLOCK') cfg.autoEat = 0.6;
  // Satiety must not saturate inside a normal session, so the per-reinforcer gain
  // scales with how many reinforcers the schedule hands out.
  if (config.satietyGain == null) cfg.satietyGain = SATIETY_GAIN[cfg.schedule.kind] ?? 0.05;
  const strain = STRAINS[cfg.strain] || STRAINS['sprague-dawley'];
  const isSA = (cfg.schedule.kind || 'FREE') === 'SA';
  // Tolerance carried in from earlier sessions, and how fast each unit of dose adds to it.
  if (config.tolerance == null) cfg.tolerance = cfg.schedule.tolerance || 0;
  if (config.toleranceGain == null) cfg.toleranceGain = 0.05;
  cfg.alpha = config.alpha != null ? config.alpha : (isSA && strain.alphaSA ? strain.alphaSA : strain.alpha);

  const tick = cfg.tick;
  const rand = rng(cfg.seed);

  // --- CSC stimulus clocks ---------------------------------------------------
  const names = Object.keys(cfg.stimuli);
  const clocks = {};
  let width = 0;
  for (const n of names) {
    clocks[n] = { ...cfg.stimuli[n], offset: width, since: EXPIRED };
    width += cfg.stimuli[n].bins;
  }

  const model = {
    w: new Float64Array(width),
    z: new Float64Array(width),
    gamma: cfg.gamma, lambda: cfg.lambda, alpha: cfg.alpha,
  };

  /** Feature vector: one active bin per running clock. */
  function features() {
    const x = new Float64Array(width);
    for (const n of names) {
      const c = clocks[n];
      const b = Math.floor(c.since / c.width);
      if (b >= 0 && b < c.bins) x[c.offset + b] = 1;
    }
    return x;
  }
  function value(x) {
    let v = 0;
    for (let i = 0; i < width; i++) if (x[i]) v += model.w[i];
    return v;
  }

  const S = {
    t: 0,
    phase: 'start',
    delta: 0, tonic: 0, tonicNorm: 0, tonicGain: 1,
    V: 0,
    values: {},
    trace: [],
    events: [],
    notes: [],
    satiety: 0.12,
    weight: 320,
    pellets: 0,
    drug: 0,
    tolerance: cfg.tolerance,
    done: false,
    strain: cfg.strain,
    seed: cfg.seed,
    counts: { pokes: 0, presses: 0, eats: 0, deliveries: 0, stims: 0, infusions: 0 },
    consumeDeltas: [],
    cueDeltas: [],
  };
  for (const n of names) S.values[n] = 0;

  // --- primitives ------------------------------------------------------------
  let pendingR = 0;
  const pendingCueOn = [];
  let pendingConsume = false;
  let cueFiredThisTick = false;

  function log(type, data) {
    const e = { t: round3(S.t), type };
    if (data) Object.assign(e, data);
    S.events.push(e);
    return e;
  }
  function note(text, em) { S.notes.push({ t: round3(S.t), text, em: !!em }); }
  function reward(r) { pendingR += r; }

  /** Fire a stimulus onset. The clock resets between x0 and x1, so the jump is the cue burst. */
  function cue(name, on = true) {
    if (!clocks[name]) return;
    if (on) { pendingCueOn.push(name); log('cue', { name }); }
    else log('cue-off', { name });
  }

  /** Put a reinforcer in the tray. The dispenser click is itself a conditioned stimulus. */
  function deliver(n = 1, opts = {}) {
    S.pellets += n;
    S.counts.deliveries++;
    log('delivery', { n, kind: opts.kind || 'pellet' });
    if (opts.click !== false && clocks.click) cue('click');
  }

  /** Intracranial stimulation: reward with no consumption, no satiety, no liking. */
  function stimulate(magnitude = 0.8) {
    S.counts.stims++;
    reward(magnitude);
    log('stim', { r: magnitude });
  }

  /** Intravenous infusion: reward now, tonic elevation with first-order decay. */
  function infuse(dose = 1) {
    S.counts.infusions++;
    const effect = dose / (1 + S.tolerance);
    S.drug += effect;
    S.tolerance += cfg.toleranceGain * dose;
    reward(effect * 0.9);
    if (clocks.infuse) pendingCueOn.push('infuse');
    log('infuse', { dose, effect });
  }

  function setPhase(name) {
    if (S.phase === name) return;
    S.phase = name;
    log('phase', { name });
  }

  // --- responses -------------------------------------------------------------
  function response(kind) {
    if (S.done) return false;
    if (kind === 'poke') S.counts.pokes++; else S.counts.presses++;
    log(kind);
    reward(-cfg.effortCost);
    sched.onResponse && sched.onResponse(kind);
    return true;
  }
  function poke() { return response('poke'); }
  function press() { return response('press'); }

  /** Consume one reinforcer from the tray. Satiety gates this; it never gates learning. */
  function eat() {
    if (S.done || S.pellets < 1) return false;
    if (S.satiety >= SATED) { log('refuse'); return false; }
    S.pellets--;
    S.counts.eats++;
    S.satiety = Math.min(1, S.satiety + cfg.satietyGain);
    S.weight += 0.045;
    log('consume');
    reward(cfg.pelletValue);
    pendingConsume = true;
    sched.onConsume && sched.onConsume();
    return true;
  }

  /** Arrival at a named location. Sign- and goal-tracking are read from this stream. */
  function approach(target) {
    log('approach', { target });
    sched.onApproach && sched.onApproach(target);
  }

  /** T-maze arm selection. */
  function choose(arm) {
    log('choose', { arm });
    sched.onChoose && sched.onChoose(arm);
  }

  // --- vigor -----------------------------------------------------------------
  /**
   * The model's native output: how long the subject waits before acting.
   * Milliseconds of delay between an intent and its effect (Niv et al. 2007).
   */
  function inputLatency() { return 90 + (1 - S.tonicNorm) * 260; }

  /** Locomotion speed multiplier; deliberately subtle (±15 %). */
  function speedFactor() { return 0.88 + 0.24 * S.tonicNorm; }

  // --- the tick --------------------------------------------------------------
  const api = {
    get S() { return S; }, cfg, rand, deliver, note, log, cue, setPhase, reward,
    stimulate, infuse, clocks, model, prRatio,
    responses: () => S.events.filter((e) => e.type === 'poke' || e.type === 'press'),
    trayClear: () => S.pellets === 0 || S.satiety >= SATED,
    finish(text) { if (!S.done) { S.done = true; if (text) note(text); log('end'); } },
  };
  const sched = makeSchedule(cfg.schedule, api);
  const rateCeiling = sched.rateCeiling || 1 / 12;

  // synthetic policy: one pending action at a time, released after the vigor latency
  let pendingAction = null;

  function samplePolicy() {
    if (!cfg.policy) return;
    if (pendingAction) {
      if (S.t >= pendingAction.at) {
        const a = pendingAction.action; pendingAction = null;
        applyAction(a);
      }
      return;
    }
    const a = cfg.policy(S, api);
    if (a) pendingAction = { action: a, at: S.t + inputLatency() / 1000 };
  }
  function applyAction(a) {
    const kind = Array.isArray(a) ? a[0] : a;
    const arg = Array.isArray(a) ? a[1] : undefined;
    if (kind === 'poke') poke();
    else if (kind === 'press') press();
    else if (kind === 'eat') eat();
    else if (kind === 'approach') approach(arg);
    else if (kind === 'choose') choose(arg);
  }

  function tickOnce() {
    S.t = round3(S.t + tick);
    sched.tick && sched.tick();
    if (cfg.autoEat && S.pellets > 0) {
      const d = lastEvent(S, 'delivery');
      if (d && S.t - d.t >= cfg.autoEat) eat();
    }
    samplePolicy();

    // TD(λ). Mid-tick events land on the x0→x1 transition: a reward δ is measured
    // against the anticipatory state, and a cue onset is itself a value jump.
    const x0 = features();
    cueFiredThisTick = pendingCueOn.length > 0;
    while (pendingCueOn.length) clocks[pendingCueOn.shift()].since = 0;
    if (pendingConsume) {
      pendingConsume = false;
      for (const n of names) clocks[n].since = n === 'eat' ? 0 : EXPIRED;
    }
    for (const n of names) clocks[n].since += tick;
    const x1 = features();

    const v0 = value(x0), v1 = value(x1);
    const r = pendingR; pendingR = 0;
    const delta = r + model.gamma * v1 - v0;
    for (let i = 0; i < width; i++) {
      model.z[i] = model.gamma * model.lambda * model.z[i] + x0[i];
      model.w[i] += model.alpha * delta * model.z[i];
    }
    S.delta = delta; S.V = v1;
    if (r > 0.5) S.consumeDeltas.push(delta);
    if (cueFiredThisTick) S.cueDeltas.push(delta);
    for (const n of names) S.values[n] = model.w[clocks[n].offset];

    // tonic dopamine = exponential moving average of reward rate
    const k = tick / 20;
    S.tonic = S.tonic * (1 - k) + (r > 0 ? r / tick : 0) * k;
    S.drug *= Math.exp(-tick / 90);
    const drive = clamp01(S.tonic / rateCeiling + S.drug * 0.35);
    const floor = strain.tonicBaseline * 0.4;
    S.tonicNorm = clamp01((floor + (1 - floor) * drive) * S.tonicGain);

    S.satiety = Math.max(0, S.satiety - tick * 0.0006);
    S.weight -= tick * 0.0008;

    S.trace.push({ t: S.t, delta, tonic: S.tonicNorm, V: S.V });
    if (S.trace.length > 900) S.trace.shift();
  }

  /**
   * Advance the model. Real-time pages pass the frame delta; the harness passes
   * virtual seconds. Whole ticks only; the remainder carries to the next call.
   */
  let acc = 0;
  function step(dt = tick) {
    acc += dt;
    let guard = 0;
    while (acc >= tick - 1e-9 && !S.done && guard++ < 20000) {
      acc -= tick;
      tickOnce();
    }
    if (S.done) acc = 0;
  }

  // --- metrics ---------------------------------------------------------------
  /** Intervals between reinforcer deliveries, long enough to have structure. */
  function fiIntervals() {
    const ivs = []; let start = null;
    for (const e of S.events) {
      if (e.type === 'delivery') {
        if (start !== null) ivs.push({ start, end: e.t });
        start = e.t;
      }
    }
    return ivs.filter((iv) => iv.end - iv.start > 2);
  }
  function responsesIn(iv) {
    return S.events.filter((e) => (e.type === 'poke' || e.type === 'press') && e.t > iv.start && e.t <= iv.end);
  }
  function earlyResponseFraction() {
    const ivs = fiIntervals(); let early = 0, all = 0;
    for (const iv of ivs) for (const p of responsesIn(iv)) {
      all++; if ((p.t - iv.start) / (iv.end - iv.start) < 0.5) early++;
    }
    return all ? early / all : -1;
  }
  /** Fry, Kelleher & Cook (1960) index of curvature over quarters; +0.75 is the maximum. */
  function indexOfCurvature() {
    const ivs = fiIntervals();
    const C = [0, 0, 0, 0]; let total = 0;
    for (const iv of ivs) for (const p of responsesIn(iv)) {
      const q = Math.min(3, Math.floor(((p.t - iv.start) / (iv.end - iv.start)) * 4));
      for (let i = q; i < 4; i++) C[i]++;
      total++;
    }
    if (!total || !C[3]) return 0;
    return (3 * C[3] - 2 * (C[0] + C[1] + C[2])) / (4 * C[3]);
  }
  /** Median of the response-time distribution within intervals, as a fraction. */
  function quarterLife() {
    const ivs = fiIntervals(); const fr = [];
    for (const iv of ivs) for (const p of responsesIn(iv)) fr.push((p.t - iv.start) / (iv.end - iv.start));
    if (!fr.length) return 0;
    fr.sort((a, b) => a - b);
    let acc2 = 0; const q = fr.length * 0.25;
    for (let i = 0; i < fr.length; i++) { acc2++; if (acc2 >= q) return fr[i]; }
    return fr[fr.length - 1];
  }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  /**
   * Seconds from each delivery to the consumption that followed it. This is the
   * magazine-approach measure: it is what falls as the click becomes a signal.
   */
  function approachLatencies() {
    const out = []; let armed = null;
    for (const e of S.events) {
      if (e.type === 'delivery') armed = e.t;
      else if (e.type === 'consume' && armed != null) { out.push(e.t - armed); armed = null; }
    }
    return out;
  }
  /** How often the subject went to each named location. Sign- and goal-tracking read this. */
  function approachCounts() {
    const out = {};
    for (const e of S.events) if (e.type === 'approach') out[e.target] = (out[e.target] || 0) + 1;
    return out;
  }
  function headTail(a, n = 3) {
    if (a.length < n * 2) return { early: mean(a.slice(0, Math.ceil(a.length / 2))), late: mean(a.slice(Math.floor(a.length / 2))) };
    return { early: mean(a.slice(0, n)), late: mean(a.slice(-n)) };
  }

  /** Every metric this session exposes: the generic block plus the schedule's own. */
  function metrics() {
    const pellet = headTail(S.consumeDeltas);
    const cueD = headTail(S.cueDeltas);
    const lat = approachLatencies();
    const base = {
      kind: cfg.schedule.kind || 'FREE',
      strain: cfg.strain,
      seed: cfg.seed,
      t: S.t,
      responses: S.counts.pokes + S.counts.presses,
      pokes: S.counts.pokes,
      presses: S.counts.presses,
      deliveries: S.counts.deliveries,
      consumed: S.counts.eats,
      satiety: S.satiety,
      weight: S.weight,
      meanTonic: mean(S.trace.map((p) => p.tonic)),
      // Interval structure. Meaningful wherever reinforcers are spaced in time;
      // the fixed-interval level is the one that reads them out loud.
      fryIndex: indexOfCurvature(),
      quarterLife: quarterLife(),
      earlyFraction: earlyResponseFraction(),
      approachLatencies: lat,
      meanApproachLatency: mean(lat),
      approachCounts: approachCounts(),
      burstMigration: {
        pelletEarly: pellet.early, pelletLate: pellet.late,
        cueEarly: cueD.early, cueLate: cueD.late,
        shrink: pellet.early > 0.05 ? 1 - pellet.late / pellet.early : 0,
      },
      values: { ...S.values },
    };
    return Object.assign(base, sched.metrics ? sched.metrics() : {});
  }

  // --- serialization ---------------------------------------------------------
  /**
   * A trained rat is its learned model state. The share code carries strain, seed,
   * cumulative stats, the clock layout, and quantized weights: base64, under 400 chars.
   */
  function serialize() {
    const head = [
      'n1',
      String(STRAIN_ORDER.indexOf(cfg.strain)),
      String(cfg.seed),
      cfg.schedule.kind || 'FREE',
      names.map((n) => `${n}:${clocks[n].bins}:${clocks[n].width}`).join(','),
      [S.counts.pokes, S.counts.presses, S.counts.eats, S.counts.deliveries, Math.round(S.t)].join(','),
    ].join('|');
    let body = '';
    for (let i = 0; i < width; i++) {
      const q = Math.max(0, Math.min(255, Math.round(((model.w[i] + 1) / 4) * 255)));
      body += String.fromCharCode(q);
    }
    const len = String(head.length).padStart(4, '0');
    return b64encode(len + head + body).replace(/=+$/, '');
  }

  return {
    S, cfg, strain,
    step, poke, press, eat, approach, choose, cue, deliver, infuse, stimulate,
    setPhase, log, note, reward,
    metrics, serialize,
    inputLatency, speedFactor,
    fiIntervals, responsesIn, indexOfCurvature, quarterLife, earlyResponseFraction,
    /** Read-only view of the learned weights, for the value bars and the debrief. */
    weights: () => model.w,
    /** Value of a named clock at the given seconds after its onset. */
    valueAt: (name, sec) => {
      const c = clocks[name]; if (!c) return 0;
      const b = Math.floor(sec / c.width);
      return b >= 0 && b < c.bins ? model.w[c.offset + b] : 0;
    },
    /** Halve the tonic ceiling: the haloperidol session. */
    setTonicGain: (g) => { S.tonicGain = g; },
    schedule: sched,
  };
}

/**
 * Rebuild a rat from a share code. Config overrides (schedule, policy, tick) are applied
 * on top, so an imported rat can be dropped into any level.
 */
createSim.deserialize = function deserialize(code, overrides = {}) {
  const raw = b64decode(code);
  const headLen = parseInt(raw.slice(0, 4), 10);
  const head = raw.slice(4, 4 + headLen).split('|');
  const body = raw.slice(4 + headLen);
  if (head[0] !== 'n1') throw new Error('unrecognized share code');
  const strain = STRAIN_ORDER[Number(head[1])] || 'sprague-dawley';
  const seed = Number(head[2]);
  const kind = head[3];
  const stimuli = {};
  for (const part of head[4].split(',')) {
    const [n, bins, w] = part.split(':');
    stimuli[n] = { bins: Number(bins), width: Number(w) };
  }
  const stats = head[5].split(',').map(Number);
  const sim = createSim({ seed, strain, stimuli, schedule: { kind }, ...overrides });
  const w = sim.weights();
  for (let i = 0; i < w.length && i < body.length; i++) {
    w[i] = (body.charCodeAt(i) / 255) * 4 - 1;
  }
  sim.imported = { strain, seed, kind, pokes: stats[0], presses: stats[1], eats: stats[2], deliveries: stats[3], seconds: stats[4] };
  return sim;
};

function b64encode(s) {
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(s, 'latin1').toString('base64');
}
function b64decode(s) {
  const pad = s + '='.repeat((4 - (s.length % 4)) % 4);
  if (typeof atob === 'function') return atob(pad);
  return Buffer.from(pad, 'base64').toString('latin1');
}
function round3(v) { return Math.round(v * 1000) / 1000; }

/* ============================================================================
   Schedule state machines. Each returns { tick, onResponse, onConsume,
   onApproach, onChoose, metrics, rateCeiling }, and drives the session through
   the api verbs. Everything a level measures comes out of `metrics()`.
   ============================================================================ */

function makeSchedule(spec, api) {
  const kind = (spec.kind || 'FREE').toUpperCase();
  const make = MACHINES[kind];
  if (!make) throw new Error('unknown schedule kind: ' + kind);
  return make(spec, api);
}

const MACHINES = {
  /** Magazine training: free deliveries on a variable time schedule, click first. */
  MAG(spec, api) {
    const S = api.S;
    const count = spec.count || 12;
    const vt = spec.vt || 20;
    let next = 3 + api.rand() * 4;
    let n = 0;
    const latencies = [];
    let awaiting = null;
    api.setPhase('magazine');
    api.note('Magazine training. Free delivery on a variable-time schedule. Watching for orientation to the hopper.');
    return {
      rateCeiling: 1 / vt,
      tick() {
        if (n < count && S.t >= next) {
          n++;
          api.deliver();
          awaiting = S.t;
          next = S.t + vt * (0.5 + api.rand());
        }
        if (n >= count && api.trayClear() && !S.done) api.finish('Magazine training complete. Subject collects reliably.');
      },
      onConsume() {
        if (awaiting != null) { latencies.push(S.t - awaiting); awaiting = null; }
        if (latencies.length === 3) api.note('Latency to the hopper is falling. The click is doing the work now.');
      },
      metrics() {
        const m = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
        return {
          approachLatencies: latencies.slice(),
          meanApproachLatency: m,
          firstLatency: latencies[0] || 0,
          lastLatency: latencies[latencies.length - 1] || 0,
        };
      },
    };
  },

  /** Pavlovian: CS for `csDur` seconds, then the reinforcer; variable inter-trial interval. */
  PAV(spec, api) { return pavlovian(spec, api, {}); },

  /** Pavlovian with the reinforcer omitted from a trial onward, plus a recovery block. */
  EXT(spec, api) {
    return pavlovian(spec, api, {
      omitFrom: spec.omitFrom || 21,
      recovery: spec.recovery == null ? 8 : spec.recovery,
    });
  },

  /** Kamin blocking: tone alone, then tone with light, then the light tested alone. */
  BLOCK(spec, api) {
    const S = api.S;
    const nA = spec.phaseA == null ? 20 : spec.phaseA;
    const nB = spec.phaseB == null ? 20 : spec.phaseB;
    const control = !!spec.control;
    const csDur = spec.csDur || 2;
    const iti = spec.iti || [8, 14];
    let trial = 0, stage = control ? 'B' : 'A';
    let next = 4, csAt = null;
    const vLightTest = { value: 0 };
    api.setPhase(control ? 'compound' : 'pretrain');
    api.note(control
      ? 'Control subject. Compound stimulus from the first trial.'
      : 'Phase A. Tone alone predicts sucrose. Twenty trials.');
    return {
      rateCeiling: 1 / 12,
      tick() {
        if (S.done) return;
        if (csAt != null && S.t >= csAt + csDur) {
          csAt = null;
          if (stage !== 'test') api.deliver();
          else {
            vLightTest.value = api.model.w[api.clocks.light.offset];
            api.finish('Test complete. Light presented alone; response to the light recorded.');
          }
        }
        if (csAt == null && S.t >= next && !S.done) {
          trial++;
          if (stage === 'A' && trial > nA) { stage = 'B'; trial = 1; api.setPhase('compound'); api.note('Phase B. The light is added. Tone and light together, same sucrose.'); }
          else if (stage === 'B' && trial > nB) { stage = 'test'; trial = 1; api.setPhase('test'); api.note('Test. The light alone. Does it predict anything?'); }
          if (stage === 'A') api.cue('tone');
          else if (stage === 'B') { api.cue('tone'); api.cue('light'); }
          else api.cue('light');
          csAt = S.t;
          next = S.t + csDur + iti[0] + api.rand() * (iti[1] - iti[0]);
          api.log('trial', { stage, n: trial });
        }
      },
      metrics() {
        return {
          vTone: api.model.w[api.clocks.tone ? api.clocks.tone.offset : 0],
          vLight: vLightTest.value || (api.clocks.light ? api.model.w[api.clocks.light.offset] : 0),
          control,
          trials: trial,
        };
      },
    };
  },

  /** Fixed ratio: n responses per reinforcer. */
  FR(spec, api) { return ratio(spec, api, false); },
  /** Variable ratio: the requirement is drawn from a geometric with mean n. */
  VR(spec, api) { return ratio(spec, api, true); },

  /** Fixed interval: the first response after `interval` seconds pays. */
  FI(spec, api) {
    const S = api.S;
    const interval = spec.interval || 12;
    const target = spec.count || 10;
    const warmup = spec.warmup === false ? 0 : (spec.warmup || 3);
    let armed = false, armAt = Infinity, n = 0, mag = 0;
    let stage = warmup ? 'habituate' : 'fi';
    api.setPhase(stage);
    if (warmup) api.note('The room smells like clean plastic. Somewhere, a fan.', true);
    let notedEff = false, notedMid = false;

    function startMagazine() {
      stage = 'magazine'; api.setPhase('magazine');
      armAt = S.t + 6 + api.rand() * 6;
      api.note('Magazine training. Free delivery, variable time. Watching for orientation to the hopper.');
    }
    function startFI() {
      stage = 'fi'; api.setPhase('fi');
      armed = false; armAt = S.t + interval;
      api.note('Beginning the schedule. Reinforcement follows the first response after a fixed interval. Interval length withheld from these notes.');
    }
    if (!warmup) startFI();

    return {
      rateCeiling: 1 / interval,
      tick() {
        if (stage === 'habituate' && S.t > 4) startMagazine();
        if (stage === 'magazine' && S.t >= armAt) { armAt = Infinity; api.deliver(); }
        if (stage === 'fi' && !armed && S.t >= armAt && n < target) armed = true;

        if (stage === 'fi' && !notedEff && n >= 2) {
          notedEff = true;
          const early = earlyFraction(api);
          api.note(early > 0.45 ? 'Subject responds throughout the interval. Inefficient.' : 'Post-reinforcement pausing emerging.');
        }
        if (stage === 'fi' && !notedMid && n === Math.floor(target / 2)) {
          notedMid = true;
          api.note('Halfway. Response rate accelerating within intervals — the record is starting to curve.');
        }
      },
      onResponse() {
        if (stage === 'fi' && armed) {
          armed = false; n++;
          api.deliver();
          if (n >= target) api.note('Final reinforcement of the session delivered.');
          else armAt = S.t + interval;
        }
      },
      onConsume() {
        if (stage === 'magazine') {
          mag++;
          if (mag >= warmup) startFI();
          else armAt = S.t + 6 + api.rand() * 6;
        } else if (stage === 'fi' && n >= target && api.trayClear()) {
          api.finish('Session complete. Cumulative record attached.');
        }
      },
      metrics() {
        return { interval, reinforcers: n, target };
      },
    };
  },

  /** Progressive ratio: the requirement grows each reinforcer; the session ends on a pause. */
  PR(spec, api) {
    const S = api.S;
    const timeout = spec.timeout || 180;
    const magnitude = spec.magnitude == null ? 1 : spec.magnitude;
    let step = 0, need = api.prRatio(0), done = 0, count = 0;
    let lastReinforcer = 0;
    const ratios = [], runRates = [];
    let runStart = null;
    api.setPhase('pr');
    api.note('Progressive ratio. The requirement rises with every pellet. The session ends when the subject stops.');
    return {
      rateCeiling: 1 / 20,
      tick() {
        if (!S.done && S.t - lastReinforcer > timeout) {
          api.finish('No completed ratio for ' + Math.round(timeout / 60) + ' minutes. Breakpoint recorded.');
        }
      },
      onResponse() {
        if (runStart == null) runStart = S.t;
        count++;
        if (count >= need) {
          ratios.push(need);
          runRates.push(need / Math.max(0.1, S.t - runStart));
          api.deliver(magnitude);
          done++; step++; count = 0; runStart = null;
          lastReinforcer = S.t;
          need = api.prRatio(step);
          if (done === 4) api.note('Subject 23 shows elevated breakpoint; requesting study extension.');
        }
      },
      metrics() {
        return {
          breakpoint: ratios.length ? ratios[ratios.length - 1] : 0,
          nextRatio: need,
          completedRatios: done,
          ratios: ratios.slice(),
          runRates: runRates.slice(),
          magnitude,
        };
      },
    };
  },

  /** Effort-based choice in a T-maze: a barrier arm worth four pellets against a flat arm worth two. */
  CHOICE(spec, api) {
    const S = api.S;
    const trials = spec.trials || 20;
    const blockSize = spec.blockSize || 5;
    const barrierPellets = spec.barrierPellets || 4;
    const flatPellets = spec.flatPellets || 2;
    if (spec.haloperidol) S.tonicGain = 0.5;
    let trial = 0, inTrial = false, needPresses = 0, presses = 0, arm = null;
    const choices = [];
    api.setPhase('choice');
    api.note(spec.haloperidol
      ? 'Second session. Same maze, same pellets. The subject received a low dose before the run.'
      : 'T-maze. Left arm: a barrier, four pellets. Right arm: no barrier, two pellets. Twenty trials.');
    return {
      rateCeiling: 1 / 25,
      tick() {
        if (!inTrial && !S.done && api.trayClear()) {
          trial++;
          if (trial > trials) { api.finish('Twenty trials complete. Choice record attached.'); return; }
          inTrial = true; arm = null; presses = 0;
          api.log('trial', { n: trial });
        }
      },
      /** The barrier is climbed by pressing; each press is one step up. */
      onResponse() {
        if (arm !== 'barrier') return;
        presses++;
        if (presses >= needPresses) {
          api.deliver(barrierPellets);
          inTrial = false; arm = null;
        }
      },
      onChoose(a) {
        if (!inTrial || arm) return;
        arm = a;
        choices.push({ trial, arm: a });
        if (a === 'barrier') {
          needPresses = effortPresses(S.tonicNorm);
          presses = 0;
          api.log('barrier', { presses: needPresses });
          if (trial === 1) api.note('Subject climbs. ' + needPresses + ' efforts to the top.');
        } else {
          api.deliver(flatPellets);
          inTrial = false; arm = null;
        }
      },
      metrics() {
        const barrier = choices.filter((c) => c.arm === 'barrier').length;
        const blocks = [];
        for (let i = 0; i < choices.length; i += blockSize) {
          const b = choices.slice(i, i + blockSize);
          blocks.push(b.filter((c) => c.arm === 'barrier').length / b.length);
        }
        return {
          trials: choices.length,
          barrierChoices: barrier,
          barrierFraction: choices.length ? barrier / choices.length : 0,
          blocks,
          haloperidol: !!spec.haloperidol,
          choices: choices.slice(),
        };
      },
    };
  },

  /** Intracranial self-stimulation: every press stimulates; no satiety, no liking, timer-ended. */
  ICSS(spec, api) {
    const S = api.S;
    const duration = spec.duration || 300;
    const magnitude = spec.magnitude == null ? 0.8 : spec.magnitude;
    const satietyStart = S.satiety;
    api.setPhase('icss');
    api.note('Electrode in place. Each press closes the circuit. Food is available in the tray throughout.');
    let notedFood = false;
    return {
      rateCeiling: 1 / 3,
      tick() {
        if (!S.done && S.t >= duration) api.finish('Session ended on the timer. The subject did not stop on its own.');
        if (!notedFood && S.t > duration * 0.5 && S.counts.eats === 0 && S.counts.presses > 30) {
          notedFood = true;
          api.note('Tray untouched. Subject has not eaten this session.');
        }
      },
      onResponse() { api.stimulate(magnitude); },
      metrics() {
        return {
          presses: S.counts.presses,
          pressesPerMin: S.counts.presses / Math.max(1 / 60, S.t / 60),
          satietyStart, satietyEnd: S.satiety,
          likingEvents: S.counts.eats,
          duration,
        };
      },
    };
  },

  /** Intravenous self-administration: a ratio schedule on infusions, with a timeout. */
  SA(spec, api) {
    const S = api.S;
    const ratioReq = spec.ratio || 1;
    const timeout = spec.timeout == null ? 20 : spec.timeout;
    const duration = spec.duration || 600;
    const dose = spec.dose == null ? 1 : spec.dose;
    const day = spec.day || 1;
    let count = 0, lockUntil = 0, infusions = 0;
    const times = [];
    api.setPhase('sa');
    api.note('Day ' + day + '. Catheter patent. The bowl turns under the subject so the line never tangles.');
    return {
      rateCeiling: 1 / 30,
      tick() {
        if (!S.done && S.t >= duration) api.finish('Session ended. Infusions: ' + infusions + '.');
      },
      onResponse() {
        if (S.t < lockUntil) { api.log('timeout-press'); return; }
        count++;
        if (count >= ratioReq) {
          count = 0;
          infusions++;
          times.push(S.t);
          api.infuse(dose);
          lockUntil = S.t + timeout;
        }
      },
      metrics() {
        const loading = times.filter((t) => t < duration * 0.2).length;
        return {
          infusions, day, ratio: ratioReq, dose,
          tolerance: S.tolerance,
          infusionTimes: times.slice(),
          loadingInfusions: loading,
          loadingFraction: infusions ? loading / infusions : 0,
        };
      },
    };
  },

  /** No schedule: the page drives everything through the verbs. */
  FREE(spec, api) {
    api.setPhase(spec.phase || 'free');
    const duration = spec.duration || 0;
    return {
      rateCeiling: spec.rateCeiling || 1 / 12,
      tick() { if (duration && !api.S.done && api.S.t >= duration) api.finish(spec.endNote); },
      metrics() { return {}; },
    };
  },
};

/** Presses to clear the barrier: cheap when vigorous, expensive when not (Salamone). */
export function effortPresses(tonicNorm) {
  return Math.round(6 + (1 - tonicNorm) * 14);
}

function earlyFraction(api) {
  const S = api.S;
  const ivs = []; let start = null;
  for (const e of S.events) {
    if (e.type === 'delivery') { if (start !== null) ivs.push({ start, end: e.t }); start = e.t; }
  }
  let early = 0, all = 0;
  for (const iv of ivs.filter((i) => i.end - i.start > 2)) {
    for (const p of S.events.filter((e) => (e.type === 'poke' || e.type === 'press') && e.t > iv.start && e.t <= iv.end)) {
      all++; if ((p.t - iv.start) / (iv.end - iv.start) < 0.5) early++;
    }
  }
  return all ? early / all : -1;
}

/** Shared body of PAV and EXT: trials of CS then reinforcer, with optional omission. */
function pavlovian(spec, api, opts) {
  const S = api.S;
  const total = spec.trials || 30;
  const csDur = spec.csDur || 2;
  const iti = spec.iti || [20, 40];
  const csName = spec.cs || 'tone';
  const omitFrom = opts.omitFrom || Infinity;
  const recovery = opts.recovery || 0;
  let trial = 0, next = 5, csAt = null, stage = 'acquisition';
  const deltaCS = [], deltaUS = [], approaches = [];
  // δ for an event is read on the following tick, when that tick's update has landed
  const half = api.cfg.tick * 0.5;
  let pendingCS = null, pendingUS = null;
  const responsesByTrial = [];
  // Extinction is new learning that only partly carries over a day boundary (Bouton 2004):
  // at the recovery block the weights move `recoveryFraction` of the way back toward
  // their values when omission began. That is what spontaneous recovery is in this model.
  const recoveryFraction = spec.recoveryFraction == null ? 0.5 : spec.recoveryFraction;
  let preExtinction = null;
  function recoverWeights() {
    if (!preExtinction) return;
    const w = api.model.w;
    for (let i = 0; i < w.length; i++) w[i] += recoveryFraction * (preExtinction[i] - w[i]);
    api.log('recovery', { fraction: recoveryFraction });
  }
  api.setPhase('pavlov');
  api.note(omitFrom < Infinity
    ? 'Same chamber, same tone. The procedure continues.'
    : 'Pavlovian conditioning. A tone, then sucrose. The subject need do nothing at all.');

  return {
    rateCeiling: 1 / 30,
    tick() {
      if (S.done) return;
      // δ is read one tick after the event, when the update for that tick has landed
      if (pendingCS != null && S.t >= pendingCS) { deltaCS.push(S.delta); pendingCS = null; }
      if (pendingUS != null && S.t >= pendingUS) { deltaUS.push(S.delta); pendingUS = null; }

      if (csAt != null && S.t >= csAt + csDur) {
        csAt = null;
        // A recovery probe is a test, so it stays unreinforced: what it measures is
        // whether the response returns on its own after the rest.
        const omitted = trial >= omitFrom || stage === 'recovery';
        if (!omitted) api.deliver();
        else { api.log('omission', { trial }); pendingUS = S.t + half; }
      }
      if (csAt == null && S.t >= next) {
        if (trial >= total && stage === 'acquisition') {
          if (recovery) {
            stage = 'recovery'; trial = 0;
            recoverWeights();
            api.setPhase('recovery');
            api.note('Next day. Same chamber. The tone returns.');
            next = S.t + 20;
            return;
          }
          api.finish('Session complete.');
          return;
        }
        if (stage === 'recovery' && trial >= recovery) { api.finish('Recovery probes complete.'); return; }
        trial++;
        responsesByTrial.push({ trial, stage, start: S.t, responses: 0, approaches: [] });
        api.cue(csName);
        csAt = S.t;
        pendingCS = S.t + half;
        next = S.t + csDur + iti[0] + api.rand() * (iti[1] - iti[0]);
        api.log('trial', { n: trial, stage });
        if (trial === omitFrom) { preExtinction = Float64Array.from(api.model.w); api.note('Sucrose withheld. The tone plays into nothing.'); }
      }
    },
    onResponse() { const r = responsesByTrial[responsesByTrial.length - 1]; if (r) r.responses++; },
    onConsume() { pendingUS = S.t + half; },
    onApproach(target) {
      approaches.push({ trial, target, t: S.t, duringCS: csAt != null });
      const r = responsesByTrial[responsesByTrial.length - 1];
      if (r) r.approaches.push(target);
    },
    metrics() {
      const cueApproaches = approaches.filter((a) => a.duringCS && (a.target === 'speaker' || a.target === csName)).length;
      const trayApproaches = approaches.filter((a) => a.duringCS && a.target === 'tray').length;
      const tot = cueApproaches + trayApproaches;
      const trackingIndex = tot ? (cueApproaches - trayApproaches) / tot : 0;
      let crossoverTrial = 0;
      for (let i = 0; i < Math.min(deltaCS.length, deltaUS.length); i++) {
        if (deltaCS[i] > deltaUS[i]) { crossoverTrial = i + 1; break; }
      }
      const rate = (from, to) => {
        const w = responsesByTrial.filter((r) => r.trial >= from && r.trial < to && r.stage === 'acquisition');
        return w.length ? w.reduce((a, b) => a + b.responses, 0) / w.length : 0;
      };
      const out = {
        trials: responsesByTrial.length,
        deltaCS: deltaCS.slice(),
        deltaUS: deltaUS.slice(),
        crossoverTrial,
        trackingIndex,
        phenotype: trackingIndex > 0.25 ? 'sign-tracker' : trackingIndex < -0.25 ? 'goal-tracker' : 'mixed',
        responsesByTrial: responsesByTrial.slice(),
      };
      if (omitFrom < Infinity) {
        const pre = rate(omitFrom - 3, omitFrom);
        const burst = rate(omitFrom, omitFrom + 3);
        const recov = responsesByTrial.filter((r) => r.stage === 'recovery');
        const late = rate(total - 3, total + 1);
        out.extinctionFrom = omitFrom;
        out.burstRatio = pre > 0 ? burst / pre : 0;
        out.recoveryRatio = late > 0 && recov.length
          ? (recov.reduce((a, b) => a + b.responses, 0) / recov.length) / late
          : 0;
      }
      return out;
    },
  };
}

/** Shared body of FR and VR. */
function ratio(spec, api, variable) {
  const S = api.S;
  const n = spec.n || spec.ratio || 1;
  const duration = spec.duration || 300;
  const target = spec.count || 0;
  let need = variable ? geometric(api.rand, n) : n;
  let count = 0, reinforcers = 0;
  const pauses = [], runs = [];
  let lastDelivery = null, firstAfter = null;
  api.setPhase(variable ? 'vr' : 'fr');
  api.note(variable
    ? 'Variable ratio ' + n + '. The requirement changes every time and the subject cannot know it.'
    : 'Fixed ratio ' + n + '. ' + n + (n === 1 ? ' response, one pellet.' : ' responses, one pellet.'));
  return {
    rateCeiling: 1 / 6,
    tick() {
      if (!S.done && duration && S.t >= duration) api.finish('Block complete.');
      if (!S.done && target && reinforcers >= target && api.trayClear()) api.finish('Block complete.');
    },
    onResponse() {
      if (lastDelivery != null && firstAfter == null) { firstAfter = S.t; pauses.push(S.t - lastDelivery); }
      count++;
      if (count >= need) {
        runs.push(need / Math.max(0.1, S.t - (firstAfter != null ? firstAfter : S.t - 0.1)));
        count = 0; reinforcers++;
        api.deliver();
        lastDelivery = S.t; firstAfter = null;
        need = variable ? geometric(api.rand, n) : n;
      }
    },
    metrics() {
      const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      return {
        ratio: n, variable, reinforcers,
        pauses: pauses.slice(),
        meanPause: mean(pauses),
        runRate: mean(runs),
        responseRate: S.t ? (S.counts.pokes + S.counts.presses) / (S.t / 60) : 0,
      };
    },
  };
}

function geometric(rand, mean) {
  const p = 1 / Math.max(1, mean);
  return Math.max(1, Math.ceil(Math.log(1 - rand()) / Math.log(1 - p)));
}

/* ============================================================================
   Synthetic rats. A policy is `(S, api) => action | null`, sampled once per tick
   and released after the vigor latency. Actions: 'poke' | 'press' | 'eat' |
   ['approach', name] | ['choose', arm].
   ============================================================================ */

export const policies = {
  /**
   * Fixed-interval scalloping: pause after the pellet, accelerate as it comes due.
   * Lands an index of curvature in the empirical band for a trained subject.
   */
  scalloping({ interval = 12, response = 'poke', peak = 0.16, exponent = 3 } = {}) {
    return (S, api) => {
      if (hungry(S)) return 'eat';
      const last = lastFrom(S, 'delivery') || 0;
      const frac = Math.min(1.4, (S.t - last) / interval);
      return api.rand() < peak * Math.pow(frac, exponent) ? response : null;
    };
  },
  /** A constant rate wherever the subject is in the interval: index of curvature near zero. */
  uniform({ rate = 0.06, response = 'poke' } = {}) {
    return (S, api) => {
      if (hungry(S)) return 'eat';
      return api.rand() < rate ? response : null;
    };
  },
  /** Everything right after the pellet, nothing before the next: a negative index. */
  frontLoaded({ interval = 12, rate = 0.3, response = 'poke' } = {}) {
    return (S, api) => {
      if (hungry(S)) return 'eat';
      const last = lastFrom(S, 'delivery') || 0;
      return (S.t - last) < interval * 0.35 && api.rand() < rate ? response : null;
    };
  },
  /** Steady work on a ratio schedule; the tonic estimate sets the pace. */
  worker({ rate = 0.35, response = 'press' } = {}) {
    return (S, api) => {
      if (hungry(S)) return 'eat';
      return api.rand() < rate * (0.5 + S.tonicNorm) ? response : null;
    };
  },
  /** Collects free deliveries: a magazine-training subject. */
  collector() {
    return (S) => (hungry(S) ? 'eat' : null);
  },
  /**
   * Drug-level seeking: presses while the drug level sits below `target`. Escalation
   * across days comes from tolerance, which the SA schedule carries in its metrics.
   */
  seeker({ target = 1.0, rate = 0.6 } = {}) {
    return (S, api) => (S.drug < target && api.rand() < rate ? 'press' : null);
  },
  /** Approaches the tray on every cue: the goal-tracker phenotype. */
  goalTracker() { return tracker('tray'); },
  /** Approaches the speaker on every cue: the sign-tracker phenotype. */
  signTracker() { return tracker('speaker'); },
  /** Prefers the barrier arm while vigorous, the flat arm when not. */
  chooser({ bias = 0.75 } = {}) {
    return (S, api) => {
      if (hungry(S)) return 'eat';
      const trial = lastEvent(S, 'trial');
      const chose = lastEvent(S, 'choose');
      if (trial && (!chose || chose.t < trial.t) && S.t - trial.t > 0.6) {
        return ['choose', api.rand() < bias * 1.3 * Math.pow(S.tonicNorm, 1.5) ? 'barrier' : 'flat'];
      }
      if (chose && chose.arm === 'barrier' && api.rand() < 0.5) return 'press';
      return null;
    };
  },
};

/** A pellet is waiting and the subject can still eat it. */
function hungry(S) { return S.pellets > 0 && S.satiety < SATED; }

function tracker(target) {
  return (S, api) => {
    if (hungry(S)) return 'eat';
    const cueT = lastFrom(S, 'cue');
    if (cueT != null && S.t - cueT < 1.4 && api.rand() < 0.2) return ['approach', target];
    return null;
  };
}

function lastEvent(S, type) {
  for (let i = S.events.length - 1; i >= 0; i--) if (S.events[i].type === type) return S.events[i];
  return null;
}
function lastFrom(S, type) {
  const e = lastEvent(S, type);
  return e ? e.t : null;
}
