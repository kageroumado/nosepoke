/**
 * What the two classical-conditioning pages share: the response measure, the synthetic
 * subject, and the two per-trial series their debrief figures plot.
 *
 * In a conditioned-approach chamber the recorded response is a head entry into the
 * sucrose cup, so this module turns every arrival at the cup into a response. The
 * runtime counts responses through `poke`, and reads sign- versus goal-tracking from
 * the `approach` stream, so one arrival writes to both.
 */

import { searcher } from '../shared/policies.js';

/**
 * Convert arrivals at the cup into recorded head entries.
 *
 * Both input paths end in an `approach` event: a click walks the rat there through
 * the rig's latency, and the synthetic policy calls the verb directly. Watching the
 * event stream therefore covers hand play and `?auto=1` with one rule.
 *
 * @param {object} sim the live session
 * @param {string} [target] the prop whose arrivals count as a head entry
 * @returns {() => void} call once per frame
 */
export function headEntryWatcher(sim, target = 'tray') {
  let seen = 0;
  return function pump() {
    const events = sim.S.events;
    for (; seen < events.length; seen++) {
      const e = events[seen];
      if (e.type === 'approach' && e.target === target) sim.poke();
    }
  };
}

/**
 * The signature suite's Pavlovian subject, walked to a target instead of poking in place.
 *
 * `searcher` decides *whether* to work the cup on this tick: inside a short window on a
 * paid trial and a long one on an omitted trial, which is where the extinction burst
 * comes from. Two things are added here. The trip is taken in proportion to the value at
 * the point the reinforcer arrives rather than at cue onset, because the onset bin barely
 * moves during extinction while that one collapses and is what the recovery step
 * restores; scaling on it gives the acquisition rise, the extinction decline, and a
 * return after the day boundary, all out of the critic. And the response is an approach,
 * so it reaches the cup the way a click does and the stream the phenotype is read from
 * gets its data.
 *
 * @param {object} [opts]
 * @param {number} [opts.sign] probability that a trip goes to the speaker instead
 * @param {number} [opts.rate] trips per tick before the value term
 * @param {number} [opts.hold] seconds of checking after a paid cue
 * @param {number} [opts.search] seconds of checking after an unpaid cue
 * @param {string} [opts.cs] the conditioned stimulus clock
 * @param {number} [opts.at] seconds into that clock where the reinforcer arrives
 * @param {number} [opts.scale] value at that point which counts as full eagerness
 * @returns {(S: object, api: object) => Array|string|null}
 */
export function conditionedApproach({ sign = 0, at = 2, scale = 0.5, ...opts } = {}) {
  const cs = opts.cs || 'tone';
  const base = searcher({ hold: 1, search: 7, rate: 1, ...opts, cs, response: 'approach' });
  return (S, api) => {
    const action = base(S, api);
    if (action !== 'approach') return action;
    const clock = api.clocks[cs];
    if (!clock) return null;
    const expected = api.model.w[clock.offset + Math.floor(at / clock.width)];
    if (api.rand() >= clamp(expected / scale, 0.04, 1)) return null;
    return ['approach', api.rand() < sign ? 'speaker' : 'tray'];
  };
}

/**
 * Head entries per trial, in play order, with the recovery probes kept separate.
 *
 * @param {object} metrics a finished `PAV` or `EXT` metrics block
 * @returns {{acquisition: number[], recovery: number[], omitFrom: number}}
 */
export function trialSeries(metrics) {
  const rows = metrics.responsesByTrial || [];
  return {
    acquisition: rows.filter((r) => r.stage !== 'recovery').map((r) => r.responses),
    recovery: rows.filter((r) => r.stage === 'recovery').map((r) => r.responses),
    omitFrom: metrics.extinctionFrom || 0,
  };
}

/**
 * Sample what the model predicts at the moment the reinforcer used to arrive.
 *
 * The onset bin of the tone clock barely moves during extinction; the value two seconds
 * in is what collapses and what the recovery step restores, so that is the number worth
 * plotting. Sampled once per trial, plus the pair either side of the `recovery` event,
 * which lands inside a single tick.
 *
 * @param {object} sim the live session
 * @param {object} [opts]
 * @param {string} [opts.stimulus] which clock to read
 * @param {number} [opts.at] seconds after that clock's onset
 * @returns {{pump: () => void, values: {acquisition: number[], recovery: number[], jump: object|null}}}
 */
export function valueTracker(sim, { stimulus = 'tone', at = 2 } = {}) {
  const values = { acquisition: [], recovery: [], jump: null };
  let seen = 0;
  let previous = sim.valueAt(stimulus, at);
  return {
    values,
    pump() {
      const events = sim.S.events;
      const now = sim.valueAt(stimulus, at);
      for (; seen < events.length; seen++) {
        const e = events[seen];
        if (e.type === 'trial') {
          (e.stage === 'recovery' ? values.recovery : values.acquisition).push(now);
        } else if (e.type === 'recovery') {
          values.jump = { before: previous, after: now, fraction: e.fraction };
        }
      }
      previous = now;
    },
  };
}

/**
 * The trial on which the burst changes hands, over a running window.
 *
 * `metrics().crossoverTrial` takes the first trial where the cue error exceeds the
 * reinforcer error at all, which a single noisy trial can trip several trials early:
 * on one seed a reinforcer error of 0.02 on trial 7 beat a cue error of 0.07 while the
 * reinforcer was still worth 0.2 on average. Averaging both sides over three trials
 * first asks the question the figure is actually marking.
 *
 * @param {number[]} deltaCS prediction error at cue onset, by trial
 * @param {number[]} deltaUS prediction error at the reinforcer, by trial
 * @param {number} [window] trials averaged on each side
 * @returns {number} the trial, counting from one, or 0 when they never cross
 */
export function crossoverTrial(deltaCS, deltaUS, window = 3) {
  const n = Math.min(deltaCS.length, deltaUS.length);
  for (let i = window - 1; i < n; i++) {
    const from = i - window + 1;
    if (mean(deltaCS.slice(from, i + 1)) > mean(deltaUS.slice(from, i + 1))) return i + 1;
  }
  return 0;
}

/** Mean of a slice, or 0 when the slice is empty. */
export function mean(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
