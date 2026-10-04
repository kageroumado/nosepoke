/**
 * The progressive-ratio debrief: what the player's own record says, and the reference
 * it is read against. Registers `REFERENCES.d06` and `TRIVIA.d06` on import, which is
 * the only thing this module does.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { referenceBreakpoints } from './06-pr.subject.js';

/** The matched sessions behind panel B. Computed once, on the first debrief. */
let reference = null;
function magnitudeCurve() {
  if (!reference) reference = referenceBreakpoints();
  return reference;
}

/** Which of the five breakpoint bands a result falls in. */
function band(breakpoint, ratios) {
  if (!breakpoint || ratios < 1) return 'none';
  if (ratios <= 3) return 'brief';
  if (breakpoint < 20) return 'modest';
  if (breakpoint < 50) return 'typical';
  return 'elevated';
}

/**
 * How many of the earliest ratios the final one outweighs. The late pellets in a
 * progressive ratio cost more than whole stretches of the early session, and this is
 * that comparison taken from the player's own sequence rather than asserted.
 */
function outweighs(ratios) {
  const last = ratios[ratios.length - 1];
  let sum = 0, k = 0;
  for (let i = 0; i < ratios.length - 1; i++) {
    if (sum + ratios[i] > last) break;
    sum += ratios[i]; k++;
  }
  return k;
}

/** Mean of the first and last third of the within-ratio run rates. */
function decay(runRates) {
  if (runRates.length < 3) return null;
  const k = Math.max(1, Math.floor(runRates.length / 3));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const early = mean(runRates.slice(0, k));
  const late = mean(runRates.slice(-k));
  return { early, late, drop: early > 0 ? 1 - late / early : 0 };
}

REFERENCES.d06 = {
  title: 'Fig. 2 — Subject #23, progressive ratio',
  subtitle: 'within-ratio run rate, and breakpoint against reward magnitude',
  caption: 'Left: responses per second inside each completed ratio, Subject #23. Right: the '
    + 'final completed ratio from three matched sessions differing only in pellets per '
    + 'reinforcer, with this subject marked.',
  citation: 'Reference after Hodos, W. (1961), Science 134, 943-944; steps after Richardson & Roberts (1996).',

  draw(ctx, box, ink, { metrics }) {
    const s = box.w / 550;
    const gap = 34 * s;
    const wA = (box.w - gap) * 0.58;
    const wB = box.w - gap - wA;
    const head = 16 * s;
    const a = { x: box.x, y: box.y + head, w: wA, h: box.h - head };
    const b = { x: box.x + wA + gap, y: box.y + head, w: wB, h: box.h - head };

    ctx.font = `600 ${10 * s}px ${ink.fontUI}`;
    ctx.fillStyle = ink.mut;
    ctx.fillText('A · run rate within each ratio', a.x, box.y + 9 * s);
    ctx.fillText('B · breakpoint vs. reward', b.x, box.y + 9 * s);

    drawRunRates(ctx, a, ink, s, metrics);
    drawMagnitudes(ctx, b, ink, s, metrics);
  },

  stats(metrics) {
    const d = decay(metrics.runRates);
    return [
      [metrics.breakpoint || 0, 'breakpoint (final completed ratio)'],
      [metrics.completedRatios, 'reinforcers earned'],
      [metrics.responses, 'lever presses'],
      [d ? d.late.toFixed(2) + '/s' : 'n/a', 'run rate at the last ratio'],
    ];
  },

  interpret(metrics) {
    const out = [];
    const bp = metrics.breakpoint || 0;
    const curve = magnitudeCurve();
    const b = band(bp, metrics.completedRatios);

    let first = '';
    if (b === 'none') {
      first = 'You never completed a ratio, so there is no breakpoint to report. The schedule '
        + 'asks for one response, then two, then four, and it waits. A session that ends here '
        + 'measures the wait, not the subject.';
    } else {
      const k = outweighs(metrics.ratios);
      first = `Your last completed ratio was <b>${bp}</b>. That number is the breakpoint: the price `
        + `at which one pellet stopped being worth the presses. Getting there took `
        + `${metrics.completedRatios} completed ratios and ${metrics.responses} responses, `
        + `for ${metrics.consumed} pellets. `;
      if (b === 'brief') {
        first += 'You stopped while the price was still trivial, which makes this a measure of your '
          + 'patience rather than of the pellet.';
      } else if (b === 'modest') {
        first += 'The requirement was still in double figures when you stopped. A hungry rat on '
          + 'ordinary food pellets sits in about this range.';
      } else if (b === 'typical') {
        first += 'That is squarely where a food-reinforced rat sits. Note the shape of the bill: '
          + `that last pellet cost more presses than your first ${k} reinforcers put together.`;
      } else {
        first += `That is a high breakpoint. The last pellet cost more presses than your first ${k} `
          + 'put together, and the field note on the left is what a subject like that is worth to '
          + 'the study.';
      }
    }
    out.push(first);

    const d = decay(metrics.runRates);
    if (d) {
      const drop = Math.round(d.drop * 100);
      let second = `Inside each ratio you worked at about <b>${d.early.toFixed(2)}</b> responses per `
        + `second early in the session and <b>${d.late.toFixed(2)}</b> by the end`;
      if (drop >= 15) {
        second += `, a fall of ${drop}%. The rate decays while the requirement climbs, so the time `
          + 'between pellets grows twice over. That is the shape in panel A, and it is why a '
          + 'progressive ratio ends the way it does rather than at a wall.';
      } else if (drop <= -15) {
        second += `, a rise of ${Math.abs(drop)}%. You worked harder as the price went up, which is `
          + 'the pattern of a subject chasing a reward it has come to expect rather than pacing itself.';
      } else {
        second += '. You held a near-constant working rate all the way to the end, so what stopped '
          + 'you was the length of the run, not a slowing hand.';
      }
      out.push(second);
    }

    const [m1, m2, m4] = curve;
    let third = 'Panel B is three more sessions of this same model, identical but for the number of '
      + `pellets a completed ratio pays. Their breakpoints were ${m1.breakpoint}, ${m2.breakpoint} `
      + `and ${m4.breakpoint}. `;
    if (bp) {
      const near = bp === m1.breakpoint ? 'exactly on the one-pellet session'
        : bp >= m4.breakpoint ? 'above every one of them'
          : bp >= m2.breakpoint ? 'between the two-pellet and four-pellet sessions'
            : bp > m1.breakpoint ? 'between the one-pellet and two-pellet sessions'
              : 'below the one-pellet session';
      third += `Yours, on one pellet, was ${bp}, which puts you ${near}. `;
    }
    third += 'This is the reason the measure exists. Hodos raised the requirement on four rats by a '
      + 'fixed increment and varied the concentration and the volume of the reward, and it was the '
      + 'size of the final completed ratio that moved with them '
      + '<cite>(Hodos 1961)</cite>. Breakpoint reports what a reward is worth. Response rate reports '
      + 'how fast an animal is working, which is a different question.';
    out.push(third);

    return out;
  },

  share(metrics) {
    const bp = metrics.breakpoint || 0;
    if (!bp) return 'I walked out of a progressive ratio without completing one.';
    return `I paid ${bp} presses for a single pellet before I stopped.`;
  },
};

/** Panel A: responses per second inside each completed ratio, against the ratio itself. */
function drawRunRates(ctx, box, ink, s, metrics) {
  const ratios = metrics.ratios || [];
  const rates = metrics.runRates || [];
  frame(ctx, box, ink);

  if (ratios.length < 2) {
    ctx.fillStyle = ink.mut;
    ctx.font = `${10 * s}px ${ink.fontData}`;
    ctx.fillText('fewer than two ratios completed', box.x + 10 * s, box.y + box.h / 2);
    axisLabels(ctx, box, ink, s, 'ratio', 'responses/s');
    return;
  }

  const xMax = ratios[ratios.length - 1] * 1.08;
  const yMax = Math.max(...rates) * 1.2 || 1;
  const X = (v) => box.x + (v / xMax) * box.w;
  const Y = (v) => box.y + box.h - (v / yMax) * box.h;

  ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = box.y + (box.h / 4) * i;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
  }

  ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ratios.forEach((r, i) => (i ? ctx.lineTo(X(r), Y(rates[i])) : ctx.moveTo(X(r), Y(rates[i]))));
  ctx.stroke();
  ctx.fillStyle = ink.ink;
  ratios.forEach((r, i) => {
    ctx.beginPath(); ctx.arc(X(r), Y(rates[i]), 2.4 * s, 0, Math.PI * 2); ctx.fill();
  });

  // The breakpoint: where the record stops, marked on the price axis.
  const bp = ratios[ratios.length - 1];
  ctx.strokeStyle = ink.accent; ctx.lineWidth = 1.2; ctx.setLineDash([4 * s, 3 * s]);
  ctx.beginPath(); ctx.moveTo(X(bp), box.y); ctx.lineTo(X(bp), box.y + box.h); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ink.accent;
  ctx.font = `600 ${9.5 * s}px ${ink.fontData}`;
  const label = 'breakpoint ' + bp;
  ctx.fillText(label, X(bp) - ctx.measureText(label).width - 6 * s, box.y + 10 * s);

  ctx.fillStyle = ink.mut;
  ctx.font = `${9 * s}px ${ink.fontData}`;
  ctx.fillText(String(ratios[0]), X(ratios[0]) - 3 * s, box.y + box.h + 11 * s);
  ctx.fillText(String(bp), X(bp) - 6 * s, box.y + box.h + 11 * s);
  ctx.fillText(yMax.toFixed(1), box.x + 5 * s, box.y + 9 * s);
  axisLabels(ctx, box, ink, s, 'ratio', 'responses/s');
}

/** Panel B: final completed ratio against pellets per reinforcer. */
function drawMagnitudes(ctx, box, ink, s, metrics) {
  const curve = magnitudeCurve();
  const bp = metrics.breakpoint || 0;
  frame(ctx, box, ink);

  const yMax = Math.max(bp, ...curve.map((c) => c.breakpoint)) * 1.2 || 1;
  const Y = (v) => box.y + box.h - (v / yMax) * box.h;
  const X = (i) => box.x + box.w * (0.18 + 0.32 * i);

  ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = box.y + (box.h / 4) * i;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
  }

  ctx.strokeStyle = ink.mut; ctx.lineWidth = 1.4;
  ctx.beginPath();
  curve.forEach((c, i) => (i ? ctx.lineTo(X(i), Y(c.breakpoint)) : ctx.moveTo(X(i), Y(c.breakpoint))));
  ctx.stroke();
  curve.forEach((c, i) => {
    ctx.beginPath(); ctx.arc(X(i), Y(c.breakpoint), 3.2 * s, 0, Math.PI * 2);
    ctx.fillStyle = ink.paper; ctx.fill();
    ctx.strokeStyle = ink.mut; ctx.lineWidth = 1.4; ctx.stroke();
  });

  ctx.fillStyle = ink.mut;
  ctx.font = `${9 * s}px ${ink.fontData}`;
  curve.forEach((c, i) => ctx.fillText('\u00d7' + c.magnitude, X(i) - 5 * s, box.y + box.h + 11 * s));
  ctx.fillText(String(Math.round(yMax)), box.x + 5 * s, box.y + 9 * s);

  if (bp) {
    ctx.fillStyle = ink.accent;
    ctx.beginPath(); ctx.arc(X(0), Y(bp), 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.font = `600 ${9.5 * s}px ${ink.fontData}`;
    ctx.fillText('you', X(0) + 7 * s, Y(bp) + 3 * s);
  }
  axisLabels(ctx, box, ink, s, 'pellets per reinforcer', 'final ratio');
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
  const w = ctx.measureText(x).width;
  ctx.fillText(x, box.x + box.w - w, box.y + box.h + 23 * s);
  ctx.save();
  ctx.translate(box.x - 12 * s, box.y + box.h);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(y, 0, 0);
  ctx.restore();
}

TRIVIA.d06 = {
  title: 'Why the ratios go 1, 2, 4, 6, 9, 12',
  body: 'Hodos raised the requirement by a fixed increment, which works but takes a long session to'
    + ' find a high breakpoint. The steps this rig uses are the ones Richardson and Roberts published'
    + ' for drug self-administration: <b>round(5 &middot; e<sup>0.2n</sup>) &minus; 5</b>, which gives'
    + ' 1, 2, 4, 6, 9, 12, 15, 20, 25, 32, 40, 50, 62, 77 and keeps accelerating. The curve is chosen'
    + ' so that a subject reaches its own limit inside one sitting instead of three, which is the only'
    + ' reason the numbers look arbitrary. Nothing about the sequence is theoretical. It is a'
    + ' laboratory convenience that became a standard.',
  source: 'Richardson, N. R. & Roberts, D. C. S. (1996). Progressive ratio schedules in drug '
    + 'self-administration studies in rats. Journal of Neuroscience Methods, 66(1), 1-11.',
};
