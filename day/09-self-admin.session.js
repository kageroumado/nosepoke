/**
 * The self-administration protocol: three sessions on consecutive days, the model
 * configuration for each, and the synthetic subject. The page and the headless checks
 * import the same values, so a number in the debrief and a number in the harness come
 * from one definition.
 *
 * Nothing here touches the DOM, so the module imports cleanly under Node.
 */

import { policies } from '../shared/sim.js';

/** Seconds the lever is dead after an infusion. Real rigs use a timeout of this shape. */
export const TIMEOUT = 20;

/** Unit dose per infusion. It is the same on every day of the protocol. */
export const DOSE = 1;

/** Pellets in the tray at the start of each session. Food is never withheld. */
export const TRAY_PELLETS = 4;

/** The circulating level the synthetic subject works to hold. */
export const TARGET = 1.0;

/**
 * Tolerance added per unit dose. The runtime's default of 0.05 is calibrated for the
 * ten-minute sessions a real protocol uses; these sessions are four minutes, so the
 * gain is raised to put the same amount of neuroadaptation inside them. Every other
 * level compresses time the same way.
 */
export const TOLERANCE_GAIN = 0.12;

/**
 * The three sessions. Access length is the same every day, so a change in intake across
 * days is a change in the subject rather than in the opportunity. The ratio steps from
 * one press per infusion to three.
 */
export const DAYS = [
  { day: 1, ratio: 1, duration: 240 },
  { day: 2, ratio: 3, duration: 240 },
  { day: 3, ratio: 3, duration: 240 },
];

/**
 * The model configuration for one session.
 *
 * Three stimulus clocks. The `infuse` clock resets on every infusion, which makes the
 * drug itself a cue the critic can learn against, and it is the one the rig's value bar
 * fills in during a session.
 *
 * The learning rate is left to the strain: `SA` sessions read `alphaSA`, which is where
 * the Lewis subject's faster acquisition comes from.
 *
 * @param {object} day one entry from `DAYS`
 * @param {object} [overrides] merged over the defaults; `seed`, `policy`, and
 *   `schedule.tolerance` carried from the previous day are the usual ones
 * @returns {object} a config for `createSim`
 */
export function saConfig(day, overrides = {}) {
  const { tolerance = 0, ...rest } = overrides;
  return {
    seed: 23,
    strain: 'lewis',
    gamma: 0.97,
    lambda: 0.9,
    stimuli: {
      eat: { bins: 44, width: 0.5 },
      click: { bins: 14, width: 0.25 },
      infuse: { bins: 40, width: 1 },
    },
    satietyGain: 0.05,
    toleranceGain: TOLERANCE_GAIN,
    schedule: {
      kind: 'SA',
      ratio: day.ratio,
      timeout: TIMEOUT,
      duration: day.duration,
      dose: DOSE,
      day: day.day,
      tolerance,
    },
    ...rest,
  };
}

/**
 * The synthetic subject: it presses while the circulating level is under its target and
 * waits when it is over. Because every infusion is worth less than the last one, holding
 * that target costs more infusions each day, which is the escalation.
 *
 * @returns {Function} a policy for `createSim({ policy })`
 */
export function saPolicy() {
  return policies.seeker({ target: TARGET });
}

/**
 * The loading phase: the run of infusions at the start of a session taken as fast as the
 * timeout allows, before the intervals lengthen into maintenance.
 *
 * @param {number[]} times infusion times in seconds
 * @returns {{count: number, seconds: number}} how many, and when the run ended
 */
export function loadingRun(times) {
  if (!times.length) return { count: 0, seconds: 0 };
  let n = 1;
  while (n < times.length && times[n] - times[n - 1] <= TIMEOUT + 3) n++;
  return { count: n, seconds: times[n - 1] };
}

/**
 * The per-session numbers the debrief and the save file both want.
 *
 * `meanEffect` is what the unit dose was actually worth, averaged over the session. It
 * is the measure that falls while everything else rises.
 *
 * @param {object} sim a finished session
 * @param {object} day the `DAYS` entry it ran
 * @returns {object} one row of the protocol record
 */
export function daySummary(sim, day) {
  const m = sim.metrics();
  const minutes = Math.max(1 / 60, sim.S.t / 60);
  const load = loadingRun(m.infusionTimes);
  const effects = sim.S.events.filter((e) => e.type === 'infuse').map((e) => e.effect);
  return {
    day: day.day,
    ratio: day.ratio,
    duration: day.duration,
    infusions: m.infusions,
    infusionTimes: m.infusionTimes,
    infusionsPerMin: m.infusions / minutes,
    loadingInfusions: load.count,
    loadingSeconds: load.seconds,
    loadingFraction: m.infusions ? load.count / m.infusions : 0,
    presses: m.presses,
    timeoutPresses: sim.S.events.filter((e) => e.type === 'timeout-press').length,
    pressesPerMin: m.presses / minutes,
    consumed: m.consumed,
    dose: DOSE,
    tolerance: m.tolerance,
    effects,
    meanEffect: effects.length ? effects.reduce((a, b) => a + b, 0) / effects.length : 0,
    meanTonic: m.meanTonic,
  };
}

/**
 * Escalation: infusions on the last day over infusions on the first.
 *
 * @param {object[]} days rows from `daySummary`
 * @returns {number} the ratio, or 0 when the first session had no infusions
 */
export function escalationRatio(days) {
  if (!days.length || !days[0].infusions) return 0;
  return days[days.length - 1].infusions / days[0].infusions;
}
