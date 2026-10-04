/**
 * The registry: every page in the game, in the order the player meets them, with the
 * rule that unlocks each one. This is the single source of navigation — the hub builds
 * the rack from it and every page's continue button routes through it, so no page ever
 * hardcodes another page's URL.
 *
 * Entries exist before their pages do. A level whose file is missing still appears in
 * the rack; it simply cannot be reached until the file lands.
 */

import { isComplete } from './save.js';

/**
 * @typedef {object} Level
 * @property {string} id short identifier, also the key into progress, trivia, and references
 * @property {string} path page path relative to the site root
 * @property {'day'|'night'|'park'|'epilogue'} phase which skin the page wears
 * @property {string} title the name in the rack
 * @property {string} what one line describing what the player does
 * @property {string[]} requires level ids that must be complete before this unlocks
 */

/** @type {Level[]} */
export const LEVELS = [
  { id: 'd00', path: 'day/00-magazine.html', phase: 'day', title: 'Magazine training', what: 'Learn where the pellets appear, and that the click comes first.', requires: [] },
  { id: 'd01', path: 'day/01-pavlovian.html', phase: 'day', title: 'Pavlovian conditioning', what: 'A tone, then sucrose. Watch the burst move to the cue.', requires: ['d00'] },
  { id: 'n01', path: 'night/01-mess-hall.html', phase: 'night', title: 'The mess hall', what: "The janitor's cart squeaks before the crumbs. The colony's first theft.", requires: ['d01'] },
  { id: 'd02', path: 'day/02-extinction.html', phase: 'day', title: 'Extinction', what: 'The tone stops paying. Then, the next day, it does not stay gone.', requires: ['n01'] },
  { id: 'd03', path: 'day/03-blocking.html', phase: 'day', title: 'Blocking', what: 'A second cue is added, and refuses to learn anything. Why?', requires: ['d02'] },
  { id: 'n03', path: 'night/03-alarm.html', phase: 'night', title: 'The new alarm', what: 'A light goes in over the door. The veterans do not even look up.', requires: ['d03'] },
  { id: 'd04', path: 'day/04-ratio.html', phase: 'day', title: 'Ratio schedules', what: 'Fixed ratio, then variable. One of them is a slot machine.', requires: ['n03'] },
  { id: 'd05', path: 'day/05-fi.html', phase: 'day', title: 'Fixed interval', what: 'Reinforcement on a clock you are never shown. Ten intervals.', requires: ['d04'] },
  { id: 'n02', path: 'night/02-lookout.html', phase: 'night', title: 'The lookout', what: "The guard's rounds are a fixed interval. Peek early and you are seen.", requires: ['d05'] },
  { id: 'd06', path: 'day/06-pr.html', phase: 'day', title: 'Progressive ratio', what: 'The price of a pellet rises with every pellet. Where do you stop?', requires: ['n02'] },
  { id: 'd07', path: 'day/07-choice.html', phase: 'day', title: 'Effort-based choice', what: 'A barrier and four pellets, or a flat walk and two.', requires: ['d06'] },
  { id: 'n04', path: 'night/04-the-wall.html', phase: 'night', title: 'The wall', what: 'Who carries what. Every rat in the colony has an effort curve.', requires: ['d07'] },
  { id: 'd08', path: 'day/08-icss.html', phase: 'day', title: 'Intracranial stimulation', what: 'The tethered electrode. The tray stays full.', requires: ['n04'] },
  { id: 'd09', path: 'day/09-self-admin.html', phase: 'day', title: 'Self-administration', what: 'The bowl turns under you so the line never tangles. Three days.', requires: ['d08'] },
  { id: 'n05', path: 'night/05-escape.html', phase: 'night', title: 'The escape', what: 'The squeak, the rounds, the alarm, the wall. Every timing is yours.', requires: ['d09'] },
  { id: 'park', path: 'park/index.html', phase: 'park', title: 'Rat Park', what: 'Wheel, tunnels, shavings, company. Two bottles, seven days.', requires: ['n05'] },
  { id: 'epilogue', path: 'epilogue/index.html', phase: 'epilogue', title: 'The disclosure', what: 'Everything the game did to you, with your own data proving it.', requires: ['park'] },
];

const BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** Look a level up by id. */
export function level(id) { return BY_ID[id] || null; }

/** The level after this one in play order, or null at the end. */
export function nextLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
}

/** The level before this one, or null at the start. */
export function previousLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i > 0 ? LEVELS[i - 1] : null;
}

/** True when every level this one requires has been completed. */
export function isUnlocked(id) {
  const l = BY_ID[id];
  if (!l) return false;
  return l.requires.every((r) => isComplete(r));
}

/** `locked`, `unlocked`, or `done` — what the rack draws. */
export function levelState(id) {
  if (isComplete(id)) return 'done';
  return isUnlocked(id) ? 'unlocked' : 'locked';
}

/** The first level that is unlocked and not yet complete. */
export function nextUnfinished() {
  return LEVELS.find((l) => isUnlocked(l.id) && !isComplete(l.id)) || null;
}

/**
 * The site root, derived from where this module itself lives. `shared/` always sits
 * directly under the root, so this is correct from any page depth and under any
 * deployment prefix.
 */
export function rootPath() {
  return new URL('../', import.meta.url).href;
}

/** A href for a level, correct from wherever the current page sits. */
export function href(id) {
  const l = BY_ID[id];
  return l ? new URL(l.path, rootPath()).href : rootPath();
}
