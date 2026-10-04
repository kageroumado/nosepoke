/**
 * Debrief figure and history card for the mess hall.
 *
 * Registers itself into the shared registries at import time, so the page imports
 * this module before it renders anything and touches nothing under `shared/`.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';

/** Trials to average over when turning single approaches into a probability. */
const WINDOW = 4;

/**
 * Anticipatory approach, trial by trial: did the subject reach the bin while the
 * squeak was still playing, before anything had landed there?
 *
 * @param {object} sim the finished session
 * @returns {{trials: Array<{n:number, cue:number, latency:number|null}>, anticipated:number,
 *            firstAnticipated:number, meanLatency:number, lateRate:number, earlyRate:number}}
 */
export function approachRecord(sim) {
  const trials = [];
  let cur = null;
  for (const e of sim.S.events) {
    if (e.type === 'cue' && e.name === 'tone') {
      cur = { n: trials.length + 1, cue: e.t, closed: false, latency: null };
      trials.push(cur);
      continue;
    }
    if (!cur || cur.closed) continue;
    if (e.type === 'delivery' || e.type === 'omission') { cur.closed = true; continue; }
    if (e.type === 'approach' && (e.target === 'bin' || e.target === 'crumbs') && cur.latency == null) {
      cur.latency = e.t - cur.cue;
    }
  }
  const hit = trials.filter((t) => t.latency != null);
  const half = Math.max(1, Math.floor(trials.length / 3));
  const early = trials.slice(0, half);
  const late = trials.slice(-half);
  return {
    trials,
    anticipated: hit.length,
    firstAnticipated: hit.length ? hit[0].n : 0,
    meanLatency: hit.length ? hit.reduce((a, b) => a + b.latency, 0) / hit.length : 0,
    earlyRate: early.length ? early.filter((t) => t.latency != null).length / early.length : 0,
    lateRate: late.length ? late.filter((t) => t.latency != null).length / late.length : 0,
  };
}

/** Running fraction of the last `WINDOW` trials that carried an anticipatory approach. */
function runningRate(trials) {
  return trials.map((_, i) => {
    const w = trials.slice(Math.max(0, i - WINDOW + 1), i + 1);
    return w.filter((t) => t.latency != null).length / w.length;
  });
}

REFERENCES.n01 = {
  title: 'Fig. N1 — the mess hall, colony subject 23',
  subtitle: 'approach to the bin during the squeak, by trial',
  caption: 'Anticipatory approach across squeaks (solid) against an idealized conditioned-approach '
    + 'acquisition curve (dashed). Ticks along the top mark the trials you moved before the crumbs landed.',
  citation: 'Idealized acquisition after Brown, P. L. & Jenkins, H. M. (1968), J. Exp. Anal. Behav. 11, 1-8.',
  axis: { x: 'squeak →', y: 'P(approach) →' },

  draw(ctx, box, ink, { sim }) {
    const rec = approachRecord(sim);
    const trials = rec.trials;
    const n = Math.max(trials.length, 8);
    const rasterH = 16;
    const plot = { x: box.x, y: box.y + rasterH + 8, w: box.w, h: box.h - rasterH - 8 };

    const X = (i) => plot.x + ((i + 0.5) / n) * plot.w;
    const Y = (p) => plot.y + plot.h - p * plot.h;

    // The raster: one tick per squeak, filled when the subject moved in time.
    ctx.lineWidth = 1.4;
    for (let i = 0; i < trials.length; i++) {
      const anticipated = trials[i].latency != null;
      ctx.strokeStyle = anticipated ? ink.accent : ink.grid;
      ctx.beginPath();
      ctx.moveTo(X(i), box.y + 2);
      ctx.lineTo(X(i), box.y + rasterH - 2);
      ctx.stroke();
    }

    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();

    ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
    for (const p of [0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(plot.x, Y(p)); ctx.lineTo(plot.x + plot.w, Y(p));
      ctx.stroke();
    }
    ctx.fillStyle = ink.mut;
    ctx.font = `9px ${ink.fontData}`;
    ctx.fillText('1.0', plot.x + plot.w - 20, Y(1) - 4);
    ctx.fillText('0.5', plot.x + plot.w - 20, Y(0.5) - 4);

    // The idealized curve: conditioned approach rises as a negatively accelerated
    // function of trials, flattening near the asymptote.
    ctx.strokeStyle = ink.mut; ctx.lineWidth = 1.1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = 0.9 * (1 - Math.exp(-(i + 1) / (n * 0.32)));
      i === 0 ? ctx.moveTo(X(i), Y(p)) : ctx.lineTo(X(i), Y(p));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (!trials.length) return;
    const rate = runningRate(trials);
    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.8;
    ctx.beginPath();
    rate.forEach((p, i) => (i === 0 ? ctx.moveTo(X(i), Y(p)) : ctx.lineTo(X(i), Y(p))));
    ctx.stroke();

    ctx.fillStyle = ink.accent;
    trials.forEach((t, i) => {
      if (t.latency == null) return;
      ctx.beginPath(); ctx.arc(X(i), Y(rate[i]), 2.4, 0, Math.PI * 2); ctx.fill();
    });
  },

  stats(metrics, sim) {
    const rec = approachRecord(sim);
    return [
      [`${rec.anticipated}/${rec.trials.length}`, 'squeaks answered early'],
      [rec.firstAnticipated || '—', 'first anticipated squeak'],
      [rec.meanLatency ? rec.meanLatency.toFixed(2) + ' s' : '—', 'squeak to bin'],
      [metrics.consumed, 'crumbs carried'],
    ];
  },

  interpret(metrics, sim) {
    const rec = approachRecord(sim);
    const out = [];
    const late = Math.round(rec.lateRate * 100);
    const early = Math.round(rec.earlyRate * 100);

    if (rec.lateRate >= 0.6) {
      out.push(`By the end of the run you were at the bin on <b>${late}%</b> of squeaks, before a single `
        + 'crumb had landed. Nothing told you the crumbs were coming except a sound that used to mean '
        + 'nothing at all. That is the entire content of Pavlovian conditioning: a stimulus that predicts '
        + 'a reward starts to pull the behavior the reward used to pull.');
    } else if (rec.lateRate >= 0.25) {
      out.push(`You answered <b>${late}%</b> of the late squeaks, up from ${early}% at the start. The `
        + 'association is forming and has not finished. Real acquisition curves look exactly like this in '
        + 'the middle: a rising, ragged thing, not a switch.');
    } else {
      out.push('You mostly collected after the fact, arriving once the crumbs were already down. That is '
        + 'a perfectly good way to eat and it is not conditioning: the squeak never got to do any work. '
        + 'Rats that sit out the cue and clean up afterwards exist, and they are outcompeted by the ones '
        + 'that move on the sound.');
    }

    out.push('The dashed line is the shape this always takes: fast at first, then flattening. The reward '
      + 'is only surprising while it is unpredicted, so learning slows exactly as the prediction gets good '
      + '<cite>(the same error term the trace on the left was drawing all night)</cite>.');

    const bm = metrics.burstMigration;
    if (bm && bm.cueLate > bm.cueEarly + 0.01) {
      out.push(`Look at where the burst went. At the crumbs it fell from ${bm.pelletEarly.toFixed(2)} to `
        + `${bm.pelletLate.toFixed(2)}, while at the squeak it rose from ${bm.cueEarly.toFixed(2)} to `
        + `${bm.cueLate.toFixed(2)}. The dopamine response did not follow the food. It followed the `
        + '<b>earliest reliable predictor</b> of the food, which is now a cart wheel that needs oiling '
        + '<cite>(Schultz, Dayan &amp; Montague 1997)</cite>.');
    }

    out.push('Whether an animal runs to the cue or to the place the food appears splits rats into '
      + 'sign-trackers and goal-trackers, and the split predicts a good deal about them later '
      + '<cite>(Flagel, Watson, Robinson &amp; Akil 2007)</cite>. Tonight the colony only cared that '
      + 'somebody was standing at the bin when the crumbs came down.');
    return out;
  },

  share(metrics) {
    const n = metrics.anticipatedSqueaks != null ? metrics.anticipatedSqueaks : 0;
    const t = metrics.squeaks != null ? metrics.squeaks : 0;
    return `I learned the janitor's cart in ${t} squeaks and answered ${n} of them early.`;
  },
};

TRIVIA.n01 = {
  title: 'Where "rat race" comes from',
  body: 'Not from a laboratory. The phrase is American and turns up in the 1930s, and its earliest '
    + 'recorded senses have nothing to do with animals: in aviation slang a <b>rat race</b> was a '
    + 'follow-the-leader chase flown between aircraft. The meaning everyone uses now, a competition '
    + 'nobody wins and nobody can leave, arrived later and by analogy. No rat in a running wheel was '
    + 'involved, and no rat has ever raced anything. What the animals in this building are on is a '
    + '<b>schedule</b>, which is a different arrangement and a worse one.',
  source: 'Oxford English Dictionary, "rat race, n."',
};
