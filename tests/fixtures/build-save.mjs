/**
 * Build a realistic `nosepoke.v1` save by running the shared sim headlessly, one
 * session per level, and write it as JSON for the smoke suite to seed localStorage with.
 *
 * The event logs here are real model output rather than hand-written stubs, so anything
 * the epilogue computes from them is computed from the same shapes a played session
 * produces. The per-level metric names the pages are expected to add on top are noted
 * beside each session below.
 *
 *     node tests/fixtures/build-save.mjs > tests/fixtures/full-save.json
 */

import { createSim, policies } from '../../shared/sim.js';

/** Run a sim to completion on a virtual clock. */
function run(sim, seconds = 900) {
  const step = 0.5;
  for (let t = 0; t < seconds && !sim.S.done; t += step) sim.step(step);
  return sim;
}

const STRAIN = 'long-evans';
let clock = Date.parse('2026-09-01T21:00:00Z');
/** Session timestamps march forward so the epilogue can order them. */
function stamp() { clock += 11 * 60 * 1000; return new Date(clock).toISOString(); }

const record = [];
const completed = {};
const colony = [];
const disclosure = [];

function session(level, sim, extra = {}) {
  run(sim);
  const metrics = { ...sim.metrics(), ...extra };
  const at = stamp();
  completed[level] = { at, metrics };
  record.push({ at, level, seed: sim.cfg.seed, share: '', events: sim.S.events, metrics });
  return { sim, metrics };
}

// d00 — magazine training. MAG adds approachLatencies, firstLatency, lastLatency.
session('d00', createSim({
  seed: 11, strain: STRAIN, schedule: { kind: 'MAG', count: 12, vt: 20 },
  policy: policies.collector(),
}));

// d01 — Pavlovian. PAV adds deltaCS, deltaUS, crossoverTrial, trackingIndex, phenotype.
session('d01', createSim({
  seed: 12, strain: STRAIN,
  stimuli: { eat: { bins: 44, width: 0.5 }, click: { bins: 14, width: 0.25 }, tone: { bins: 20, width: 0.25 } },
  schedule: { kind: 'PAV', trials: 30, csDur: 2, iti: [20, 40], cs: 'tone' },
  policy: policies.signTracker(),
}));

// d02 — extinction. EXT adds burstRatio, recoveryRatio, extinctionFrom.
session('d02', createSim({
  seed: 13, strain: STRAIN,
  stimuli: { eat: { bins: 44, width: 0.5 }, click: { bins: 14, width: 0.25 }, tone: { bins: 20, width: 0.25 } },
  schedule: { kind: 'EXT', trials: 30, omitFrom: 21, recovery: 8, csDur: 2, iti: [20, 40], cs: 'tone' },
  policy: policies.signTracker(),
}));

// d03 — blocking. BLOCK adds vTone, vLight, control.
session('d03', createSim({
  seed: 14, strain: STRAIN,
  stimuli: {
    eat: { bins: 44, width: 0.5 }, click: { bins: 14, width: 0.25 },
    tone: { bins: 20, width: 0.25 }, light: { bins: 20, width: 0.25 },
  },
  schedule: { kind: 'BLOCK', phaseA: 20, phaseB: 20, csDur: 2, iti: [20, 40] },
}));

// d04 — ratio schedules. The page runs three blocks in one session, so the epilogue
// expects them collected under `blocks`, each carrying its own `runRate` and `meanPause`.
const fr1 = run(createSim({ seed: 15, strain: STRAIN, schedule: { kind: 'FR', n: 1, duration: 300 }, policy: policies.worker() }));
const fr5 = run(createSim({ seed: 16, strain: STRAIN, schedule: { kind: 'FR', n: 5, duration: 300 }, policy: policies.worker() }));
const vr5 = run(createSim({ seed: 17, strain: STRAIN, schedule: { kind: 'VR', n: 5, duration: 300 }, policy: policies.worker() }));
{
  const blocks = [fr1, fr5, vr5].map((s) => {
    const m = s.metrics();
    return { kind: m.kind, n: m.ratio, runRate: m.runRate, meanPause: m.meanPause, responseRate: m.responseRate, reinforcers: m.reinforcers, variable: !!m.variable };
  });
  const at = stamp();
  const metrics = { ...vr5.metrics(), blocks };
  completed.d04 = { at, metrics };
  record.push({ at, level: 'd04', seed: 17, share: '', events: [...fr5.S.events, ...vr5.S.events], metrics });
  disclosure.push({ at, kind: 'vr-slot', level: 'd04', told: true });
}

// d05 — fixed interval, and the first faint cue in the pad.
disclosure.push({ at: stamp(), kind: 'faint-cue', level: 'd05', semitones: 2, leadMs: 800 });
const fi = session('d05', createSim({
  seed: 23, strain: STRAIN, gamma: 0.99, alpha: 0.08,
  stimuli: { eat: { bins: 44, width: 0.5 }, click: { bins: 14, width: 0.25 } },
  schedule: { kind: 'FI', interval: 12, count: 10 },
  policy: policies.scalloping({ interval: 12 }),
}));
colony.push({ added: stamp(), name: 'Subject 23', level: 'd05', strain: STRAIN, code: fi.sim.serialize() });
disclosure.push({ at: stamp(), kind: 'faint-cue', level: 'd05', semitones: 2, leadMs: 800 });

// d06 — progressive ratio. PR adds breakpoint, ratios, runRates.
session('d06', createSim({
  seed: 18, strain: STRAIN, schedule: { kind: 'PR', timeout: 180, magnitude: 1 },
  policy: policies.worker(),
}));

// d07 — effort choice, baseline then the haloperidol session. The epilogue expects the
// two halves side by side; `baseline` and `haloperidol` sub-objects are the shape it reads.
const base = run(createSim({ seed: 19, strain: STRAIN, schedule: { kind: 'CHOICE', trials: 20, blockSize: 5 }, policy: policies.chooser() }));
const halo = createSim({ seed: 20, strain: STRAIN, schedule: { kind: 'CHOICE', trials: 20, blockSize: 5, haloperidol: true }, policy: policies.chooser() });
halo.setTonicGain(0.5);
run(halo);
{
  const at = stamp();
  const bm = base.metrics();
  const hm = halo.metrics();
  const metrics = {
    ...hm,
    baseline: { barrierFraction: bm.barrierFraction, barrierChoices: bm.barrierChoices, trials: bm.trials },
    haloperidol: { barrierFraction: hm.barrierFraction, barrierChoices: hm.barrierChoices, trials: hm.trials },
  };
  completed.d07 = { at, metrics };
  record.push({ at, level: 'd07', seed: 20, share: '', events: [...base.S.events, ...halo.S.events], metrics });
  disclosure.push({ at, kind: 'haloperidol', level: 'd07', tonicGain: 0.5 });
}

// d08 — intracranial stimulation.
session('d08', createSim({
  seed: 21, strain: STRAIN, schedule: { kind: 'ICSS', duration: 240, magnitude: 0.8 },
  policy: policies.worker(),
}));

// d09 — self-administration across three days. The epilogue reads `days` when the page
// records one entry per day; it falls back to the single-session block otherwise.
{
  const runs = [1, 2, 3].map((day) => run(createSim({
    seed: 30 + day, strain: STRAIN,
    schedule: { kind: 'SA', ratio: day === 1 ? 1 : 3, timeout: 20, duration: 300, dose: 1, day },
    policy: policies.worker(),
  })));
  const at = stamp();
  const last = runs[2].metrics();
  const metrics = {
    ...last,
    days: runs.map((s, i) => ({ day: i + 1, infusions: s.metrics().infusions, loadingFraction: s.metrics().loadingFraction })),
  };
  completed.d09 = { at, metrics };
  record.push({ at, level: 'd09', seed: 33, share: '', events: runs[2].S.events, metrics });
  colony.push({ added: at, name: 'Subject 23', level: 'd09', strain: STRAIN, code: runs[2].serialize() });
}

// park — the week, as the park page writes it.
{
  const park = run(createSim({
    seed: 71, strain: STRAIN,
    stimuli: { eat: { bins: 44, width: 0.5 } },
    satietyGain: 0.012,
    schedule: { kind: 'FREE', duration: 175, phase: 'park', rateCeiling: 1 / 5 },
    policy: policies.collector(),
  }));
  const bottles = ['plain', 'plain', 'morphine', 'plain', 'plain', 'plain', null];
  const at = stamp();
  const metrics = {
    ...park.metrics(),
    days: bottles.map((b, i) => ({ day: i + 1, bottle: b, t: b ? i * 25 + 9 : null })),
    morphineDays: 1, waterDays: 5, abstainDays: 1,
    morphineShare: 1 / 6, enrichmentVisits: 19, colonySize: 5,
  };
  completed.park = { at, metrics };
  record.push({ at, level: 'park', seed: 71, share: '', events: park.S.events, metrics });
  colony.push({ added: at, name: 'Subject 23', level: 'park', strain: STRAIN, code: park.serialize() });
}

const save = {
  version: 1,
  created: '2026-09-01T20:40:00Z',
  progress: { completed, lastLevel: 'park' },
  colony,
  record,
  disclosure,
  prefs: { theme: 'auto', sound: true },
  player: { phenotype: 'high-responder', strain: STRAIN },
};

process.stdout.write(JSON.stringify(save));
