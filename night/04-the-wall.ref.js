/**
 * Debrief figure and history card for the wall.
 *
 * The figure is the roster: who took which route, what it cost them in presses, and
 * what the colony ended up with. Every number in it comes from that rat's own session,
 * run with its own strain's tonic ceiling.
 */

import { REFERENCES } from '../shared/figure.js';
import { TRIVIA } from '../shared/shell.js';

/**
 * Seconds a turn takes, as a function of the route. The constants are read off the
 * arena: a walk, a climb at the press rate the vigor model allows, and the trip to
 * the pile by the door. Used only to say what the best possible allocation would
 * have carried, never to decide anything during play.
 */
export const TIME_MODEL = { flat: 7, barrierBase: 7.5, perPress: 0.44 };

/** Estimated seconds for one rat on one route. */
export function turnSeconds(rat, route) {
  return route === 'barrier'
    ? TIME_MODEL.barrierBase + rat.cost * TIME_MODEL.perPress
    : TIME_MODEL.flat;
}

/**
 * The allocation that would have carried the most, given the same roster order and the
 * same budget. Sixty-four assignments, each cut off wherever the clock runs out.
 *
 * @param {Array} roster rats with `cost`
 * @param {number} budget seconds before the guard comes back
 * @param {number} barrierPellets sacks carried over the wall
 * @param {number} flatPellets sacks carried round the drain
 */
export function bestAllocation(roster, budget, barrierPellets, flatPellets) {
  let best = { pellets: -1, plan: [] };
  const n = roster.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    let spent = 0, carried = 0;
    const plan = [];
    for (let i = 0; i < n; i++) {
      const route = mask & (1 << i) ? 'barrier' : 'flat';
      const cost = turnSeconds(roster[i], route);
      if (spent + cost > budget) { plan.push('missed'); continue; }
      spent += cost;
      carried += route === 'barrier' ? barrierPellets : flatPellets;
      plan.push(route);
    }
    if (carried > best.pellets) best = { pellets: carried, plan, seconds: spent };
  }
  return best;
}

/** How far the player's assignment leaned on the rats that climb cheapest. */
export function vigorAlignment(roster) {
  const went = roster.filter((r) => r.route === 'barrier' || r.route === 'flat');
  if (went.length < 2) return 0;
  const barrier = went.filter((r) => r.route === 'barrier');
  const flat = went.filter((r) => r.route === 'flat');
  if (!barrier.length || !flat.length) return 0;
  const mean = (a) => a.reduce((x, r) => x + r.vigor, 0) / a.length;
  return mean(barrier) - mean(flat);
}

REFERENCES.n04 = {
  title: 'Fig. N4 — the wall, colony roster',
  subtitle: 'sacks carried and presses paid, by rat',
  caption: 'One row per rat, ordered by resting vigor. Bar length is the load that got over; the '
    + 'number beside it is what the climb cost in presses. A rat that never got its turn has no bar.',
  citation: 'Effort cost after Salamone, Cousins & Bucher (1994), Behav. Brain Res. 65, 221-229.',
  axis: { x: 'sacks →', y: '' },

  draw(ctx, box, ink, { metrics }) {
    // Ordered by resting vigor so the question the level asks, whether the wall went
    // to the rats that climb cheapest, can be read straight off the rows.
    const roster = (metrics.roster || []).slice().sort((a, b) => b.vigor - a.vigor);
    const maxLoad = Math.max(metrics.barrierPellets || 4, 1);
    const gutter = Math.min(96, box.w * 0.2);
    const barX = box.x + gutter;
    const barW = box.w - gutter - 74;
    const rowH = (box.h - 30) / (roster.length + 1);

    ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX, box.y);
    ctx.lineTo(barX, box.y + rowH * roster.length + 4);
    ctx.stroke();

    roster.forEach((r, i) => {
      const y = box.y + i * rowH;
      const mid = y + rowH / 2;

      ctx.fillStyle = ink.ink;
      ctx.font = `600 11px ${ink.fontUI}`;
      ctx.fillText(r.name, box.x, mid + 4);

      if (r.route === 'missed') {
        ctx.fillStyle = ink.mut;
        ctx.font = `10px ${ink.fontData}`;
        ctx.fillText('never got a turn', barX + 6, mid + 3);
        return;
      }

      const w = (r.pellets / maxLoad) * barW;
      if (r.pellets) {
        ctx.fillStyle = r.route === 'barrier' ? ink.accent : ink.mut;
        ctx.fillRect(barX + 1, y + 5, Math.max(2, w), rowH - 11);
      }
      ctx.fillStyle = r.pellets ? ink.ink : ink.mut;
      ctx.font = `10px ${ink.fontData}`;
      const tag = !r.pellets ? `stopped short at ${r.presses} presses`
        : r.route === 'barrier' ? `${r.presses} presses`
        : 'round the drain';
      ctx.fillText(tag, barX + w + 8, mid + 3);
    });

    const totalY = box.y + rowH * roster.length + 10;
    ctx.strokeStyle = ink.grid;
    ctx.beginPath();
    ctx.moveTo(box.x, totalY); ctx.lineTo(box.x + box.w, totalY);
    ctx.stroke();
    ctx.fillStyle = ink.ink;
    ctx.font = `600 11px ${ink.fontUI}`;
    ctx.fillText('colony', box.x, totalY + 17);
    ctx.font = `600 12px ${ink.fontData}`;
    ctx.fillText(`${metrics.pellets} sacks`, barX, totalY + 17);
    ctx.fillStyle = ink.mut;
    ctx.font = `10px ${ink.fontData}`;
    ctx.fillText(`best possible: ${metrics.bestPellets}`, barX + 74, totalY + 17);
  },

  stats(metrics) {
    return [
      [metrics.pellets, 'sacks over the wall'],
      [`${metrics.barrierCount} / ${metrics.roster.length}`, 'sent up the wall'],
      [metrics.pressesPaid, 'presses paid, colony total'],
      [metrics.seconds.toFixed(0) + ' s', `on the floor, in a ${metrics.budget.toFixed(0)} s window`],
    ];
  },

  interpret(metrics) {
    const out = [];
    const missed = metrics.roster.filter((r) => r.route === 'missed').length;
    const align = vigorAlignment(metrics.roster);
    const ratio = metrics.bestPellets ? metrics.pellets / metrics.bestPellets : 1;

    if (ratio >= 0.95) {
      out.push(`<b>${metrics.pellets} sacks</b> against a ceiling of ${metrics.bestPellets}. There was `
        + 'no better assignment available tonight. The wall pays double and costs time, the drain pays '
        + 'half and costs almost none, and you put each rat where its own price made sense.');
    } else if (ratio >= 0.75) {
      out.push(`<b>${metrics.pellets} sacks</b> against a ceiling of ${metrics.bestPellets}. A workable `
        + 'night. The gap is where a rat went up a wall it charges too much to climb, or walked round a '
        + 'drain it would have cleared cheaply.');
    } else {
      out.push(`<b>${metrics.pellets} sacks</b> against a ceiling of ${metrics.bestPellets}. `
        + 'The assignment cost the colony more than the wall did.');
    }

    const routes = new Set(metrics.roster.filter((r) => r.route && r.route !== 'missed').map((r) => r.route));
    if (routes.size < 2) {
      out.push(routes.has('barrier')
        ? 'Every rat that got a turn went up the wall. That is one way to run a night, and it means the '
          + 'roster never got used: Pin charges half again what Whisk does for the same climb, and the '
          + 'clock paid the difference.'
        : 'Nobody went up the wall. Every sack that moved tonight went the long way for half the load, '
          + 'which is what a colony does when it has decided in advance that climbing is expensive.');
    } else if (align > 0.04) {
      out.push('You put the wall on the rats that climb cheapest. That is the right read of the roster, '
        + 'and the reason it is the right read has nothing to do with how much any of them wants a sack. '
        + 'They all want it the same. What differs is what each one is willing to pay.');
    } else if (align < -0.04) {
      out.push('The wall went to the rats that charge most for it. Every sack still got carried, and '
        + 'every sack cost more time than it needed to. Effort is not distributed evenly across a colony '
        + 'and it never was.');
    } else {
      out.push('The wall and the drain went out more or less at random with respect to who climbs cheap. '
        + 'The roster on the left is not decoration: resting vigor sets the price of a climb before '
        + 'anybody starts climbing.');
    }

    out.push('This is the barrier T-maze, run at night with sacks instead of pellets. Salamone put rats '
      + 'in front of a high arm worth four pellets and a low arm worth two, then depleted accumbens '
      + 'dopamine. The animals stopped climbing and took the small pile. What they did not do was eat '
      + 'less: given both piles free, they ate exactly as much as before <cite>(Salamone, Cousins &amp; '
      + 'Bucher 1994)</cite>. Dopamine was never the pleasure. It was the willingness to pay.');

    if (missed) {
      out.push(`${missed === 1 ? 'One rat' : missed + ' rats'} never got a turn: the round came back `
        + `round at ${metrics.budget.toFixed(0)} seconds and that was the night. Hesitating at the `
        + 'bottom of the wall spends the same clock as climbing it.');
    }
    return out;
  },

  share(metrics) {
    return `The colony got ${metrics.pellets} sacks over the wall on ${metrics.pressesPaid} presses.`;
  },
};

TRIVIA.n04 = {
  title: 'The paper nobody wanted',
  body: 'Bruce Alexander built Rat Park in the 1970s: a large plywood colony with shavings, tins to '
    + 'hide in, wheels, and other rats, set against the standard isolated cage. Rats in the park drank '
    + 'far less morphine solution than rats in cages, which suggested that a great deal of what looked '
    + 'like the pharmacology of addiction was actually the pharmacology of being alone in a box. The '
    + 'first paper got into Psychopharmacology in 1978. Later submissions were turned down by Science '
    + 'and by Nature, the funding was discontinued, and the work sat more or less unread for decades. '
    + 'The finding is where this colony is trying to get to.',
  source: 'Alexander, B. K., Coambs, R. B. & Hadaway, P. F. (1978). The effect of housing and gender on '
    + 'morphine self-administration in rats. Psychopharmacology, 58(2), 175-179.',
};
