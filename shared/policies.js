/**
 * Synthetic rats the behavioral signatures need beyond the ones `shared/sim.js` ships.
 *
 * Each is a policy in the runtime's own shape — `(S, api) => action | null`, sampled once
 * per tick and released after the vigor latency — and draws every random number from
 * `api.rand()`, so a session is reproducible from its seed.
 */

/**
 * True when a reinforcer is in the tray and the subject will actually take it.
 * The runtime applies the same guard inside its own policies but keeps the helper
 * private, so the policies here carry their own.
 */
export function hungry(S) {
  return S.pellets > 0 && S.satiety < 0.98;
}

/**
 * Look back for the most recent event of a type. The scan stops at `horizon` seconds
 * so a long session does not make every tick walk the whole log.
 */
export function lastEvent(S, type, horizon = 120) {
  for (let i = S.events.length - 1; i >= 0; i--) {
    const e = S.events[i];
    if (e.t < S.t - horizon) return null;
    if (e.type === type) return e;
  }
  return null;
}

/**
 * A Pavlovian subject that works the tray while it expects the reinforcer, and keeps
 * searching when the cue pays nothing. The two windows are the whole extinction burst:
 * a paid trial ends the search at `hold`, an omitted one runs to `search`.
 *
 * Rate scales with the learned value of the conditioned stimulus, so responding grows
 * over acquisition and decays once the reinforcer stops.
 */
export function searcher({ rate = 0.5, hold = 3, search = 12, cs = 'tone', response = 'poke' } = {}) {
  return (S, api) => {
    if (hungry(S)) return 'eat';
    const cue = lastEvent(S, 'cue');
    if (!cue) return null;
    const delivery = lastEvent(S, 'delivery');
    const paid = delivery && delivery.t >= cue.t;
    if (S.t - cue.t > (paid ? hold : search)) return null;
    const v = Math.max(0, Math.min(1, (S.values[cs] || 0) * 2));
    return api.rand() < rate * v ? response : null;
  };
}

/**
 * A ratio subject that waits out the responses it knows cannot pay.
 *
 * On a fixed ratio the n − 1 responses after a reinforcer are guaranteed unpaid, and the
 * subject pauses for the time they would take. On a variable ratio the very next response
 * may pay, so there is nothing to wait for. That asymmetry is the post-reinforcement
 * pause, and it is the reason the fixed and variable cumulative records look different.
 */
export function ratioSubject({ n = 5, variable = false, rate = 0.6, pace = 0.4, response = 'press' } = {}) {
  return (S, api) => {
    if (hungry(S)) return 'eat';
    const delivery = lastEvent(S, 'delivery');
    if (delivery) {
      const wait = variable ? 0.4 : pace * (n - 1);
      if (S.t - delivery.t < wait) return null;
    }
    return api.rand() < rate * (0.5 + S.tonicNorm) ? response : null;
  };
}
