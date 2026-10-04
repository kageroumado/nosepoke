/**
 * The intracranial self-stimulation session: the model configuration and the synthetic
 * subject, in one place so the page and the headless checks run the same session.
 *
 * Nothing here touches the DOM, so the module imports cleanly under Node.
 */

/** Session length in virtual seconds. The timer is the only thing that ends it. */
export const DURATION = 240;

/** Reinforcer magnitude per closure of the circuit. Fixed for the whole session. */
export const MAGNITUDE = 0.8;

/** Pellets sitting in the tray from the first second. The subject need not touch them. */
export const TRAY_PELLETS = 6;

/**
 * The model configuration.
 *
 * One stimulus clock, on consumption. Nothing signals the stimulation, so the critic
 * has nothing to predict it with: every press produces the same prediction error, for
 * as long as the subject keeps pressing.
 *
 * `satietyGain` carries the food value rather than zero, so a flat satiety line means
 * the tray went untouched and not that the meter was switched off.
 *
 * @param {object} [overrides] merged over the defaults; `seed` and `policy` are the usual ones
 * @returns {object} a config for `createSim`
 */
export function icssConfig(overrides = {}) {
  return {
    seed: 23,
    strain: 'wistar',
    gamma: 0.97,
    lambda: 0.9,
    stimuli: { eat: { bins: 44, width: 0.5 } },
    satietyGain: 0.05,
    schedule: { kind: 'ICSS', duration: DURATION, magnitude: MAGNITUDE },
    ...overrides,
  };
}

/**
 * A synthetic subject for the smoke suite: it presses at a steady rate and never goes
 * to the tray. The rate is high enough that a minute's count is not dominated by
 * sampling noise, which is what makes the flat-rate signature measurable at all.
 *
 * @param {object} [opts]
 * @param {number} [opts.rate] probability of an intent per model tick
 * @returns {Function} a policy for `createSim({ policy })`
 */
export function icssPolicy({ rate = 0.3 } = {}) {
  return (S, api) => (api.rand() < rate ? 'press' : null);
}

/**
 * Presses in each whole minute of the session, from the event log.
 *
 * @param {Array} events the sim event log
 * @param {number} tEnd session length in seconds
 * @returns {number[]} presses per minute, one entry per started minute
 */
export function pressesPerMinute(events, tEnd) {
  const bins = new Array(Math.max(1, Math.ceil(tEnd / 60))).fill(0);
  for (const e of events) {
    if (e.type !== 'press' && e.type !== 'poke') continue;
    const i = Math.min(bins.length - 1, Math.floor(e.t / 60));
    bins[i]++;
  }
  return bins;
}

/**
 * Satiety at a point in time, rebuilt from the event log: it rises only with
 * consumption and otherwise falls at the resting metabolic rate the model applies.
 *
 * @param {Array} events the sim event log
 * @param {number} t seconds since session start
 * @param {number} [gain] satiety added per reinforcer consumed
 * @param {number} [start] satiety at t = 0
 * @returns {number} satiety in [0, 1]
 */
export function satietyAt(events, t, gain = 0.05, start = 0.12) {
  let eaten = 0;
  for (const e of events) {
    if (e.t > t) break;
    if (e.type === 'consume') eaten++;
  }
  return Math.max(0, Math.min(1, start + eaten * gain - t * 0.0006));
}
