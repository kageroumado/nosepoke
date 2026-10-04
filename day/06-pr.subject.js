/**
 * The progressive-ratio session, defined once: the model configuration the page plays,
 * the synthetic subject that plays it without a human, and the three matched sessions
 * the debrief figure draws its reference curve from.
 *
 * The module is pure. It runs under Node, which is how the breakpoint signature is
 * checked headlessly, and it is the same code the browser runs, so the reference curve
 * in the figure is a real result rather than a drawing of one.
 */

import { createSim } from '../shared/sim.js';

/** Two clocks: one on consumption, one on the dispenser click that precedes it. */
export const PR_STIMULI = {
  eat: { bins: 44, width: 0.5 },
  click: { bins: 14, width: 0.25 },
};

/** Seconds without a completed ratio that end the session. */
export const PR_TIMEOUT = 180;

/**
 * The session configuration.
 *
 * @param {object} [opts]
 * @param {number} [opts.seed] session generator seed
 * @param {number} [opts.magnitude] pellets delivered per completed ratio
 * @param {Function|null} [opts.policy] synthetic subject, or null for a human
 * @returns {object} a `createSim` configuration
 */
export function prConfig({ seed = 23, magnitude = 1, policy = null } = {}) {
  return {
    seed,
    strain: 'wistar',
    gamma: 0.99, alpha: 0.08, lambda: 0.9,
    stimuli: PR_STIMULI,
    // One reinforcer is a few pellets at most, so a session cannot end in satiety;
    // the price is the only thing that stops the subject.
    satietyGain: 0.006,
    schedule: { kind: 'PR', timeout: PR_TIMEOUT, magnitude },
    policy,
  };
}

/**
 * A subject that works while the pellet is still worth the presses.
 *
 * Vigor comes from the tonic estimate, as everywhere else. What quits is the
 * comparison: effort already sunk into the current ratio against the learned value of
 * the dispenser click, which is where the model has stored how much a reinforcer is
 * worth. A subject blind to that value presses at the same price forever and has no
 * breakpoint to measure.
 *
 * @param {object} [opts]
 * @param {number} [opts.rate] base sampling probability per tick
 * @param {number} [opts.worth] presses the subject will spend per unit of learned value
 * @param {number} [opts.floor] value assumed before the click has been learned
 * @returns {Function} a policy for `createSim({ policy })`
 */
export function prSubject({ rate = 0.5, worth = 40, floor = 0.5 } = {}) {
  let spent = 0;
  let seen = 0;
  return (S, api) => {
    if (S.counts.deliveries !== seen) { seen = S.counts.deliveries; spent = 0; }
    if (S.pellets > 0) return 'eat';
    const budget = worth * Math.max(floor, S.values.click);
    const left = Math.max(0, 1 - spent / budget);
    if (api.rand() < rate * (0.45 + 0.55 * S.tonicNorm) * left) { spent++; return 'press'; }
    return null;
  };
}

/** Run a session to its end under a virtual clock. */
function runToEnd(sim, cap = 6000) {
  let guard = 0;
  while (!sim.S.done && sim.S.t < cap && guard++ < 200000) sim.step(0.1);
  return sim;
}

/**
 * Breakpoints from matched sessions that differ only in pellets per reinforcer.
 * This is the reference curve in panel B of the debrief figure.
 *
 * @param {number[]} [magnitudes] pellets per reinforcer, ascending
 * @param {number} [seed] fixed, so every player sees the same reference
 * @returns {Array<{magnitude: number, breakpoint: number, ratios: number}>}
 */
export function referenceBreakpoints(magnitudes = [1, 2, 4], seed = 23) {
  return magnitudes.map((magnitude) => {
    const sim = runToEnd(createSim(prConfig({ seed, magnitude, policy: prSubject() })));
    const m = sim.metrics();
    return { magnitude, breakpoint: m.breakpoint, ratios: m.completedRatios };
  });
}
