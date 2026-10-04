/**
 * Rat Park's debrief figure and trivia card, registered additively into the shared
 * runtime. Importing this module is what makes `park` a level the figure and shell
 * modules know about; nothing under `shared/` is edited.
 *
 * The reference is drawn as a labeled schematic. Alexander, Coambs & Hadaway (1978)
 * report the direction of the effect in their abstract and the companion study gives
 * the ratios; neither gives a per-day series that could be digitized here, so the
 * comparison lines carry no y-axis values of their own and say so on the figure.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';

/** Days in the park. The page and the figure agree on this through the module. */
export const DAYS = 7;

/** Slope of each schematic comparison line, in morphine-drinking days per day. */
const SCHEMATIC = { isolated: 0.86, colony: 0.14 };

REFERENCES.park = {
  title: 'Fig. 11 — Subject #23, seven days in the park',
  subtitle: 'cumulative morphine-bottle days vs. day',
  caption: 'Your week (solid) against the direction of the housing effect reported by '
    + 'Alexander, Coambs & Hadaway (1978) (dashed, schematic). Markers show the bottle you '
    + 'chose each day.',
  citation: 'Direction after Alexander, Coambs & Hadaway (1978), Psychopharmacology 58, 175-179.',
  axis: { x: 'day →', y: 'morphine →' },

  draw(ctx, box, ink, { metrics }) {
    const days = metrics.days || [];
    const X = (d) => box.x + (d / DAYS) * box.w;
    const Y = (n) => box.y + box.h - (n / DAYS) * box.h;

    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();

    ctx.strokeStyle = ink.grid;
    ctx.lineWidth = 1;
    for (let n = 1; n <= DAYS; n++) {
      ctx.beginPath();
      ctx.moveTo(box.x, Y(n));
      ctx.lineTo(box.x + box.w, Y(n));
      ctx.stroke();
    }

    ctx.fillStyle = ink.mut;
    ctx.font = `${Math.max(8, box.h * 0.035)}px ${ink.fontData}`;
    for (let d = 1; d <= DAYS; d++) ctx.fillText(String(d), X(d) - 3, box.y + box.h + 13);
    for (let n = 0; n <= DAYS; n += 1) ctx.fillText(String(n), box.x - 14, Y(n) + 3);

    // The two schematic directions. They carry a slope and a label, never a value.
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.1;
    for (const [name, slope] of Object.entries(SCHEMATIC)) {
      ctx.strokeStyle = ink.mut;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(DAYS), Y(Math.min(DAYS, slope * DAYS)));
      ctx.stroke();
      ctx.fillStyle = ink.mut;
      ctx.font = `${Math.max(8, box.h * 0.036)}px ${ink.fontUI}`;
      const label = name === 'isolated' ? 'isolated cage (schematic)' : 'colony (schematic)';
      // Labels sit mid-line, where neither the axis nor the player's own record runs.
      const at = DAYS * 0.55;
      ctx.fillText(label, X(at) - ctx.measureText(label).width / 2, Y(slope * at) - 7);
    }
    ctx.setLineDash([]);

    // The player's own week.
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    let n = 0;
    for (let d = 1; d <= DAYS; d++) {
      const row = days[d - 1];
      if (row && row.bottle === 'morphine') n++;
      ctx.lineTo(X(d), Y(n));
    }
    ctx.stroke();

    n = 0;
    for (let d = 1; d <= DAYS; d++) {
      const row = days[d - 1];
      const bottle = row ? row.bottle : null;
      if (bottle === 'morphine') n++;
      const x = X(d);
      const y = Y(n);
      if (bottle === 'morphine') {
        ctx.fillStyle = ink.accent;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      } else if (bottle === 'plain') {
        ctx.strokeStyle = ink.ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.strokeStyle = ink.mut; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke();
      }
    }

    ctx.fillStyle = ink.mut;
    ctx.font = `${Math.max(8, box.h * 0.036)}px ${ink.fontUI}`;
    ctx.fillText('● morphine   ○ water   — no drink', box.x + 6, box.y + 15);
  },

  stats(metrics) {
    const m = metrics.morphineDays || 0;
    const w = metrics.waterDays || 0;
    const drinking = m + w;
    const share = drinking ? Math.round((m / drinking) * 100) : 0;
    return [
      [`${m}/${DAYS}`, 'days you chose morphine'],
      [`${w}/${DAYS}`, 'days you chose water'],
      [`${share}%`, 'of your drinking days were morphine'],
      [String(metrics.enrichmentVisits || 0), 'visits to the wheel, tunnels, and nest'],
    ];
  },

  interpret(metrics) {
    const m = metrics.morphineDays || 0;
    const w = metrics.waterDays || 0;
    const out = [];

    let first = `Seven days, two bottles, no schedule and no door. You went to the morphine `
      + `bottle on <b>${m}</b> of them and to the water on <b>${w}</b>. `;
    if (m === 0) {
      first += 'The sweetened morphine was there the whole week and you never took it. That is '
        + 'the colony result, and it is the one the literature found surprising enough to argue '
        + 'about for forty years.';
    } else if (m <= 2) {
      first += 'You sampled it and went back to water. Socially housed rats in the original study '
        + 'behaved this way: the drug was available, palatable, and mostly beside the point.';
    } else if (m <= 4) {
      first += 'You split the week roughly down the middle. Even that is far below what an '
        + 'isolated animal does with the same bottle in front of it.';
    } else {
      first += 'You took it nearly every day. Nothing in the park stopped you, and nothing was '
        + 'meant to. The comparison the study makes is between environments, not between rats, '
        + 'and one week of one rat is a single point on that comparison.';
    }
    out.push(first);

    out.push('Alexander, Coambs and Hadaway put rats either in standard isolation cages or in a '
      + 'large open colony box of 8.8 m<sup>2</sup>, and gave both morphine solution to drink. '
      + 'The isolated rats drank significantly more than the socially housed ones. When the '
      + 'experimenters ran a cycle known to push caged rats into heavier consumption, the isolated '
      + 'animals increased their intake and the colony animals <b>decreased</b> theirs '
      + '<cite>(Alexander, Coambs &amp; Hadaway 1978, Psychopharmacology 58: 175-179)</cite>. '
      + 'The companion study put a size on the gap: in the phase of heaviest drinking, isolated '
      + 'females took five times, and isolated males sixteen times, the morphine per kilogram that '
      + 'their colony counterparts did <cite>(Hadaway et al. 1979, Psychopharmacology 66: 87-91)</cite>.');

    out.push('The dashed lines on the figure carry that direction and nothing else. They are '
      + 'schematic: the papers report group differences, not a seven-day series, so drawing '
      + 'numbers on them would be inventing data.');

    let last = 'Nothing here was reinforcement. There was a wheel, there were tunnels, there was '
      + 'food that arrived without a click in front of it, and there were other rats. ';
    if ((metrics.enrichmentVisits || 0) >= 8) {
      last += `You used all of it, ${metrics.enrichmentVisits} times over the week. `;
    } else if ((metrics.enrichmentVisits || 0) > 0) {
      last += 'You used some of it. ';
    } else {
      last += 'You barely touched any of it, which is its own kind of answer. ';
    }
    last += 'The finding is not that morphine is weak. It is that a cage is a variable, and it was '
      + 'in every experiment you played before this one. The colony is what got you out.';
    out.push(last);

    return out;
  },

  share(metrics) {
    const m = metrics.morphineDays || 0;
    if (m === 0) return `Seven days in Rat Park with a morphine bottle. I never touched it.`;
    if (m >= 5) return `Seven days in Rat Park. I went to the morphine bottle on ${m} of them.`;
    return `Seven days in Rat Park. The morphine bottle got ${m} of them.`;
  },
};

TRIVIA.park = {
  title: 'The paper nobody wanted',
  body: 'Rat Park was a plywood box of about 8.8 square meters with shavings, tins, running wheels '
    + 'and a colony of rats living in it, built at Simon Fraser University to ask one question: how '
    + 'much of a caged rat&rsquo;s appetite for morphine belongs to the morphine, and how much to the '
    + 'cage. The answer came out as three papers in <i>Psychopharmacology</i> and '
    + '<i>Pharmacology Biochemistry and Behavior</i> between 1978 and 1981 — respectable journals, '
    + 'and not the ones a result like that would land in today. By Alexander&rsquo;s own account the '
    + 'work was turned down by the large general-science journals and the funding was not renewed, '
    + 'and the study spent decades being retold second-hand more often than it was read. The rats '
    + 'in the colony still drank less.',
  source: 'Alexander, B. K., Coambs, R. B. & Hadaway, P. F. (1978). The effect of housing and gender '
    + 'on morphine self-administration in rats. Psychopharmacology 58(2), 175-179. '
    + 'Publication history per Alexander, B. K. (2010), Addiction: The View from Rat Park.',
};
