/**
 * Blocking: the debrief figure, the trivia card, and the pieces the night version of
 * this paradigm reuses.
 *
 * Importing this module registers `REFERENCES.d03` and `TRIVIA.d03`. The exports are
 * the reusable half: the session configuration, the headless control run that the
 * comparison needs, and the panel that draws one against the other.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { createSim } from '../shared/sim.js';

/** Clocks long enough to span a two-second cue and the gap to the reinforcer. */
export const BLOCK_STIMULI = {
  eat: { bins: 44, width: 0.5 },
  click: { bins: 14, width: 0.25 },
  tone: { bins: 20, width: 0.25 },
  light: { bins: 20, width: 0.25 },
};

/**
 * The session both runs share. `control` skips phase A, which is the yoked subject
 * that meets the compound with no pretrained cue.
 *
 * @param {object} opts `{ seed, control, phaseA, phaseB }`
 * @returns {object} a `createSim` configuration
 */
export function blockingConfig({ seed = 23, control = false, phaseA = 20, phaseB = 20 } = {}) {
  return {
    seed,
    strain: 'long-evans',
    gamma: 0.97,
    lambda: 0.9,
    stimuli: BLOCK_STIMULI,
    schedule: { kind: 'BLOCK', phaseA, phaseB, csDur: 2, iti: [5, 9], control },
  };
}

/**
 * Run the control subject headlessly: the same seed, the same compound phase, no
 * pretraining. This is the denominator of the blocking ratio.
 *
 * @param {object} opts as `blockingConfig`, minus `control`
 * @returns {object} the finished sim
 */
export function runBlockingControl(opts = {}) {
  const sim = createSim(blockingConfig({ ...opts, control: true }));
  let guard = 0;
  while (!sim.S.done && guard++ < 60000) sim.step(0.1);
  return sim;
}

/**
 * How much of the control subject's learning about the light survived blocking.
 * Zero or below means the added cue picked up nothing at all.
 *
 * @param {number} vLight value at light onset in the blocked run
 * @param {number} vControl the same value in the control run
 * @returns {number} the ratio
 */
export function blockingRatio(vLight, vControl) {
  return vControl > 1e-6 ? vLight / vControl : 0;
}

/** The result band the interpretation and the caption branch on. */
export function blockingBand(ratio) {
  if (ratio <= 0.1) return 'complete';
  if (ratio < 0.35) return 'textbook';
  if (ratio < 0.7) return 'partial';
  return 'absent';
}

/** Kamin's own result, as suppression ratios: 0.5 is a cue that predicts nothing. */
const KAMIN = { control: 0.05, blocked: 0.45, none: 0.5 };

/**
 * Panel A: value at cue onset, three bars on one axis.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {object} ink the paper palette from `figure.js`
 * @param {object} data `{ vTone, vLight, vControl, s }`
 */
export function drawValuePanel(ctx, box, ink, { vTone, vLight, vControl, s }) {
  const top = Math.max(0.24, vTone * 1.25, vControl * 1.25);
  const bars = [
    { v: vTone, label: 'tone', sub: 'pretrained', fill: ink.mut },
    { v: vLight, label: 'light', sub: 'blocked', fill: ink.accent },
    { v: vControl, label: 'light', sub: 'control', fill: ink.mut },
  ];
  drawBars(ctx, box, ink, bars, top, s, 'your session — value at cue onset', (v) => v.toFixed(3));
}

/**
 * Panel B: Kamin's suppression ratios, schematic. A ratio of 0.5 is a subject that
 * does not react to the cue at all, so the blocked bar sitting near it is the result.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {object} ink the paper palette
 * @param {number} s the figure scale
 */
export function drawKaminPanel(ctx, box, ink, s) {
  const bars = [
    { v: KAMIN.control, label: 'light', sub: 'control', fill: ink.mut },
    { v: KAMIN.blocked, label: 'light', sub: 'blocked', fill: ink.accent },
  ];
  drawBars(ctx, box, ink, bars, 0.56, s, 'Kamin 1969 — suppression ratio', (v) => v.toFixed(2));

  // The line a cue with no meaning sits on.
  const y = box.y + box.h - (KAMIN.none / 0.56) * box.h;
  ctx.save();
  ctx.strokeStyle = ink.mut;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(box.x, y);
  ctx.lineTo(box.x + box.w, y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = ink.mut;
  ctx.font = `${9 * s}px ${ink.fontData}`;
  ctx.fillText('0.50 = no suppression', box.x + 4 * s, y - 4 * s);
}

/** Shared bar drawing for both panels. */
function drawBars(ctx, box, ink, bars, top, s, heading, fmt) {
  ctx.fillStyle = ink.mut;
  ctx.font = `${10 * s}px ${ink.fontData}`;
  ctx.fillText(heading, box.x, box.y - 8 * s);

  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();

  const slot = box.w / bars.length;
  const bw = Math.min(slot * 0.44, 54 * s);
  bars.forEach((b, i) => {
    const cx = box.x + slot * (i + 0.5);
    const h = Math.max(0, Math.min(1, b.v / top)) * box.h;
    ctx.fillStyle = b.fill;
    ctx.fillRect(cx - bw / 2, box.y + box.h - h, bw, h);
    ctx.fillStyle = ink.ink;
    ctx.font = `600 ${10 * s}px ${ink.fontData}`;
    ctx.textAlign = 'center';
    ctx.fillText(fmt(b.v), cx, box.y + box.h - h - 6 * s);
    ctx.font = `${10 * s}px ${ink.fontUI}`;
    ctx.fillText(b.label, cx, box.y + box.h + 14 * s);
    ctx.fillStyle = ink.mut;
    ctx.font = `${9 * s}px ${ink.fontData}`;
    ctx.fillText(b.sub, cx, box.y + box.h + 26 * s);
    ctx.textAlign = 'left';
  });
}

REFERENCES.d03 = {
  title: 'Fig. 3 — Subject #23, compound conditioning',
  subtitle: 'associative value of the added cue, against a control subject',
  caption: 'Left: value at cue onset after twenty compound trials, with a control subject '
    + 'run on the same schedule minus the pretraining. Right: Kamin (1969), schematic: '
    + 'suppression ratios for the added cue in a blocked and a control group.',
  citation: 'Reference values after Kamin (1969), Punishment and Aversive Behavior.',

  draw(ctx, box, ink, { metrics }) {
    const s = box.w / 550;
    const gap = 46 * s;
    const wA = (box.w - gap) * 0.56;
    const wB = box.w - gap - wA;
    const inner = { y: box.y + 18 * s, h: box.h - 46 * s };
    drawValuePanel(ctx, { x: box.x, y: inner.y, w: wA, h: inner.h }, ink, {
      vTone: Math.max(0, metrics.vTone),
      vLight: Math.max(0, metrics.vLight),
      vControl: Math.max(0, metrics.vControl),
      s,
    });
    drawKaminPanel(ctx, { x: box.x + wA + gap, y: inner.y, w: wB, h: inner.h }, ink, s);
  },

  stats(metrics) {
    const ratio = blockingRatio(metrics.vLight, metrics.vControl);
    return [
      [metrics.vTone.toFixed(3), 'V(tone), pretrained'],
      [metrics.vLight.toFixed(3), 'V(light), blocked'],
      [metrics.vControl.toFixed(3), 'V(light), control'],
      [Math.round(Math.max(0, ratio) * 100) + '%', 'of the control light'],
    ];
  },

  interpret(metrics) {
    const ratio = blockingRatio(metrics.vLight, metrics.vControl);
    const band = blockingBand(ratio);
    const pct = Math.round(Math.max(0, ratio) * 100);
    const out = [];

    if (metrics.prediction) {
      const right = (metrics.prediction === 'nothing') === (band === 'complete' || band === 'textbook');
      out.push(metrics.prediction === 'nothing'
        ? `You said the light would come out meaning nothing. ${right ? 'It did.' : 'It picked up more than that.'}`
        : `You said the light would learn. ${right ? 'It did.' : 'It came out very nearly empty.'}`);
    }

    let main = `The light was on for every one of the twenty compound trials, and every one of them `
      + 'ended in sucrose. It was paired as often, and as reliably, as the tone. ';
    if (band === 'complete') {
      main += `It finished at <b>${metrics.vLight.toFixed(3)}</b>. The control subject, which met the `
        + 'same light and the same sucrose without a pretrained tone, finished at '
        + `<b>${metrics.vControl.toFixed(3)}</b>. Pairing is not what teaches.`;
      if (metrics.vLight < -0.005) {
        main += ' Yours came out slightly under zero, which is the tone and the light briefly '
          + 'predicting more sucrose together than arrived: the surplus was charged to the newer cue.';
      }
    } else if (band === 'textbook') {
      main += `It finished at <b>${metrics.vLight.toFixed(3)}</b>, which is <b>${pct}%</b> of what `
        + 'the same light was worth to a control subject that met it without a pretrained tone. '
        + 'This is blocking, at about the size it is usually found.';
    } else if (band === 'partial') {
      main += `It finished at <b>${metrics.vLight.toFixed(3)}</b>, <b>${pct}%</b> of the control `
        + "subject's light. Partial blocking: the tone took most of the available value, and what "
        + 'was left over went to the light.';
    } else {
      main += `It finished at <b>${metrics.vLight.toFixed(3)}</b>, close to the control subject's `
        + `<b>${metrics.vControl.toFixed(3)}</b>. On this run the light learned about as much as it `
        + 'would have on its own, so there was value left unclaimed when phase B began.';
    }
    out.push(main);

    out.push('The reason is on the trace. By the end of phase A the tone already predicted the '
      + 'sucrose, so when the sucrose arrived it was no longer news: the prediction error at delivery '
      + 'had fallen to nearly zero. Learning is driven by that error, and an error of zero teaches '
      + 'nothing to anything present. The light was present. It was simply present at a moment when '
      + 'there was nothing left to learn <cite>(Kamin 1969; Rescorla &amp; Wagner 1972)</cite>.');

    out.push('That is the part worth carrying out of the room: <b>a cue does not become meaningful by '
      + 'accompanying a reward.</b> It becomes meaningful by removing surprise that nothing else had '
      + 'removed yet. Cues that arrive after the surprise is gone stay invisible however often you see them.');
    return out;
  },

  share(metrics) {
    const ratio = blockingRatio(metrics.vLight, metrics.vControl);
    const pct = Math.round(Math.max(0, ratio) * 100);
    return pct <= 10
      ? 'Twenty pairings with sucrose taught my light exactly nothing.'
      : `My light was paired with sucrose twenty times and came out worth ${pct}% of a control light.`;
  },
};

TRIVIA.d03 = {
  title: 'Kamin, and the invention of surprise',
  body: 'Leon Kamin ran his blocking experiments in the late 1960s with a shock and a rat that '
    + 'stopped pressing a lever when it expected one. A group pretrained on a noise learned nothing '
    + 'about a light that was later added to it, while a group meeting the same light without the '
    + 'noise learned about it perfectly well. The pairing was identical; only the history differed. '
    + 'Kamin&rsquo;s explanation was one word: <b>surprise</b>. An animal learns about a cue only when '
    + 'the outcome it accompanies was not already expected, which is the idea the Rescorla&ndash;Wagner '
    + 'rule formalized three years later and the idea a prediction-error term implements. '
    + 'This chamber uses sucrose instead of a shock, and the effect is the same size.',
  source: 'Kamin, L. J. (1969). Predictability, surprise, attention, and conditioning. In B. A. Campbell & R. M. Church (Eds.), Punishment and Aversive Behavior. Appleton-Century-Crofts.',
};
