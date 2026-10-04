/**
 * The day-9 debrief figure and trivia card, registered additively into the shared
 * runtime. Importing this module is what teaches `figure.js` and `shell.js` about d09.
 *
 * The figure is three panels: infusions per session against a schematic of what access
 * length does to intake, the wanting-against-liking comparison, and a raster of when
 * every infusion in the protocol was taken.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { TIMEOUT, escalationRatio } from './09-self-admin.session.js';

/** Intake is called escalated above this ratio of last session to first. */
const ESCALATED = 1.2;

/**
 * The figure's own scale factor. `renderFigure` sizes the box from the canvas width,
 * so text and rules can be recovered from the box and stay legible in the 1600 px export.
 */
function scaleOf(box) { return Math.max(0.6, box.w / 550); }

/** The per-session rows, from the metrics the page assembled. */
function rows(metrics) { return metrics.days || []; }

REFERENCES.d09 = {
  title: 'Fig. 1 — Subject #23, intravenous self-administration',
  subtitle: 'three sessions, Raturn platform, unit dose held constant',
  caption: 'a: infusions per session, yours against a subject that acquires no tolerance. '
    + 'b: responses per minute against what one infusion was worth, each relative to '
    + 'session 1. c: every infusion of the protocol in time, with the loading run shaded.',
  citation: 'Escalation after Ahmed & Koob (1998), Science 282, 298.',

  draw(ctx, box, ink, { sim, metrics }) {
    const s = scaleOf(box);
    const d = rows(metrics);
    if (!d.length) return;

    // The panel letters sit above each panel, so the whole stack is inset to clear the
    // figure's own subtitle.
    const gap = 26 * s;
    const rowY = box.y + 12 * s;
    const topH = (box.h - 12 * s) * 0.54;
    const A = { x: box.x, y: rowY, w: (box.w - gap) * 0.5, h: topH };
    const B = { x: box.x + (box.w - gap) * 0.5 + gap, y: rowY, w: (box.w - gap) * 0.5, h: topH };
    const C = { x: box.x, y: rowY + topH + gap * 1.25, w: box.w, h: box.h - 12 * s - topH - gap * 1.25 };

    const axes = (p) => {
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + p.h);
      ctx.lineTo(p.x + p.w, p.y + p.h);
      ctx.stroke();
    };
    const tag = (p, letter, text) => {
      ctx.fillStyle = ink.ink;
      ctx.font = `600 ${11 * s}px ${ink.fontUI}`;
      ctx.fillText(letter, p.x - 12 * s, p.y - 7 * s);
      ctx.fillStyle = ink.mut;
      ctx.font = `${9.5 * s}px ${ink.fontData}`;
      ctx.fillText(text, p.x + 5 * s, p.y - 7 * s);
    };

    // --- a: infusions per session -------------------------------------------
    axes(A);
    tag(A, 'a', 'infusions per session');
    const peak = Math.max(4, ...d.map((r) => r.infusions)) * 1.2;
    const ax = (i) => A.x + ((i + 0.5) / d.length) * A.w;
    const ay = (v) => A.y + A.h - (v / peak) * A.h;

    // A subject that acquires no tolerance holds its intake across days, because the
    // same dose keeps buying the same level. The line that moves is the one that adapts.
    ctx.save();
    ctx.strokeStyle = ink.mut;
    ctx.lineWidth = 1.1 * s;
    ctx.setLineDash([5 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(ax(0), ay(d[0].infusions));
    ctx.lineTo(ax(d.length - 1), ay(d[0].infusions));
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    d.forEach((r, i) => (i === 0 ? ctx.moveTo(ax(i), ay(r.infusions)) : ctx.lineTo(ax(i), ay(r.infusions))));
    ctx.stroke();
    ctx.fillStyle = ink.accent;
    ctx.font = `${9.5 * s}px ${ink.fontData}`;
    d.forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(ax(i), ay(r.infusions), 3.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink.ink;
      ctx.fillText(String(r.infusions), ax(i) - 4 * s, ay(r.infusions) - 8 * s);
      ctx.fillStyle = ink.accent;
    });
    ctx.fillStyle = ink.mut;
    ctx.font = `${9.5 * s}px ${ink.fontData}`;
    d.forEach((r, i) => ctx.fillText('day ' + r.day, ax(i) - 12 * s, A.y + A.h + 12 * s));
    ctx.fillText('no tolerance', A.x + 6 * s, ay(d[0].infusions) + 12 * s);

    // --- b: wanting against liking ------------------------------------------
    // Both series are the subject's own, both relative to session 1: the work it put in,
    // and what one infusion was actually worth once tolerance had taken its cut.
    axes(B);
    tag(B, 'b', 'relative to session 1');
    const wants = d.map((r) => r.pressesPerMin / (d[0].pressesPerMin || 1));
    const worth = d.map((r) => r.meanEffect / (d[0].meanEffect || 1));
    const top = Math.max(1.6, ...wants) * 1.15;
    const bx = (i) => B.x + ((i + 0.5) / d.length) * B.w;
    const by = (v) => B.y + B.h - (v / top) * B.h;

    const series = (vals, color, dash) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8 * s;
      if (dash) ctx.setLineDash([4 * s, 3 * s]);
      ctx.beginPath();
      vals.forEach((v, i) => (i === 0 ? ctx.moveTo(bx(i), by(v)) : ctx.lineTo(bx(i), by(v))));
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      vals.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(bx(i), by(v), 2.8 * s, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    series(wants, ink.accent, false);
    series(worth, ink.ink, true);

    ctx.font = `${9.5 * s}px ${ink.fontData}`;
    ctx.fillStyle = ink.accent;
    ctx.fillText('responses / min', B.x + 6 * s, by(wants[wants.length - 1]) - 8 * s);
    ctx.fillStyle = ink.ink;
    ctx.fillText('worth of one infusion', B.x + 6 * s, B.y + B.h - 7 * s);
    ctx.fillStyle = ink.mut;
    d.forEach((r, i) => ctx.fillText('day ' + r.day, bx(i) - 12 * s, B.y + B.h + 12 * s));

    // --- c: when every infusion was taken -----------------------------------
    const span = Math.max(...d.map((r) => r.duration));
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.moveTo(C.x, C.y);
    ctx.lineTo(C.x, C.y + C.h);
    ctx.lineTo(C.x + C.w, C.y + C.h);
    ctx.stroke();
    tag(C, 'c', 'infusion times, loading run shaded');

    const lane = C.h / d.length;
    d.forEach((r, i) => {
      const y0 = C.y + i * lane + lane * 0.18;
      const y1 = C.y + (i + 1) * lane - lane * 0.18;
      const wEnd = C.x + (r.duration / span) * C.w;

      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = ink.accent;
      ctx.fillRect(C.x, y0, ((r.loadingSeconds + 4) / span) * C.w, y1 - y0);
      ctx.restore();

      ctx.strokeStyle = ink.grid;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(C.x, (y0 + y1) / 2);
      ctx.lineTo(wEnd, (y0 + y1) / 2);
      ctx.stroke();

      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 1.4 * s;
      for (const t of r.infusionTimes) {
        const x = C.x + (t / span) * C.w;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
      ctx.fillStyle = ink.mut;
      ctx.font = `${9 * s}px ${ink.fontData}`;
      ctx.fillText('d' + r.day, C.x - 20 * s, (y0 + y1) / 2 + 3 * s);
    });
    ctx.fillStyle = ink.mut;
    ctx.font = `${9.5 * s}px ${ink.fontData}`;
    ctx.fillText('time in session →', C.x + C.w - 90 * s, C.y + C.h + 12 * s);
  },

  stats(metrics) {
    const d = rows(metrics);
    const first = d[0] || { infusions: 0, meanEffect: 1 };
    const last = d[d.length - 1] || { infusions: 0, tolerance: 0, meanEffect: 0 };
    const ratio = escalationRatio(d);
    const worth = first.meanEffect ? last.meanEffect / first.meanEffect : 0;
    return [
      [metrics.totalInfusions, 'infusions, three sessions'],
      [`${first.infusions} → ${last.infusions}`, 'session 1 → session 3'],
      [ratio ? ratio.toFixed(2) + '×' : '—', 'escalation'],
      [Math.round(worth * 100) + '%', 'what one infusion was still worth'],
    ];
  },

  interpret(metrics, sim) {
    const d = rows(metrics);
    const out = [];
    if (!d.length) return out;
    const first = d[0];
    const last = d[d.length - 1];
    const ratio = escalationRatio(d);
    const worth = first.meanEffect ? last.meanEffect / first.meanEffect : 0;

    let lede = 'The syringe was loaded the same on all three days, every session ran the same '
      + `length, and the lever went dead for ${TIMEOUT} seconds after every infusion. `
      + 'The only thing that changed across the protocol was the subject. ';
    if (ratio >= ESCALATED) {
      lede += `You took ${first.infusions} infusions in session 1 and <b>${last.infusions}</b> in `
        + `session 3, a ratio of <b>${ratio.toFixed(2)}</b>. Intake that climbs on a fixed dose in `
        + 'a fixed session is the escalation result, and the reason it climbs is underneath it: '
        + 'the level that used to be enough stops being reachable at the old price '
        + '<cite>(Ahmed &amp; Koob 1998)</cite>.';
    } else if (ratio > 0.85) {
      lede += `You took ${first.infusions} infusions in session 1 and ${last.infusions} in session 3. `
        + 'Your intake held rather than climbed, which is what a subject that never gets far enough '
        + 'ahead of the timeout looks like: the schedule capped you before your own adaptation did.';
    } else {
      lede += `You took ${first.infusions} infusions in session 1 and ${last.infusions} in session 3. `
        + 'Intake fell across the protocol, which is the one direction this arrangement rarely '
        + 'produces; you stopped working before the schedule stopped paying.';
    }
    out.push(lede);

    out.push('Watch what the dose was doing while that happened. Every infusion left the subject '
      + `a little more tolerant, so by session 3 one infusion was worth <b>${Math.round(worth * 100)}%</b> `
      + `of what it was worth on the first day (tolerance ${first.tolerance.toFixed(2)} rising to `
      + `${last.tolerance.toFixed(2)}). Panel b is those two lines crossing: the work going up while `
      + 'what the work buys goes down. That is the wanting-and-liking dissociation with a mechanism '
      + 'attached, and it is the same figure the arc has been building toward since the electrode '
      + '<cite>(Berridge &amp; Robinson 1998)</cite>.');

    if (last.loadingInfusions > first.loadingInfusions) {
      out.push('Panel c is where the shape of a session lives. Session 1 opened with a run of '
        + `<b>${first.loadingInfusions}</b> infusions taken as fast as the timeout allowed and then `
        + 'the intervals stretched out: a <b>loading phase</b> followed by maintenance, the subject '
        + 'bringing the circulating level up and then spacing its work to hold it there. By '
        + `session 3 the opening run was <b>${last.loadingInfusions}</b> infusions long. The `
        + 'maintenance phase is being eaten by the loading phase, which is what escalation looks '
        + 'like from inside one session.');
    } else {
      out.push(`Session 1 opened with a run of ${first.loadingInfusions} infusions at the shortest `
        + `interval the timeout allowed and session 3 opened with ${last.loadingInfusions}. Panel c `
        + 'shows the spacing you settled into: each infusion taken once the last one had worn off '
        + 'far enough, which is titration rather than habit.');
    }

    const sameRatio = d.filter((r) => r.ratio === last.ratio);
    if (sameRatio.length >= 2 && sameRatio[0].day !== first.day) {
      const a = sameRatio[0], b = sameRatio[sameRatio.length - 1];
      const clean = b.pressesPerMin / Math.max(0.01, a.pressesPerMin);
      out.push('One caveat on panel b, because the price also moved: session 1 paid one press per '
        + `infusion and the later sessions paid ${last.ratio}. Sessions ${a.day} and ${b.day} were `
        + `priced the same as each other, and between those two alone the rate still went up `
        + `<b>${clean.toFixed(2)}×</b>. The ratio change is not what produced the climb.`);
    }

    const strain = sim.cfg.strain;
    if (strain === 'lewis') {
      out.push('One more thing about this subject. The colony sent a <b>Lewis</b> rat for this '
        + 'protocol, and the learning rate the model gave it on these sessions is half again the '
        + 'rate a Sprague-Dawley would have had. Strains differ in how fast they acquire '
        + 'self-administration, and the difference is heritable rather than chosen '
        + '<cite>(Kosten et al. 1997; Piazza et al. 1989)</cite>.');
    }

    if (metrics.timeoutPresses > 0) {
      out.push(`You pressed <b>${metrics.timeoutPresses}</b> times while the lever was dead. Those `
        + 'presses did nothing at all, which is why they are the most informative thing in the '
        + 'record: they are responding the schedule cannot explain.');
    }
    return out;
  },

  share(metrics) {
    const d = rows(metrics);
    const ratio = escalationRatio(d);
    if (ratio >= ESCALATED) {
      return `My intake climbed ${ratio.toFixed(2)}× on a dose that never changed.`;
    }
    return `${metrics.totalInfusions} infusions across three days, one unchanged dose.`;
  },
};

TRIVIA.d09 = {
  title: 'The cage that turns',
  body: 'A catheter running out of a moving animal has one enemy: the line winds up. The '
    + 'usual answer is a swivel over the cage, which works and also tethers the subject to '
    + 'the middle of the room. The <b>Raturn</b> takes the other approach and turns the '
    + 'floor instead: sensors watch where the animal is, and the bowl counter-rotates '
    + 'underneath it so that the line above never twists and the animal can walk in circles '
    + 'all night without noticing. The bowl you were playing in was rotating the entire '
    + 'session. Nothing you did caused it and nothing on screen announced it.',
  source: 'BASi Raturn automated sampling and dosing system; used with Empis programmable infusion.',
};
