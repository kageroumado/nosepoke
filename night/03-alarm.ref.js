/**
 * Debrief figure and history card for the new alarm.
 *
 * The figure is a straight comparison of associative strength: what the light came to
 * be worth to a veteran who already had the squeak, against what the same twenty
 * compound trials made it worth to a rat that arrived tonight.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';

/**
 * Times a subject went and looked at the alarm while it was lit.
 *
 * @param {object} sim the session
 * @returns {number}
 */
export function lookUps(sim) {
  let lit = -Infinity;
  let n = 0;
  for (const e of sim.S.events) {
    if (e.type === 'cue' && e.name === 'light') lit = e.t;
    else if (e.type === 'approach' && e.target === 'alarm' && e.t - lit < 2.5) n++;
  }
  return n;
}

/** What the light is worth to the veteran as a fraction of what it is worth next door. */
export function blockedFraction(metrics) {
  const naive = metrics.naiveLight;
  if (!naive || naive <= 0.001) return 0;
  return Math.max(0, metrics.vLight / naive);
}

REFERENCES.n03 = {
  title: 'Fig. N3 — the new alarm, two subjects',
  subtitle: 'associative strength at test, light presented alone',
  caption: 'What each cue came to predict. The veteran had twenty nights of squeak before the light was '
    + 'installed; the rat in cage 12 saw squeak and light together from its first trial. Both then got '
    + 'the same twenty compound trials.',
  citation: 'Blocking after Kamin, L. J. (1969), in Campbell & Church, Punishment and Aversive Behavior.',
  axis: { x: '', y: 'V at onset →' },

  draw(ctx, box, ink, { metrics }) {
    const bars = [
      { label: 'veteran', sub: 'squeak', v: metrics.vTone, fill: ink.mut },
      { label: 'veteran', sub: 'alarm', v: metrics.vLight, fill: ink.accent },
      { label: 'cage 12', sub: 'alarm', v: metrics.naiveLight, fill: ink.ink },
    ];
    // The axis keeps a fifth of its height below zero, because a blocked cue can
    // settle slightly negative and the figure has to be able to show that.
    const plotH = box.h - 46;
    const negRoom = plotH * 0.2;
    const zero = box.y + plotH - negRoom;
    const top = Math.max(0.12, ...bars.map((b) => Math.abs(b.v))) * 1.25;
    const scale = (zero - box.y) / top;

    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + plotH);
    ctx.stroke();

    ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, zero); ctx.lineTo(box.x + box.w, zero);
    ctx.stroke();
    ctx.fillStyle = ink.mut;
    ctx.font = `9px ${ink.fontData}`;
    ctx.fillText('0', box.x - 12, zero + 3);

    const slot = box.w / bars.length;
    const bw = Math.min(74, slot * 0.44);
    bars.forEach((b, i) => {
      const cx = box.x + slot * (i + 0.5);
      const h = b.v * scale;
      ctx.fillStyle = b.fill;
      ctx.fillRect(cx - bw / 2, h >= 0 ? zero - h : zero, bw, Math.max(1, Math.abs(h)));

      ctx.fillStyle = ink.ink;
      ctx.font = `600 10px ${ink.fontData}`;
      const val = b.v.toFixed(3);
      ctx.fillText(val, cx - ctx.measureText(val).width / 2, (h >= 0 ? zero - h : zero + Math.abs(h)) + (h >= 0 ? -6 : 14));

      ctx.fillStyle = ink.ink;
      ctx.font = `600 11px ${ink.fontUI}`;
      ctx.fillText(b.label, cx - ctx.measureText(b.label).width / 2, box.y + plotH + 16);
      ctx.fillStyle = ink.mut;
      ctx.font = `10px ${ink.fontData}`;
      ctx.fillText(b.sub, cx - ctx.measureText(b.sub).width / 2, box.y + plotH + 29);
    });
  },

  stats(metrics) {
    const f = blockedFraction(metrics);
    return [
      [metrics.vLight.toFixed(3), 'V(alarm), veteran'],
      [metrics.naiveLight.toFixed(3), 'V(alarm), cage 12'],
      [Math.round(f * 100) + '%', 'of what it could have learned'],
      [`${metrics.veteranLooks} / ${metrics.naiveLooks}`, 'looks at the alarm, you / cage 12'],
    ];
  },

  interpret(metrics) {
    const f = blockedFraction(metrics);
    const out = [];

    if (f < 0.35) {
      out.push(`The alarm went in over the door, it came on before every delivery for twenty straight `
        + `trials, and it taught you <b>${Math.round(f * 100)}%</b> of what it taught the rat in cage 12. `
        + 'It was perfectly visible and perfectly reliable. You learned nothing from it. That is '
        + '<b>blocking</b>, and it is the result that made a purely associative account of learning '
        + 'untenable <cite>(Kamin 1969)</cite>.');
    } else if (f < 0.7) {
      out.push(`The alarm reached <b>${Math.round(f * 100)}%</b> of the strength it reached next door. `
        + 'Partial blocking: the squeak was doing most of the predicting but had not quite finished, so '
        + 'there was still a little surprise left over for the light to pick up.');
    } else {
      out.push(`The alarm learned nearly as much as it did next door, <b>${Math.round(f * 100)}%</b>. `
        + 'That happens when the first cue never got strong enough to leave nothing over. Run the '
        + 'squeak longer and the light will find there is no surprise left for it.');
    }

    out.push('The reason is one line of arithmetic. A cue is only learned about in proportion to the '
      + 'error left after every cue present is taken into account. The squeak already predicted the '
      + 'crumbs, so on compound trials there was no error, so nothing updated. The light was never '
      + 'ignored, never unseen, never too dim. It was <b>redundant</b>, which for a learning system is '
      + 'a stronger form of invisible.');

    if (metrics.vLight < -0.002) {
      out.push(`Your light did not merely fail to learn: it settled slightly below zero, at `
        + `${metrics.vLight.toFixed(3)}. On the compound trials the squeak had begun to over-predict, `
        + 'and the small negative errors that follow have to go somewhere. They went onto the newest cue.');
    }

    out.push(`You went and looked at the alarm <b>${metrics.veteranLooks}</b> times. The rat in cage 12 `
      + `looked <b>${metrics.naiveLooks}</b>. Nobody told either of you what the light was for. The `
      + 'difference is entirely in what each of you already knew when it was switched on.');
    return out;
  },

  share(metrics) {
    const f = blockedFraction(metrics);
    return `A new alarm went in over the door and taught me ${Math.round(f * 100)}% of what it taught the new rat.`;
  },
};

TRIVIA.n03 = {
  title: 'Why an albino rat is nearly blind',
  body: 'Albinism does not just remove color from the coat. Without melanin the retinal pigment '
    + 'epithelium cannot absorb stray light, so the eye scatters its own image, and standard vivarium '
    + 'lighting degrades the retina further. Measured with gratings, pigmented strains such as '
    + 'Long-Evans resolve about <b>1.0 cycle per degree</b>; the albino strains that fill most '
    + 'laboratories, Wistar, Sprague-Dawley and Fischer-344, come in near <b>0.5</b>, which is roughly '
    + 'the acuity of a mouse. A great deal of published rat behavior rests on visual cues the animals '
    + 'could barely see, and the strain was chosen for temperament rather than eyes.',
  source: 'Prusky, G. T., Harker, K. T., Douglas, R. M. & Whishaw, I. Q. (2002). Variation in visual '
    + 'acuity within pigmented, and between pigmented and albino rat strains. Behavioural Brain '
    + 'Research, 136(2), 339-348.',
};
