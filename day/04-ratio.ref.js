/**
 * Ratio schedules: the debrief figure, the trivia card, and the pause measurement the
 * page, the harness, and the epilogue all read.
 *
 * Importing this module registers `REFERENCES.d04` and `TRIVIA.d04`.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { drawCumulativeRecord } from '../shared/rig.js';

/** The three blocks, in order. Each runs as its own session on its own subject clock. */
export const BLOCKS = [
  { id: 'fr1', kind: 'FR', n: 1, label: 'FR 1', title: 'Block 1 — fixed ratio 1' },
  { id: 'fr5', kind: 'FR', n: 5, label: 'FR 5', title: 'Block 2 — fixed ratio 5' },
  { id: 'vr5', kind: 'VR', n: 5, label: 'VR 5', title: 'Block 3 — variable ratio 5' },
];

/** Sized so five minutes of hand play move the meter without filling the subject. */
export const SATIETY_GAIN = 0.01;

/**
 * Every post-reinforcement pause in a block: the delivery, and how long the subject
 * waited before touching the lever again. The schedule's `meanPause` is the average of
 * the second column, so the figure and the metric cannot disagree.
 *
 * @param {Array} events a sim event log
 * @returns {Array<[number, number]>} `[time of the delivery, seconds of pause]`
 */
export function pauseIntervals(events) {
  const out = [];
  let paid = null;
  for (const e of events) {
    if (e.type === 'delivery') { if (paid == null) paid = e.t; }
    else if ((e.type === 'press' || e.type === 'poke') && paid != null) { out.push([paid, e.t - paid]); paid = null; }
  }
  return out;
}

/**
 * The average pause after a pellet in one block.
 *
 * @param {object} block `{ metrics }` from a finished session
 * @returns {number} seconds
 */
export function blockPause(block) {
  return block && block.metrics ? block.metrics.meanPause || 0 : 0;
}

/** How many times longer the subject waited after a pellet on FR 5 than on VR 5. */
export function pauseRatio(blocks) {
  const fr = blocks.find((b) => b.id === 'fr5');
  const vr = blocks.find((b) => b.id === 'vr5');
  if (!fr || !vr) return 0;
  const v = blockPause(vr);
  return v > 1e-6 ? blockPause(fr) / v : 0;
}

/** The result band the interpretation and the caption branch on. */
export function pauseBand(ratio) {
  if (ratio >= 2) return 'textbook';
  if (ratio >= 1.2) return 'blunted';
  if (ratio >= 0.8) return 'flat';
  return 'reversed';
}

/** Panel A: the three records on shared axes, with every pause under them to scale. */
function drawRecords(ctx, box, ink, blocks, s) {
  const laneH = 40 * s;
  const laneGap = 24 * s;
  const plot = { x: box.x, y: box.y, w: box.w, h: box.h - laneH - laneGap };
  const tEnd = Math.max(...blocks.map((b) => b.t), 1);
  const top = Math.max(...blocks.map((b) => b.metrics.responses), 10);

  ctx.fillStyle = ink.mut;
  ctx.font = `${10 * s}px ${ink.fontData}`;
  ctx.fillText('your session — cumulative responses', box.x, box.y - 8 * s);

  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();

  const styles = [
    { ink: ink.mut, pip: ink.mut, lineWidth: 1.1 },
    { ink: ink.ink, pip: ink.ink, lineWidth: 1.7 },
    { ink: ink.accent, pip: ink.accent, lineWidth: 1.7 },
  ];
  blocks.forEach((b, i) => {
    drawCumulativeRecord(ctx, plot, b.events, tEnd, { ...styles[i], scaleTo: top });
  });

  // Every pause, on the same time axis, drawn to a shared duration scale: this is
  // where a fixed ratio and a variable one stop looking alike.
  const X = (t) => plot.x + (t / tEnd) * plot.w;
  const pauses = blocks.map((b) => pauseIntervals(b.events));
  const longest = Math.max(1, ...pauses.flat().map(([, d]) => d));
  const laneY = plot.y + plot.h + laneGap;

  ctx.fillStyle = ink.mut;
  ctx.font = `${9 * s}px ${ink.fontData}`;
  ctx.fillText('pause after each pellet', plot.x, laneY - 8 * s);
  ctx.fillText(longest.toFixed(0) + ' s', plot.x + plot.w + 4 * s, laneY + 8 * s);
  ctx.fillText('0', plot.x + plot.w + 4 * s, laneY + laneH);

  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(plot.x, laneY);
  ctx.lineTo(plot.x, laneY + laneH);
  ctx.lineTo(plot.x + plot.w, laneY + laneH);
  ctx.stroke();

  pauses.forEach((list, i) => {
    ctx.fillStyle = styles[i].ink;
    for (const [t, d] of list) {
      const h = (d / longest) * laneH;
      ctx.fillRect(X(t) - 1 * s, laneY + laneH - h, Math.max(1.4, 2.2 * s), h);
    }
  });

  // The legend doubles for both halves: same color, same block, in each.
  ctx.font = `${9.5 * s}px ${ink.fontData}`;
  blocks.forEach((b, i) => {
    const y = plot.y + 12 * s + i * 13 * s;
    ctx.fillStyle = styles[i].ink;
    ctx.fillRect(plot.x + 8 * s, y - 5 * s, 14 * s, 2.2 * s);
    ctx.fillText(b.label, plot.x + 28 * s, y);
  });
}

/** Panel B: what the two records look like in Ferster & Skinner, drawn as ideals. */
function drawSchematic(ctx, box, ink, s) {
  ctx.fillStyle = ink.mut;
  ctx.font = `${10 * s}px ${ink.fontData}`;
  ctx.fillText('Ferster & Skinner 1957', box.x, box.y - 8 * s);

  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();

  // Fixed ratio: a flat pause after every reinforcer, then a straight run.
  const fr = [];
  let t = 0;
  const step = 1 / 14;
  while (t < 1) {
    t += 0.075;                                    // the pause
    for (let i = 0; i < 5 && t < 1; i++) { t += step * 0.42; fr.push({ t, type: 'press' }); }
    if (t < 1) fr.push({ t, type: 'delivery' });
  }
  // Variable ratio: one steady line, reinforcers scattered along it.
  const vr = [];
  t = 0;
  let k = 0;
  while (t < 1) {
    t += step * 0.5;
    vr.push({ t, type: 'press' });
    if (++k % 5 === 0) vr.push({ t, type: 'delivery' });
  }
  const top = Math.max(fr.filter((e) => e.type === 'press').length, vr.filter((e) => e.type === 'press').length);
  drawCumulativeRecord(ctx, box, fr, 1, { ink: ink.ink, pip: ink.ink, lineWidth: 1.6, scaleTo: top });
  drawCumulativeRecord(ctx, box, vr, 1, { ink: ink.accent, pip: ink.accent, lineWidth: 1.6, scaleTo: top });

  ctx.font = `${9 * s}px ${ink.fontData}`;
  ctx.fillStyle = ink.ink;
  ctx.fillText('fixed ratio', box.x + box.w * 0.46, box.y + box.h * 0.78);
  ctx.fillStyle = ink.accent;
  ctx.fillText('variable ratio', box.x + box.w * 0.08, box.y + box.h * 0.2);
}

REFERENCES.d04 = {
  title: 'Fig. 4 — Subject #23, three ratio schedules',
  subtitle: 'cumulative responses vs. time, with the pause after each pellet',
  caption: 'Left: your three blocks, each on its own clock, pips at each pellet, and under '
    + 'them every pause between a pellet and the next response, to one scale. Right: the two '
    + 'record shapes as Ferster & Skinner drew them.',
  citation: 'Reference curves after Ferster & Skinner (1957), Schedules of Reinforcement.',

  draw(ctx, box, ink, { metrics }) {
    const s = box.w / 550;
    const blocks = metrics.blocks || [];
    if (!blocks.length || !blocks[0].events) return;
    const gap = 40 * s;
    const wA = (box.w - gap) * 0.62;
    const wB = box.w - gap - wA;
    const inner = { y: box.y + 16 * s, h: box.h - 24 * s };
    drawRecords(ctx, { x: box.x, y: inner.y, w: wA - 26 * s, h: inner.h }, ink, blocks, s);
    drawSchematic(ctx, { x: box.x + wA + gap, y: inner.y, w: wB, h: inner.h - 26 * s }, ink, s);
  },

  stats(metrics) {
    const blocks = metrics.blocks || [];
    const fr5 = blocks.find((b) => b.id === 'fr5');
    const vr5 = blocks.find((b) => b.id === 'vr5');
    if (!fr5 || !vr5) return [];
    const ratio = pauseRatio(blocks);
    return [
      [blockPause(fr5).toFixed(1) + ' s', 'pause after a pellet, FR 5'],
      [blockPause(vr5).toFixed(1) + ' s', 'pause after a pellet, VR 5'],
      [ratio.toFixed(1) + '×', 'longer on the fixed ratio'],
      [Math.round(vr5.metrics.responseRate), 'responses per minute, VR 5'],
    ];
  },

  interpret(metrics) {
    const blocks = metrics.blocks || [];
    const fr5 = blocks.find((b) => b.id === 'fr5');
    const vr5 = blocks.find((b) => b.id === 'vr5');
    if (!fr5 || !vr5) return [];
    const ratio = pauseRatio(blocks);
    const band = pauseBand(ratio);
    const out = [];

    let first = 'Both of the last two blocks paid one pellet for about five presses. The only '
      + 'difference was whether the count was the same every time. ';
    if (band === 'textbook') {
      first += `After a pellet on the fixed ratio you waited <b>${blockPause(fr5).toFixed(1)} s</b> `
        + `before pressing again, and on the variable ratio <b>${blockPause(vr5).toFixed(1)} s</b>, `
        + `which is <b>${ratio.toFixed(1)} times</b> shorter. That gap is the post-reinforcement pause, and it `
        + 'is the shape difference Ferster and Skinner used to tell the two schedules apart at a glance.';
    } else if (band === 'blunted') {
      first += `You paused <b>${blockPause(fr5).toFixed(1)} s</b> after a pellet on the fixed ratio `
        + `and <b>${blockPause(vr5).toFixed(1)} s</b> on the variable one. The difference is in the `
        + 'right direction and smaller than a trained animal shows, which is what a first exposure '
        + 'usually looks like: the pause grows over sessions as the requirement becomes predictable.';
    } else if (band === 'flat') {
      first += `Your pauses came out about equal, <b>${blockPause(fr5).toFixed(1)} s</b> against `
        + `<b>${blockPause(vr5).toFixed(1)} s</b>. You worked through both blocks at one pace, `
        + 'which pays the same pellets for more effort on the fixed ratio.';
    } else {
      first += `You paused longer on the variable ratio, <b>${blockPause(vr5).toFixed(1)} s</b> `
        + `against <b>${blockPause(fr5).toFixed(1)} s</b> on the fixed one. That is the reverse `
        + 'of the standard finding, and it usually means the fixed count was never counted: the pause '
        + 'appears only once the requirement is predictable enough to be worth waiting out.';
    }
    out.push(first);

    out.push('The pause is not fatigue. It sits exactly where the next pellet is furthest away and '
      + 'nowhere else, and on the fixed ratio the subject knows where that is: the moment a pellet '
      + 'lands, five more presses stand between it and the next one. On the variable ratio the next '
      + 'press might be the one that pays, so there is never a moment when waiting is cheap.');

    const rateGain = fr5.metrics.responseRate > 0 ? vr5.metrics.responseRate / fr5.metrics.responseRate : 0;
    if (rateGain > 1.05) {
      out.push(`That is also why the variable block cost you more work: <b>${Math.round(vr5.metrics.responseRate)}</b> `
        + `responses a minute against <b>${Math.round(fr5.metrics.responseRate)}</b> on the fixed ratio, `
        + `for the same five presses per pellet on average. Unpredictability bought `
        + `<b>${Math.round((rateGain - 1) * 100)}%</b> more responding out of you at the same price.`);
    } else {
      out.push('The rates came out close this time. Across sessions the variable block is the one '
        + 'that climbs: the same average price buys more responding when the price is unpredictable, '
        + 'which is the whole commercial value of the schedule.');
    }

    out.push('You were told before the last block that it was the slot-machine schedule. It is worth '
      + 'noticing what the warning was worth. <cite>The disclosure has been logged and the epilogue '
      + 'will read it back with the rest.</cite>');
    return out;
  },

  share(metrics) {
    const ratio = pauseRatio(metrics.blocks || []);
    return ratio >= 1.2
      ? `I paused ${ratio.toFixed(1)}x longer after a pellet when I could count the presses.`
      : 'I worked a slot machine and a vending machine at exactly the same pace.';
  },
};

TRIVIA.d04 = {
  title: 'The weekend Skinner ran out of pellets',
  body: 'Every schedule in this room exists because of a supply problem. Skinner made his food '
    + 'pellets by hand, a slow job on a pill machine, and one Saturday afternoon he worked out how '
    + 'few he had left and how long the apparatus would have to run. Rather than '
    + 'spend the weekend making more, he changed the apparatus to reinforce only once a minute, and '
    + 'found the rats kept responding anyway. <b>Intermittent reinforcement was a labor-saving '
    + 'measure before it was a discovery</b>, and the two decades of curves it opened up were '
    + 'collected in Ferster and Skinner&rsquo;s 1957 volume.',
  source: 'Skinner, B. F. (1956). A case history in scientific method. American Psychologist, 11(5), 221-233.',
};
