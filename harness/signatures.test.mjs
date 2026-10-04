/**
 * The behavioral signatures, one test per row of the band table in PLAN §4, plus the
 * model checks the runtime has to keep passing for those bands to mean anything.
 *
 *     node --test harness/signatures.test.mjs
 *
 * Every session is seeded, so a failure is a change in the model rather than a bad roll.
 * The empirical band and the paper it comes from are named in each test.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { createSim, policies, STRAINS, SCHEDULE_KINDS } from '../shared/sim.js';
import { CLOCKS, PRESETS, HEADLINE, run } from './sessions.mjs';
import { searcher, ratioSubject } from '../shared/policies.js';

/** Every measured signature, printed as a table once the suite has run. */
const measured = [];
function record(level, metric, value, band) {
  measured.push({ level, metric, value, band });
  return value;
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Post-reinforcement pauses read straight off the event log: from each delivery to the
 * next response. Computed here rather than trusted from `metrics()` so the two can be
 * compared.
 */
function postReinforcementPauses(events) {
  const out = [];
  let armed = null;
  for (const e of events) {
    if (e.type === 'delivery') armed = e.t;
    else if ((e.type === 'poke' || e.type === 'press') && armed != null) {
      out.push(e.t - armed);
      armed = null;
    }
  }
  return out;
}

/** Responses inside each Pavlovian trial, from the event log. */
function responsesPerTrial(events) {
  const trials = [];
  for (const e of events) {
    if (e.type === 'trial') trials.push({ n: e.n, stage: e.stage, responses: 0 });
    else if ((e.type === 'poke' || e.type === 'press') && trials.length) {
      trials[trials.length - 1].responses++;
    }
  }
  return trials;
}

// ---------------------------------------------------------------------------
// d01 — Pavlovian: the burst migrates from the reinforcer to the cue.
// Band: the crossover falls in trials 8-25. Schultz (1997).
// ---------------------------------------------------------------------------

test('d01 Pavlovian: the delta crossover lands in trials 8-25 (Schultz 1997)', (t) => {
  const sim = run(createSim({
    seed: 23, alpha: 0.05, stimuli: CLOCKS.full, autoEat: 0.6,
    schedule: { kind: 'PAV', trials: 30, csDur: 2, iti: [20, 40] },
  }), { cap: 3000 });
  const m = sim.metrics();
  const crossover = record('d01', 'crossoverTrial', m.crossoverTrial, '8-25');

  t.diagnostic(`crossover at trial ${crossover}; delta at the reinforcer ${f2(mean(m.deltaUS.slice(0, 3)))} -> ${f2(mean(m.deltaUS.slice(-3)))}, at the cue ${f2(mean(m.deltaCS.slice(0, 3)))} -> ${f2(mean(m.deltaCS.slice(-3)))}`);

  assert.ok(mean(m.deltaUS.slice(-3)) < mean(m.deltaUS.slice(0, 3)), 'delta at the reinforcer must fall');
  assert.ok(mean(m.deltaCS.slice(-3)) > mean(m.deltaCS.slice(0, 3)), 'delta at the cue must rise');
  assert.ok(crossover >= 8 && crossover <= 25, `crossover ${crossover} outside trials 8-25`);
});

test('d01 the crossover trial is monotone in the learning rate', (t) => {
  const at = (alpha) => run(createSim({
    seed: 23, alpha, stimuli: CLOCKS.full, autoEat: 0.6,
    schedule: { kind: 'PAV', trials: 30, csDur: 2, iti: [20, 40] },
  }), { cap: 3000 }).metrics().crossoverTrial;
  const slow = at(0.04), mid = at(0.06), fast = at(0.12);
  t.diagnostic(`alpha 0.04 -> trial ${slow}, 0.06 -> ${mid}, 0.12 -> ${fast}`);
  assert.ok(slow > mid && mid > fast, `crossover ${slow} / ${mid} / ${fast} is not ordered`);
});

// ---------------------------------------------------------------------------
// d02 — Extinction: responding spikes when the cue stops paying.
// Band: trials 21-23 over trials 18-20 above 1.15. Pavlov (1927).
// ---------------------------------------------------------------------------

test('d02 extinction: the burst exceeds 1.15x the pre-omission rate (Pavlov 1927)', (t) => {
  const sim = run(createSim({
    seed: 23, alpha: 0.05, stimuli: CLOCKS.full, autoEat: 0.6,
    schedule: { kind: 'EXT', trials: 30, omitFrom: 21, recovery: 8, iti: [20, 40] },
    policy: searcher({ search: 12 }),
  }), { cap: 4000 });
  const m = sim.metrics();
  const ratio = record('d02', 'burstRatio', m.burstRatio, '> 1.15');

  // The same ratio, recomputed from the event log rather than read from the schedule.
  const trials = responsesPerTrial(sim.S.events).filter((x) => x.stage === 'acquisition');
  const window = (from, to) => mean(trials.filter((x) => x.n >= from && x.n < to).map((x) => x.responses));
  const fromEvents = window(21, 24) / window(18, 21);

  t.diagnostic(`burst ratio ${f2(ratio)} from the schedule, ${f2(fromEvents)} from the event log; recovery ratio ${f2(m.recoveryRatio)}`);
  assert.ok(Math.abs(ratio - fromEvents) < 0.01, 'the schedule and the event log disagree about the burst');
  assert.ok(ratio > 1.15, `burst ratio ${f2(ratio)} is not above 1.15`);
});

test('d02 extinction: the tone recovers value over the day boundary (Bouton 2004)', (t) => {
  const sim = createSim({
    seed: 23, alpha: 0.05, stimuli: CLOCKS.full, autoEat: 0.6,
    schedule: { kind: 'EXT', trials: 30, omitFrom: 21, recovery: 8, iti: [20, 40] },
    policy: searcher({ search: 12 }),
  });

  // The recovery step lands inside one tick, so the value is sampled on both sides of it.
  let seen = 0, before = null, after = null;
  while (!sim.S.done && sim.S.t < 4000) {
    const v = sim.valueAt('tone', 2);
    sim.step(0.1);
    for (; seen < sim.S.events.length; seen++) {
      if (sim.S.events[seen].type === 'recovery' && after === null) { before = v; after = sim.valueAt('tone', 2); }
    }
  }

  const m = sim.metrics();
  const recovery = sim.S.events.find((e) => e.type === 'recovery');
  const firstProbe = sim.S.events.filter((e) => e.type === 'trial' && e.t < recovery.t).length;
  const lastExtinction = m.deltaCS[firstProbe - 1];
  const probes = m.deltaCS.slice(firstProbe);
  record('d02', 'V(tone at the reinforcer) after / before recovery', after / before, '> 1');

  t.diagnostic(`value at the reinforcer ${f2(before)} -> ${f2(after)}; delta at the cue ${lastExtinction.toFixed(4)} on the last extinction trial, ${probes[0].toFixed(4)} on the first probe, ${mean(probes).toFixed(4)} over the block`);
  assert.ok(after > before, `value at the reinforcer ${f2(before)} did not recover, it went to ${f2(after)}`);
});

// ---------------------------------------------------------------------------
// d03 — Blocking: a cue added to an already-predictive one learns nothing.
// Band: blocked over control below 0.35. Kamin (1969).
// ---------------------------------------------------------------------------

test('d03 blocking: V(light) blocked over control is below 0.35 (Kamin 1969)', (t) => {
  const session = (control) => run(createSim({
    seed: 7, stimuli: CLOCKS.full,
    schedule: { kind: 'BLOCK', phaseA: 20, phaseB: 20, csDur: 2, iti: [6, 10], control },
  }), { cap: 2500 }).metrics();

  const blocked = session(false), control = session(true);
  const ratio = record('d03', 'vLight blocked / control', blocked.vLight / control.vLight, '< 0.35');
  t.diagnostic(`V(light) blocked ${f2(blocked.vLight)}, control ${f2(control.vLight)}, ratio ${f2(ratio)}`);
  assert.ok(control.vLight > 0.02, 'the control run must learn the light for the ratio to mean anything');
  assert.ok(ratio < 0.35, `ratio ${f2(ratio)} is not below 0.35`);
});

// ---------------------------------------------------------------------------
// d04 — Ratio schedules: the fixed ratio pauses after each pellet, the variable one
// does not. Band: the pause ratio above 2. Ferster & Skinner (1957).
// ---------------------------------------------------------------------------

test('d04 ratio: the fixed-ratio pause is over twice the variable-ratio pause (Ferster & Skinner 1957)', (t) => {
  const session = (variable) => run(createSim({
    seed: 3, stimuli: CLOCKS.operant,
    schedule: { kind: variable ? 'VR' : 'FR', n: 5, duration: 300 },
    policy: ratioSubject({ n: 5, variable }),
  }), { cap: 400 });

  const fr = session(false), vr = session(true);
  const frPause = mean(postReinforcementPauses(fr.S.events));
  const vrPause = mean(postReinforcementPauses(vr.S.events));
  const ratio = record('d04', 'FR pause / VR pause', frPause / vrPause, '> 2');

  t.diagnostic(`fixed ratio ${f2(frPause)} s over ${fr.metrics().reinforcers} reinforcers, variable ratio ${f2(vrPause)} s over ${vr.metrics().reinforcers}, ratio ${f2(ratio)}`);
  assert.ok(Math.abs(frPause - fr.metrics().meanPause) < 0.05, 'the schedule and the event log disagree about the fixed-ratio pause');
  assert.ok(ratio > 2, `pause ratio ${f2(ratio)} is not above 2`);
});

// ---------------------------------------------------------------------------
// d05 — Fixed interval: the scallop. Band: index of curvature 0.35-0.65.
// ---------------------------------------------------------------------------

test('d05 fixed interval: the index of curvature lands in 0.35-0.65 (Fry, Kelleher & Cook 1960)', (t) => {
  const fi = (policy, seed = 23) => run(createSim({
    seed, strain: 'wistar', gamma: 0.99, alpha: 0.08, lambda: 0.9,
    stimuli: CLOCKS.operant, schedule: { kind: 'FI', interval: 12, count: 10 }, policy,
  }), { cap: 600 });

  const scallop = fi(policies.scalloping({ interval: 12 }));
  const uniform = fi(policies.uniform({ rate: 0.06 }));
  const front = fi(policies.frontLoaded({ interval: 12 }));
  const iS = record('d05', 'fryIndex, scalloping', scallop.indexOfCurvature(), '0.35-0.65');
  const iU = uniform.indexOfCurvature(), iF = front.indexOfCurvature();

  t.diagnostic(`scalloping ${f2(iS)}, uniform ${f2(iU)}, front-loaded ${f2(iF)}; quarter-life ${f2(scallop.quarterLife())}`);
  assert.ok(iS >= 0.35 && iS <= 0.65, `index ${f2(iS)} outside 0.35-0.65`);
  assert.ok(Math.abs(iU) < 0.15, `uniform index ${f2(iU)} is not near zero`);
  assert.ok(iF < -0.1, `front-loaded index ${f2(iF)} is not negative`);
  assert.ok(iS > iU && iU > iF, 'the index does not separate the three policies');
  assert.equal(scallop.metrics().reinforcers, 10, 'the session must reach its ten reinforcers');
});

test('d05 the burst migrates from the pellet to the dispenser click', (t) => {
  const sim = run(createSim({
    seed: 23, strain: 'wistar', gamma: 0.99, alpha: 0.08, stimuli: CLOCKS.operant,
    schedule: { kind: 'FI', interval: 12, count: 10 },
    policy: policies.scalloping({ interval: 12 }),
  }), { cap: 600 });
  const bm = sim.metrics().burstMigration;
  t.diagnostic(`pellet ${f2(bm.pelletEarly)} -> ${f2(bm.pelletLate)}, click ${f2(bm.cueEarly)} -> ${f2(bm.cueLate)}`);
  assert.ok(bm.pelletLate < bm.pelletEarly, 'delta at the pellet must fall');
  assert.ok(bm.cueLate > bm.cueEarly, 'delta at the click must rise');
});

// ---------------------------------------------------------------------------
// d06 — Progressive ratio: the breakpoint rises with reward magnitude.
// Band: strictly increasing across three magnitudes. Hodos (1961).
//
// A single subject cannot show this cleanly: the Richardson & Roberts steps are coarser
// near the breakpoint than the effect of one extra pellet, so two magnitudes routinely
// stop on the same step. Hodos reports group means, and so does this test.
// ---------------------------------------------------------------------------

test('d06 progressive ratio: the breakpoint rises with reward magnitude (Hodos 1961)', (t) => {
  const seeds = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23];
  const breakpointAt = (magnitude) => mean(seeds.map((seed) => run(createSim({
    seed, stimuli: CLOCKS.operant,
    schedule: { kind: 'PR', timeout: 180, magnitude },
    policy: policies.worker({ rate: 0.35 }),
  }), { cap: 3000 }).metrics().breakpoint));

  const one = breakpointAt(1), two = breakpointAt(2), three = breakpointAt(3);
  record('d06', 'breakpoint by magnitude 1/2/3', `${f2(one)} / ${f2(two)} / ${f2(three)}`, 'strictly increasing');
  t.diagnostic(`mean breakpoint over ${seeds.length} subjects: ${f2(one)} at one pellet, ${f2(two)} at two, ${f2(three)} at three`);
  assert.ok(one < two && two < three, `breakpoints ${f2(one)} / ${f2(two)} / ${f2(three)} are not strictly increasing`);
});

// ---------------------------------------------------------------------------
// d07 — Effort-based choice: dopamine blockade collapses the high-effort choice.
// Band: haloperidol over baseline below 0.6. Salamone's barrier T-maze.
// ---------------------------------------------------------------------------

test('d07 choice: haloperidol over baseline barrier choice is below 0.6 (Salamone)', (t) => {
  const session = (haloperidol) => run(createSim({
    seed: 4, stimuli: CLOCKS.operant,
    schedule: { kind: 'CHOICE', trials: 20, blockSize: 5, haloperidol },
    policy: policies.chooser(),
  }), { cap: 2000 }).metrics();

  const base = session(false), halo = session(true);
  const ratio = record('d07', 'barrierFraction halo / baseline', halo.barrierFraction / base.barrierFraction, '< 0.6');
  t.diagnostic(`barrier choice ${f2(base.barrierFraction)} at baseline, ${f2(halo.barrierFraction)} under haloperidol, ratio ${f2(ratio)}; pellets consumed ${base.consumed} and ${halo.consumed}`);
  assert.ok(base.barrierFraction > 0.5, 'the baseline subject must prefer the barrier arm');
  assert.ok(ratio < 0.6, `ratio ${f2(ratio)} is not below 0.6`);
  assert.ok(halo.consumed > 0, 'food intake must survive the dose; the effect is on effort');
});

// ---------------------------------------------------------------------------
// d09 — Self-administration: intake escalates across days.
// Band: day 3 over day 1 above 1.2.
//
// The escalation is tolerance. Each infusion is worth `dose / (1 + tolerance)` and
// raises the tolerance, so the same drug level costs more infusions on the next day.
// The chain carries `metrics().tolerance` from each day into the next day's schedule,
// which is what a page running three days has to do.
// ---------------------------------------------------------------------------

test('d09 self-administration: day 3 intake is over 1.2x day 1', (t) => {
  const days = [];
  let tolerance = 0;
  for (let day = 1; day <= 3; day++) {
    const sim = run(createSim({
      seed: 40 + day, strain: 'lewis', stimuli: CLOCKS.drug,
      schedule: { kind: 'SA', ratio: day < 3 ? 1 : 3, duration: 600, timeout: 20, dose: 1, day, tolerance },
      policy: policies.seeker({ target: 1.0 }),
    }), { cap: 700 });
    days.push(sim.metrics());
    tolerance = sim.metrics().tolerance;
  }

  const [d1, d2, d3] = days;
  const ratio = record('d09', 'infusions day 3 / day 1', d3.infusions / d1.infusions, '> 1.2');
  t.diagnostic(`infusions ${d1.infusions} -> ${d2.infusions} -> ${d3.infusions} at ratio ${d1.ratio}/${d2.ratio}/${d3.ratio}; tolerance ${f2(d1.tolerance)} -> ${f2(d2.tolerance)} -> ${f2(d3.tolerance)}`);
  assert.ok(d2.infusions > d1.infusions && d3.infusions > d2.infusions, `intake ${d1.infusions} / ${d2.infusions} / ${d3.infusions} does not rise across days`);
  assert.ok(ratio > 1.2, `escalation ratio ${f2(ratio)} is not above 1.2`);
});

// ---------------------------------------------------------------------------
// The model checks the bands rest on.
// ---------------------------------------------------------------------------

test('a share code round-trips strain, seed, and the learned weights', (t) => {
  const trained = run(createSim({
    seed: 23, strain: 'wistar', gamma: 0.99, alpha: 0.08, stimuli: CLOCKS.operant,
    schedule: { kind: 'FI', interval: 12, count: 10 },
    policy: policies.scalloping({ interval: 12 }),
  }), { cap: 600 });

  const code = trained.serialize();
  const back = createSim.deserialize(code, { schedule: { kind: 'FI', interval: 12, count: 10 } });
  let maxError = 0;
  for (let i = 0; i < back.weights().length; i++) {
    maxError = Math.max(maxError, Math.abs(back.weights()[i] - trained.weights()[i]));
  }
  t.diagnostic(`${code.length} characters, maximum weight error ${maxError.toFixed(4)}`);
  assert.ok(code.length < 400, `share code is ${code.length} characters`);
  assert.ok(maxError < 0.02, `quantization error ${maxError}`);
  assert.equal(back.imported.strain, 'wistar');
  assert.equal(back.imported.seed, 23);
});

for (const [key, strain] of Object.entries(STRAINS)) {
  test(`strain ${key} runs a session and reports a finite tonic estimate`, (t) => {
    const sim = run(createSim({
      seed: 5, strain: key, stimuli: CLOCKS.operant,
      schedule: { kind: 'FI', interval: 12, count: 3 },
      policy: policies.scalloping({ interval: 12 }),
    }), { cap: 900 });
    t.diagnostic(`alpha ${sim.cfg.alpha}, mean tonic ${f2(sim.metrics().meanTonic)}, baseline ${strain.tonicBaseline}`);
    assert.ok(sim.S.done, 'session did not finish');
    assert.ok(Number.isFinite(sim.metrics().meanTonic));
  });
}

for (const kind of SCHEDULE_KINDS) {
  test(`schedule ${kind} terminates and every metric is finite`, (t) => {
    const preset = PRESETS[kind]({});
    const sim = run(createSim({
      seed: 11,
      ...(preset.strain ? { strain: preset.strain } : {}),
      ...(preset.gamma != null ? { gamma: preset.gamma } : {}),
      ...(preset.alpha != null ? { alpha: preset.alpha } : {}),
      ...(preset.autoEat != null ? { autoEat: preset.autoEat } : {}),
      stimuli: preset.stimuli, schedule: preset.schedule, policy: preset.policy,
    }), { cap: preset.cap });
    const m = sim.metrics();
    const bad = Object.entries(m).filter(([, v]) => typeof v === 'number' && !Number.isFinite(v));

    t.diagnostic(`${f2(m.t)} s, ${m.responses} responses, ${m.deliveries} deliveries, ${HEADLINE[kind]} ${f2(m[HEADLINE[kind]])}`);
    assert.ok(sim.S.done, `${kind} did not finish inside ${preset.cap} virtual seconds`);
    assert.equal(bad.length, 0, `non-finite metrics: ${bad.map(([k]) => k).join(', ')}`);
  });
}

after(() => {
  if (!measured.length) return;
  const width = Math.max(...measured.map((m) => m.metric.length));
  process.stdout.write('\n=== signature metrics, one row per PLAN section 4 band ===\n');
  for (const m of measured) {
    const value = typeof m.value === 'number' ? f2(m.value) : m.value;
    process.stdout.write(`  ${m.level}  ${m.metric.padEnd(width)}  ${String(value).padStart(18)}   band ${m.band}\n`);
  }
  process.stdout.write('\n');
});
