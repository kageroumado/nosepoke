/**
 * Reading the player's own record back for the disclosure.
 *
 * Every function here takes what `save.js` stores and returns either a measurement or
 * `null`, so a page that was never played produces "not applied" rather than a guess.
 * The extractors are deliberately tolerant about where a level parked its numbers: the
 * shapes each one accepts are the shapes the day pages are expected to write.
 */

/** Mean of a numeric array, or 0 when it is empty. */
export function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

/** Median of a numeric array, or 0 when it is empty. */
export function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** Pearson correlation between two equal-length series. */
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * The delay the vigor model served at a given tonic estimate, in milliseconds.
 * This is `sim.inputLatency()` evaluated after the fact, on a session's mean.
 */
export function servedLatency(tonicNorm) { return 90 + (1 - tonicNorm) * 260; }

/** Responses in one event log, in time order. */
function responses(events) {
  return events.filter((e) => e.type === 'poke' || e.type === 'press');
}

/**
 * Per-session latency evidence: the delay the model served, against how fast the player
 * actually acted. One row per recorded session that contains at least three responses.
 *
 * @returns {Array<{level:string, at:string, tonic:number, served:number, iri:number, n:number}>}
 */
export function latencyRows(record) {
  const rows = [];
  for (const r of record) {
    const resp = responses(r.events || []);
    if (resp.length < 3) continue;
    const gaps = [];
    for (let i = 1; i < resp.length; i++) {
      const d = resp[i].t - resp[i - 1].t;
      if (d > 0 && d < 30) gaps.push(d * 1000);
    }
    if (!gaps.length) continue;
    const tonic = r.metrics && r.metrics.meanTonic != null ? r.metrics.meanTonic : 0;
    rows.push({ level: r.level, at: r.at, tonic, served: servedLatency(tonic), iri: median(gaps), n: resp.length });
  }
  return rows;
}

/**
 * Responding that lands in the window immediately before a reinforcer, relative to the
 * session's own overall rate. A value above 1 means responding bunched into that window.
 *
 * @param {Array} events one session's event log
 * @param {number} [window] seconds before each delivery that count as anticipatory
 */
export function anticipation(events, window = 1) {
  const resp = responses(events || []);
  const deliveries = (events || []).filter((e) => e.type === 'delivery');
  if (resp.length < 5 || deliveries.length < 3) return null;
  const times = deliveries.map((d) => d.t);
  let inWindow = 0;
  for (const p of resp) {
    for (const d of times) {
      if (d - p.t > 0 && d - p.t <= window) { inWindow++; break; }
    }
  }
  const span = Math.max(...events.map((e) => e.t)) - Math.min(...events.map((e) => e.t));
  if (span <= 0) return null;
  const rateInWindow = inWindow / (deliveries.length * window);
  const rateOverall = resp.length / span;
  return { rateInWindow, rateOverall, ratio: rateOverall ? rateInWindow / rateOverall : 0, sessions: 1 };
}

/**
 * The anticipation measure averaged over the sessions before the faint cue first
 * sounded and over the sessions from that point on.
 *
 * @returns {{before:number|null, after:number|null, nBefore:number, nAfter:number}}
 */
export function anticipationSplit(record, firstCueAt) {
  const before = [], after = [];
  for (const r of record) {
    const a = anticipation(r.events);
    if (!a) continue;
    (firstCueAt && r.at >= firstCueAt ? after : before).push(a.ratio);
  }
  return {
    before: before.length ? mean(before) : null,
    after: after.length ? mean(after) : null,
    nBefore: before.length,
    nAfter: after.length,
  };
}

/**
 * The ratio level's blocks. Accepts a `blocks` array, per-schedule sub-objects, or a
 * single flat schedule block, and returns fixed-ratio and variable-ratio halves.
 *
 * @returns {{fixed:Array, variable:Array}|null}
 */
export function ratioBlocks(metrics) {
  if (!metrics) return null;
  let blocks = null;
  if (Array.isArray(metrics.blocks) && metrics.blocks.some((b) => b && b.kind)) {
    blocks = metrics.blocks;
  } else {
    const named = [];
    for (const [key, value] of Object.entries(metrics)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const m = /^(fr|vr)(\d*)$/i.exec(key);
      if (m) named.push({ kind: m[1].toUpperCase(), n: value.n != null ? value.n : Number(m[2]) || null, ...value });
    }
    if (named.length) blocks = named;
    else if (metrics.runRate != null) {
      blocks = [{ kind: metrics.variable ? 'VR' : metrics.kind, n: metrics.ratio, runRate: metrics.runRate, meanPause: metrics.meanPause }];
    }
  }
  if (!blocks) return null;
  const fixed = blocks.filter((b) => String(b.kind).toUpperCase() === 'FR');
  const variable = blocks.filter((b) => String(b.kind).toUpperCase() === 'VR' || b.variable);
  return fixed.length || variable.length ? { fixed, variable } : null;
}

/**
 * The effort-choice level's two halves. Accepts `baseline`/`haloperidol` sub-objects,
 * flat `baselineBarrierFraction`/`haloperidolBarrierFraction`, or blocks tagged with a
 * `haloperidol` flag.
 *
 * @returns {{base:number, halo:number}|null}
 */
export function choiceHalves(metrics) {
  if (!metrics) return null;
  const obj = (v) => v && typeof v === 'object' && v.barrierFraction != null;
  if (obj(metrics.baseline) && obj(metrics.haloperidol)) {
    return { base: metrics.baseline.barrierFraction, halo: metrics.haloperidol.barrierFraction };
  }
  if (metrics.baselineBarrierFraction != null && metrics.haloperidolBarrierFraction != null) {
    return { base: metrics.baselineBarrierFraction, halo: metrics.haloperidolBarrierFraction };
  }
  if (Array.isArray(metrics.blocks)) {
    const tagged = metrics.blocks.filter((b) => b && b.haloperidol !== undefined && b.barrierFraction != null);
    const off = tagged.filter((b) => !b.haloperidol);
    const on = tagged.filter((b) => b.haloperidol);
    if (off.length && on.length) {
      return { base: mean(off.map((b) => b.barrierFraction)), halo: mean(on.map((b) => b.barrierFraction)) };
    }
  }
  return null;
}

/**
 * Sign- or goal-tracking, from the Pavlovian level's own classification when it made
 * one, and otherwise from where the subject actually went across every recorded session.
 *
 * @returns {{label:string, basis:string, speaker:number, tray:number}|null}
 */
export function tracking(metrics, record) {
  if (metrics && metrics.phenotype) {
    return {
      label: String(metrics.phenotype),
      basis: 'the Pavlovian session',
      speaker: (metrics.approachCounts || {}).speaker || 0,
      tray: (metrics.approachCounts || {}).tray || 0,
    };
  }
  let speaker = 0, tray = 0;
  for (const r of record) {
    for (const e of r.events || []) {
      if (e.type !== 'approach') continue;
      if (e.target === 'speaker' || e.target === 'light') speaker++;
      else if (e.target === 'tray' || e.target === 'trayBarrier' || e.target === 'trayFlat') tray++;
    }
  }
  if (!speaker && !tray) return null;
  const label = speaker > tray * 1.2 ? 'sign-tracker' : tray > speaker * 1.2 ? 'goal-tracker' : 'intermediate';
  return { label, basis: 'every approach you made across the study', speaker, tray };
}

/**
 * High or low responder, from the roll the save carries when a level made one, and
 * otherwise from the player's own vigor across every session they finished.
 *
 * @returns {{label:string, basis:string, tonic:number, breakpoint:number|null}}
 */
export function responder(player, completed) {
  const tonics = Object.values(completed)
    .map((c) => (c.metrics || {}).meanTonic)
    .filter((v) => typeof v === 'number');
  const tonic = mean(tonics);
  const pr = (completed.d06 || {}).metrics;
  const breakpoint = pr && pr.breakpoint != null ? pr.breakpoint : null;
  // `player.phenotype` is where the Pavlovian level writes the tracking verdict; only a
  // rolled responder phenotype belongs in this sentence.
  if (player && /responder/i.test(String(player.phenotype || ''))) {
    return { label: String(player.phenotype), basis: 'the phenotype rolled for your rat', tonic, breakpoint };
  }
  if (!tonics.length) return { label: 'unclassified', basis: 'nothing to classify yet', tonic: 0, breakpoint };
  return {
    label: tonic >= 0.55 ? 'high responder' : 'low responder',
    basis: 'your own mean reward-rate estimate across every session',
    tonic,
    breakpoint,
  };
}
