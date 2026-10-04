/**
 * The effort-choice debrief: the player's own two sessions read against the barrier
 * T-maze result they reproduce. Registers `REFERENCES.d07` and `TRIVIA.d07` on import,
 * which is the only thing this module does.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';

/** Which of the four shift bands a pair of sessions falls in. */
export function shiftBand(metrics) {
  if (metrics.baselineFraction < 0.35) return 'never-worked';
  if (metrics.shiftRatio < 0.7) return 'collapsed';
  if (metrics.shiftRatio < 0.95) return 'partial';
  return 'held';
}

/**
 * The researcher's line for a result. Written by the page into the field notes and
 * read back at the top of the debrief, so the claim only ever follows the data.
 *
 * @param {object} metrics the merged two-session metrics
 * @returns {string}
 */
export function fieldNote(metrics) {
  switch (shiftBand(metrics)) {
    case 'never-worked':
      return 'Subject took the open arm from the start. No barrier preference to abolish.';
    case 'collapsed':
      return 'Barrier selections fall under the dose. Appetite unchanged. Dopamine is for effort, '
        + 'not pleasure.';
    case 'partial':
      return 'Barrier selections down but not abolished. Repeat at a higher dose before concluding.';
    default:
      return 'Subject climbed under the dose as readily as without it. Result not replicated.';
  }
}

const PCT = (v) => Math.round(v * 100) + '%';

REFERENCES.d07 = {
  title: 'Fig. 3 — Subject #23, cost/benefit T-maze',
  subtitle: 'selections of the four-pellet arm, before and under haloperidol',
  caption: 'Left: percentage of trials on the barrier arm, in blocks of five, undrugged (solid) '
    + 'and drugged (dashed). Right: the two session means. Both arms were baited throughout.',
  citation: 'After Salamone, J. D., Cousins, M. S. & Bucher, S. (1994), Behav. Brain Res. 65, 221-229.',

  draw(ctx, box, ink, { metrics }) {
    const s = box.w / 550;
    const gap = 34 * s;
    const wA = (box.w - gap) * 0.62;
    const wB = box.w - gap - wA;
    const head = 16 * s;
    const a = { x: box.x, y: box.y + head, w: wA, h: box.h - head };
    const b = { x: box.x + wA + gap, y: box.y + head, w: wB, h: box.h - head };

    ctx.font = `600 ${10 * s}px ${ink.fontUI}`;
    ctx.fillStyle = ink.mut;
    ctx.fillText('A · barrier arm, by block of five', a.x, box.y + 9 * s);
    ctx.fillText('B · session means', b.x, box.y + 9 * s);

    drawBlocks(ctx, a, ink, s, metrics);
    drawMeans(ctx, b, ink, s, metrics);
  },

  stats(metrics) {
    return [
      [PCT(metrics.baselineFraction), 'barrier arm, undrugged'],
      [PCT(metrics.haloperidolFraction), 'barrier arm, under haloperidol'],
      [metrics.shiftRatio.toFixed(2), 'ratio, drugged over undrugged'],
      [metrics.baselinePellets + ' / ' + metrics.haloperidolPellets, 'pellets earned, session 1 / 2'],
    ];
  },

  interpret(metrics) {
    const out = [];
    const b = shiftBand(metrics);
    const base = PCT(metrics.baselineFraction);
    const halo = PCT(metrics.haloperidolFraction);

    out.push(`Undrugged, you took the barrier arm on <b>${base}</b> of trials. Under the dose you took `
      + `it on <b>${halo}</b>. The maze did not change between those two numbers. The pellets did not `
      + 'change either: four behind the barrier, two on the open arm, every trial, both sessions.');

    if (b === 'collapsed') {
      out.push('That is the result, and it is the one the barrier was built to produce. Salamone, '
        + 'Cousins and Bucher gave rats 0.1 mg/kg of haloperidol in exactly this maze. With the '
        + 'barrier in place, the drug cut selections of the four-pellet arm. With the barrier '
        + '<b>removed</b>, the same dose changed nothing: the rats still preferred four pellets to two '
        + '<cite>(Salamone, Cousins &amp; Bucher 1994)</cite>. The preference survived. Only the '
        + 'willingness to climb for it did not.');
      out.push('This is why the title of that paper is a question. If dopamine carried pleasure, '
        + 'blocking it should have made four pellets stop being better than two, and the open-arm '
        + 'control says it did not. What it took away was the work. <b>Dopamine is for effort, not '
        + 'pleasure.</b>');
    } else if (b === 'partial') {
      out.push(`Your barrier choices fell by ${PCT(1 - metrics.shiftRatio)} but did not collapse. In `
        + 'the original the effect was large enough to reach significance across a group; one subject '
        + 'over twenty trials is a noisier instrument than that. The direction is right, and the '
        + 'direction is the finding: with the barrier present, blocking dopamine moves the choice, '
        + 'and with the barrier absent it does not '
        + '<cite>(Salamone, Cousins &amp; Bucher 1994)</cite>.');
      out.push('Read the two sessions as one sentence rather than two numbers. Nothing about the '
        + 'reward changed. What changed was the price you were willing to pay for it.');
    } else if (b === 'held') {
      out.push('You climbed under the dose as readily as without it, so your own record does not '
        + 'reproduce the effect. That is worth stating plainly rather than explaining away. In the '
        + 'original, haloperidol reduced selections of the four-pellet arm when the barrier was '
        + 'present and left them alone when it was removed '
        + '<cite>(Salamone, Cousins &amp; Bucher 1994)</cite>.');
      out.push('One thing did change for you, whether or not you noticed it: the tonic estimate on '
        + 'the trace ran at half its ceiling for the whole second session, and every input you made '
        + 'was delayed by more milliseconds because of it. The claim under test is that this channel, '
        + 'and not liking, is what dopamine carries. You paid the delay and climbed anyway.');
    } else {
      out.push('You mostly took the open arm even before the dose, so there was no barrier preference '
        + 'for it to abolish. The comparison the paradigm makes needs a subject that works for the '
        + 'larger reward first. Run it again and climb, and the second session becomes readable.');
      out.push('The design is a cost/benefit test: four pellets that cost a climb against two that '
        + 'cost nothing. A subject that never pays the cost gives the same record whether or not it '
        + 'has been drugged <cite>(Salamone, Cousins &amp; Bucher 1994)</cite>.');
    }

    const refusals = metrics.refusals || 0;
    out.push(`One number holds still across both sessions: you ate <b>${metrics.consumedTotal}</b> of `
      + `the ${metrics.baselinePellets + metrics.haloperidolPellets} pellets that were dispensed, with `
      + `${refusals === 0 ? 'not one refusal' : refusals + ' refusals'}. Appetite was never the `
      + 'variable. That is the whole argument in one line of the record.');

    return out;
  },

  share(metrics) {
    const b = shiftBand(metrics);
    if (b === 'collapsed' || b === 'partial') {
      return `Halve my dopamine and I stop climbing for four pellets: ${PCT(metrics.baselineFraction)}`
        + ` down to ${PCT(metrics.haloperidolFraction)}.`;
    }
    if (b === 'held') return 'I climbed the barrier on haloperidol anyway.';
    return 'I took the easy arm in a cost/benefit T-maze, drugged or not.';
  },
};

/** A session block's per-block fractions, from whichever half of the record carries them. */
function blocksOf(m) {
  return m && Array.isArray(m.blocks) && m.blocks.length ? m.blocks : null;
}

/** Panel A: percentage on the barrier arm per block of five trials, both sessions. */
function drawBlocks(ctx, box, ink, s, metrics) {
  frame(ctx, box, ink);
  const base = blocksOf(metrics.baseline) || [];
  const halo = blocksOf(metrics.haloperidol) || blocksOf(metrics) || [];
  const n = Math.max(base.length, halo.length, 1);
  const X = (i) => box.x + box.w * ((i + 0.5) / n);
  const Y = (v) => box.y + box.h - v * box.h;

  ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = box.y + (box.h / 4) * i;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
  }

  series(ctx, base, X, Y, s, ink.ink, false);
  series(ctx, halo, X, Y, s, ink.mut, true);

  ctx.font = `${9 * s}px ${ink.fontData}`;
  ctx.fillStyle = ink.mut;
  ctx.fillText('100%', box.x + 5 * s, box.y + 9 * s);
  ctx.fillText('0', box.x + 5 * s, box.y + box.h - 4 * s);
  for (let i = 0; i < n; i++) ctx.fillText(String(i + 1), X(i) - 2 * s, box.y + box.h + 11 * s);

  // The key sits under the axis, where neither line can ever run through it.
  const key = box.y + box.h + 23 * s;
  ctx.font = `${9 * s}px ${ink.fontData}`;
  sample(ctx, box.x, key - 3 * s, 14 * s, ink.ink, false);
  ctx.fillStyle = ink.ink;
  ctx.fillText('undrugged', box.x + 19 * s, key);
  const off = box.x + 19 * s + ctx.measureText('undrugged').width + 14 * s;
  sample(ctx, off, key - 3 * s, 14 * s, ink.mut, true);
  ctx.fillStyle = ink.mut;
  ctx.fillText('haloperidol', off + 19 * s, key);

  axisLabels(ctx, box, ink, s, 'block of five trials', 'barrier arm');
}

/** A short stroke of a series' own line style, for the key. */
function sample(ctx, x, y, w, color, dashed) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  ctx.setLineDash([]);
}

function series(ctx, values, X, Y, s, color, dashed) {
  if (!values.length) return;
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  if (dashed) ctx.setLineDash([5 * s, 4 * s]);
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  values.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(X(i), Y(v), 2.6 * s, 0, Math.PI * 2); ctx.fill();
  });
}

/** Panel B: the two session means, on the same axis as panel A. */
function drawMeans(ctx, box, ink, s, metrics) {
  frame(ctx, box, ink);
  const bars = [
    { label: 'undrugged', v: metrics.baselineFraction, fill: ink.ink },
    { label: 'drugged', v: metrics.haloperidolFraction, fill: ink.mut },
  ];
  ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = box.y + (box.h / 4) * i;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
  }

  const bw = box.w * 0.24;
  bars.forEach((bar, i) => {
    const x = box.x + box.w * (0.3 + i * 0.4) - bw / 2;
    const h = bar.v * box.h;
    ctx.fillStyle = bar.fill;
    ctx.fillRect(x, box.y + box.h - h, bw, h);
    ctx.fillStyle = ink.mut;
    ctx.font = `${9 * s}px ${ink.fontData}`;
    ctx.fillText(bar.label, x - 4 * s, box.y + box.h + 11 * s);
    ctx.fillStyle = ink.ink;
    ctx.font = `600 ${9.5 * s}px ${ink.fontData}`;
    ctx.fillText(PCT(bar.v), x + 2 * s, box.y + box.h - h - 5 * s);
  });
  axisLabels(ctx, box, ink, s, '', 'barrier arm');
}

/** The two rules every panel stands on. */
function frame(ctx, box, ink) {
  ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();
}

function axisLabels(ctx, box, ink, s, x, y) {
  ctx.fillStyle = ink.mut;
  ctx.font = `${9.5 * s}px ${ink.fontData}`;
  if (x) ctx.fillText(x, box.x + box.w - ctx.measureText(x).width, box.y + box.h + 23 * s);
  ctx.save();
  ctx.translate(box.x - 12 * s, box.y + box.h);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(y, 0, 0);
  ctx.restore();
}

TRIVIA.d07 = {
  title: 'The control condition is the whole paper',
  body: 'It is easy to read a drug that stops rats working as a drug that stops rats caring. Salamone'
    + ' ran the same maze twice: once with a 44 cm barrier in the arm holding four pellets, and once'
    + ' with the barrier taken out. Haloperidol cut selections of the four-pellet arm when the climb'
    + ' was there. With the climb removed, the identical dose <b>changed nothing</b>, and the rats'
    + ' went on preferring four pellets to two. The same dissociation appeared when the dopamine in'
    + ' the nucleus accumbens was destroyed outright rather than blocked. The question in the title,'
    + ' <i>anhedonia or anergia</i>, is answered by the arm without the barrier in it.',
  source: 'Salamone, J. D., Cousins, M. S. & Bucher, S. (1994). Anhedonia or anergia? Effects of '
    + 'haloperidol and nucleus accumbens dopamine depletion on instrumental response selection in a '
    + 'T-maze cost/benefit procedure. Behavioural Brain Research, 65(2), 221-229.',
};
