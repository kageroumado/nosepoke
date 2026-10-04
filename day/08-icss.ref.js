/**
 * The day-8 debrief figure and trivia card, registered additively into the shared
 * runtime. Importing this module is what teaches `figure.js` and `shell.js` about d08.
 */

import { REFERENCES } from '../shared/figure.js';
import { drawCumulativeRecord } from '../shared/rig.js';
import { TRIVIA } from '../shared/shell.js';
import { DURATION, pressesPerMinute, satietyAt } from './08-icss.session.js';

/** Rate is called steady when the last minute lands within this fraction of the first. */
const STEADY = 0.2;

/**
 * The figure's own scale factor. `renderFigure` sizes the box from the canvas width, so
 * text and rules can be recovered from the box and stay legible in the 1600 px export.
 */
function scaleOf(box) { return Math.max(0.6, box.w / 550); }

/** A rotated axis label centered down the left edge of a panel. */
function sideLabel(ctx, text, panel, s) {
  ctx.save();
  ctx.translate(panel.x - 8 * s, panel.y + panel.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** First and last whole-minute press counts, and the ratio between them. */
function rateShape(metrics, sim) {
  const perMin = pressesPerMinute(sim.S.events, Math.max(sim.S.t, DURATION));
  const first = perMin[0] || 0;
  const last = perMin[perMin.length - 1] || 0;
  return { perMin, first, last, ratio: first > 0 ? last / first : 0 };
}

/** `steady`, `climbing`, `falling`, or `sparse` when there is too little to judge. */
function pattern(metrics, sim) {
  const { first, ratio } = rateShape(metrics, sim);
  if (metrics.presses < 20 || first < 4) return 'sparse';
  if (ratio > 1 + STEADY) return 'climbing';
  if (ratio < 1 - STEADY) return 'falling';
  return 'steady';
}

REFERENCES.d08 = {
  title: 'Fig. 1 — Subject #23, intracranial self-stimulation',
  subtitle: 'cumulative presses, and the vitals underneath',
  caption: 'Above: cumulative presses (solid) against the first minute’s rate carried '
    + 'forward (dashed). Below: satiety, with a mark for every reinforcer eaten.',
  citation: 'Rate after Olds & Milner (1954), J. Comp. Physiol. Psychol. 47, 419.',

  draw(ctx, box, ink, { sim, metrics }) {
    const S = sim.S;
    const s = scaleOf(box);
    const tEnd = Math.max(S.t, DURATION);
    const gap = Math.max(20 * s, box.h * 0.09);
    const A = { x: box.x, y: box.y, w: box.w, h: box.h * 0.7 };
    const B = { x: box.x, y: box.y + A.h + gap, w: box.w, h: box.h - A.h - gap };

    // --- panel A: the record -------------------------------------------------
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(A.x, A.y + A.h);
    ctx.lineTo(A.x + A.w, A.y + A.h);
    ctx.stroke();

    const resp = S.events.filter((e) => e.type === 'press' || e.type === 'poke');
    const total = Math.max(resp.length, 10);
    const X = (t) => A.x + (t / tEnd) * A.w;
    const Y = (n) => A.y + A.h - (Math.min(n, total) / total) * A.h;

    // The first minute's rate carried across the whole session. A record that hugs it
    // is a rate that never fell off.
    const { first } = rateShape(metrics, sim);
    const perSec = first / 60;
    ctx.save();
    ctx.strokeStyle = ink.mut;
    ctx.lineWidth = 1.1 * s;
    ctx.setLineDash([5 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    const tCap = perSec > 0 ? Math.min(tEnd, total / perSec) : tEnd;
    ctx.lineTo(X(tCap), Y(perSec * tCap));
    ctx.stroke();
    ctx.restore();

    drawCumulativeRecord(ctx, A, S.events, tEnd, {
      ink: ink.ink, pip: ink.accent, lineWidth: 1.6 * s, scaleTo: total,
    });

    ctx.fillStyle = ink.mut;
    ctx.font = `${10 * s}px ${ink.fontData}`;
    sideLabel(ctx, 'cumulative presses', A, s);
    ctx.fillText(`${Math.round(total)} presses full scale`, A.x + 8 * s, A.y + 12 * s);

    // --- panel B: the vitals -------------------------------------------------
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(B.x, B.y + B.h);
    ctx.lineTo(B.x + B.w, B.y + B.h);
    ctx.stroke();

    const gain = sim.cfg.satietyGain;
    ctx.strokeStyle = ink.accent;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * tEnd;
      const x = B.x + (t / tEnd) * B.w;
      const y = B.y + B.h - satietyAt(S.events, t, gain) * B.h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = ink.mut;
    for (const e of S.events) {
      if (e.type !== 'consume') continue;
      const x = B.x + (e.t / tEnd) * B.w;
      ctx.beginPath();
      ctx.arc(x, B.y + B.h - satietyAt(S.events, e.t, gain) * B.h, 2.6 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = ink.mut;
    ctx.font = `${10 * s}px ${ink.fontData}`;
    sideLabel(ctx, 'satiety', B, s);
    ctx.fillText('time →', B.x + B.w - 40 * s, B.y + B.h + 14 * s);
    const eaten = S.events.filter((e) => e.type === 'consume').length;
    ctx.fillStyle = ink.ink;
    ctx.font = `${10.5 * s}px ${ink.fontData}`;
    const label = `reinforcers eaten: ${eaten}`;
    ctx.fillText(label, B.x + B.w - ctx.measureText(label).width - 8 * s, B.y + 12 * s);
  },

  stats(metrics, sim) {
    const { first, last } = rateShape(metrics, sim);
    const drift = Math.round((metrics.satietyEnd - metrics.satietyStart) * 100);
    return [
      [metrics.presses, 'presses'],
      [metrics.pressesPerMin.toFixed(0), 'presses per minute'],
      [`${first} → ${last}`, 'first minute → last'],
      [`${drift > 0 ? '+' : ''}${drift}`, 'satiety, points moved'],
    ];
  },

  interpret(metrics, sim) {
    const p = pattern(metrics, sim);
    const { first, last, ratio } = rateShape(metrics, sim);
    const out = [];

    let lede = `The circuit closed ${metrics.presses} times`
      + ' and every closure delivered the same current. Nothing signaled it, so nothing could '
      + `predict it: the trace you were watching never learned to go quiet the way it did on the `
      + `pellet levels. `;
    if (p === 'steady') {
      lede += `You pressed ${first} times in the first minute and ${last} in the last, a change of `
        + `<b>${Math.round(Math.abs(ratio - 1) * 100)}%</b>. That is the shape Olds and Milner `
        + 'described in 1954: responding that holds its rate for as long as the lever is there '
        + '<cite>(Olds &amp; Milner 1954)</cite>.';
    } else if (p === 'climbing') {
      lede += `You went from ${first} presses in the first minute to ${last} in the last. The rate `
        + 'climbed rather than settled, which is what the first minutes of a new placement look '
        + 'like before the animal finds its tempo.';
    } else if (p === 'falling') {
      lede += `You went from ${first} presses in the first minute to ${last} in the last. Your own `
        + 'arm gave out before the schedule did; the session still ended on the timer.';
    } else {
      lede += 'You tried the lever a handful of times and stopped. The session ended on the timer '
        + 'anyway, which is the only thing that ever ends this one.';
    }
    out.push(lede);

    const eaten = metrics.likingEvents;
    if (eaten === 0) {
      out.push('The tray was full from the first second and you never went near it. Satiety moved '
        + `<b>${Math.round((metrics.satietyEnd - metrics.satietyStart) * 100)} points</b>, all of it `
        + 'downward, because nothing was eaten. A food session ends when the animal is full. This '
        + 'one has no such ending: there is no full.');
    } else {
      out.push(`You did go and eat, ${eaten} ${eaten === 1 ? 'time' : 'times'}. Listen back and the `
        + 'crunch was exactly the size it has been since session zero. It does not grow, it does '
        + 'not fade, and it has no relationship at all to the trace on the right.');
    }

    out.push('That gap is the point of the level. The stimulation drove <b>wanting</b>: the '
      + 'pressing, the rate, the whole green train on the dopamine strip. It drove no '
      + '<b>liking</b> whatsoever, because there was nothing to like. The two are separable '
      + 'systems, and this is the cleanest way anyone has found to pull them apart '
      + '<cite>(Berridge &amp; Robinson 1998)</cite>.');

    if (eaten === 0 && metrics.presses >= 20) {
      out.push('Rats given one hour a day with a food lever and a hypothalamic stimulation lever '
        + 'take the stimulation and lose weight doing it <cite>(Routtenberg &amp; Lindy 1965)</cite>. '
        + 'It is not that the food stopped being good. It stopped being asked for.');
    }
    return out;
  },

  share(metrics) {
    const rate = Math.round(metrics.pressesPerMin || 0);
    if (metrics.likingEvents === 0) {
      return `${metrics.presses} presses for a current, ${rate} a minute, and I never touched the food.`;
    }
    return `${metrics.presses} presses for a current at ${rate} a minute, with the tray right there.`;
  },
};

TRIVIA.d08 = {
  title: 'The electrode that missed',
  body: 'In 1953 James Olds was a postdoc in Peter Milner’s lab at McGill, aiming an electrode '
    + 'at the reticular formation of a rat to see whether stimulating it would make the animal '
    + 'avoid the place where it happened. The rat did the opposite: it kept coming back to that '
    + 'corner of the table. By Olds’s own later account the electrode had gone in <b>bent and '
    + 'off target</b>, landing near the septal area instead. The lever came afterward, built to '
    + 'ask the animal how much it wanted the thing it had already voted for with its feet. The '
    + 'reward system was found by a placement error and a researcher who noticed.',
  source: 'Olds, J. & Milner, P. (1954). Positive reinforcement produced by electrical stimulation '
    + 'of septal area and other regions of rat brain. Journal of Comparative and Physiological '
    + 'Psychology, 47(6), 419-427.',
};
