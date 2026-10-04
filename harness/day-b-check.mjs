/**
 * Headless checks for the three conditioning levels: magazine training, Pavlovian
 * acquisition, and extinction with spontaneous recovery. Each check is a claim one of
 * the debriefs makes, run over five seeds against the configuration the page builds, so
 * a page that stops producing its own result fails here rather than in a screenshot.
 *
 *     node harness/day-b-check.mjs
 *
 * Exits non-zero on a failure, so it gates.
 */
import { createSim, policies } from '../shared/sim.js';
import { conditionedApproach, headEntryWatcher, valueTracker, trialSeries, crossoverTrial, mean } from '../day/conditioning.js';

let failures = 0;
function check(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '  ' + detail : ''));
  if (!ok) failures++;
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));

/** Run to completion with the same two pumps the pages run on every frame. */
function run(sim, cap = 4000) {
  const entries = headEntryWatcher(sim);
  const values = valueTracker(sim);
  let guard = 0;
  while (!sim.S.done && sim.S.t < cap && guard++ < 200000) {
    sim.step(0.1);
    entries();
    values.pump();
  }
  return { sim, values: values.values };
}

const MAG_STIMULI = { eat: { bins: 44, width: 0.5 }, click: { bins: 14, width: 0.25 } };
const CS_STIMULI = {
  eat: { bins: 44, width: 0.5 },
  click: { bins: 14, width: 0.25 },
  tone: { bins: 20, width: 0.25 },
};

/** The configuration `day/00-magazine.html` builds. */
export function magazineSim(seed = 23, policy = null) {
  return createSim({
    seed, strain: 'wistar', gamma: 0.99, alpha: 0.08, lambda: 0.9,
    stimuli: MAG_STIMULI,
    schedule: { kind: 'MAG', count: 12, vt: 20 },
    policy,
  });
}

/** The configuration `day/01-pavlovian.html` builds. */
export function pavlovianSim(seed = 23, policy = null) {
  return createSim({
    seed, strain: 'wistar', gamma: 0.99, alpha: 0.05, lambda: 0.9,
    stimuli: CS_STIMULI, autoEat: 0.6,
    schedule: { kind: 'PAV', trials: 30, csDur: 2, iti: [6, 11] },
    policy,
  });
}

/** The configuration `day/02-extinction.html` builds. */
export function extinctionSim(seed = 23, policy = null) {
  return createSim({
    seed, strain: 'wistar', gamma: 0.99, alpha: 0.05, lambda: 0.9,
    stimuli: CS_STIMULI, autoEat: 0.6,
    schedule: {
      kind: 'EXT', trials: 30, csDur: 2, iti: [4, 8],
      omitFrom: 21, recovery: 8, recoveryFraction: 0.5,
    },
    policy,
  });
}

const SEEDS = [23, 5, 101, 777, 31415, 88, 2024, 7, 404, 1234];

console.log('\nd00 — magazine training, VT 20 s, 12 deliveries');
{
  const { sim } = run(magazineSim(23, policies.collector()));
  const m = sim.metrics();
  check('session completes', sim.S.done && m.deliveries === 12,
    m.deliveries + ' deliveries, ' + m.consumed + ' eaten, t = ' + f2(sim.S.t) + ' s');
  check('one latency per delivery', m.approachLatencies.length === 12,
    m.approachLatencies.length + ' latencies');
  check('latencies are sub-second for a collector',
    m.meanApproachLatency > 0 && m.meanApproachLatency < 1,
    'mean ' + f2(m.meanApproachLatency) + ' s, first ' + f2(m.firstLatency) + ', last ' + f2(m.lastLatency));
  const bm = m.burstMigration;
  check('the burst moves onto the dispenser click', bm.cueLate > bm.cueEarly && bm.pelletLate < bm.pelletEarly,
    'pellet ' + f2(bm.pelletEarly) + ' -> ' + f2(bm.pelletLate)
    + ', click ' + f2(bm.cueEarly) + ' -> ' + f2(bm.cueLate));
}

console.log('\nd01 — Pavlovian, 30 trials, tone 2 s, ITI 6-11 s, alpha 0.05');
{
  const crossovers = [];
  for (const seed of SEEDS) {
    const { sim } = run(pavlovianSim(seed, conditionedApproach({ sign: 0.15 })));
    const m = sim.metrics();
    const usEarly = mean(m.deltaUS.slice(0, 5)), usLate = mean(m.deltaUS.slice(-5));
    const csEarly = mean(m.deltaCS.slice(0, 5)), csLate = mean(m.deltaCS.slice(-5));
    // The figure marks the crossover over a three-trial average, because the raw first
    // crossing can be tripped several trials early by one noisy reinforcer error.
    const xt = crossoverTrial(m.deltaCS, m.deltaUS);
    crossovers.push(xt);
    check('seed ' + String(seed).padEnd(6) + ' US falls, CS rises, crossover in 8-25',
      usLate < usEarly && csLate > csEarly && xt >= 8 && xt <= 25,
      'US ' + f2(usEarly) + ' -> ' + f2(usLate) + ', CS ' + f2(csEarly) + ' -> ' + f2(csLate)
      + ', crossover trial ' + xt + ' (raw first crossing ' + m.crossoverTrial + '), '
      + m.phenotype + ', t = ' + f2(sim.S.t) + ' s');
  }
  check('crossover stable across seeds', Math.max(...crossovers) - Math.min(...crossovers) <= 8,
    'trials ' + crossovers.join(', '));

  const goal = run(pavlovianSim(23, conditionedApproach({ sign: 0 }))).sim;
  const sign = run(pavlovianSim(23, conditionedApproach({ sign: 1 }))).sim;
  check('phenotype follows the approach target',
    goal.metrics().phenotype === 'goal-tracker' && sign.metrics().phenotype === 'sign-tracker',
    goal.metrics().phenotype + ' / ' + sign.metrics().phenotype);
}

console.log('\nd02 — extinction from trial 21, then 8 unreinforced probes');
{
  for (const seed of SEEDS) {
    const { sim } = run(extinctionSim(seed, conditionedApproach({ sign: 0.15 })));
    const m = sim.metrics();
    const s = trialSeries(m);
    const pre = mean(s.acquisition.slice(17, 20));
    const burst = mean(s.acquisition.slice(20, 23));
    check('seed ' + String(seed).padEnd(6) + ' extinction burst above 1.15',
      m.burstRatio > 1.15,
      'trials 18-20 ' + f2(pre) + ' -> trials 21-23 ' + f2(burst)
      + ' = ' + f2(m.burstRatio) + ', t = ' + f2(sim.S.t) + ' s');
  }

  console.log('\n  the model side: value where the sucrose used to arrive');
  for (const seed of SEEDS) {
    const { sim, values } = run(extinctionSim(seed, conditionedApproach({ sign: 0.15 })));
    const m = sim.metrics();
    const j = values.jump;
    const peak = values.acquisition[19];
    const floor = values.acquisition[values.acquisition.length - 1];
    check('seed ' + String(seed).padEnd(6) + ' collapses, then recovers over the day boundary',
      !!j && floor < peak * 0.4 && j.after > j.before,
      'V ' + f3(peak) + ' at trial 20 -> ' + f3(floor) + ' at trial 30, jump '
      + f3(j.before) + ' -> ' + f3(j.after) + ' (x' + f2(j.after / j.before) + ')'
      + ', player recovery ratio ' + f2(m.recoveryRatio));
  }

  const { sim, values } = run(extinctionSim(23, conditionedApproach({ sign: 0.15 })));
  const m = sim.metrics();
  const s = trialSeries(m);
  check('responding declines across extinction',
    mean(s.acquisition.slice(27, 30)) < mean(s.acquisition.slice(20, 23)),
    'trials 21-23 ' + f2(mean(s.acquisition.slice(20, 23)))
    + ' -> trials 28-30 ' + f2(mean(s.acquisition.slice(27, 30))));
  check('recovery probes are unreinforced',
    !sim.S.events.some((e) => e.type === 'delivery' && e.t > recoveryStart(sim)),
    'deliveries after the rest: ' + sim.S.events.filter((e) => e.type === 'delivery' && e.t > recoveryStart(sim)).length);
  check('the first probes exceed the end of extinction',
    mean(s.recovery.slice(0, 3)) > mean(s.acquisition.slice(-3)),
    'trials 28-30 ' + f2(mean(s.acquisition.slice(-3)))
    + ' -> probes 1-3 ' + f2(mean(s.recovery.slice(0, 3)))
    + ', whole block ratio ' + f2(m.recoveryRatio)
    + ', probes ' + s.recovery.join(', '));
  check('the value series has one sample per trial',
    values.acquisition.length === 30 && values.recovery.length === 8,
    values.acquisition.length + ' acquisition, ' + values.recovery.length + ' recovery');
}

function recoveryStart(sim) {
  const e = sim.S.events.find((x) => x.type === 'phase' && x.name === 'recovery');
  return e ? e.t : Infinity;
}

console.log(failures ? '\n' + failures + ' check(s) failed\n' : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
