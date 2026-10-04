/**
 * The debrief figure and the history card for magazine training. Imported by
 * `day/00-magazine.html` before the shell mounts, because the shell reads the
 * trivia map at mount time.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';

/** Where the idealized shaping curve starts and where it settles, in seconds. */
const SHAPING = { start: 4.7, floor: 0.8, tau: 3.5 };

/** The idealized latency for the nth delivery, counting from one. */
function shapingCurve(n) {
  return SHAPING.floor + (SHAPING.start - SHAPING.floor) * Math.exp(-(n - 1) / SHAPING.tau);
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

/**
 * Which of the three collection patterns the record shows.
 *
 * @param {number[]} lat latency to each collection, in seconds
 * @returns {'shaped'|'variable'|'slow'}
 */
function band(lat) {
  if (lat.length < 4) return 'slow';
  const third = Math.max(1, Math.round(lat.length / 3));
  const last = mean(lat.slice(-third));
  if (last < 1.5) return 'shaped';
  const half = lat.slice(Math.floor(lat.length / 2));
  if (Math.max(...half) - Math.min(...half) > 2) return 'variable';
  return 'slow';
}

REFERENCES.d00 = {
  title: 'Fig. 1 — Subject #23, magazine training',
  subtitle: 'latency from dispenser click to collection, by delivery',
  caption: 'Collection latency for Subject #23 (solid) against an idealized shaping curve '
    + '(dashed), which decays toward a sub-second asymptote as the dispenser click acquires '
    + 'conditioned value. The guide line marks one second.',
  citation: 'Idealized curve after the magazine-training procedure in Skinner, B. F. (1938), '
    + 'The Behavior of Organisms.',
  axis: { x: 'delivery →', y: 'seconds →' },

  draw(ctx, box, ink, { metrics }) {
    const lat = metrics.approachLatencies || [];
    const n = Math.max(lat.length, 12);
    const yMax = Math.min(12, Math.max(5, Math.ceil(Math.max(SHAPING.start, ...lat, 0) * 1.15)));
    const X = (i) => box.x + (box.w * i) / Math.max(1, n - 1);
    const Y = (v) => box.y + box.h - (box.h * Math.min(v, yMax)) / yMax;

    // grid: one horizontal rule per second. The topmost numbers are left off, because
    // the rotated axis title runs down that part of the margin.
    const scale = box.w / 550;
    const titleFoot = box.y + 62 * scale;
    ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
    ctx.font = `9px ${ink.fontData}`;
    for (let v = 0; v <= yMax; v += yMax > 6 ? 2 : 1) {
      ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + box.w, Y(v)); ctx.stroke();
      if (Y(v) > titleFoot) {
        ctx.fillStyle = ink.mut;
        ctx.fillText(String(v), box.x - 16, Y(v) + 3);
      }
    }

    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y); ctx.lineTo(box.x, box.y + box.h); ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();

    // the one-second guide, the line a trained subject drops under
    ctx.save();
    ctx.strokeStyle = ink.accent; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(box.x, Y(1)); ctx.lineTo(box.x + box.w, Y(1)); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = ink.accent;
    ctx.font = `9px ${ink.fontData}`;
    ctx.fillText('1 s', box.x + box.w - 20, Y(1) - 4);

    // the idealized shaping curve
    ctx.save();
    ctx.strokeStyle = ink.mut; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const y = Y(shapingCurve(i + 1));
      if (i === 0) ctx.moveTo(X(i), y); else ctx.lineTo(X(i), y);
    }
    ctx.stroke();
    ctx.restore();

    if (!lat.length) return;

    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.8;
    ctx.beginPath();
    lat.forEach((v, i) => { const y = Y(v); if (i === 0) ctx.moveTo(X(i), y); else ctx.lineTo(X(i), y); });
    ctx.stroke();
    ctx.fillStyle = ink.accent;
    lat.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(v), 2.6, 0, Math.PI * 2); ctx.fill();
    });

    // delivery numbers along the foot, stopping short of the axis title
    ctx.fillStyle = ink.mut;
    ctx.font = `9px ${ink.fontData}`;
    const lastLabel = box.x + box.w - 62 * scale;
    for (let i = 0; i < n; i += n > 12 ? 3 : 2) {
      if (X(i) < lastLabel) ctx.fillText(String(i + 1), X(i) - 3, box.y + box.h + 12);
    }
  },

  stats(metrics) {
    const lat = metrics.approachLatencies || [];
    return [
      [(metrics.firstLatency || 0).toFixed(2) + ' s', 'first collection'],
      [(metrics.lastLatency || 0).toFixed(2) + ' s', 'last collection'],
      [(metrics.meanApproachLatency || 0).toFixed(2) + ' s', 'mean latency'],
      [band(lat), 'pattern'],
    ];
  },

  interpret(metrics) {
    const lat = metrics.approachLatencies || [];
    const b = band(lat);
    const third = Math.max(1, Math.round(lat.length / 3));
    const early = mean(lat.slice(0, third)), late = mean(lat.slice(-third));
    const out = [];

    let first = `Twelve pellets arrived on a variable-time schedule, on average one every twenty `
      + `seconds, and nothing you did changed when. The only thing being measured was how long `
      + `you took to reach the hopper once the dispenser fired: <b>${early.toFixed(2)} s</b> across `
      + `your first four deliveries, <b>${late.toFixed(2)} s</b> across your last four. `;
    if (b === 'shaped' && early - late < 0.4) {
      first += 'You were at the hopper from the first delivery, so there was nothing left to shape: '
        + 'the curve is flat because it started where a trained animal ends. The dashed line is what '
        + 'a subject looks like on the way down to where you began.';
    } else if (b === 'shaped') {
      first += 'That is the shaping curve. You stopped waiting for the pellet and started moving on '
        + 'the sound, which means the click had become worth something on its own.';
    } else if (b === 'variable') {
      first += 'You got quick and then drifted, so the record swings. A subject that leaves the '
        + 'hopper between deliveries pays for it in latency every time, which is why trained '
        + 'animals settle into the corner and stay there.';
    } else {
      first += 'You collected, but you never sped up. Every pellet was found rather than '
        + 'anticipated, and the click stayed decoration.';
    }
    out.push(first);

    const bm = metrics.burstMigration;
    if (bm && bm.pelletEarly > 0.02) {
      const shrink = Math.round(bm.shrink * 100);
      out.push('Underneath, the model was doing the same thing to itself. The prediction error at '
        + `the pellet started at <b>${bm.pelletEarly.toFixed(2)}</b> and ended at `
        + `<b>${bm.pelletLate.toFixed(2)}</b>, a drop of about ${shrink}%, while the error at the `
        + `dispenser click rose from ${bm.cueEarly.toFixed(2)} to <b>${bm.cueLate.toFixed(2)}</b>. `
        + 'Nothing about the pellet changed. It simply stopped being news, and the news moved to '
        + 'the thing that predicts it.');
    }

    out.push('This is the session every operant experiment starts with, and it is deliberately '
      + 'dull: it exists so the animal knows where food appears and what sound precedes it. '
      + 'Everything after this assumes both. <cite>Skinner, B. F. (1938). The Behavior of '
      + 'Organisms.</cite>');
    return out;
  },

  share(metrics) {
    const last = metrics.lastLatency || 0;
    if (last < 1) return `By the last pellet I was at the hopper in ${last.toFixed(2)} s.`;
    return `Magazine training done: ${last.toFixed(2)} s from click to pellet on the last delivery.`;
  },
};

TRIVIA.d00 = {
  title: 'The day Skinner shaped something by hand',
  body: 'The method of successive approximation is laid out in chapter 8 of <i>The Behavior of '
    + 'Organisms</i> (1938), and yet Skinner did not actually shape a response by hand until 1943, '
    + 'on the top floor of a flour mill in Minneapolis, where he was working on a wartime project. '
    + 'Reinforcing closer and closer approximations <b>in person</b>, rather than through a '
    + 'machine, appears to have been a genuine surprise to him. He coined the word <b>shaping</b> '
    + 'for it afterwards, and the experience pushed his attention from the apparatus toward the '
    + 'social side of reinforcement. The dispenser you just listened for is the machine half of '
    + 'that story.',
  source: 'Peterson, G. B. (2004). A day of great illumination: B. F. Skinner\'s discovery of '
    + 'shaping. Journal of the Experimental Analysis of Behavior, 82(3), 317–328.',
};
