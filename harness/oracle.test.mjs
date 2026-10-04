import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_ONE, pull, seal, sha256, sessionOneLines, sessionTwoForks, createPredictor,
  describeFork, scoreLever, scoreSessionOne, scoreSessionTwoMeta,
} from '../game/oracle.js';

function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('a seal is SHA-256 of the text and nonce, and any edit breaks it', async () => {
  const s = await seal(['01  subject goes LEFT'], 'abc123');
  assert.equal(s.text, '01  subject goes LEFT\nnonce abc123');
  assert.equal(s.hash, await sha256(s.text));
  assert.notEqual(s.hash, await sha256(s.text.replace('LEFT', 'RIGHT')));
});

test('a one-bit prediction cannot be read back from its digest without the nonce', async () => {
  const a = await seal(['S2 fork 01 · subject goes LEFT']);
  const b = await seal(['S2 fork 01 · subject goes LEFT']);
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.hash, b.hash);
});

test('session 1 is written before waking: eight forks and three lever lines', () => {
  const lines = sessionOneLines(23);
  assert.equal(lines.length, 12);
  assert.match(lines[0], /subject 23 · session 1/);
  assert.match(lines[1], /lamp lit over the left door — subject takes the lit door: LEFT/);
  assert.match(lines[3], /two identical doors — subject goes RIGHT/);
});

test('phrasing names what the subject does with the cue', () => {
  assert.equal(describeFork({ cue: 'follow', side: 'L' }, 'R').outcome, 'does not follow: RIGHT');
  assert.equal(describeFork({ cue: 'tape', side: 'R' }, 'R').outcome, 'goes under the tape: RIGHT');
  assert.equal(describeFork({ cue: 'tape', side: 'R' }, 'L').outcome, 'obeys the tape: LEFT');
});

test('session 2 shuffles every cue kind once and gives each a side', () => {
  const forks = sessionTwoForks(prng(4));
  assert.deepEqual(forks.map(f => f.cue).sort(), SESSION_ONE.map(f => f.cue).sort());
  for (const f of forks) assert.equal(f.side === null, f.cue === 'none');
});

function accuracy(play, games = 1500) {
  const rand = prng(99);
  let hits = 0, n = 0;
  for (let g = 0; g < games; g++) {
    const s1 = SESSION_ONE.map(f => ({ ...f, pick: rand() < 0.75 ? pull(f) : pull(f) === 'L' ? 'R' : 'L' }));
    const predictor = createPredictor(s1);
    let last = s1.at(-1).pick;
    for (const f of sessionTwoForks(rand)) {
      const guess = predictor.predict(f).pick, pick = play(f, last, rand);
      hits += guess === pick; n++;
      predictor.observe(f, pick); last = pick;
    }
  }
  return hits / n;
}

test('the predictor cannot beat a fair coin', () => {
  const a = accuracy((f, last, r) => (r() < 0.5 ? 'L' : 'R'));
  assert.ok(Math.abs(a - 0.5) < 0.03, `coin accuracy ${a}`);
});

test('the predictor reads people who defy the cue or over-alternate', () => {
  const defier = accuracy((f, last, r) => (f.side ? (r() < 0.8 ? (f.side === 'L' ? 'R' : 'L') : f.side) : last === 'L' ? 'R' : 'L'));
  const alternator = accuracy((f, last, r) => (r() < 0.75 ? (last === 'L' ? 'R' : 'L') : last));
  assert.ok(defier > 0.68, `defier accuracy ${defier}`);
  assert.ok(alternator > 0.6, `alternator accuracy ${alternator}`);
});

test('the lever lines score the extinction burst from press times', () => {
  const rewarded = [1, 2, 3, 4, 5, 6];
  const burst = scoreLever({ presses: [...rewarded, 6.4, 6.8, 7.1, 7.4, 7.7], freeEatAt: 9, extinctionAt: 6 });
  assert.deepEqual([burst.beforeFree, burst.persisted, burst.faster], [true, true, true]);
  const quit = scoreLever({ presses: [...rewarded, 8, 11], freeEatAt: 0.5, extinctionAt: 6 });
  assert.deepEqual([quit.beforeFree, quit.persisted, quit.faster], [false, false, false]);
  const never = scoreLever({ presses: [], freeEatAt: null, extinctionAt: null });
  assert.deepEqual([never.beforeFree, never.persisted, never.faster], [false, false, false]);
});

test('session 1 scoring compares each fork with the room\'s pull', () => {
  const choices = SESSION_ONE.map(f => ({ pick: pull(f) }));
  const outcomes = scoreSessionOne(choices, { presses: [], freeEatAt: null, extinctionAt: null });
  assert.deepEqual(outcomes.slice(0, 8), Array(8).fill(true));
  assert.equal(outcomes.length, 11);
});

test('session 2 statements: following less, switching more, hesitating longer', () => {
  const s1 = SESSION_ONE.map(f => ({ ...f, pick: pull(f), dwell: 1 }));
  const s2 = sessionTwoForks(prng(1)).map((f, i) => ({ ...f, pick: i % 2 ? 'L' : 'R', dwell: 3 }));
  const [m1, m2, m3, m4, m5] = scoreSessionTwoMeta(s1, s2, { presses: [4] }, false);
  assert.equal(m2, true);
  assert.equal(m3, true);
  assert.equal(m4, true);
  assert.equal(m5, null);
  assert.equal(typeof m1, 'boolean');
});
