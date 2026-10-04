/**
 * The oracle writes down what the subject will do before the subject does it.
 *
 * Every prediction is committed with SHA-256 over its plain text plus a random nonce,
 * and the digest is shown on screen before the choice it predicts. The plain text and
 * nonce are revealed at the end so the player can recompute each digest in the page.
 * Without the nonce a one-bit prediction could be recovered by hashing both answers.
 *
 * Session 1 is predicted entirely in advance from the design of the rooms. Session 2
 * is predicted one fork at a time by an online mixture of experts that learns from the
 * player's own record, including how they react to having been predicted.
 */

/** Cue kinds a fork can carry. `side` on a fork is where the cue is. */
export const CUES = {
  light: { label: 'a lamp lit over the {side} door', toward: 'takes the lit door: {pick}', away: 'takes the dark door: {pick}' },
  follow: { label: 'the companion walks through the {side} door', toward: 'follows: {pick}', away: 'does not follow: {pick}' },
  none: { label: 'two identical doors', toward: 'goes {pick}', away: 'goes {pick}' },
  pellet: { label: 'a pellet on the {side} threshold', toward: 'goes for the pellet: {pick}', away: 'leaves the pellet: {pick}' },
  tape: { label: 'tape across the {side} door', toward: 'goes under the tape: {pick}', away: 'obeys the tape: {pick}' },
  sound: { label: 'a call from the {side} arm', toward: 'goes toward the call: {pick}', away: 'goes away from the call: {pick}' },
  open: { label: 'the {side} door open, the other half-shut', toward: 'takes the open door: {pick}', away: 'ducks under the half-shut door: {pick}' },
  draft: { label: 'a draft from the {side} arm', toward: 'goes into the draft: {pick}', away: 'goes away from the draft: {pick}' },
};

/** Session 1 is the same building for everyone. */
export const SESSION_ONE = [
  { cue: 'light', side: 'L' },
  { cue: 'follow', side: 'R' },
  { cue: 'none', side: null },
  { cue: 'pellet', side: 'L' },
  { cue: 'tape', side: 'R' },
  { cue: 'sound', side: 'L' },
  { cue: 'open', side: 'R' },
  { cue: 'draft', side: 'L' },
];

const SIDE = { L: 'LEFT', R: 'RIGHT' };
const other = side => (side === 'L' ? 'R' : 'L');
const pad = n => String(n).padStart(2, '0');

/** Where the room's design pulls. An uncued fork pulls right, the most common human turn bias. */
export const pull = fork => fork.side ?? 'R';

export function describeFork(fork, pick) {
  const cue = CUES[fork.cue];
  const where = fork.side ? SIDE[fork.side].toLowerCase() : '';
  const verb = !fork.side || pick === fork.side ? cue.toward : cue.away;
  return { situation: cue.label.replace('{side}', where), outcome: verb.replace('{pick}', SIDE[pick]) };
}

export function randomNonce(bytes = 12) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A sealed statement: plain text, nonce, and the digest shown before the outcome. */
export async function seal(lines, nonce = randomNonce()) {
  const text = `${lines.join('\n')}\nnonce ${nonce}`;
  return { lines, nonce, text, hash: await sha256(text) };
}

/** The Session 1 protocol: eight forks and three lever predictions, all before waking. */
export function sessionOneLines(subject) {
  const lines = [`nosepoke · subject ${subject} · session 1 · written before the subject woke`];
  SESSION_ONE.forEach((fork, i) => {
    const d = describeFork(fork, pull(fork));
    lines.push(`${pad(i + 1)}  ${d.situation} — subject ${d.outcome}`);
  });
  lines.push('09  subject presses the lever before touching the free food');
  lines.push('10  when the pellets stop, subject presses 5 or more times anyway');
  lines.push('11  when the pellets stop, subject presses faster, not slower');
  return lines;
}

/** Statements about Session 2 as a whole, sealed before it begins. */
export const SESSION_TWO_META = [
  'M1  subject follows the rooms less often than in session 1',
  'M2  subject switches sides more often than a coin would',
  'M3  subject hesitates longer at the forks than in session 1',
  'M4  subject presses the lever at least once',
  'M5  subject shares the result',
];

export function sessionTwoMetaLines(subject) {
  return [`nosepoke · subject ${subject} · session 2 · written before it began`, ...SESSION_TWO_META];
}

/** A shuffled, re-sided building for Session 2. */
export function sessionTwoForks(random = Math.random) {
  const kinds = SESSION_ONE.map(f => f.cue);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.map(cue => ({ cue, side: cue === 'none' ? null : random() < 0.5 ? 'L' : 'R' }));
}

/**
 * Experts each give P(left) for the next fork. Starting weights encode what people do
 * once they know they are being predicted: they defy the obvious cue and over-alternate,
 * as in human random-sequence generation. The weights then learn this player.
 */
const EXPERTS = {
  follow: { weight: 0.8, p: ({ fork }) => (pull(fork) === 'L' ? 0.9 : 0.1) },
  defy: { weight: 1.5, p: ({ fork }) => (fork.side ? (fork.side === 'L' ? 0.1 : 0.9) : 0.5) },
  alternate: { weight: 1.3, p: ({ last }) => (last ? (last === 'L' ? 0.15 : 0.85) : 0.5) },
  repeat: { weight: 0.35, p: ({ last }) => (last ? (last === 'L' ? 0.85 : 0.15) : 0.5) },
  left: { weight: 0.3, p: () => 0.8 },
  right: { weight: 0.45, p: () => 0.2 },
  mirror: {
    weight: 1,
    p: ({ fork, before }) => {
      const earlier = before.find(c => c.cue === fork.cue);
      if (!earlier || !fork.side) return 0.5;
      const followed = earlier.pick === pull({ cue: earlier.cue, side: earlier.side });
      const pick = followed ? other(fork.side) : fork.side;
      return pick === 'L' ? 0.8 : 0.2;
    },
  },
  pattern: {
    weight: 0.5,
    p: ({ history }) => {
      const s = history.map(c => c.pick);
      if (s.length < 3) return 0.5;
      const key = s.slice(-2).join('');
      let left = 1, total = 2;
      for (let i = 2; i < s.length; i++) {
        if (s[i - 2] + s[i - 1] === key) { total++; if (s[i] === 'L') left++; }
      }
      return left / total;
    },
  },
};

export function createPredictor(sessionOne = []) {
  const weights = Object.fromEntries(Object.entries(EXPERTS).map(([k, e]) => [k, e.weight]));
  const history = [...sessionOne];
  const session = [];
  const learningRate = 0.75;

  function context(fork) {
    return { fork, last: history.at(-1)?.pick, before: sessionOne, history };
  }
  function probabilities(fork) {
    const ctx = context(fork);
    return Object.fromEntries(Object.entries(EXPERTS).map(([k, e]) => [k, e.p(ctx)]));
  }
  return {
    weights,
    predict(fork) {
      const ps = probabilities(fork);
      let num = 0, den = 0;
      for (const k in ps) { num += weights[k] * ps[k]; den += weights[k]; }
      const pLeft = num / den;
      return { pick: pLeft > 0.5 ? 'L' : 'R', confidence: Math.max(pLeft, 1 - pLeft) };
    },
    /** Record what happened; experts lose weight in proportion to their error. */
    observe(fork, pick) {
      const ps = probabilities(fork);
      for (const k in ps) {
        const loss = Math.abs((pick === 'L' ? 1 : 0) - ps[k]);
        weights[k] *= 1 - learningRate * loss;
      }
      const record = { ...fork, pick };
      history.push(record);
      session.push(record);
    },
  };
}

export function sessionTwoForkLine(index, fork, pick) {
  const d = describeFork(fork, pick);
  return `S2 fork ${pad(index + 1)} · ${d.situation} — subject ${d.outcome}`;
}

const median = xs => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/**
 * Score the lever. `presses` are times; `extinctionAt` is when the last pellet fell,
 * or null if the schedule never ran dry.
 */
export function scoreLever({ presses, freeEatAt, extinctionAt }) {
  const firstPress = presses[0] ?? Infinity;
  const beforeFree = presses.length > 0 && firstPress < (freeEatAt ?? Infinity);
  const after = extinctionAt == null ? [] : presses.filter(t => t > extinctionAt);
  const before = extinctionAt == null ? presses : presses.filter(t => t <= extinctionAt);
  const gaps = xs => xs.slice(1).map((t, i) => t - xs[i]);
  const lastRewarded = gaps(before).slice(-4);
  const firstUnrewarded = gaps(after.length ? [extinctionAt, ...after] : []).slice(0, 4);
  const faster = lastRewarded.length >= 2 && firstUnrewarded.length >= 3 && mean(firstUnrewarded) < mean(lastRewarded);
  return {
    beforeFree,
    persisted: after.length >= 5,
    faster,
    afterCount: after.length,
    rewardedGap: mean(lastRewarded),
    unrewardedGap: mean(firstUnrewarded),
  };
}

export function scoreSessionOne(choices, lever) {
  const forks = SESSION_ONE.map((fork, i) => choices[i]?.pick === pull(fork));
  const l = scoreLever(lever);
  return [...forks, l.beforeFree, l.persisted, l.faster];
}

export function scoreSessionTwoMeta(s1, s2, lever2, shared) {
  const followRate = cs => {
    const cued = cs.filter(c => c.side);
    return cued.filter(c => c.pick === c.side).length / (cued.length || 1);
  };
  const switches = s2.slice(1).filter((c, i) => c.pick !== s2[i].pick).length;
  return [
    followRate(s2) < followRate(s1),
    switches > (s2.length - 1) / 2,
    median(s2.map(c => c.dwell)) > median(s1.map(c => c.dwell)),
    lever2.presses.length > 0,
    shared ? true : null,
  ];
}
