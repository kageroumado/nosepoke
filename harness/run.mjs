/**
 * Headless runner for one session, or a parameter sweep over many.
 *
 *     node harness/run.mjs FI --seed 23
 *     node harness/run.mjs PR --strain lewis --policy grinder --json
 *     node harness/run.mjs FI --sweep --alpha 0.06,0.08 --gamma 0.97,0.99 --temp 0.12,0.16
 *
 * A single run prints `sim.metrics()`. A sweep prints one tab-separated row per run,
 * with a header, so it can be piped straight into the tuning loop.
 */

import { createSim, SCHEDULE_KINDS, STRAINS } from '../shared/sim.js';
import { PRESETS, POLICY_REGISTRY, HEADLINE, run } from './sessions.mjs';

const USAGE = `usage: node harness/run.mjs <kind> [options]

  kind          one of ${SCHEDULE_KINDS.join(' ')}

  --seed N      session seed (default 23)
  --strain S    one of ${Object.keys(STRAINS).join(' ')}
  --policy P    one of ${Object.keys(POLICY_REGISTRY).join(' ')}
  --alpha X     learning rate            (sweep: a comma-separated list)
  --gamma X     discount                 (sweep: a comma-separated list)
  --lambda X    eligibility decay        (sweep: a comma-separated list)
  --temp X      policy temperature       (sweep: a comma-separated list)
  --json        print the metrics as JSON
  --sweep       run the grid and print TSV
  --seeds A,B   seeds for the sweep (default 1,2,3)
  --cap S       virtual seconds before the loop gives up
`;

const argv = process.argv.slice(2);
if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
  process.stdout.write(USAGE);
  process.exit(argv.length ? 0 : 1);
}

const kind = argv[0].toUpperCase();
if (!PRESETS[kind]) {
  process.stderr.write(`unknown schedule kind: ${argv[0]}\n\n${USAGE}`);
  process.exit(1);
}

const opts = parseFlags(argv.slice(1));

/** Read `--name value` pairs and bare `--flag` switches off the argument list. */
function parseFlags(args) {
  const out = { flags: new Set() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) out.flags.add(name);
    else { out[name] = next; i++; }
  }
  return out;
}

const numbers = (v, fallback) =>
  v === undefined ? fallback : String(v).split(',').map((s) => Number(s.trim()));

/**
 * Build one session from the kind's preset, with the model parameters and the policy
 * the caller asked for.
 */
function build({ seed, strain, alpha, gamma, lambda, temp, policyName }) {
  const preset = PRESETS[kind]({ temp });
  const cfg = {
    seed,
    ...(preset.strain ? { strain: preset.strain } : {}),
    ...(preset.gamma != null ? { gamma: preset.gamma } : {}),
    ...(preset.alpha != null ? { alpha: preset.alpha } : {}),
    ...(preset.autoEat != null ? { autoEat: preset.autoEat } : {}),
    stimuli: preset.stimuli,
    schedule: preset.schedule,
    policy: preset.policy,
  };
  if (strain) cfg.strain = strain;
  if (alpha != null) cfg.alpha = alpha;
  if (gamma != null) cfg.gamma = gamma;
  if (lambda != null) cfg.lambda = lambda;
  if (policyName) {
    const make = POLICY_REGISTRY[policyName];
    if (!make) { process.stderr.write(`unknown policy: ${policyName}\n`); process.exit(1); }
    cfg.policy = make(temp == null ? {} : { rate: temp, peak: temp, bias: temp });
  }
  return { sim: createSim(cfg), cap: Number(opts.cap) || preset.cap };
}

const f3 = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? round(v) : String(v)) : v);
function round(v) { return Math.abs(v) >= 1000 ? v.toFixed(0) : Number(v.toFixed(3)); }

if (opts.flags.has('sweep')) {
  const alphas = numbers(opts.alpha, [null]);
  const gammas = numbers(opts.gamma, [null]);
  const lambdas = numbers(opts.lambda, [null]);
  const temps = numbers(opts.temp, [undefined]);
  const seeds = numbers(opts.seeds, [1, 2, 3]);
  const headline = HEADLINE[kind];

  // `burstShrink` and `cueLate` are the columns that move with the model parameters:
  // the time-based policies respond on a clock, so the response metrics alone can sit
  // still across a whole learning-rate sweep.
  const generic = ['t', 'responses', 'deliveries', 'consumed', 'meanTonic', 'fryIndex',
    'quarterLife', 'earlyFraction', 'burstShrink', 'cueLate'];
  const extra = generic.includes(headline) ? [] : [headline];
  process.stdout.write(['kind', 'seed', 'alpha', 'gamma', 'lambda', 'temp', ...generic, ...extra].join('\t') + '\n');

  for (const alpha of alphas) {
    for (const gamma of gammas) {
      for (const lambda of lambdas) {
        for (const temp of temps) {
          for (const seed of seeds) {
            const { sim, cap } = build({ seed, strain: opts.strain, alpha, gamma, lambda, temp, policyName: opts.policy });
            run(sim, { cap });
            const m = sim.metrics();
            const row = {
              ...m,
              burstShrink: m.burstMigration.shrink,
              cueLate: m.burstMigration.cueLate,
            };
            process.stdout.write([
              kind, seed,
              alpha == null ? sim.cfg.alpha : alpha,
              gamma == null ? sim.cfg.gamma : gamma,
              lambda == null ? sim.cfg.lambda : lambda,
              temp == null ? '' : temp,
              ...generic.map((c) => f3(row[c])),
              ...extra.map((c) => f3(row[c])),
            ].join('\t') + '\n');
          }
        }
      }
    }
  }
  process.exit(0);
}

const { sim, cap } = build({
  seed: Number(opts.seed) || 23,
  strain: opts.strain,
  alpha: opts.alpha == null ? null : Number(opts.alpha),
  gamma: opts.gamma == null ? null : Number(opts.gamma),
  lambda: opts.lambda == null ? null : Number(opts.lambda),
  temp: opts.temp == null ? undefined : Number(opts.temp),
  policyName: opts.policy,
});
run(sim, { cap });
const metrics = sim.metrics();

if (opts.flags.has('json')) {
  process.stdout.write(JSON.stringify({ done: sim.S.done, metrics }, null, 2) + '\n');
  process.exit(0);
}

process.stdout.write(`${kind} — ${sim.cfg.strain} #${sim.cfg.seed}, ${sim.S.done ? 'finished' : 'CAPPED'} at ${metrics.t.toFixed(1)} s\n`);
for (const [key, value] of Object.entries(metrics)) {
  if (key === 'kind' || key === 'strain' || key === 'seed') continue;
  process.stdout.write('  ' + key.padEnd(22) + format(value) + '\n');
}

/** One metric value, short enough to read in a terminal. */
function format(v) {
  if (Array.isArray(v)) {
    const head = v.slice(0, 8).map((x) => (typeof x === 'number' ? round(x) : JSON.stringify(x)));
    return `[${head.join(', ')}${v.length > 8 ? `, … ${v.length} total` : ''}]`;
  }
  if (v && typeof v === 'object') {
    return '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${f3(x)}`).join(', ') + ' }';
  }
  return String(f3(v));
}
