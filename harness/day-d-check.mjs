/**
 * Headless signature checks for the progressive-ratio and effort-choice levels, against
 * the bands in PLAN section 4.
 *
 *     node harness/day-d-check.mjs
 *
 * Exits non-zero on a failure, so it gates.
 */
import { createSim, policies } from '../shared/sim.js';
import { referenceBreakpoints, prConfig, prSubject } from '../day/06-pr.subject.js';
import { choiceConfig, pelletsDelivered } from '../day/07-choice.session.js';

let fail = 0;
const ok = (label, pass, detail) => { console.log((pass ? '  ok   ' : '  FAIL ') + label + (detail ? '  ' + detail : '')); if (!pass) fail++; };
function run(sim, cap = 6000) { let g = 0; while (!sim.S.done && sim.S.t < cap && g++ < 200000) sim.step(0.1); return sim; }

console.log('\nd06 - breakpoint monotone in reward magnitude (Hodos 1961)');
const curve = referenceBreakpoints();
console.log('   ', curve.map(c => 'x' + c.magnitude + ': bp ' + c.breakpoint + ' (' + c.ratios + ' ratios)').join('   '));
ok('strictly increasing across three magnitudes',
  curve[0].breakpoint < curve[1].breakpoint && curve[1].breakpoint < curve[2].breakpoint,
  curve.map(c => c.breakpoint).join(' < '));

console.log('\nd06 - the same across five seeds');
for (const seed of [23, 7, 101, 555, 900]) {
  const bp = [1, 2, 4].map(magnitude => run(createSim(prConfig({ seed, magnitude, policy: prSubject() }))).metrics().breakpoint);
  ok('seed ' + String(seed).padEnd(4), bp[0] < bp[1] && bp[1] < bp[2], bp.join(' < '));
}

console.log('\nd07 - barrier choice under haloperidol (Salamone 1994), band < 0.6');
for (const seed of [23, 7, 101, 555, 900]) {
  const b = run(createSim(choiceConfig({ seed, haloperidol: false, policy: policies.chooser() })), 4000);
  const h = run(createSim(choiceConfig({ seed: seed + 1, haloperidol: true, policy: policies.chooser() })), 4000);
  const bm = b.metrics(), hm = h.metrics();
  const r = hm.barrierFraction / bm.barrierFraction;
  const eaten = bm.consumed + hm.consumed;
  const pellets = pelletsDelivered(b.S.events) + pelletsDelivered(h.S.events);
  const refusals = b.S.events.filter(e => e.type === 'refuse').length + h.S.events.filter(e => e.type === 'refuse').length;
  ok('seed ' + String(seed).padEnd(4), r < 0.6,
    bm.barrierFraction.toFixed(2) + ' -> ' + hm.barrierFraction.toFixed(2) + ' = ' + r.toFixed(2)
    + ' | ate ' + eaten + '/' + pellets + ' pellets, ' + refusals + ' refusals'
    + ' | tonic ' + bm.meanTonic.toFixed(2) + ' vs ' + hm.meanTonic.toFixed(2));
}

console.log(fail ? '\n' + fail + ' check(s) failed\n' : '\nall checks passed\n');
process.exit(fail ? 1 : 0);
