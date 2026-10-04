/**
 * The debrief figure and the history card for extinction and spontaneous recovery.
 * Imported by `day/02-extinction.html` before the shell mounts, because the shell
 * reads the trivia map at mount time.
 *
 * Two panels over one trial axis, because the level has two recoveries and they are
 * not the same thing. The top panel is the player: head entries per trial, in the same
 * red the live strip uses for a negative prediction error once the sucrose stops. The
 * bottom panel is the model: what it predicts at the moment the sucrose used to
 * arrive, which collapses across extinction and steps part of the way back over the
 * day boundary.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';
import { trialSeries, mean } from './conditioning.js';

/** The negative-error color, read from the page tokens so both themes stay honest. */
function pulseDown() {
  return getComputedStyle(document.documentElement).getPropertyValue('--pulse-down').trim() || '#CE4A44';
}

/**
 * The curve Pavlov describes: responding builds, collapses when the reinforcer stops
 * after a brief surge, and returns in part after a rest. Scaled to the player's own
 * pre-extinction rate so the two are comparable on one axis.
 */
function idealized(nAcq, omitFrom, nRec, asymptote) {
  const acq = [];
  for (let n = 1; n <= nAcq; n++) {
    if (n < omitFrom) acq.push(asymptote * (1 - Math.exp(-n / 5)));
    else {
      const k = n - omitFrom;
      acq.push(Math.max(asymptote * 0.12, asymptote * 1.7 * Math.exp(-k / 3.2)));
    }
  }
  const rec = [];
  for (let n = 0; n < nRec; n++) rec.push(asymptote * (0.2 + 0.35 * Math.exp(-n / 3)));
  return { acq, rec };
}

/** How clear the surge on omission was. */
function burstBand(ratio) {
  if (!(ratio > 0)) return 'no data';
  if (ratio >= 1.4) return 'clear burst';
  return ratio >= 1.05 ? 'slight burst' : 'no burst';
}

/** What the model held at the reinforcer point, per trial, when the page recorded it. */
function modelValues(metrics) {
  const v = metrics.modelValues;
  return v && v.acquisition ? v : { acquisition: [], recovery: [], jump: null };
}

/** The model's own recovery: value at the first probe over value at the last extinction trial. */
function modelRecovery(values) {
  if (values.jump && values.jump.before > 0) return values.jump.after / values.jump.before;
  const last = values.acquisition[values.acquisition.length - 1];
  const first = values.recovery[0];
  return last > 0 && first > 0 ? first / last : 0;
}

REFERENCES.d02 = {
  title: 'Fig. 1 — Subject #23, extinction and spontaneous recovery',
  subtitle: 'head entries per trial, and the value the model holds where the sucrose was',
  caption: 'Top: head entries per trial for Subject #23 (solid; red once sucrose is withheld) '
    + 'against an idealized extinction curve (dashed). The bracket marks the three trials after '
    + 'omission begins. Bottom: what the model predicts two seconds into the tone, where the '
    + 'sucrose used to arrive. Probes to the right of the break were run after a rest, with the '
    + 'tone still unreinforced.',
  citation: 'Idealized curve after the extinction and spontaneous-recovery results described in '
    + 'Pavlov, I. P. (1927), Conditioned Reflexes, trans. G. V. Anrep.',
  axis: { x: 'trial →', y: '' },

  draw(ctx, box, ink, { metrics }) {
    const s = trialSeries(metrics);
    const acq = s.acquisition, rec = s.recovery;
    const omitFrom = s.omitFrom || acq.length + 1;
    const values = modelValues(metrics);
    const red = pulseDown();

    const nAcq = Math.max(acq.length, 1);
    const nRec = rec.length;
    const slots = nAcq + (nRec ? nRec + 1.6 : 0);
    const X = (slot) => box.x + (box.w * slot) / Math.max(1, slots - 1);
    const recSlot = (i) => nAcq + 0.6 + i;

    const gap = 26;
    const top = { x: box.x, y: box.y, w: box.w, h: box.h * 0.58 - gap / 2 };
    const bottom = { x: box.x, y: box.y + box.h * 0.58 + gap / 2, w: box.w, h: box.h * 0.42 - gap / 2 };

    /** One panel: baseline, grid, its own y scale, and a title inside the top-left. */
    function frame(panel, yMax, step, label) {
      const Y = (v) => panel.y + panel.h - (panel.h * Math.min(v, yMax)) / yMax;
      ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
      ctx.font = `9px ${ink.fontData}`;
      for (let v = 0; v <= yMax + 1e-9; v += step) {
        ctx.beginPath(); ctx.moveTo(panel.x, Y(v)); ctx.lineTo(panel.x + panel.w, Y(v)); ctx.stroke();
        if (Y(v) > panel.y + 12) {
          ctx.fillStyle = ink.mut;
          const text = step < 1 ? v.toFixed(1) : String(v);
          ctx.fillText(text, panel.x - 8 - ctx.measureText(text).width, Y(v) + 3);
        }
      }
      ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(panel.x, panel.y); ctx.lineTo(panel.x, panel.y + panel.h);
      ctx.lineTo(panel.x + panel.w, panel.y + panel.h);
      ctx.stroke();
      ctx.fillStyle = ink.mut;
      ctx.font = `9px ${ink.fontData}`;
      ctx.fillText(label, panel.x + 5, panel.y + 9);
      return Y;
    }

    /** The two vertical rules that run through both panels. */
    function rule(x, color, alpha, dash) {
      ctx.save();
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x, top.y); ctx.lineTo(x, top.y + top.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, bottom.y); ctx.lineTo(x, bottom.y + bottom.h); ctx.stroke();
      ctx.restore();
    }

    function series(pts, color, width) {
      if (pts.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    }
    function dots(pts, color, r = 2.2) {
      ctx.fillStyle = color;
      pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); });
    }

    // --- top: the player -----------------------------------------------------
    const asym = Math.max(1, mean(acq.slice(Math.max(0, omitFrom - 4), omitFrom - 1)));
    const ideal = idealized(nAcq, omitFrom, nRec, asym);
    const hiTop = Math.max(4, Math.ceil(Math.max(...acq, ...rec, ...ideal.acq, 1) * 1.12));
    const Yt = frame(top, hiTop, hiTop > 12 ? 5 : hiTop > 6 ? 2 : 1, 'head entries per trial');

    ctx.save();
    ctx.strokeStyle = ink.mut; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ideal.acq.forEach((v, i) => { const y = Yt(v); if (i === 0) ctx.moveTo(X(i), y); else ctx.lineTo(X(i), y); });
    ctx.stroke();
    if (nRec) {
      ctx.beginPath();
      ideal.rec.forEach((v, i) => { const y = Yt(v); if (i === 0) ctx.moveTo(X(recSlot(i)), y); else ctx.lineTo(X(recSlot(i)), y); });
      ctx.stroke();
    }
    ctx.restore();

    const pts = acq.map((v, i) => ({ x: X(i), y: Yt(v) }));
    series(pts.slice(0, omitFrom - 1), ink.ink, 1.8);
    series(pts.slice(omitFrom - 2), red, 1.8);
    dots(pts.slice(0, omitFrom - 1), ink.ink);
    dots(pts.slice(omitFrom - 1), red);
    if (nRec) {
      const rp = rec.map((v, i) => ({ x: X(recSlot(i)), y: Yt(v) }));
      series(rp, red, 1.8);
      dots(rp, red);
    }

    // --- bottom: the model ---------------------------------------------------
    const all = values.acquisition.concat(values.recovery);
    const hiBot = Math.max(0.2, Math.ceil(Math.max(0.2, ...all) * 11) / 10);
    const Yb = frame(bottom, hiBot, hiBot > 0.6 ? 0.2 : 0.1, 'V̂ where the sucrose was');

    if (all.length) {
      const vp = values.acquisition.map((v, i) => ({ x: X(i), y: Yb(v) }));
      series(vp.slice(0, omitFrom - 1), ink.ink, 1.6);
      series(vp.slice(omitFrom - 2), red, 1.6);
      if (values.recovery.length) {
        const vr = values.recovery.map((v, i) => ({ x: X(recSlot(i)), y: Yb(v) }));
        series(vr, red, 1.6);
        // the step across the day boundary, drawn as the jump it is
        ctx.save();
        ctx.strokeStyle = red; ctx.lineWidth = 1.4; ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(vp[vp.length - 1].x, vp[vp.length - 1].y);
        ctx.lineTo(vr[0].x, vr[0].y);
        ctx.stroke();
        ctx.restore();
        const ratio = modelRecovery(values);
        if (ratio > 1) {
          ctx.fillStyle = red;
          ctx.font = `600 9px ${ink.fontData}`;
          const label = 'x' + ratio.toFixed(1);
          ctx.fillText(label, vr[0].x - ctx.measureText(label).width - 4, vr[0].y - 5);
          ctx.font = `9px ${ink.fontData}`;
        }
      }
    }

    // --- the two rules, and the annotations that hang off them ---------------
    if (omitFrom <= nAcq) {
      rule(X(omitFrom - 1.5), red, 1, [3, 3]);
      ctx.fillStyle = red;
      ctx.font = `9px ${ink.fontData}`;
      // Along the foot of the top panel: responding is at its highest here, so the
      // burst bracket owns the space above and this label would run into it.
      ctx.fillText('sucrose withheld', X(omitFrom - 1.5) + 4, top.y + top.h - 5);
    }
    if (nRec) {
      rule(X(nAcq - 0.2), ink.mut, 0.5);
      ctx.fillStyle = ink.mut;
      ctx.fillText('rest', X(nAcq - 0.2) + 4, top.y + 9);
    }

    if (omitFrom <= nAcq && metrics.burstRatio > 0) {
      const a = X(omitFrom - 1), b = X(Math.min(nAcq - 1, omitFrom + 1));
      const bracket = Math.min(...acq.slice(omitFrom - 1, omitFrom + 2).map(Yt)) - 10;
      ctx.strokeStyle = ink.ink; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a, bracket + 5); ctx.lineTo(a, bracket); ctx.lineTo(b, bracket); ctx.lineTo(b, bracket + 5);
      ctx.stroke();
      ctx.fillStyle = ink.ink;
      ctx.font = `600 9px ${ink.fontData}`;
      ctx.fillText('extinction burst ×' + metrics.burstRatio.toFixed(2), a, bracket - 4);
      ctx.font = `9px ${ink.fontData}`;
    }

    ctx.fillStyle = ink.mut;
    for (let i = 0; i < nAcq; i += Math.ceil(nAcq / 6)) ctx.fillText(String(i + 1), X(i) - 3, bottom.y + bottom.h + 12);
    if (nRec) ctx.fillText('probes', X(recSlot(0)) - 6, bottom.y + bottom.h + 12);
  },

  stats(metrics) {
    const s = trialSeries(metrics);
    const values = modelValues(metrics);
    const ratio = modelRecovery(values);
    return [
      [(metrics.burstRatio || 0).toFixed(2) + '×', 'extinction burst'],
      [burstBand(metrics.burstRatio), 'pattern'],
      [(metrics.recoveryRatio || 0).toFixed(2) + '×', 'your responding, after the rest'],
      [ratio ? ratio.toFixed(1) + '×' : '—', 'the model, after the rest'],
    ];
  },

  interpret(metrics) {
    const s = trialSeries(metrics);
    const omitFrom = s.omitFrom || 21;
    const pre = mean(s.acquisition.slice(Math.max(0, omitFrom - 4), omitFrom - 1));
    const burst = mean(s.acquisition.slice(omitFrom - 1, omitFrom + 2));
    const end = mean(s.acquisition.slice(-3));
    const firstProbes = mean(s.recovery.slice(0, 3));
    const br = metrics.burstRatio || 0;
    const rr = metrics.recoveryRatio || 0;
    const values = modelValues(metrics);
    const modelRatio = modelRecovery(values);
    const out = [];

    let first = `For twenty trials the tone paid. From trial ${omitFrom} it did not, and nothing `
      + `else about the chamber changed. Over the three trials before the change you checked the `
      + `cup <b>${pre.toFixed(1)}</b> times per trial; over the three trials after, `
      + `<b>${burst.toFixed(1)}</b>. `;
    if (br >= 1.4) {
      first += `That is a ratio of <b>${br.toFixed(2)}</b>, and it is the extinction burst: the `
        + 'first response to a reward that stops arriving is to try harder, not to stop. It is '
        + 'the reason a broken vending machine gets hit.';
    } else if (br >= 1.05) {
      first += `That is a ratio of <b>${br.toFixed(2)}</b> — a small surge rather than a spike. `
        + 'You worked a little harder before you believed it, which is the same phenomenon at low '
        + 'volume.';
    } else {
      first += 'You did not surge at all. Giving up immediately is rarer than the burst, and it '
        + 'usually means the change was obvious to you: this run, the omission read as a broken '
        + 'apparatus rather than a bad trial.';
    }
    out.push(first);

    let second = `By the last trials of the session you were down to <b>${end.toFixed(1)}</b> `
      + 'entries per trial, and the lower panel says why. Each omission fired the reward event in '
      + 'reverse: the model expected sucrose two seconds into the tone, got nothing, and posted a '
      + '<b>negative</b> prediction error. ';
    if (values.acquisition.length) {
      const peak = Math.max(...values.acquisition.slice(0, omitFrom - 1));
      const floor = values.acquisition[values.acquisition.length - 1];
      second += `What it held at that moment fell from <b>${peak.toFixed(2)}</b> to `
        + `<b>${floor.toFixed(2)}</b> over ten unpaid trials. `;
    }
    second += 'That red dip is the arithmetic of the same rule that drove the green pulses, with '
      + 'the reward term set to zero.';
    out.push(second);

    let third = 'Then the rest, and eight probes with the tone still unpaid. <b>Two different '
      + 'things recovered, and they are worth keeping apart.</b> ';
    if (modelRatio > 1.05) {
      third += `The model recovered by construction: across the day boundary the tone's value `
        + `where the sucrose used to be stepped from ${values.jump ? values.jump.before.toFixed(2) : '—'} `
        + `to ${values.jump ? values.jump.after.toFixed(2) : '—'}, a factor of `
        + `<b>${modelRatio.toFixed(1)}</b>, because extinction here is modeled as new learning `
        + 'laid over the old rather than as erasure, and only part of it survives a night. ';
    } else {
      third += 'The model is the first: it keeps a copy of what the tone was worth before the '
        + 'omissions began and restores part of it over the day boundary, which is the lower '
        + 'panel stepping back up. ';
    }
    third += `Your own responding is the second, and it did not have to follow: you made `
      + `<b>${firstProbes.toFixed(1)}</b> entries per trial on the first three probes against `
      + `<b>${end.toFixed(1)}</b> at the end of extinction, `;
    if (rr >= 1.15) {
      third += `<b>${rr.toFixed(2)}×</b> your extinguished rate over the whole block. The response `
        + 'came back for a cue that had paid you nothing for ten trials.';
    } else if (rr > 0) {
      third += `<b>${rr.toFixed(2)}×</b> your extinguished rate over the whole block, so any return `
        + 'on the first probes was spent by the last. Recovery is a group effect, and a single '
        + 'subject that has thoroughly given up can stay given up.';
    } else {
      third += 'and you made no entries at all during the probes.';
    }
    out.push(third);

    out.push('Pavlov saw the same thing in 1927 and drew the same conclusion: a reflex run to zero '
      + 'is not a reflex erased. The modern reading adds where the surviving copy is kept — the '
      + 'inhibitory memory is bound to the context it was learned in, which is why a change of '
      + 'room, or of day, brings the original back. <cite>Bouton, M. E. (2004), Learning &amp; '
      + 'Memory 11, 485–494.</cite>');
    return out;
  },

  share(metrics) {
    const br = metrics.burstRatio || 0;
    if (br >= 1.4) return `When the sucrose stopped I hit the cup ${br.toFixed(1)}× harder.`;
    if (br >= 1.05) return `When the sucrose stopped I pushed ${br.toFixed(2)}× harder, then quit.`;
    return 'When the sucrose stopped I quit without a burst.';
  },
};

TRIVIA.d02 = {
  title: 'What extinction does not do',
  body: 'An extinguished response is not an erased one. Pavlov noticed that a reflex he had run '
    + 'to zero came back on its own after a rest, and a century of work since has filled in the '
    + 'reason: the second phase of training does not overwrite the first, it adds an inhibitory '
    + 'memory that is <b>tied to the context it was learned in</b>. Move the animal to a different '
    + 'room and the original response returns in full. That is why exposure therapy relapses when '
    + 'the patient leaves the clinic, and it is why the model in this level keeps a copy of what '
    + 'it knew before the omissions began and restores half of it overnight.',
  source: 'Bouton, M. E. (2004). Context and behavioral processes in extinction. Learning & Memory, '
    + '11(5), 485–494.',
};
