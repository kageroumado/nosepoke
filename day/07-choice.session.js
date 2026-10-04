/**
 * The effort-based choice session, defined once so the page, the headless check, and any
 * later replay all run the same experiment: a T-maze with four pellets behind a barrier
 * and two on the flat arm, twice, the second time with the tonic ceiling halved.
 *
 * The module is pure and runs under Node.
 */

/** Two clocks: one on consumption, one on the dispenser click that precedes it. */
export const CHOICE_STIMULI = {
  eat: { bins: 44, width: 0.5 },
  click: { bins: 14, width: 0.25 },
};

/** Trials per session, and the block size the choice record is summarized in. */
export const CHOICE_TRIALS = 20;
export const CHOICE_BLOCK = 5;

/**
 * The session configuration.
 *
 * Salamone, Cousins & Bucher (1994) used 4 x 45 mg pellets behind a 44 cm barrier
 * against 2 x 45 mg on the open arm, which is the ratio kept here.
 *
 * @param {object} [opts]
 * @param {number} [opts.seed] session generator seed
 * @param {boolean} [opts.haloperidol] halve the tonic ceiling for this session
 * @param {Function|null} [opts.policy] synthetic subject, or null for a human
 * @returns {object} a `createSim` configuration
 */
export function choiceConfig({ seed = 23, haloperidol = false, policy = null } = {}) {
  return {
    seed,
    strain: 'wistar',
    gamma: 0.99, alpha: 0.08, lambda: 0.9,
    stimuli: CHOICE_STIMULI,
    // The subject eats what it earns without being asked, far enough after the delivery
    // that it has walked to the goal box first. What is measured here is which arm it
    // walks down, not whether it collects.
    autoEat: 1.6,
    schedule: {
      kind: 'CHOICE',
      trials: CHOICE_TRIALS,
      blockSize: CHOICE_BLOCK,
      barrierPellets: 4,
      flatPellets: 2,
      haloperidol,
    },
    policy,
  };
}

/**
 * Pellets actually dispensed in a session, which is not the number of deliveries: one
 * delivery on the barrier arm is four pellets.
 *
 * @param {Array} events the sim event log
 * @returns {number}
 */
export function pelletsDelivered(events) {
  let n = 0;
  for (const e of events) if (e.type === 'delivery') n += e.n || 1;
  return n;
}

/** The model's own latency prediction at a session's mean tonic, in milliseconds. */
export function latencyAt(meanTonic) {
  return Math.round(90 + (1 - meanTonic) * 260);
}
