/**
 * The player's own record: progression, the colony, every session's event log, and
 * the list of manipulations the game applied to them. The epilogue reads the last of
 * these back with the data proving each one worked, which is why nothing may be
 * appended to it silently.
 */

const KEY = 'nosepoke.v1';

/** Sessions kept in full. Older ones drop off the end. */
const RECORD_CAP = 24;

const BLANK = {
  version: 1,
  created: null,
  progress: { completed: {}, lastLevel: null },
  colony: [],
  record: [],
  disclosure: [],
  prefs: { theme: 'auto', sound: false },
  player: { phenotype: null, strain: null },
};

let cache = null;

/** Read the whole save. Safe on a first visit and when storage is unavailable. */
export function load() {
  if (cache) return cache;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }
  cache = merge(structuredClone(BLANK), stored || {});
  if (!cache.created) cache.created = new Date().toISOString();
  return cache;
}

/** Merge a patch into the save and write it. Returns the new state. */
export function save(patch = {}) {
  const state = merge(load(), patch);
  cache = state;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private window */ }
  return state;
}

/**
 * The strain of the player's rat, rolled once on first call and kept for the whole arc.
 * Every level's sim takes it, so the sprite, the learning rate, and the resting vigor are
 * the same animal from magazine training to Rat Park.
 */
export function playerStrain() {
  const state = load();
  if (!STRAIN_KEYS.includes(state.player.strain)) {
    state.player.strain = STRAIN_KEYS[Math.floor(Math.random() * STRAIN_KEYS.length)];
    save({ player: { strain: state.player.strain } });
  }
  return state.player.strain;
}
const STRAIN_KEYS = ['sprague-dawley', 'wistar', 'long-evans', 'lister-hooded', 'lewis', 'fischer-344'];

/** Record a finished level with the metrics it produced. */
export function completeLevel(levelId, metrics) {
  const state = load();
  state.progress.completed[levelId] = { at: new Date().toISOString(), metrics };
  state.progress.lastLevel = levelId;
  return save({});
}

/** True once the level has been finished at least once. */
export function isComplete(levelId) {
  return !!load().progress.completed[levelId];
}

/** Metrics from the last completed run of a level, or null. */
export function levelMetrics(levelId) {
  const entry = load().progress.completed[levelId];
  return entry ? entry.metrics : null;
}

/**
 * Add a rat to the colony. A rat is its share code plus the name it was given;
 * everything else in the row is derived from the code when it is imported.
 */
export function addRat(rat) {
  const state = load();
  if (state.colony.some((r) => r.code === rat.code)) return state;
  state.colony.push({ added: new Date().toISOString(), ...rat });
  return save({});
}

/** Append one session's event log, dropping the oldest when the cap is reached. */
export function addRecord(entry) {
  const state = load();
  state.record.push({ at: new Date().toISOString(), ...entry });
  while (state.record.length > RECORD_CAP) state.record.shift();
  return save({});
}

/**
 * Append a manipulation the game applied to this player. `kind` is the mechanism
 * (`faint-cue`, `latency`, `vr-slot`); `data` is whatever the epilogue needs to prove
 * it worked on this particular person.
 */
export function disclose(kind, data = {}) {
  const state = load();
  state.disclosure.push({ at: new Date().toISOString(), kind, ...data });
  return save({});
}

/** Everything disclosed so far, oldest first. */
export function disclosures() { return load().disclosure.slice(); }

/** Store a preference (theme, sound). */
export function setPref(name, value) {
  const state = load();
  state.prefs[name] = value;
  return save({});
}
export function pref(name, fallback) {
  const v = load().prefs[name];
  return v === undefined ? fallback : v;
}

/** The player's own data, as a file they can keep. */
export function exportJSON() {
  return JSON.stringify(load(), null, 2);
}

/** Offer the save as a download. */
export function downloadJSON(filename = 'nosepoke-data.json') {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Wipe the save. The epilogue offers this after the disclosure. */
export function reset() {
  cache = null;
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
  return load();
}

function merge(base, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      merge(base[k], v);
    } else if (v !== undefined) {
      base[k] = v;
    }
  }
  return base;
}
