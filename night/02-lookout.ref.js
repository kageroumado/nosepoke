/**
 * Debrief figure and history card for the lookout.
 *
 * The figure puts tonight's cumulative record on the same axes as the player's own
 * fixed-interval session from day five, so the comparison is their record against
 * their record rather than against an ideal.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { drawCumulativeRecord } from '../shared/rig.js';
import { load, levelMetrics } from '../shared/save.js';

/**
 * Peeks sorted into the three things a peek can be: too early and seen, on time and
 * counted, or so late the guard has already gone by.
 *
 * @param {object} sim the running or finished session
 * @returns {{interval:number, counted:number, seen:number, late:number,
 *            overruns:number[], meanOverrun:number}}
 */
export function watchRecord(sim) {
  const interval = (sim.cfg.schedule && sim.cfg.schedule.interval) || 12;
  const overruns = [];
  let seen = 0, counted = 0, late = 0, from = 0;
  for (const e of sim.S.events) {
    if (e.type === 'poke' || e.type === 'press') {
      if (e.t - from < interval) seen++;
    } else if (e.type === 'delivery') {
      const over = e.t - from - interval;
      overruns.push(Math.max(0, over));
      if (over > interval * 0.5) late++;
      counted++;
      from = e.t;
    }
  }
  const mean = overruns.length ? overruns.reduce((a, b) => a + b, 0) / overruns.length : 0;
  return { interval, counted, seen, late, overruns, meanOverrun: mean };
}

/**
 * The player's own fixed-interval session, if the save still holds one. Full event
 * logs age out of the record, so this reports what it found and the page says so.
 *
 * @returns {{events: Array|null, metrics: object|null, source: 'record'|'metrics'|'none'}}
 */
export function dayFiveRecord() {
  const state = load();
  const rows = (state.record || []).filter((r) => r.level === 'd05' && r.events && r.events.length);
  const metrics = levelMetrics('d05');
  if (rows.length) return { events: rows[rows.length - 1].events, metrics: rows[rows.length - 1].metrics || metrics, source: 'record' };
  if (metrics) return { events: null, metrics, source: 'metrics' };
  return { events: null, metrics: null, source: 'none' };
}

/** An idealized scalloped record, used when the player has no day-five session on file. */
function idealScallop(interval, reinforcers, perInterval) {
  const out = [];
  let t = 0;
  for (let k = 0; k < reinforcers; k++) {
    for (let i = 0; i < perInterval; i++) {
      out.push({ t: t + Math.pow((i + 1) / perInterval, 1 / 3) * interval, type: 'poke' });
    }
    t += interval;
    out.push({ t, type: 'delivery' });
  }
  return out;
}

REFERENCES.n02 = {
  title: 'Fig. N2 — the lookout, colony subject 23',
  subtitle: 'cumulative peeks vs. time, tonight against your day-five record',
  caption: 'Tonight (solid) and your own fixed-interval session from the chamber (dashed), each '
    + 'stretched across the same box so the shapes can be compared. Pips mark a counted round.',
  citation: 'Curvature index after Fry, Kelleher & Cook (1960); the scallop after Ferster & Skinner (1957).',
  axis: { x: 'time →', y: 'peeks →' },

  draw(ctx, box, ink, { sim, metrics }) {
    const S = sim.S;
    const first = S.events.find((e) => e.type === 'poke' || e.type === 'press');
    const tStart = first ? first.t : 0;
    const day = metrics.dayFive || dayFiveRecord();

    ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();

    const mine = S.events.filter((e) => e.type === 'poke' || e.type === 'press').length;
    let past = day.events;
    let pastLabel = 'day 5, your record';
    if (!past) {
      const iv = (day.metrics && day.metrics.interval) || 12;
      past = idealScallop(iv, 8, Math.max(5, Math.round(mine / 8)));
      pastLabel = day.metrics ? 'day 5, idealized (log aged out)' : 'idealized scallop';
    }
    const pastResp = past.filter((e) => e.type === 'poke' || e.type === 'press');
    const pastStart = pastResp.length ? pastResp[0].t : 0;
    const pastEnd = past.length ? past[past.length - 1].t : 1;
    const scaleTo = Math.max(mine, pastResp.length, 10);

    drawCumulativeRecord(ctx, box, past, pastEnd, {
      ink: ink.mut, pip: ink.mut, lineWidth: 1.1, tStart: pastStart, dashed: true, scaleTo,
    });
    drawCumulativeRecord(ctx, box, S.events, S.t, {
      ink: ink.ink, pip: ink.accent, lineWidth: 1.6, tStart, scaleTo,
    });

    ctx.font = `9.5px ${ink.fontData}`;
    ctx.fillStyle = ink.ink;
    ctx.fillText('tonight', box.x + 8, box.y + 12);
    ctx.fillStyle = ink.mut;
    ctx.fillText(pastLabel, box.x + 8, box.y + 24);
  },

  stats(metrics, sim) {
    const rec = watchRecord(sim);
    const day = metrics.dayFive || dayFiveRecord();
    const mine = sim.indexOfCurvature();
    const theirs = day.metrics && day.metrics.fryIndex != null ? day.metrics.fryIndex : null;
    return [
      [rec.counted, 'rounds counted'],
      [rec.seen, 'peeks too early'],
      [mine.toFixed(2), 'index of curvature, tonight'],
      [theirs == null ? '—' : theirs.toFixed(2), 'index of curvature, day 5'],
    ];
  },

  interpret(metrics, sim) {
    const rec = watchRecord(sim);
    const day = metrics.dayFive || dayFiveRecord();
    const mine = sim.indexOfCurvature();
    const out = [];

    if (mine > 0.15) {
      out.push(`You held still after each round and then quickened as the next one came due. That shape `
        + `has a name and a number: the <b>scallop</b>, index of curvature <b>${mine.toFixed(2)}</b>. `
        + `Every peek you did not take is a peek the guard did not catch, and the only thing telling you `
        + 'when to take one was an interval you were never shown.');
    } else if (mine > -0.05) {
      out.push(`You peeked at a fairly even rate the whole way through, index of curvature `
        + `<b>${mine.toFixed(2)}</b>. It works, in that the rounds still got counted. It also means `
        + `${rec.seen} peeks landed while the corridor was still occupied.`);
    } else {
      out.push(`You peeked hardest right after each round went by, index of curvature `
        + `<b>${mine.toFixed(2)}</b>, which is precisely when the next one was furthest away. `
        + 'Nothing punishes it. It simply spends the whole night looking at an empty corridor.');
    }

    if (day.source === 'record' || day.source === 'metrics') {
      const theirs = day.metrics && day.metrics.fryIndex != null ? day.metrics.fryIndex : 0;
      const delta = mine - theirs;
      if (Math.abs(delta) < 0.08) {
        out.push(`In the chamber on day five you scored ${theirs.toFixed(2)}. Tonight you scored `
          + `${mine.toFixed(2)}. The room changed, the reason changed, the reinforcer changed, and the `
          + 'shape of the behavior did not. That is what it means to say a schedule controls responding.');
      } else if (delta > 0) {
        out.push(`In the chamber you scored ${theirs.toFixed(2)}; tonight, ${mine.toFixed(2)}. You time `
          + 'the corridor better than you ever timed the hopper. The interval is a little different and '
          + 'you had already learned how to learn one.');
      } else {
        out.push(`In the chamber you scored ${theirs.toFixed(2)}; tonight, ${mine.toFixed(2)}. The `
          + 'timing is looser out here, which is what tends to happen when the cost of a wrong guess '
          + 'is a person in the corridor rather than a wasted poke.');
      }
    } else {
      out.push('There is no day-five session in your record yet, so the dashed line is the idealized '
        + 'scallop rather than your own. Run the fixed-interval session in the chamber and come back: '
        + 'the comparison is the whole point of the figure.');
    }

    out.push(`Peeks that landed while the round was still running: <b>${rec.seen}</b>. Rounds where you `
      + `waited so long the guard had already gone past: <b>${rec.late}</b>, an average of `
      + `${rec.meanOverrun.toFixed(1)} s late. A fixed interval punishes neither one. It just refuses to `
      + 'pay for either, and the animal works the rest out from that alone.');
    return out;
  },

  share(metrics) {
    const i = metrics.fryIndex != null ? metrics.fryIndex : 0;
    return `I timed a guard's rounds from inside a nest (index of curvature ${i.toFixed(2)}).`;
  },
};

TRIVIA.n02 = {
  title: 'Project Pigeon',
  body: 'In 1943 the American National Defense Research Committee gave B. F. Skinner money to put '
    + 'pigeons inside a missile. The birds were conditioned to peck at the image of a target projected '
    + 'onto a screen in the nose cone; their pecks steered the thing. It worked in the laboratory. The '
    + 'committee watched a demonstration, declined to believe it, and cancelled the project in 1944. '
    + 'The Navy revived it quietly in the 1950s under the name <b>ORCON</b>, for organic control, and '
    + 'no pigeon was ever fired at anything. Skinner wrote it up afterwards and said the hardest part '
    + 'had been getting anyone to take a trained animal seriously as an instrument.',
  source: 'Skinner, B. F. (1960). Pigeons in a pelican. American Psychologist, 15(1), 28-37.',
};
