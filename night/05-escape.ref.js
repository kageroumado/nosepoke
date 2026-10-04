/**
 * Debrief figure and history card for the escape.
 *
 * One panel, one session, four bands. The escape is a single continuous record, so the
 * figure is the record: everything the subject did, with the four paradigms marked
 * across it in the order the colony used them.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { drawCumulativeRecord } from '../shared/rig.js';

REFERENCES.n05 = {
  title: 'Fig. N5 — the escape, colony subject 23',
  subtitle: 'cumulative responses across four beats',
  caption: 'The whole run on one axis. Shaded bands are the four beats; the line is every response '
    + 'made, and the pips are what the colony collected on the way. Each band was timed from the '
    + 'record the same subject left on the days it was a subject.',
  citation: 'The four paradigms, in order: Pavlov (1927); Ferster & Skinner (1957); Kamin (1969); '
    + 'Salamone, Cousins & Bucher (1994).',
  axis: { x: 'time →', y: 'responses →' },

  draw(ctx, box, ink, { sim, metrics }) {
    const beats = metrics.beats || [];
    const tEnd = Math.max(sim.S.t, 1);
    const X = (t) => box.x + (t / tEnd) * box.w;

    beats.forEach((b, i) => {
      const x0 = X(b.from);
      const x1 = X(Math.min(b.to, tEnd));
      ctx.save();
      ctx.globalAlpha = i % 2 ? 0.5 : 0.26;
      ctx.fillStyle = ink.grid;
      ctx.fillRect(x0, box.y, Math.max(1, x1 - x0), box.h);
      ctx.restore();

      // A band only gets as much of its caption as it has room for; the beat number
      // always fits, and the rest of the detail is in the paragraphs below.
      const w = x1 - x0;
      ctx.save();
      ctx.translate(x0 + 5, box.y + 6);
      ctx.fillStyle = b.cleared ? ink.ink : ink.mut;
      ctx.font = `600 9.5px ${ink.fontData}`;
      ctx.fillText(String(i + 1), 0, 8);
      if (ctx.measureText(b.label).width + 20 < w) ctx.fillText(b.label, 13, 8);
      ctx.fillStyle = ink.mut;
      ctx.font = `9px ${ink.fontData}`;
      if (ctx.measureText(b.detail).width + 12 < w) ctx.fillText(b.detail, 0, 20);
      ctx.restore();
    });

    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();

    drawCumulativeRecord(ctx, { x: box.x, y: box.y + 34, w: box.w, h: box.h - 34 }, sim.S.events, tEnd, {
      ink: ink.ink, pip: ink.accent, lineWidth: 1.6,
    });

    // Cue onsets sit on the floor of the plot: the squeak the colony moved on, and the
    // alarm it did not.
    for (const e of sim.S.events) {
      if (e.type !== 'cue') continue;
      ctx.strokeStyle = e.name === 'light' ? ink.accent : ink.mut;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(X(e.t), box.y + box.h);
      ctx.lineTo(X(e.t), box.y + box.h - 9);
      ctx.stroke();
    }
  },

  stats(metrics) {
    const cleared = metrics.beats.filter((b) => b.cleared).length;
    return [
      [`${cleared} / ${metrics.beats.length}`, 'beats cleared'],
      [metrics.seconds.toFixed(0) + ' s', 'from the nest to the door'],
      [metrics.responses, 'responses made'],
      [metrics.timesSeen, 'times seen at the crack'],
    ];
  },

  interpret(metrics) {
    const out = [];
    const cleared = metrics.beats.filter((b) => b.cleared).length;
    const src = metrics.sources || {};

    if (cleared === metrics.beats.length) {
      out.push('Squeak, count, hold, climb. Four beats, four clean, and the door was open at '
        + `<b>${metrics.seconds.toFixed(0)} seconds</b>. Nothing in that sequence was new tonight. `
        + 'You had already done every part of it, in a chamber, for pellets, while somebody wrote it down.');
    } else if (cleared >= metrics.beats.length - 1) {
      out.push(`<b>${cleared} of ${metrics.beats.length}</b> beats went the way they were meant to. The `
        + 'colony is out. Escapes do not require a clean run, only that the part which failed was not '
        + 'the part with the guard in it.');
    } else {
      out.push(`<b>${cleared} of ${metrics.beats.length}</b>. It was a noisy way out and everybody got `
        + 'through the door anyway, which is roughly what the literature would predict of an animal '
        + 'running four learned procedures under time pressure for the first time in one night.');
    }

    const have = src.fromRecord || {};
    const clauses = [];
    clauses.push(have.n01
      ? `The colony waited ${src.squeaksNeeded === 1 ? 'one squeak' : 'two squeaks'}, which is how `
        + 'reliably you answered the cart in the mess hall.'
      : 'The colony waited two squeaks, the number a rat gets when there is no mess-hall session in '
        + 'its record.');
    clauses.push(have.n02 || have.d05
      ? `The guard's round was <b>${src.interval} s</b>, the interval you learned to time `
        + `${have.n02 ? 'on the lookout' : 'in the chamber'}, and the marker on the bar sat at `
        + `${(src.quarterLife * 100).toFixed(0)}% of it, where you usually go.`
      : `The guard's round was <b>${src.interval} s</b>, the house figure, because there is no `
        + 'fixed-interval session of yours to take one from.');
    clauses.push(src.blocked != null
      ? `The hold under the alarm ran <b>${src.hold.toFixed(1)} s</b>, set by the `
        + `${Math.round(src.blocked * 100)}% the light managed to teach you on the night it went in.`
      : `The hold under the alarm ran <b>${src.hold.toFixed(1)} s</b>, the length a colony holds when `
        + 'nobody has tested the light on it yet.');
    clauses.push(src.carriers
      ? `The wall wanted <b>${src.wallPresses}</b> efforts, after the ${src.carriers} who went up `
        + 'ahead of you left the rope.'
      : `The wall wanted <b>${src.wallPresses}</b> efforts, with nobody ahead of you to leave a rope.`);
    out.push('None of the numbers in this run were chosen for you. ' + clauses.join(' '));

    out.push('That is the whole trick of the night and it is also the whole trick of the building. '
      + 'A schedule teaches an animal the shape of its own environment, and the shape is portable. '
      + 'The people running the sessions were measuring how well you learned. They were not asking '
      + 'what you would do with it.');

    out.push('Beat by beat: '
      + metrics.beats.map((b) => `<b>${b.label}</b>, ${b.detail}`).join('; ') + '.');

    if (metrics.timesSeen > 2) {
      out.push(`You were seen at the crack <b>${metrics.timesSeen}</b> times getting the count. Nothing `
        + 'happened. A fixed interval has no punishment in it at all; it simply does not pay early, '
        + 'and everything an animal does about that it works out for itself.');
    }
    return out;
  },

  share(metrics) {
    const cleared = metrics.beats.filter((b) => b.cleared).length;
    return `Four learned paradigms, ${cleared} clean, ${metrics.seconds.toFixed(0)} seconds from the nest to the door.`;
  },
};

TRIVIA.n05 = {
  title: 'The electrode that missed',
  body: 'In 1953 James Olds was new to stereotaxic surgery and put an electrode into a rat somewhat '
    + 'off its intended target. The animal kept returning to the corner of the box where it had been '
    + 'stimulated, and then it would go wherever the current was. Olds and Peter Milner followed that '
    + 'accident into the paper that founded the whole reward-circuitry literature, and rats given a '
    + 'lever wired to the same placement pressed it thousands of times an hour. Nearly everything in '
    + 'this building descends from a piece of wire in slightly the wrong place.',
  source: 'Olds, J. & Milner, P. (1954). Positive reinforcement produced by electrical stimulation of '
    + 'septal area and other regions of rat brain. Journal of Comparative and Physiological '
    + 'Psychology, 47(6), 419-427.',
};
