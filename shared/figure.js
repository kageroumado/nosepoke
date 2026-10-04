/**
 * The debrief figure: the player's own session drawn as a publication figure, with the
 * reference from the source paper on the same axes, and a caption that says what the
 * result means in their numbers. This figure is the artifact the game is built to
 * produce, so it is a light-on-paper object in both themes.
 */

import { drawCumulativeRecord } from './rig.js';

/**
 * One entry per level. Page agents add their own additively; nothing here is shared
 * mutable state beyond this map.
 *
 * @typedef {object} Reference
 * @property {string} title figure heading, e.g. `Fig. 1 — Subject #23, Session 1`
 * @property {string} subtitle axis description under the heading
 * @property {string} caption the sentence printed under the canvas in the page
 * @property {string} citation the source, printed on the exported PNG
 * @property {(ctx: CanvasRenderingContext2D, box: object, ink: object, data: object) => void} draw
 *           draws the panel; `data` is `{ sim, metrics }`, `ink` is the paper palette
 * @property {(metrics: object, sim: object) => Array<[string|number, string]>} stats
 *           the number row under the figure
 * @property {(metrics: object, sim: object) => string[]} interpret
 *           result-adaptive paragraphs; inline markup allowed
 * @property {(metrics: object) => string} share the one-line caption for sharing
 */

/** @type {Object<string, Reference|null>} */
export const REFERENCES = {
  d00: null,
  d01: null,
  n01: null,
  d02: null,
  d03: null,
  n03: null,
  d04: null,

  d05: {
    title: 'Fig. 1 — Subject #23, Session 1',
    subtitle: 'cumulative responses vs. time',
    caption: 'Fixed-interval responding, Subject #23 (solid) against an idealized record after '
      + 'Ferster & Skinner (1957) (dashed). Pips mark reinforcement.',
    citation: 'Reference curve after Ferster, C. B. & Skinner, B. F. (1957), Schedules of Reinforcement.',
    axis: { x: 'time →', y: 'responses →' },

    draw(ctx, box, ink, { sim, metrics }) {
      const S = sim.S;
      const first = S.events.find((e) => e.type === 'poke' || e.type === 'press');
      const tStart = first ? first.t : 0;
      const interval = metrics.interval || 12;
      const intervals = sim.fiIntervals();

      ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(box.x, box.y);
      ctx.lineTo(box.x, box.y + box.h);
      ctx.lineTo(box.x + box.w, box.y + box.h);
      ctx.stroke();

      // The idealized scallop: responses bunch toward the end of each interval.
      const ref = [];
      const perIv = Math.max(6, Math.round(metrics.responses / Math.max(intervals.length, 1)));
      const nIv = Math.max(intervals.length, 6);
      let t = tStart;
      for (let k = 0; k < nIv; k++) {
        for (let i = 0; i < perIv; i++) {
          const u = Math.pow((i + 1) / perIv, 1 / 3);
          ref.push({ t: t + u * interval, type: 'poke' });
        }
        t += interval;
        ref.push({ t, type: 'delivery' });
      }
      drawCumulativeRecord(ctx, box, ref, ref[ref.length - 1].t, {
        ink: ink.mut, pip: ink.mut, lineWidth: 1.1, tStart, dashed: true,
      });
      drawCumulativeRecord(ctx, box, S.events, S.t, {
        ink: ink.ink, pip: ink.accent, lineWidth: 1.6, tStart,
      });
    },

    stats(metrics, sim) {
      const i = sim.indexOfCurvature();
      return [
        [metrics.responses, 'nosepokes'],
        [metrics.consumed, 'pellets eaten'],
        [i.toFixed(2), 'index of curvature (Fry et al. 1960)'],
        [pattern(i), 'pattern'],
      ];
    },

    interpret(metrics, sim) {
      const i = sim.indexOfCurvature();
      const p = pattern(i);
      const out = [];
      let first = `The interval was ${metrics.interval} seconds. Nothing on screen ever showed it — `
        + 'the only clock available was yours. ';
      if (p === 'scalloped') {
        first += 'You paused after each pellet, then accelerated as the next one came due: a <b>scallop</b>. '
          + 'The pause is prediction, not idleness — you learned when responding was pointless from nothing '
          + 'but the schedule itself. The dashed line is what Ferster &amp; Skinner&rsquo;s animals drew in 1957. '
          + 'Same curve.';
      } else if (p === 'steady') {
        first += 'You responded at a near-constant rate wherever you were in the interval, paying the effort '
          + 'cost on pokes that could never pay out. Real rats start exactly this way — the scallop emerges '
          + 'over sessions, as the internal clock sharpens.';
      } else {
        first += 'You responded hardest right after each pellet — precisely when the next one was furthest '
          + 'away. The schedule never punishes this; it just doesn&rsquo;t pay. With training, responding '
          + 'migrates toward the end of the interval.';
      }
      out.push(first);
      out.push('The index of curvature condenses the whole record into one number: 0 is a constant rate, '
        + '+0.75 means every response landed just before the pellet, negative means front-loaded. '
        + `You scored <b>${i.toFixed(2)}</b>.`);

      const bm = metrics.burstMigration;
      const shrink = Math.round(bm.shrink * 100);
      if (bm.pelletEarly > 0.05 && shrink >= 10) {
        let third = 'One more thing happened, over on the trace: the dopamine burst at the pellet shrank by '
          + `about <b>${shrink}%</b> between your first rewards and your last`;
        if (bm.cueLate > bm.cueEarly + 0.02) {
          third += `, while the burst moved onto the dispenser click, which rose from ${bm.cueEarly.toFixed(2)} `
            + `to ${bm.cueLate.toFixed(2)}`;
        }
        third += '. A predicted reward stops being news — that migration is the reward-prediction-error '
          + 'signature <cite>(Schultz, Dayan &amp; Montague 1997)</cite>.';
        out.push(third);
      }
      return out;
    },

    share(metrics) {
      const i = metrics.fryIndex != null ? metrics.fryIndex : 0;
      if (i > 0.15) return `I scalloped like a 1957 pigeon (index of curvature ${i.toFixed(2)}).`;
      if (i < -0.05) return `I front-loaded a fixed-interval schedule (index of curvature ${i.toFixed(2)}).`;
      return `I responded steadily through every interval (index of curvature ${i.toFixed(2)}).`;
    },
  },

  n02: null,
  d06: null,
  d07: null,
  n04: null,
  d08: null,
  d09: null,
  n05: null,
  park: null,
  epilogue: null,
};

function pattern(i) { return i > 0.15 ? 'scalloped' : i < -0.05 ? 'front-loaded' : 'steady'; }

/** The paper palette: light in both themes, because a printed figure is printed. */
function paperInk() {
  const g = getComputedStyle(document.documentElement);
  const t = (n) => g.getPropertyValue(n).trim();
  return {
    paper: t('--paper'),
    ink: t('--paper-ink'),
    grid: t('--paper-grid'),
    mut: t('--paper-mut'),
    accent: t('--accent'),
    fontUI: t('--font-ui'),
    fontData: t('--font-data'),
  };
}

/**
 * Draw the figure for a level into a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {object} opts.sim the finished session
 * @param {string} opts.level level id, keying `REFERENCES`
 * @param {object} [opts.metrics] defaults to `sim.metrics()`
 * @param {number} [opts.width] CSS width; defaults to the canvas's own
 * @param {boolean} [opts.bakeCaption] print the share line and citation into the image
 * @returns {object} the metrics used
 */
export function renderFigure(canvas, opts) {
  const { sim, level } = opts;
  const metrics = opts.metrics || sim.metrics();
  const ref = REFERENCES[level];
  const ink = paperInk();

  const wCss = opts.width || Math.min(620, canvas.parentElement.clientWidth - 8);
  const hCss = Math.round(wCss * (opts.bakeCaption ? 0.66 : 0.58));
  const dpr = opts.dpr || devicePixelRatio || 1;
  canvas.style.width = wCss + 'px';
  canvas.width = Math.round(wCss * dpr);
  canvas.height = Math.round(hCss * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const s = wCss / 620;                                  // one scale for every measurement
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, wCss, hCss);

  if (!ref) {
    ctx.fillStyle = ink.mut;
    ctx.font = `${13 * s}px ${ink.fontData}`;
    ctx.fillText(`No reference figure registered for ${level}.`, 18 * s, 30 * s);
    return metrics;
  }

  ctx.fillStyle = ink.ink;
  ctx.font = `600 ${13 * s}px ${ink.fontUI}`;
  ctx.fillText(ref.title, 18 * s, 26 * s);
  ctx.font = `${11 * s}px ${ink.fontData}`;
  ctx.fillStyle = ink.mut;
  ctx.fillText(ref.subtitle, 18 * s, 42 * s);

  const capRoom = opts.bakeCaption ? 54 * s : 0;
  const box = {
    x: 46 * s,
    y: 56 * s,
    w: wCss - 70 * s,
    h: hCss - 96 * s - capRoom,
  };
  ref.draw(ctx, box, ink, { sim, metrics });

  ctx.fillStyle = ink.mut;
  ctx.font = `${10.5 * s}px ${ink.fontData}`;
  if (ref.axis) {
    ctx.fillText(ref.axis.x, box.x + box.w - 46 * s, box.y + box.h + 16 * s);
    ctx.save();
    ctx.translate(28 * s, box.y + 70 * s);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(ref.axis.y, 0, 0);
    ctx.restore();
  }

  if (opts.bakeCaption) {
    const y = hCss - 34 * s;
    ctx.fillStyle = ink.ink;
    ctx.font = `600 ${12 * s}px ${ink.fontUI}`;
    ctx.fillText(ref.share(metrics), 18 * s, y);
    ctx.fillStyle = ink.mut;
    ctx.font = `${10 * s}px ${ink.fontData}`;
    // The wordmark rides on the share line and the citation gets the full width below it:
    // a full source, journal and all, is longer than the space beside a wordmark.
    const mark = 'nosepoke — kagerou.glass';
    ctx.fillText(mark, wCss - 18 * s - ctx.measureText(mark).width, y);
    ctx.fillText(ref.citation, 18 * s, y + 15 * s);
  }
  return metrics;
}

/**
 * Render the figure at share resolution with the caption baked in.
 *
 * @returns {string} a PNG data URL, 1600 px wide by default
 */
export function exportPNG(opts) {
  const canvas = document.createElement('canvas');
  renderFigure(canvas, { ...opts, width: opts.width || 1600, dpr: 1, bakeCaption: true });
  return canvas.toDataURL('image/png');
}

/** Save the figure to the player's disk. */
export function downloadPNG(opts, filename) {
  const a = document.createElement('a');
  a.download = filename || `nosepoke-${opts.level}.png`;
  a.href = exportPNG(opts);
  a.click();
}

/** The one-line caption for a result. Empty when the level has no reference yet. */
export function shareText(level, metrics) {
  const ref = REFERENCES[level];
  return ref ? ref.share(metrics) : '';
}

/** The number row under the figure, as `[value, label]` pairs. */
export function figureStats(level, metrics, sim) {
  const ref = REFERENCES[level];
  return ref && ref.stats ? ref.stats(metrics, sim) : [];
}

/** The result-adaptive paragraphs. */
export function figureInterpretation(level, metrics, sim) {
  const ref = REFERENCES[level];
  return ref && ref.interpret ? ref.interpret(metrics, sim) : [];
}

/** The sentence printed under the canvas in the page. */
export function figureCaption(level) {
  const ref = REFERENCES[level];
  return ref ? ref.caption : '';
}
