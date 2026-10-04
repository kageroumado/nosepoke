/**
 * The rest of the colony, drawn on a canvas layered over the arena.
 *
 * Every rat here is a real share code rebuilt into its own sim, so its vigor is its own
 * learned model state rather than a wander constant. The player's tonic estimate sets
 * how the colony spends its time: a lively park sends rats to the wheel and the tunnels,
 * a flat one leaves them asleep in the nest.
 */

import { createSim, STRAINS } from '../shared/sim.js';

/**
 * Colony rats that live here regardless of who the player has collected, so the park is
 * never empty. Names belong to the colony, not to the study.
 */
export const RESIDENTS = [
  { name: 'Pip', strain: 'long-evans' },
  { name: 'Wren', strain: 'lister-hooded' },
  { name: 'Moss', strain: 'sprague-dawley' },
  { name: 'Bell', strain: 'wistar' },
  { name: 'Tuck', strain: 'fischer-344' },
  { name: 'Ash', strain: 'lewis' },
];

/** How many rats the park draws at most, the player's own excluded. */
const MAX_RATS = 8;

/** Seeded generator, so a given colony wanders the same way twice. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Mount the colony over an arena.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas the overlay canvas, sized to the arena
 * @param {object} opts.rig the mounted rig; its props and arena box are read, never written
 * @param {object} opts.sim the player's sim; its tonic estimate drives the colony's energy
 * @param {Array} [opts.colony] saved colony rows, `{ name, code, strain }`
 * @returns {object} `{ rats, step, draw, count }`
 */
export function mountColony(opts) {
  const { canvas, rig, sim } = opts;
  const AR = rig.arena;
  const props = rig.props;

  const rats = [];
  const saved = (opts.colony || []).filter((r) => r && r.code).slice(-MAX_RATS);
  for (const row of saved) rats.push(makeRat(row.name || 'Subject', row.code, row.strain));
  for (const res of RESIDENTS) {
    if (rats.length >= Math.max(5, saved.length + 3)) break;
    if (rats.some((r) => r.name === res.name)) continue;
    rats.push(makeRat(res.name, null, res.strain));
  }

  function makeRat(name, code, strainKey) {
    const seed = hash(code || name);
    const rand = rng(seed);
    let own = null;
    if (code) {
      try {
        own = createSim.deserialize(code, { schedule: { kind: 'FREE' }, policy: null });
      } catch { own = null; }
    }
    if (!own) {
      const strain = STRAINS[strainKey] ? strainKey : 'sprague-dawley';
      own = createSim({ seed, strain, schedule: { kind: 'FREE' } });
    }
    return {
      name,
      sim: own,
      rand,
      x: 60 + rand() * (AR.w - 120),
      y: 60 + rand() * (AR.h - 120),
      angle: rand() * Math.PI * 2,
      scale: 0.72 + rand() * 0.12,
      state: 'wander',
      stateT: 1 + rand() * 4,
      target: null,
      orbit: rand() * Math.PI * 2,
      hidden: false,
      bob: rand() * Math.PI * 2,
    };
  }

  /** Pick what a rat does next. A lively park pulls toward the wheel and the tunnels. */
  function nextState(r, energy) {
    const roll = r.rand();
    const active = 0.2 + energy * 0.55;
    if (roll < active * 0.4 && props.wheel) return 'wheel';
    if (roll < active * 0.8 && props.tunnel) return 'tunnel';
    if (roll < active) return 'wander';
    return props.nest ? 'nest' : 'wander';
  }

  function enter(r, state, energy) {
    r.state = state;
    r.hidden = false;
    if (state === 'wander') {
      r.target = { x: 44 + r.rand() * (AR.w - 88), y: 44 + r.rand() * (AR.h - 88) };
      r.stateT = 2 + r.rand() * 4;
    } else if (state === 'wheel') {
      r.target = null;
      r.orbit = r.rand() * Math.PI * 2;
      r.stateT = 5 + r.rand() * 9 * (0.5 + energy);
    } else if (state === 'tunnel') {
      r.target = { x: props.tunnel.x + (r.rand() - 0.5) * 60, y: props.tunnel.y };
      r.stateT = 4 + r.rand() * 6;
    } else if (state === 'nest') {
      const a = r.rand() * Math.PI * 2;
      const rad = props.nest.r * (0.3 + r.rand() * 0.5);
      r.target = { x: props.nest.x + Math.cos(a) * rad, y: props.nest.y + Math.sin(a) * rad };
      r.stateT = 9 + r.rand() * 16 * (1.4 - energy);
    }
  }

  /** Advance every colony rat by one frame. */
  function step(dt) {
    const energy = sim.S.tonicNorm;
    for (const r of rats) {
      r.sim.step(dt);
      r.bob += dt * (1.4 + energy * 2);
      r.stateT -= dt;

      if (r.state === 'wheel') {
        const w = props.wheel;
        const speed = (0.9 + energy * 2.2) * r.sim.speedFactor();
        r.orbit += dt * speed;
        r.x = w.x + Math.cos(r.orbit) * (w.r * 0.62);
        r.y = w.y + Math.sin(r.orbit) * (w.r * 0.62);
        r.angle = r.orbit + Math.PI / 2;
      } else if (r.target) {
        const dx = r.target.x - r.x;
        const dy = r.target.y - r.y;
        const d = Math.hypot(dx, dy);
        if (d < 5) {
          r.target = null;
          if (r.state === 'tunnel') r.hidden = true;
        } else {
          const sp = 92 * r.sim.speedFactor() * (0.55 + energy * 0.75);
          const want = Math.atan2(dy, dx);
          let da = want - r.angle;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          r.angle += da * Math.min(1, dt * 6);
          r.x += Math.cos(r.angle) * sp * dt;
          r.y += Math.sin(r.angle) * sp * dt;
        }
      }

      if (r.stateT <= 0) {
        if (r.state === 'tunnel' && r.hidden) {
          // Out the far end, which is what a tunnel is for.
          const side = r.rand() < 0.5 ? -1 : 1;
          r.x = props.tunnel.x + side * (props.tunnel.r + 16);
          r.y = props.tunnel.y + (r.rand() - 0.5) * 20;
        }
        enter(r, nextState(r, energy), energy);
      }
    }
  }

  /** Draw the colony over the arena. Names are drawn at full strength, bodies under it. */
  function draw() {
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth || AR.w;
    const h = canvas.clientHeight || AR.h;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(w / AR.w, h / AR.h);

    const c = rig.colors;
    for (const r of rats) {
      if (r.hidden) continue;
      const asleep = r.state === 'nest' && !r.target;
      ctx.save();
      ctx.translate(r.x, r.y + (asleep ? Math.sin(r.bob) * 0.8 : 0));
      ctx.rotate(r.angle);
      ctx.scale(r.scale, r.scale);

      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.quadraticCurveTo(-32, Math.sin(r.bob) * 5, -44, Math.sin(r.bob * 0.7) * 7);
      ctx.stroke();

      ctx.globalAlpha = asleep ? 0.75 : 0.92;
      ctx.fillStyle = c.fur;
      ctx.strokeStyle = c.furLine;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 12.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(18, 0, 11, 8.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = asleep ? 0.5 : 0.8;
      ctx.beginPath(); ctx.arc(13, -8, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(13, 8, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (!asleep) {
        ctx.fillStyle = c.ink3;
        ctx.font = `10px ${c.fontData}`;
        ctx.textAlign = 'center';
        ctx.fillText(r.name, r.x, r.y - 20 * r.scale);
        ctx.textAlign = 'left';
      }
    }

    // Sleepers are drawn as a pile, so the pile gets one label instead of five.
    const sleeping = rats.filter((r) => r.state === 'nest' && !r.target && !r.hidden);
    if (sleeping.length && props.nest) {
      ctx.fillStyle = c.ink3;
      ctx.font = `10px ${c.fontData}`;
      ctx.textAlign = 'center';
      const who = sleeping.length > 2
        ? `${sleeping.length} asleep`
        : sleeping.map((r) => r.name).join(' and ') + ' · zzz';
      ctx.fillText(who, props.nest.x, props.nest.y - props.nest.r - 6);
      ctx.textAlign = 'left';
    }

    // The bottles are the only thing in the park that has to be read, so they are labeled.
    ctx.font = `10px ${c.fontData}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = c.ink2;
    if (props.bottlePlain) ctx.fillText('water', props.bottlePlain.x, props.bottlePlain.y - 34);
    if (props.bottleMorphine) ctx.fillText('morphine', props.bottleMorphine.x, props.bottleMorphine.y - 34);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  return { rats, step, draw, get count() { return rats.length; } };
}
