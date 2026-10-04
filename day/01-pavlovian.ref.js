/**
 * The debrief figure and the history card for Pavlovian conditioning. Imported by
 * `day/01-pavlovian.html` before the shell mounts, because the shell reads the
 * trivia map at mount time.
 *
 * The figure is two panels in one box: the player's own prediction error at the tone
 * and at the sucrose across trials, and beside it the schematic every textbook prints
 * of the same result recorded from midbrain dopamine neurons.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { crossoverTrial, mean } from './conditioning.js';

/** A short label for how far into the session the burst changed hands. */
function crossoverBand(trial, trials) {
  if (!trial) return 'no crossover';
  if (trial <= 12) return 'early';
  return trial <= Math.max(20, trials * 0.75) ? 'mid-session' : 'late';
}

/**
 * The schematic panel: what a dopamine neuron does before and after the tone means
 * something. A baseline with one burst on it, twice.
 */
function drawSchultzPanel(ctx, p, ink) {
  const head = 16;
  const rowH = (p.h - head) / 2;
  const rows = [
    { label: 'before learning', burstAt: 0.68, quiet: false },
    { label: 'after learning', burstAt: 0.3, quiet: true },
  ];

  ctx.font = `9px ${ink.fontData}`;
  ctx.fillStyle = ink.mut;
  ctx.fillText('dopamine neuron, schematic', p.x, p.y + 8);

  rows.forEach((row, i) => {
    const top = p.y + head + i * rowH;
    const base = top + rowH - 16;
    const amp = base - (top + 12);

    ctx.fillStyle = ink.mut;
    ctx.fillText(row.label, p.x, top + 9);

    ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, base); ctx.lineTo(p.x + p.w, base); ctx.stroke();

    // the firing trace: flat, one burst, flat
    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let s = 0; s <= 80; s++) {
      const u = s / 80;
      const d = (u - row.burstAt) / 0.035;
      const x = p.x + u * p.w;
      const y = base - Math.exp(-d * d) * amp;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // event markers: the tone at 0.3, the sucrose at 0.68
    for (const [u, name] of [[0.3, 'CS'], [0.68, 'US']]) {
      const x = p.x + u * p.w;
      ctx.save();
      ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
      ctx.strokeStyle = u === 0.3 ? ink.accent : ink.mut;
      ctx.beginPath(); ctx.moveTo(x, top + 12); ctx.lineTo(x, base); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = u === 0.3 ? ink.accent : ink.mut;
      ctx.fillText(name, x - 6, base + 11);
    }

    if (row.quiet) {
      ctx.fillStyle = ink.mut;
      ctx.fillText('quiet', p.x + 0.68 * p.w + 5, base - 4);
    }
  });
}

REFERENCES.d01 = {
  title: 'Fig. 1 — Subject #23, Pavlovian acquisition',
  subtitle: 'prediction error at the tone and at the sucrose, by trial',
  caption: 'Left: prediction error measured at tone onset (pink) and at sucrose delivery (dark) '
    + 'across trials. The marked crossover is the first trial where the cue error exceeds the '
    + 'reinforcer error on a three-trial average. Right: the same result as recorded from midbrain '
    + 'dopamine neurons, schematic after Schultz, Dayan & Montague (1997).',
  citation: 'Reference schematic after Schultz, W., Dayan, P. & Montague, P. R. (1997), '
    + 'A neural substrate of prediction and reward, Science 275, 1593–1599.',
  axis: { x: 'trial →', y: 'δ →' },

  draw(ctx, box, ink, { metrics }) {
    const cs = metrics.deltaCS || [];
    const us = metrics.deltaUS || [];
    const n = Math.max(cs.length, us.length, 2);

    const gap = 22;
    const left = { x: box.x, y: box.y, w: box.w * 0.6 - gap, h: box.h };
    const right = { x: box.x + box.w * 0.6, y: box.y, w: box.w * 0.4, h: box.h };

    const hi = Math.max(0.2, ...cs, ...us);
    const lo = Math.min(-0.05, ...cs, ...us);
    const X = (i) => left.x + (left.w * i) / Math.max(1, n - 1);
    const Y = (v) => left.y + left.h - (left.h * (v - lo)) / (hi - lo);

    // The topmost numbers are left off, because the rotated axis title runs down that
    // part of the margin. The title here is two glyphs, so it needs little room.
    const scale = box.w / 550;
    const titleFoot = box.y + 34 * scale;
    ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
    ctx.font = `9px ${ink.fontData}`;
    for (let v = Math.ceil(lo * 5) / 5; v <= hi; v += 0.2) {
      ctx.beginPath(); ctx.moveTo(left.x, Y(v)); ctx.lineTo(left.x + left.w, Y(v)); ctx.stroke();
      if (Y(v) > titleFoot) {
        ctx.fillStyle = ink.mut;
        ctx.fillText(v.toFixed(1), left.x - 22, Y(v) + 3);
      }
    }
    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y); ctx.lineTo(left.x, left.y + left.h);
    ctx.lineTo(left.x + left.w, left.y + left.h);
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = ink.mut; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(left.x, Y(0)); ctx.lineTo(left.x + left.w, Y(0)); ctx.stroke();
    ctx.restore();

    const series = (data, color, width) => {
      if (data.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      data.forEach((v, i) => { const y = Y(v); if (i === 0) ctx.moveTo(X(i), y); else ctx.lineTo(X(i), y); });
      ctx.stroke();
    };
    series(us, ink.ink, 1.7);
    series(cs, ink.accent, 1.7);

    const xt = crossoverTrial(cs, us);
    if (xt) {
      const x = X(xt - 1);
      ctx.save();
      ctx.strokeStyle = ink.mut; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, left.y + 50); ctx.lineTo(x, left.y + left.h); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = ink.ink;
      ctx.font = `9px ${ink.fontData}`;
      const label = 'crossover, trial ' + xt;
      const w = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(x + 4, left.x + left.w - w), left.y + 46);
    }

    ctx.font = `9px ${ink.fontData}`;
    const key = (color, text, row) => {
      const y = left.y + 8 + row * 12;
      ctx.strokeStyle = color; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(left.x + 4, y - 3); ctx.lineTo(left.x + 20, y - 3); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(text, left.x + 25, y);
    };
    key(ink.ink, 'δ at sucrose', 0);
    key(ink.accent, 'δ at tone', 1);

    ctx.fillStyle = ink.mut;
    for (let i = 0; i < n; i += Math.ceil(n / 6)) ctx.fillText(String(i + 1), X(i) - 3, left.y + left.h + 12);

    drawSchultzPanel(ctx, right, ink);
  },

  stats(metrics) {
    const us = metrics.deltaUS || [];
    const cs = metrics.deltaCS || [];
    const k = Math.max(1, Math.round(us.length / 6));
    return [
      [crossoverTrial(cs, us) || '—', 'crossover trial'],
      [mean(us.slice(0, k)).toFixed(2) + ' → ' + mean(us.slice(-k)).toFixed(2), 'δ at sucrose'],
      [mean(cs.slice(0, k)).toFixed(2) + ' → ' + mean(cs.slice(-k)).toFixed(2), 'δ at tone'],
      [metrics.phenotype || 'mixed', 'phenotype'],
    ];
  },

  interpret(metrics) {
    const us = metrics.deltaUS || [];
    const cs = metrics.deltaCS || [];
    const k = Math.max(1, Math.round(us.length / 6));
    const usEarly = mean(us.slice(0, k)), usLate = mean(us.slice(-k));
    const csEarly = mean(cs.slice(0, k)), csLate = mean(cs.slice(-k));
    const xt = crossoverTrial(cs, us);
    const out = [];

    let first = `The tone predicted sucrose two seconds later, thirty times, and you were never `
      + `required to do anything about it. On your first trials the prediction error at the `
      + `sucrose was <b>${usEarly.toFixed(2)}</b> and at the tone <b>${csEarly.toFixed(2)}</b>: `
      + `the reward was the surprise. By the end those were `
      + `<b>${usLate.toFixed(2)}</b> and <b>${csLate.toFixed(2)}</b>. `;
    if (xt && xt <= 12) {
      first += `They swapped places on trial <b>${xt}</b>, early, which means the tone became a `
        + 'reliable announcement almost as soon as it could.';
    } else if (xt) {
      first += `They swapped places on trial <b>${xt}</b>, ${crossoverBand(xt, us.length)} — the `
        + 'tone took a while to be believed, and the sucrose kept some of its surprise until then.';
    } else {
      first += 'They never swapped places, so on this run the sucrose stayed more surprising than '
        + 'its own warning for all thirty trials.';
    }
    out.push(first);

    out.push('That migration is the whole result on the right-hand panel. A dopamine neuron fires '
      + 'to an unexpected reward, and once a cue reliably precedes it, fires to the cue and goes '
      + 'quiet at the reward itself. Nothing here was scripted to do that: the same temporal '
      + 'difference update that learns the value of the tone is what drains the burst off the '
      + 'sucrose. <cite>Schultz, Dayan &amp; Montague (1997), Science 275, 1593–1599.</cite>');

    const p = metrics.phenotype;
    const counts = metrics.approachCounts || {};
    const tray = counts.tray || 0, speaker = counts.speaker || 0;
    let third = `You went to the cup ${tray} times and to the speaker ${speaker} times. `;
    if (p === 'sign-tracker') {
      third += 'When the tone came on you went to <b>the tone</b>. That is sign-tracking: the cue '
        + 'itself acquires the pull, not just the information. Sign-trackers work for cues, and '
        + 'in rats the trait travels with a set of others that matter — they are more impulsive '
        + 'in action and take drugs more readily than goal-trackers do.';
    } else if (p === 'goal-tracker') {
      third += 'When the tone came on you went to <b>the cup</b>. That is goal-tracking: the tone '
        + 'was information about where to be, and nothing more. Goal-trackers treat a cue as a '
        + 'signpost; sign-trackers treat it as the thing itself.';
    } else {
      third += 'You split your visits between the cup and the speaker, which puts you between the '
        + 'two phenotypes. Rats do this too; the classification is a continuum that only looks '
        + 'binary at the ends.';
    }
    third += ' <cite>Flagel et al. (2010), Neuropsychopharmacology 35, 388–400.</cite>';
    out.push(third);

    out.push('One thing deliberately did not change all session: the sound the sucrose makes when '
      + 'you take it. Wanting moved. Liking sat still.');
    return out;
  },

  share(metrics) {
    const p = metrics.phenotype || 'mixed';
    const xt = crossoverTrial(metrics.deltaCS || [], metrics.deltaUS || []);
    if (xt) return `I'm a ${p}: my dopamine moved to the tone by trial ${xt}.`;
    return `I'm a ${p}, and the sucrose still surprised me on trial 30.`;
  },
};

TRIVIA.d01 = {
  title: 'There was no bell',
  body: 'Pavlov almost never used a bell. The laboratory ran on <b>metronomes, buzzers, whistles, '
    + 'harmoniums, electric shocks to the skin and rotating objects</b>, chosen because their onset '
    + 'and offset could be controlled exactly and timed against the drop count. The building itself '
    + 'was purpose-built for stimulus control: a moated, sound-damped structure the staff called '
    + 'the Tower of Silence, so that nothing reached a dog except the thing being tested. The bell '
    + 'is a translation artifact that spread through textbooks, and it has been passed along ever '
    + 'since by people who never opened the lectures.',
  source: 'Pavlov, I. P. (1927). Conditioned Reflexes, trans. G. V. Anrep. Oxford University Press; '
    + 'Todes, D. P. (2014). Ivan Pavlov: A Russian Life in Science. Oxford University Press.',
};
