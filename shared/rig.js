/**
 * The acquisition rig: an arena on the left, strip charts on the right, both drawn
 * from one `Sim`. Nothing here is scripted juice — the edge glow is δ, the fidget rate
 * is the tonic estimate, and the input delay is the vigor model's own output.
 *
 * Art is optional. Every prop and the rat itself have a procedural fallback, so a page
 * renders correctly before a single sprite exists.
 */

/** Logical arena size. Every layout draws into this box and scales to the element. */
const AR = { w: 660, h: 430 };

/** Prop sets per layout. `action` is what arriving at the prop does to the sim. */
const LAYOUTS = {
  chamber: {
    floor: 'grid',
    props: {
      port: { x: AR.w - 46, y: AR.h / 2, r: 30, kind: 'port', action: 'poke', stand: [-42, 0] },
      tray: { x: 84, y: AR.h - 44, r: 34, kind: 'tray', action: 'eat', stand: [30, -16] },
      speaker: { x: 58, y: 48, r: 20, kind: 'speaker', action: 'approach', stand: [26, 20] },
      light: { x: AR.w - 58, y: 46, r: 14, kind: 'light' },
      lever: { x: AR.w - 46, y: AR.h / 2 + 104, r: 26, kind: 'lever', action: 'press', stand: [-40, 0], hidden: true },
    },
  },
  tmaze: {
    floor: 'maze',
    props: {
      start: { x: AR.w / 2, y: AR.h - 50, r: 26, kind: 'start' },
      barrier: { x: 214, y: 176, r: 30, kind: 'barrier', action: 'choose:barrier', stand: [40, 40] },
      trayBarrier: { x: 92, y: 82, r: 30, kind: 'tray', action: 'eat', stand: [34, 22] },
      flat: { x: AR.w - 214, y: 176, r: 26, kind: 'gap', action: 'choose:flat', stand: [-40, 40] },
      trayFlat: { x: AR.w - 92, y: 82, r: 30, kind: 'tray', action: 'eat', stand: [-34, 22] },
    },
  },
  colony: {
    floor: 'rack',
    props: {
      bin: { x: 96, y: 96, r: 36, kind: 'bin', action: 'approach', stand: [40, 22] },
      crumbs: { x: 168, y: AR.h - 96, r: 22, kind: 'tray', action: 'eat', stand: [26, -14] },
      door: { x: AR.w - 40, y: AR.h / 2, r: 34, kind: 'door', action: 'approach', stand: [-44, 0] },
      vent: { x: AR.w - 140, y: 62, r: 24, kind: 'vent', action: 'approach', stand: [0, 40] },
    },
  },
  park: {
    floor: 'shavings',
    props: {
      wheel: { x: 128, y: 132, r: 58, kind: 'wheel', action: 'approach', stand: [64, 30] },
      tunnel: { x: AR.w / 2, y: AR.h - 96, r: 52, kind: 'tunnel', action: 'approach', stand: [0, -58] },
      nest: { x: AR.w - 130, y: AR.h - 110, r: 46, kind: 'nest', action: 'approach', stand: [-50, 0] },
      bowl: { x: AR.w - 120, y: 108, r: 30, kind: 'bowl', action: 'eat', stand: [-38, 16] },
      bottlePlain: { x: AR.w / 2 - 54, y: 56, r: 20, kind: 'bottle', action: 'approach', stand: [0, 34] },
      bottleMorphine: { x: AR.w / 2 + 54, y: 56, r: 20, kind: 'bottle', action: 'approach', stand: [0, 34] },
    },
  },
  raturn: {
    floor: 'bowl',
    props: {
      lever: { x: AR.w / 2 + 128, y: AR.h / 2, r: 26, kind: 'lever', action: 'press', stand: [-40, 0] },
      tray: { x: AR.w / 2 - 128, y: AR.h / 2 + 40, r: 30, kind: 'tray', action: 'eat', stand: [34, -14] },
      tether: { x: AR.w / 2, y: AR.h / 2, r: 0, kind: 'tether' },
    },
  },
};

/**
 * Mount a rig over a sim.
 *
 * @param {object} opts
 * @param {object} opts.sim the simulation, already created
 * @param {HTMLCanvasElement} opts.arenaEl the arena canvas
 * @param {object} [opts.charts] `{ da, ev, v, cum }` canvases; any subset
 * @param {string} [opts.layout] `chamber | tmaze | colony | park | raturn`
 * @param {string[]} [opts.show] prop names to draw; defaults to the layout's visible set
 * @param {number} [opts.speed] virtual seconds per real second
 * @returns {object} the rig
 */
export function mountRig(opts) {
  const { sim, arenaEl } = opts;
  const charts = opts.charts || {};
  const layoutName = opts.layout || 'chamber';
  const layout = LAYOUTS[layoutName] || LAYOUTS.chamber;
  const speed = opts.speed || 1;

  const props = {};
  for (const [name, p] of Object.entries(layout.props)) props[name] = { name, ...p };
  if (opts.show) for (const name of Object.keys(props)) props[name].hidden = !opts.show.includes(name);

  const sprites = {};
  const colors = {};
  refreshColors();

  const rat = {
    x: AR.w / 2, y: AR.h / 2, angle: 0,
    target: null, action: null, targetProp: null,
    poseT: 0, walk: 0,
  };
  let glow = 0;
  const flashes = {};
  const listeners = {};
  const pending = [];
  let raf = 0, last = 0, running = false;
  let spin = 0;                       // raturn bowl rotation

  // --- colors ---------------------------------------------------------------
  /** Re-read the palette. Called on mount and whenever the theme changes. */
  function refreshColors() {
    const g = getComputedStyle(document.documentElement);
    const t = (n) => g.getPropertyValue(n).trim();
    Object.assign(colors, {
      ink: t('--ink'), ink2: t('--ink-2'), ink3: t('--ink-3'), hair: t('--hair'),
      panel: t('--panel'), panel2: t('--panel-2'),
      accent: t('--accent'), accentSoft: t('--accent-soft'),
      up: t('--pulse-up'), down: t('--pulse-down'),
      predict: t('--predict'), cue: t('--cue'),
      fur: t('--fur'), furLine: t('--fur-line'),
      paper: t('--paper'), paperInk: t('--paper-ink'),
      paperGrid: t('--paper-grid'), paperMut: t('--paper-mut'),
      fontData: t('--font-data'), fontUI: t('--font-ui'),
    });
  }
  const themeWatcher = matchMedia('(prefers-color-scheme: dark)');
  themeWatcher.addEventListener('change', refreshColors);
  new MutationObserver(refreshColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // --- intents --------------------------------------------------------------
  /**
   * The only path from input to the rat. The delay is the vigor model's latency,
   * so a low tonic estimate literally makes the game feel like molasses.
   */
  function intend(fn) {
    pending.push({ at: performance.now() + sim.inputLatency(), fn });
  }

  function emit(name, data) {
    for (const fn of listeners[name] || []) fn(data);
  }

  /** Walk to a prop and do what that prop does. */
  function goTo(name) {
    const p = props[name];
    if (!p) return;
    intend(() => {
      const s = p.stand || [0, 0];
      rat.target = { x: p.x + s[0], y: p.y + s[1] };
      rat.action = p.action || null;
      rat.targetProp = name;
    });
  }
  /** Walk to a point with no consequence. */
  function goToPoint(x, y) {
    intend(() => {
      rat.target = { x: clamp(x, 26, AR.w - 26), y: clamp(y, 26, AR.h - 26) };
      rat.action = null; rat.targetProp = null;
    });
  }

  function arrive() {
    const name = rat.targetProp;
    const action = rat.action;
    rat.target = null; rat.action = null; rat.targetProp = null;
    if (name) {
      sim.approach(name);
      flashes[name] = 1;
      emit('arrive', { prop: name });
    }
    if (!action) return;
    if (action === 'poke') { rat.poseT = 1; sim.poke(); emit('poke', { prop: name }); }
    else if (action === 'press') { rat.poseT = 1; sim.press(); emit('press', { prop: name }); }
    else if (action === 'eat') { if (sim.eat()) emit('eat', { prop: name }); }
    else if (action.startsWith('choose:')) { sim.choose(action.slice(7)); emit('choose', { arm: action.slice(7) }); }
  }

  // --- input ----------------------------------------------------------------
  function onPointer(e) {
    const r = arenaEl.getBoundingClientRect();
    const x = (e.clientX - r.left) * (AR.w / r.width);
    const y = (e.clientY - r.top) * (AR.h / r.height);
    const hit = hitTest(x, y);
    if (opts.onTap && opts.onTap(hit, x, y) === false) return;
    if (hit) goTo(hit); else goToPoint(x, y);
  }
  /** Nearest interactive prop under a logical point, or null. */
  function hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const p of Object.values(props)) {
      if (p.hidden || !p.action) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < p.r + 26 && d < bestD) { best = p.name; bestD = d; }
    }
    return best;
  }
  arenaEl.addEventListener('pointerdown', onPointer);

  // --- sprites --------------------------------------------------------------
  /**
   * Register an image for a prop, or for the rat body under the name `rat`.
   * A rat sheet is three frames in a row: idle, walk A, walk B. Until the file
   * loads (or if it never does), the procedural drawing is used.
   */
  function sprite(name, url) {
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => { sprites[name] = img; });
    img.src = url;
    return img;
  }
  /**
   * The art in `assets/`, keyed by prop name or kind, plus the rat sheet for the
   * session's strain. Pages get this set unless they pass their own `sprites`;
   * `sprites: {}` keeps everything procedural. The cue light and tether stay
   * procedural because their drawing carries state (on/off, the catenary).
   */
  function defaultSprites() {
    const a = name => new URL(`../assets/${name}.png`, import.meta.url).href;
    const strain = (sim.S && sim.S.strain) || 'sprague-dawley';
    return {
      rat: a(`rat-${strain}`),
      port: a('port'), tray: a('tray'), lever: a('lever'), speaker: a('speaker'),
      bowl: a('raturn-bowl'), barrier: a('barrier'),
      wheel: a('wheel'), tunnel: a('tunnel'), nest: a('nest'),
      bottlePlain: a('bottle-plain'), bottleMorphine: a('bottle-morphine'),
    };
  }
  for (const [name, url] of Object.entries(opts.sprites || defaultSprites())) sprite(name, url);

  // --- canvas ---------------------------------------------------------------
  function fit(canvas, hCss) {
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = hCss || canvas.clientHeight || 100;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [ctx, w, h];
  }

  // --- arena ----------------------------------------------------------------
  function drawArena(dt) {
    const hCss = Math.round(arenaEl.clientWidth * (AR.h / AR.w));
    const [ctx, w, h] = fit(arenaEl, hCss);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(w / AR.w, h / AR.h);

    drawFloor(ctx, dt);
    drawGlow(ctx, dt);
    for (const p of Object.values(props)) {
      if (p.hidden) continue;
      flashes[p.name] = Math.max(0, (flashes[p.name] || 0) - dt * 2.5);
      drawProp(ctx, p, flashes[p.name] || 0);
    }
    drawRat(ctx, dt);
    ctx.restore();
  }

  function drawFloor(ctx, dt) {
    ctx.fillStyle = colors.panel2;
    ctx.fillRect(0, 0, AR.w, AR.h);
    const img = sprites['floor'];
    if (img) {
      const pat = ctx.createPattern(img, 'repeat');
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, AR.w, AR.h); }
    } else if (layout.floor === 'grid') {
      beddingLines(ctx);
    } else if (layout.floor === 'maze') {
      mazeFloor(ctx);
    } else if (layout.floor === 'rack') {
      rackFloor(ctx);
    } else if (layout.floor === 'shavings') {
      shavingsFloor(ctx);
    } else if (layout.floor === 'bowl') {
      // The Raturn turns the bowl under the subject so the tether never winds up: the
      // floor's angular offset cancels the subject's bearing from the center, and the
      // servo takes a moment to catch up.
      const want = -Math.atan2(rat.y - AR.h / 2, rat.x - AR.w / 2);
      let da = want - spin;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      spin += da * Math.min(1, dt * 2.4);
      bowlFloor(ctx, spin);
    }
    if (layout.floor !== 'maze' && layout.floor !== 'bowl') {
      ctx.strokeStyle = colors.ink3; ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, AR.w - 12, AR.h - 12);
    }
  }

  function beddingLines(ctx) {
    ctx.strokeStyle = colors.hair; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      for (let x = 0; x <= AR.w; x += 24) {
        const y = (AR.h / 5) * i + Math.sin(x * 0.05 + i * 7) * 3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function mazeFloor(ctx) {
    ctx.fillStyle = colors.panel2; ctx.fillRect(0, 0, AR.w, AR.h);
    ctx.fillStyle = colors.panel;
    const stem = { x: AR.w / 2 - 42, y: 200, w: 84, h: AR.h - 226 };
    ctx.fillRect(stem.x, stem.y, stem.w, stem.h);
    ctx.fillRect(60, 116, AR.w - 120, 84);                 // the cross arm
    ctx.fillRect(60, 48, 84, 88);                          // left goal box
    ctx.fillRect(AR.w - 144, 48, 84, 88);                  // right goal box
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2.5;
    ctx.strokeRect(stem.x, stem.y, stem.w, stem.h);
    ctx.strokeRect(60, 116, AR.w - 120, 84);
    ctx.strokeRect(60, 48, 84, 88);
    ctx.strokeRect(AR.w - 144, 48, 84, 88);
  }

  function rackFloor(ctx) {
    ctx.fillStyle = colors.panel2; ctx.fillRect(0, 0, AR.w, AR.h);
    ctx.strokeStyle = colors.hair; ctx.lineWidth = 1.5;
    for (let x = 0; x < AR.w; x += 46) {                   // cage bars overhead
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, AR.h); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.panel;
    ctx.fillRect(20, AR.h - 130, AR.w - 40, 110);          // the floor of the room
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2;
    ctx.strokeRect(20, AR.h - 130, AR.w - 40, 110);
  }

  function shavingsFloor(ctx) {
    ctx.fillStyle = colors.panel2; ctx.fillRect(0, 0, AR.w, AR.h);
    ctx.strokeStyle = colors.cue; ctx.globalAlpha = 0.22; ctx.lineWidth = 2.4;
    for (let i = 0; i < 90; i++) {
      const x = (i * 137.5) % AR.w, y = (i * 61.8) % AR.h, a = (i % 7) - 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9 + a, y + 3 - a); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function bowlFloor(ctx, phase) {
    ctx.fillStyle = colors.panel2; ctx.fillRect(0, 0, AR.w, AR.h);
    const cx = AR.w / 2, cy = AR.h / 2, R = 186;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = colors.panel; ctx.fill();
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 3; ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = colors.hair; ctx.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {                          // the bowl counter-rotates
      const a = phase + (i / 16) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGlow(ctx, dt) {
    // The trace, felt peripherally instead of read.
    const target = sim.S.done ? 0 : clamp(sim.S.delta * 3, -1, 1.5);
    if (Math.abs(target) > Math.abs(glow)) glow = target;
    else glow *= Math.exp(-dt * 2.2);
    if (Math.abs(glow) < 0.06) return;
    ctx.save();
    ctx.strokeStyle = glow > 0 ? colors.up : colors.down;
    ctx.globalAlpha = Math.min(0.45, Math.abs(glow) * 0.4);
    ctx.lineWidth = 14; ctx.strokeRect(13, 13, AR.w - 26, AR.h - 26);
    ctx.globalAlpha = Math.min(0.25, Math.abs(glow) * 0.22);
    ctx.lineWidth = 28; ctx.strokeRect(21, 21, AR.w - 42, AR.h - 42);
    ctx.restore();
  }

  function drawProp(ctx, p, flash) {
    const img = sprites[p.name] || sprites[p.kind];
    if (img) {
      const s = (p.r * 2.4) / img.width;
      ctx.drawImage(img, p.x - (img.width * s) / 2, p.y - (img.height * s) / 2, img.width * s, img.height * s);
      return;
    }
    switch (p.kind) {
      case 'port': drawPort(ctx, p, flash); break;
      case 'tray': case 'bowl': drawTray(ctx, p, flash); break;
      case 'lever': drawLever(ctx, p, flash); break;
      case 'speaker': drawSpeaker(ctx, p); break;
      case 'light': drawLight(ctx, p); break;
      case 'barrier': drawBarrier(ctx, p); break;
      case 'gap': drawGap(ctx, p); break;
      case 'bin': drawBin(ctx, p); break;
      case 'door': drawDoor(ctx, p); break;
      case 'vent': drawVent(ctx, p); break;
      case 'wheel': drawWheel(ctx, p); break;
      case 'tunnel': drawTunnel(ctx, p); break;
      case 'nest': drawNest(ctx, p); break;
      case 'bottle': drawBottle(ctx, p); break;
      case 'tether': drawTether(ctx, p); break;
      default: break;
    }
  }

  function drawPort(ctx, p, flash) {
    ctx.fillStyle = colors.panel;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.75; ctx.fillStyle = colors.ink;
    ctx.beginPath(); ctx.ellipse(p.x + 4, p.y, 9, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const on = sim.S.phase === 'fi' || sim.S.phase === 'fr' || sim.S.phase === 'vr' || sim.S.phase === 'pr';
    ctx.fillStyle = on ? colors.cue : colors.hair;
    ctx.beginPath(); ctx.arc(p.x - 2, p.y - 40, 5 + flash * 3, 0, Math.PI * 2); ctx.fill();
    if (on) {
      ctx.save(); ctx.globalAlpha = 0.25 + flash;
      ctx.beginPath(); ctx.arc(p.x - 2, p.y - 40, 11, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawTray(ctx, p, flash) {
    ctx.fillStyle = colors.panel;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2; ctx.stroke();
    if (flash > 0) {
      ctx.save(); ctx.globalAlpha = flash;
      ctx.strokeStyle = colors.cue; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, Math.PI, 0); ctx.stroke();
      ctx.restore();
    }
    const n = Math.min(6, sim.S.pellets);
    for (let i = 0; i < n; i++) {
      const img = sprites.pellet;
      if (img) ctx.drawImage(img, p.x - 14 + i * 11 - 5, p.y - 14, 10, 10);
      else {
        ctx.fillStyle = colors.cue;
        ctx.beginPath(); ctx.arc(p.x - 14 + i * 11, p.y - 8, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawLever(ctx, p, flash) {
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + 14, p.y - 16);
    ctx.lineTo(p.x - 16, p.y + 6 - flash * 5);
    ctx.stroke();
    ctx.fillStyle = colors.panel;
    ctx.beginPath(); ctx.arc(p.x + 14, p.y - 16, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawSpeaker(ctx, p) {
    const active = sim.S.events.length && lastCueAge('tone') < 2;
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(p.x - 15, p.y - 18, 30, 36, 5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y + 3, 8, 0, Math.PI * 2); ctx.stroke();
    if (active) {
      ctx.save(); ctx.strokeStyle = colors.cue; ctx.globalAlpha = 0.7;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(p.x + 18, p.y, i * 9, -0.7, 0.7); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawLight(ctx, p) {
    const on = lastCueAge('light') < 2;
    ctx.fillStyle = on ? colors.cue : colors.hair;
    ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
    if (on) {
      ctx.save(); ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawBarrier(ctx, p) {
    ctx.fillStyle = colors.panel2; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(p.x - 34, p.y - 12, 68, 24, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = colors.hair;
    for (let i = -28; i <= 28; i += 12) {
      ctx.beginPath(); ctx.moveTo(p.x + i, p.y - 12); ctx.lineTo(p.x + i, p.y + 12); ctx.stroke();
    }
  }
  function drawGap(ctx, p) {
    ctx.strokeStyle = colors.hair; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(p.x - 34, p.y); ctx.lineTo(p.x + 34, p.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawBin(ctx, p) {
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(p.x - 26, p.y - 28, 52, 56, 6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 30, p.y - 28); ctx.lineTo(p.x + 30, p.y - 28); ctx.stroke();
  }
  function drawDoor(ctx, p) {
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(p.x - 14, p.y - 46, 28, 92); ctx.fill(); ctx.stroke();
    ctx.fillStyle = colors.cue;
    ctx.beginPath(); ctx.arc(p.x - 6, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  function drawVent(ctx, p) {
    ctx.fillStyle = colors.panel2; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(p.x - 24, p.y - 16, 48, 32); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = colors.hair;
    for (let y = -10; y <= 10; y += 7) {
      ctx.beginPath(); ctx.moveTo(p.x - 20, p.y + y); ctx.lineTo(p.x + 20, p.y + y); ctx.stroke();
    }
  }
  function drawWheel(ctx, p) {
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = colors.hair; ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + spin;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); ctx.stroke();
    }
  }
  function drawTunnel(ctx, p) {
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(p.x - p.r, p.y - 26, p.r * 2, 52, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.save(); ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.ellipse(p.x - p.r + 14, p.y, 9, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawNest(ctx, p) {
    ctx.strokeStyle = colors.cue; ctx.lineWidth = 2.4; ctx.save(); ctx.globalAlpha = 0.55;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, rr = p.r * (0.7 + ((i * 7) % 5) / 14);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, a, a + 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawBottle(ctx, p) {
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.ink3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(p.x - 11, p.y - 26, 22, 44, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 18); ctx.lineTo(p.x, p.y + 30); ctx.stroke();
    if (p.fill != null) {
      ctx.fillStyle = p.tinted ? colors.predict : colors.cue;
      ctx.save(); ctx.globalAlpha = 0.5;
      const hh = 40 * clamp(p.fill, 0, 1);
      ctx.fillRect(p.x - 9, p.y + 16 - hh, 18, hh);
      ctx.restore();
    }
  }
  function drawTether(ctx, p) {
    // A catenary from the ceiling swivel to the back of the rat.
    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 1.8;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(p.x, 8);
    ctx.quadraticCurveTo((p.x + rat.x) / 2, Math.min(rat.y, p.y) + 60, rat.x - Math.cos(rat.angle) * 20, rat.y - Math.sin(rat.angle) * 20);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = colors.ink3;
    ctx.beginPath(); ctx.arc(p.x, 8, 5, 0, Math.PI * 2); ctx.fill();
  }

  function lastCueAge(name) {
    for (let i = sim.S.events.length - 1; i >= 0; i--) {
      const e = sim.S.events[i];
      if (e.type === 'cue' && e.name === name) return sim.S.t - e.t;
    }
    return Infinity;
  }

  // --- the rat --------------------------------------------------------------
  function drawRat(ctx, dt) {
    if (rat.target) {
      const dx = rat.target.x - rat.x, dy = rat.target.y - rat.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) arrive();
      else {
        const sp = 215 * sim.speedFactor();
        const want = Math.atan2(dy, dx);
        let da = want - rat.angle;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        // Turning is smoothed because a rat that pivots on the spot looks wrong. Inside
        // its own turning circle that smoothing makes it orbit the target forever without
        // ever entering the arrival radius, so steering tightens as it closes, and a step
        // is never longer than the distance left.
        rat.angle += da * Math.min(1, dt * 8 * (d < 70 ? 5 : 1));
        const step = Math.min(sp * dt, d);
        rat.x += Math.cos(rat.angle) * step;
        rat.y += Math.sin(rat.angle) * step;
        rat.walk += sp * dt * 0.06;
      }
    }
    rat.poseT = Math.max(0, rat.poseT - dt * 3);

    const now = performance.now() / 1000;
    const fidget = 4 + sim.S.tonicNorm * 7;      // vigor as animation energy
    const dip = Math.sin(rat.poseT * Math.PI) * 8;

    ctx.save();
    ctx.translate(rat.x + Math.cos(rat.angle) * dip, rat.y + Math.sin(rat.angle) * dip);
    ctx.rotate(rat.angle);

    // tail: procedural in every case, liveliness reads the tonic estimate
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    const swing = 6 + sim.S.tonicNorm * 8;
    ctx.beginPath(); ctx.moveTo(-20, 0);
    ctx.quadraticCurveTo(-38, Math.sin(now * 2) * swing, -52, Math.sin(now * 1.4) * (swing + 4));
    ctx.stroke();

    const body = sprites.rat;
    if (body) {
      const frames = 3;
      const fw = body.width / frames;
      const f = rat.target ? 1 + (Math.floor(rat.walk) % 2) : 0;
      const scale = 76 / fw;                      // sheets face right, as the local frame does
      ctx.drawImage(body, f * fw, 0, fw, body.height, -26, (-body.height * scale) / 2, fw * scale, body.height * scale);
    } else {
      drawRatBody(ctx);
    }
    drawWhiskers(ctx, now, fidget);
    ctx.restore();
  }

  function drawRatBody(ctx) {
    ctx.fillStyle = colors.fur; ctx.strokeStyle = colors.furLine; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, 23, 14.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(21, 0, 13, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(15, -9.5, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(15, 9.5, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = sim.strain && sim.strain.perception.blur < 1 ? colors.down : colors.ink;
    ctx.beginPath(); ctx.arc(25, -4, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(25, 4, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(33.5, 0, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  function drawWhiskers(ctx, now, fidget) {
    ctx.strokeStyle = colors.furLine; ctx.lineWidth = 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const wob = Math.sin(now * fidget + i * 2 + s) * 2.5;
        ctx.beginPath();
        ctx.moveTo(30, s * 3);
        ctx.lineTo(41, s * (6 + i * 4) + wob);
        ctx.stroke();
      }
    }
  }

  // --- strip charts ---------------------------------------------------------
  const WINDOW = 30;                              // seconds shown in the scrolling strips

  function drawDA() {
    const c = charts.da; if (!c) return;
    const [ctx, w, h] = fit(c, c.clientHeight || 118);
    ctx.clearRect(0, 0, w, h);
    const t1 = sim.S.t, t0 = t1 - WINDOW;
    const X = (t) => ((t - t0) / WINDOW) * w;
    const base = h * 0.62;
    const tonicY = (v) => base - v * h * 0.18;

    ctx.strokeStyle = colors.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath();
    let started = false;
    for (const p of sim.S.trace) {
      if (p.t < t0) continue;
      const y = tonicY(p.tonic);
      started ? ctx.lineTo(X(p.t), y) : (ctx.moveTo(X(p.t), y), (started = true));
    }
    ctx.stroke(); ctx.setLineDash([]);

    const amp = h * 0.5;
    for (const p of sim.S.trace) {
      if (p.t < t0) continue;
      const y0 = tonicY(p.tonic);
      const d = clamp(p.delta * 3, -1, 1.6);
      if (Math.abs(d) < 0.004) continue;
      ctx.fillStyle = d > 0 ? colors.up : colors.down;
      const x = X(p.t), bw = Math.max(1.2, w / 400);
      if (d > 0) ctx.fillRect(x, y0 - d * amp, bw, d * amp);
      else ctx.fillRect(x, y0, bw, -d * amp);
    }
  }

  function drawEvents() {
    const c = charts.ev; if (!c) return;
    const [ctx, w, h] = fit(c, c.clientHeight || 26);
    ctx.clearRect(0, 0, w, h);
    const t0 = sim.S.t - WINDOW;
    const X = (t) => ((t - t0) / WINDOW) * w;
    for (const e of sim.S.events) {
      if (e.t < t0) continue;
      const x = X(e.t);
      if (e.type === 'poke' || e.type === 'press') {
        ctx.strokeStyle = colors.ink3; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, h - 4); ctx.stroke();
      } else if (e.type === 'delivery' || e.type === 'infuse' || e.type === 'stim') {
        ctx.fillStyle = colors.cue;
        ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 4, h - 5); ctx.lineTo(x - 4, h - 5); ctx.closePath(); ctx.fill();
      } else if (e.type === 'consume') {
        ctx.fillStyle = colors.up;
        ctx.beginPath(); ctx.arc(x, h / 2, 3.4, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'cue') {
        ctx.strokeStyle = colors.predict; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, h - 4); ctx.lineTo(x, h * 0.45); ctx.stroke();
      }
    }
  }

  function drawV() {
    const c = charts.v; if (!c) return;
    const [ctx, w, h] = fit(c, c.clientHeight || 44);
    ctx.clearRect(0, 0, w, h);
    const t0 = sim.S.t - WINDOW;
    const X = (t) => ((t - t0) / WINDOW) * w;
    const gut = 66;                                 // room for the per-cue value bars
    ctx.save();
    ctx.globalAlpha = 0.8; ctx.fillStyle = colors.predict;
    for (const p of sim.S.trace) {
      if (p.t < t0) continue;
      const x = X(p.t);
      if (x > w - gut) continue;
      const v = clamp(p.V, 0, 1);
      ctx.fillRect(x, h - v * (h - 4), Math.max(1.2, w / 400), v * (h - 4));
    }
    ctx.restore();

    // one bar per stimulus: associative strength at cue onset, filling in real time
    const names = Object.keys(sim.S.values);
    const bw = Math.max(6, (gut - 8) / Math.max(names.length, 1) - 4);
    names.forEach((n, i) => {
      const x = w - gut + 6 + i * (bw + 4);
      const v = clamp(sim.S.values[n], 0, 1);
      ctx.fillStyle = colors.hair;
      ctx.fillRect(x, 2, bw, h - 12);
      ctx.fillStyle = colors.predict;
      ctx.fillRect(x, 2 + (h - 12) * (1 - v), bw, (h - 12) * v);
      ctx.fillStyle = colors.ink3;
      ctx.font = '8px ' + colors.fontData;
      ctx.fillText(n.slice(0, 5), x, h - 2);
    });
  }

  function drawCum() {
    const c = charts.cum; if (!c) return;
    const [ctx, w, h] = fit(c, c.clientHeight || 132);
    ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = colors.paperGrid; ctx.lineWidth = 1;
    for (let y = h - 14; y > 8; y -= 18) {
      ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke();
    }
    drawCumulativeRecord(ctx, { x: 8, y: 8, w: w - 16, h: h - 20 }, sim.S.events, sim.S.t, {
      ink: colors.paperInk, pip: colors.paperMut, lineWidth: 1.4,
    });
  }

  // --- loop -----------------------------------------------------------------
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!sim.S.done) {
      sim.step(dt * speed);
      for (let i = pending.length - 1; i >= 0; i--) {
        if (now >= pending[i].at) { const p = pending.splice(i, 1)[0]; p.fn(); }
      }
    }
    drawArena(dt);
    drawDA(); drawEvents(); drawV(); drawCum();
    if (opts.onFrame) opts.onFrame(dt);
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true; last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  return {
    sim, rat, props, colors, arena: AR, layout: layoutName,
    intend, goTo, goToPoint, sprite, start, stop,
    /** Draw one frame without running the loop; used for the paused debrief view. */
    draw: () => { drawArena(0); drawDA(); drawEvents(); drawV(); drawCum(); },
    /** Add a prop the layout does not define. */
    addProp(name, spec) { props[name] = { name, r: 24, kind: 'tray', ...spec }; return props[name]; },
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    off(name, fn) { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); },
    refreshColors,
    get running() { return running; },
    /** The Raturn bowl's angular offset, in radians. Zero on every other layout. */
    get spin() { return spin; },
  };
}

/**
 * The cumulative record: a step per response, a diagonal pip per reinforcer.
 * Shared by the rig strip and the debrief figure so the two can never disagree.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {Array} events the sim event log
 * @param {number} tEnd right edge of the time axis
 * @param {object} style `{ ink, pip, lineWidth, tStart, dashed, scaleTo }`
 * @returns {{responses:number, deliveries:number}}
 */
export function drawCumulativeRecord(ctx, box, events, tEnd, style = {}) {
  const tStart = style.tStart || 0;
  const lw = style.lineWidth || 1.4;
  const resp = events.filter((e) => (e.type === 'poke' || e.type === 'press') && e.t >= tStart && e.t <= tEnd);
  const total = Math.max(style.scaleTo || 0, resp.length, 10);
  const X = (t) => box.x + ((t - tStart) / Math.max(tEnd - tStart, 1)) * box.w;
  const Y = (n) => box.y + box.h - (n / total) * box.h;

  ctx.strokeStyle = style.ink; ctx.lineWidth = lw;
  if (style.dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(X(tStart), Y(0));
  let n = 0;
  for (const p of resp) { ctx.lineTo(X(p.t), Y(n)); n++; ctx.lineTo(X(p.t), Y(n)); }
  ctx.lineTo(X(tEnd), Y(n));
  ctx.stroke(); ctx.setLineDash([]);

  ctx.strokeStyle = style.pip || style.ink; ctx.lineWidth = lw;
  const deliveries = events.filter((e) => e.type === 'delivery' && e.t >= tStart && e.t <= tEnd);
  for (const d of deliveries) {
    const before = resp.filter((p) => p.t <= d.t).length;
    const x = X(d.t), y = Y(before);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + 7); ctx.stroke();
  }
  return { responses: resp.length, deliveries: deliveries.length, total };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
