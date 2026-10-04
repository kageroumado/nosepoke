/**
 * The colony: six named rats, one per strain, and the lines they say at night.
 *
 * Every night page imports this so the cast is the same one every time. A rat's
 * numbers come from the strain table in `sim.js` rather than from anything invented
 * here, so a personality line and an effort curve describe the same animal.
 */

import { STRAINS, effortPresses } from '../shared/sim.js';

/**
 * @typedef {object} ColonyRat
 * @property {string} id short key, used by pages and by the field notes
 * @property {string} name the name the colony uses
 * @property {string} strain key into `STRAINS`
 * @property {string} they subject pronoun
 * @property {string} them object pronoun
 * @property {string} their possessive pronoun
 * @property {string} line one sentence of who this rat is
 * @property {string} job what this one is for, in the colony's own words
 */

/** @type {ColonyRat[]} */
export const COLONY = [
  {
    id: 'bandit', name: 'Bandit', strain: 'long-evans',
    they: 'she', them: 'her', their: 'her',
    line: 'Has been over the wall twice and come back both times, which she says was the plan.',
    job: 'scout',
  },
  {
    id: 'milk', name: 'Milk', strain: 'wistar',
    they: 'she', them: 'her', their: 'her',
    line: 'Cannot make out the far end of the room and has never once needed to.',
    job: 'ears',
  },
  {
    id: 'nine', name: 'Nine', strain: 'sprague-dawley',
    they: 'they', them: 'them', their: 'their',
    line: 'Does exactly what the procedure says. In here that turns out to be rare.',
    job: 'timekeeper',
  },
  {
    id: 'whisk', name: 'Whisk', strain: 'lister-hooded',
    they: 'he', them: 'him', their: 'his',
    line: 'Cannot be in a room without having touched every wall of it first.',
    job: 'climber',
  },
  {
    id: 'ash', name: 'Ash', strain: 'lewis',
    they: 'he', them: 'him', their: 'his',
    line: 'Came out of the tethered study. Does not talk about it, and carries the far end of everything.',
    job: 'hauler',
  },
  {
    id: 'pin', name: 'Pin', strain: 'fischer-344',
    they: 'she', them: 'her', their: 'her',
    line: 'Freezes at anything new for about four seconds, then does the right thing.',
    job: 'lookout',
  },
];

const BY_ID = Object.fromEntries(COLONY.map((r) => [r.id, r]));

/** One rat by id. */
export function colonyRat(id) { return BY_ID[id] || null; }

/** The rat that carries a given strain, or null when no one in the cast does. */
export function ratOfStrain(strain) { return COLONY.find((r) => r.strain === strain) || null; }

/**
 * The model rests a subject at `tonicBaseline × 0.4` before any reward has arrived, so
 * a page that wants an animal to sit at its strain's own baseline passes this to
 * `setTonicGain`. It is the same number for every strain: the differences between rats
 * come from the baseline column, not from the gain.
 */
export const BASELINE_GAIN = 2.5;

/** Where this strain's tonic estimate sits at rest, once `BASELINE_GAIN` is applied. */
export function restingVigor(strain) {
  const s = STRAINS[strain] || STRAINS['sprague-dawley'];
  return Math.min(1, s.tonicBaseline);
}

/** Presses this strain pays to clear a barrier from rest, by Salamone's cost rule. */
export function barrierCost(strain) {
  return effortPresses(restingVigor(strain));
}

/**
 * Lines the colony says on each night, in the order a page plays them. Each is
 * attributed, and each goes into the sim's note stream so it lands in the session
 * record with everything else.
 *
 * @type {Object<string, Array<{who: string, text: string}>>}
 */
export const FIELD_NOTES = {
  n01: [
    { who: 'bandit', text: 'The cart squeaks before it turns the corner. That is the whole trick. Wait for the squeak, then move.' },
    { who: 'milk', text: 'I hear it two rooms out. You will all be standing at the bin before you know why.' },
    { who: 'nine', text: 'Recording it properly: squeak, then crumbs, every time. That is not luck, that is a schedule.' },
  ],
  n02: [
    { who: 'pin', text: 'He walks the same round every time. Same boots, same corner, same gap.' },
    { who: 'nine', text: 'Peek before the gap opens and he sees you. Peek after and you have missed the count.' },
    { who: 'bandit', text: 'That curve on the paper is you learning what time it is without a clock.' },
  ],
  n03: [
    { who: 'whisk', text: 'They put a light over the door tonight. Red. It comes on when the squeak comes on.' },
    { who: 'milk', text: 'I could not see it if I tried. Neither could any of you, in the way that matters.' },
    { who: 'bandit', text: 'The new one is up on her back legs staring at it. Nothing to learn there. We already knew.' },
  ],
  n04: [
    { who: 'ash', text: 'The wall is the only way out that is not a door. Somebody has to be on the far end of it.' },
    { who: 'whisk', text: 'I will climb. I would climb anyway. Give me the heavy one.' },
    { who: 'pin', text: 'Send me round the drain. I am no use on a wall and we both know it.' },
  ],
  n05: [
    { who: 'bandit', text: 'Everyone knows their part. Squeak, count, hold, climb. Nobody improvises tonight.' },
    { who: 'nine', text: 'The gap is exactly as long as it has always been. Trust the count, not your nerve.' },
    { who: 'ash', text: 'Door is open. Go. I am behind you and I am not coming back for anything.' },
  ],
};

/**
 * Push one colony line into a sim's note stream, so the shell's ticker shows it and
 * the session record keeps it.
 *
 * @param {object} sim the running sim
 * @param {string} nightId level id, keying `FIELD_NOTES`
 * @param {number} index which line
 */
export function speak(sim, nightId, index) {
  const lines = FIELD_NOTES[nightId] || [];
  const line = lines[index];
  if (!line || !sim) return null;
  const who = BY_ID[line.who];
  sim.note((who ? who.name + ': ' : '') + line.text);
  return line;
}

/** The whole cast as one line of prose, for a page that wants to introduce them. */
export function roll() {
  return COLONY.map((r) => r.name).join(', ');
}
