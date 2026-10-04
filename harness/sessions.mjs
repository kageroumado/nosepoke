/**
 * Default sessions for the headless runner: one sensible configuration per schedule
 * kind, the virtual-time loop that drives a session to its end, and the headline metric
 * each kind is judged on.
 *
 * The runner and the signature tests both build from here, so a session described in one
 * place cannot drift from the session measured in the other.
 */

import { policies } from '../shared/sim.js';
import { searcher, ratioSubject } from '../shared/policies.js';

/**
 * Stimulus clocks. `operant` is the two the chamber always has, `full` adds the cues, and
 * `drug` adds the infusion clock that makes the drug itself a learnable stimulus.
 */
export const CLOCKS = {
  operant: {
    eat: { bins: 44, width: 0.5 },
    click: { bins: 14, width: 0.25 },
  },
  full: {
    eat: { bins: 44, width: 0.5 },
    click: { bins: 14, width: 0.25 },
    tone: { bins: 20, width: 0.25 },
    light: { bins: 20, width: 0.25 },
  },
  drug: {
    eat: { bins: 44, width: 0.5 },
    click: { bins: 14, width: 0.25 },
    infuse: { bins: 40, width: 1 },
  },
};

/**
 * Drive a session to completion on virtual time.
 *
 * @param {object} sim a sim from `createSim`
 * @param {object} [opts]
 * @param {number} [opts.cap] virtual seconds after which the loop gives up
 * @returns {object} the same sim
 */
export function run(sim, { cap = 4000 } = {}) {
  let guard = 0;
  while (!sim.S.done && sim.S.t < cap && guard++ < cap * 20) sim.step(0.1);
  return sim;
}

/**
 * One default configuration per schedule kind: the clocks it needs, the schedule spec,
 * a synthetic rat that produces the behavior the kind is about, and a time cap.
 *
 * `temp` scales the synthetic rat's per-tick response probability. It is the only
 * stochasticity knob in this policy family, so it is what the sweep varies when it
 * sweeps softmax temperature. The kinds whose subject does not choose when to respond
 * — magazine training, the two Pavlovian kinds, and the free session — ignore it.
 */
export const PRESETS = {
  MAG: () => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'MAG', count: 12, vt: 20 },
    policy: policies.collector(),
    cap: 900,
  }),
  PAV: () => ({
    stimuli: CLOCKS.full,
    alpha: 0.05,
    autoEat: 0.6,
    schedule: { kind: 'PAV', trials: 30, csDur: 2, iti: [20, 40] },
    policy: policies.goalTracker(),
    cap: 3000,
  }),
  EXT: ({ temp = 0.5 } = {}) => ({
    stimuli: CLOCKS.full,
    alpha: 0.05,
    autoEat: 0.6,
    schedule: { kind: 'EXT', trials: 30, omitFrom: 21, recovery: 8, iti: [20, 40] },
    policy: searcher({ rate: temp }),
    cap: 4000,
  }),
  BLOCK: () => ({
    stimuli: CLOCKS.full,
    schedule: { kind: 'BLOCK', phaseA: 20, phaseB: 20, csDur: 2, iti: [8, 14] },
    policy: null,
    cap: 2500,
  }),
  FR: ({ temp = 0.6 } = {}) => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'FR', n: 5, duration: 300 },
    policy: ratioSubject({ n: 5, rate: temp }),
    cap: 400,
  }),
  VR: ({ temp = 0.6 } = {}) => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'VR', n: 5, duration: 300 },
    policy: ratioSubject({ n: 5, variable: true, rate: temp }),
    cap: 400,
  }),
  FI: ({ temp = 0.16 } = {}) => ({
    stimuli: CLOCKS.operant,
    strain: 'wistar',
    gamma: 0.99,
    alpha: 0.08,
    schedule: { kind: 'FI', interval: 12, count: 10 },
    policy: policies.scalloping({ interval: 12, peak: temp }),
    cap: 600,
  }),
  PR: ({ temp = 0.35 } = {}) => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'PR', timeout: 180, magnitude: 1 },
    policy: policies.worker({ rate: temp }),
    cap: 3000,
  }),
  CHOICE: ({ temp = 0.75 } = {}) => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'CHOICE', trials: 20, blockSize: 5 },
    policy: policies.chooser({ bias: temp }),
    cap: 2000,
  }),
  ICSS: ({ temp = 0.5 } = {}) => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'ICSS', duration: 300 },
    policy: policies.worker({ rate: temp }),
    cap: 400,
  }),
  SA: ({ temp = 0.6 } = {}) => ({
    stimuli: CLOCKS.drug,
    strain: 'lewis',
    schedule: { kind: 'SA', ratio: 1, duration: 600, timeout: 20, dose: 1, day: 1 },
    policy: policies.seeker({ target: 1.0, rate: temp }),
    cap: 700,
  }),
  FREE: () => ({
    stimuli: CLOCKS.operant,
    schedule: { kind: 'FREE', duration: 120, endNote: 'Observation window closed.' },
    policy: null,
    cap: 200,
  }),
};

/** Every policy the runner can be pointed at by name. */
export const POLICY_REGISTRY = {
  scalloping: (o) => policies.scalloping(o),
  uniform: (o) => policies.uniform(o),
  frontLoaded: (o) => policies.frontLoaded(o),
  worker: (o) => policies.worker(o),
  collector: () => policies.collector(),
  goalTracker: () => policies.goalTracker(),
  signTracker: () => policies.signTracker(),
  chooser: (o) => policies.chooser(o),
  seeker: (o) => policies.seeker(o),
  searcher: (o) => searcher(o),
  ratioSubject: (o) => ratioSubject(o),
  none: () => null,
};

/** The one number each kind is tuned against, for the sweep's last column. */
export const HEADLINE = {
  MAG: 'meanApproachLatency',
  PAV: 'crossoverTrial',
  EXT: 'burstRatio',
  BLOCK: 'vLight',
  FR: 'meanPause',
  VR: 'meanPause',
  FI: 'fryIndex',
  PR: 'breakpoint',
  CHOICE: 'barrierFraction',
  ICSS: 'pressesPerMin',
  SA: 'infusions',
  FREE: 't',
};
