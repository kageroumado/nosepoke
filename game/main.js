import * as THREE from '../vendor/three/three.module.min.js';
import { createMaze, CENTER, CHAMBER, GARDEN, toWorld } from './maze.js';
import { createScenery, HOME, FLOOR_Y, CEILING_Y } from './scenery.js';
import { createPlayer, EYE } from './player.js';
import { createRat } from './rat.js';
import * as oracle from './oracle.js';
import { start as startAudio, sfx, voices, ambience, setListener, setMuted, chorus } from './sound.js';

const $ = id => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: the count simply restarts */ } },
};
const SUBJECT = 23 + Number(store.get('nosepoke.wakings') || 0);
const SITE = 'https://kagerou.glass/nosepoke/';

// ——— Renderer, camera, light ———
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0e10');
scene.fog = new THREE.FogExp2('#0b0e10', 0.03);
const camera = new THREE.PerspectiveCamera(78, 1, 0.01, 800);
scene.add(camera);

const hemi = new THREE.HemisphereLight('#dfe8ea', '#39403d', 0.9);
const sun = new THREE.DirectionalLight('#f4f6f0', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 60 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
const sunOffset = new THREE.Vector3(4, 18, 6);
const night = new THREE.PointLight('#ff2414', 0, 40, 1.2);
night.position.set(HOME.x + 5, 6, HOME.z);
const pool = [0, 1, 2].map(() => new THREE.PointLight('#ffc978', 0, 7, 2));
scene.add(hemi, sun, sun.target, night, ...pool);

/** A soft studio room baked into an environment map, so metal and plastic have something to reflect. */
{
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: '#3a4244', side: THREE.BackSide }));
  env.add(room);
  for (const [x, z] of [[-2.5, 0], [0, 0], [2.5, 0]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    panel.position.set(x, 2.9, z); panel.rotation.x = Math.PI / 2; env.add(panel);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: '#1b2022' }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.9; env.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
}
const maze = createMaze(scene);
const world = createScenery(scene, maze);
const player = createPlayer(camera);

const LIGHTING = {
  night: { hemi: ['#ff3a2a', '#0a0202', 0.14], sun: 0, night: 9, fog: ['#0a0202', 0.07], tubes: '#140404', exposure: 1.1, bg: '#0a0202', env: 0.02 },
  lab: { hemi: ['#e8eef0', '#4a5250', 0.85], sun: 3.0, night: 0, fog: ['#11171a', 0.02], tubes: '#f2f6f0', exposure: 1.15, bg: '#11171a' },
  garden: { hemi: ['#d4e6f2', '#4d5b33', 1.35], sun: 3.4, night: 0, fog: ['#dfe2d4', 0.018], tubes: '#f2f6f0', exposure: 1.05, bg: '#dfe2d4', sunColor: '#fff1d6' },
  feed: { hemi: ['#ffffff', '#555555', 1.3], sun: 2.2, night: 0, fog: ['#0d1113', 0.0], tubes: '#f2f6f0', exposure: 1.1, bg: '#0d1113' },
  city: { hemi: ['#8fa0c0', '#050608', 0.25], sun: 0, night: 0, fog: ['#06080b', 0.00022], tubes: '#f2f6f0', exposure: 1.2, bg: '#06080b', env: 0.1 },
};
function setLighting(name) {
  const L = LIGHTING[name];
  hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.intensity = L.sun; sun.color.set(L.sunColor ?? '#f4f6f0');
  night.intensity = L.night;
  scene.fog.color.set(L.fog[0]); scene.fog.density = L.fog[1];
  scene.background.set(L.bg);
  world.tubeMesh.material.color.set(L.tubes);
  renderer.toneMappingExposure = L.exposure;
  scene.environmentIntensity = L.env ?? 0.5;
  if (name === 'garden') sunOffset.set(-9, 24, 10); else sunOffset.set(4, 18, 6);
}

/** Someone leaning over the apparatus: only their shadow reaches the floor. */
const watcher = new THREE.Group();
{
  const shade = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40).scale(1.6, 1, 1).rotateX(-Math.PI / 2), shade);
  const head = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32).rotateX(-Math.PI / 2).translate(0, 0.4, -4.6), shade);
  for (const m of [body, head]) { m.castShadow = true; watcher.add(m); }
  watcher.position.set(0, 9, 30);
  scene.add(watcher);
}
const lean = { active: false, t: 0, from: new THREE.Vector3(), over: new THREE.Vector3() };
function leanOver() {
  if (lean.active) return;
  lean.active = true; lean.t = 0;
  lean.over.set(player.position.x + 1.8, 9, player.position.z + 2.6);
  lean.from.copy(lean.over).add(new THREE.Vector3(3, 0, 16));
  watcher.rotation.y = Math.random() * 0.6 - 0.3;
  sfx.thump(lean.over.clone().setY(6));
  later(1.4, () => { voices(lean.over.clone().setY(8), 3.2, 112); caption('[someone leans over]', 2.6); });
}
function leanStep(dt) {
  if (!lean.active) return;
  lean.t += dt;
  const u = lean.t < 2 ? ease(lean.t / 2) : lean.t < 6 ? 1 : 1 - ease(Math.min(1, (lean.t - 6) / 2.2));
  watcher.position.lerpVectors(lean.from, lean.over, u);
  watcher.position.x += Math.sin(lean.t * 0.9) * 0.3 * u;
  if (lean.t > 8.4) { lean.active = false; watcher.position.set(0, 9, 30); }
}

// ——— Game state ———
const G = {
  phase: 'loading', t: 0, phaseT: 0, clock: 0, session: 0,
  forks: [], k: 0, chosen: null, enteredFork: null,
  choices: [[], []], trace: [[], []],
  lever: [], inChamber: false, chamberT: 0,
  seals: { s1: null, meta: null, forks: [] }, predictor: null, predictions: [],
  shared: false, cues: { next: 0 }, captionUntil: 0, events: [],
};
const newLever = session => ({ presses: [], freeEatAt: null, extinctionAt: null, extinct: false, pellets: 0, count: 0, req: 1, cup: 0, session, lastPress: -99 });
let miso, self, friends = [];

// ——— Small helpers ———
const ease = x => x * x * (3 - 2 * x);
const later = (seconds, fn) => G.events.push({ at: G.t + seconds, fn });
function caption(text, seconds = 3.5) {
  const el = $('caption'); el.textContent = text; el.classList.add('on');
  G.captionUntil = G.t + seconds;
}
const fade = (on, white = false) => { $('fade').classList.toggle('white', white); $('fade').classList.toggle('on', on); };
const wait = ms => new Promise(r => setTimeout(r, ms));
function setPhase(p) { G.phase = p; G.phaseT = 0; document.body.dataset.phase = p; }
function hudSession(label, hash) { $('hud-session').textContent = label; $('hud-hash').textContent = hash ? hash.slice(0, 8) : '········'; }
function lineOfSight(a, b) {
  const d = a.distanceTo(b), n = Math.ceil(d / 0.25);
  for (let i = 1; i < n; i++) { const u = i / n; if (maze.blockedAt(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)) return false; }
  return true;
}

// ——— Input ———
const keys = new Set();
const touch = { forward: 0, turn: 0, stickId: null, lookId: null, ox: 0, oy: 0, lx: 0, ly: 0 };
const controllable = () => ['home', 's1', 's2', 'garden'].includes(G.phase);
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && controllable()) e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  if ((k === 'e' || k === ' ') && controllable()) interact();
  if (k === 'm') toggleMute();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
function readInput() {
  const on = k => keys.has(k) ? 1 : 0;
  player.input.forward = THREE.MathUtils.clamp(on('w') + on('arrowup') - on('s') - on('arrowdown') + touch.forward, -1, 1);
  player.input.turn = THREE.MathUtils.clamp(on('d') + on('arrowright') - on('a') - on('arrowleft') + touch.turn, -1, 1);
  player.input.run = keys.has('shift');
}
canvas.addEventListener('click', () => {
  if (!controllable() || coarse) return;
  if (document.pointerLockElement === canvas) interact();
  else canvas.requestPointerLock?.()?.catch?.(() => {});
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas || !controllable()) return;
  player.input.lookX += e.movementX * 0.0022; player.input.lookY += e.movementY * 0.0022;
});
let dragging = null;
canvas.addEventListener('pointerdown', e => {
  if (!controllable()) return;
  if (e.pointerType === 'mouse') { if (document.pointerLockElement !== canvas) dragging = { x: e.clientX, y: e.clientY }; return; }
  canvas.setPointerCapture(e.pointerId);
  if (e.clientX < innerWidth * 0.45 && touch.stickId === null) {
    touch.stickId = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY;
    const s = $('stick'); s.hidden = false; s.style.left = `${e.clientX}px`; s.style.top = `${e.clientY}px`; s.firstElementChild.style.transform = '';
  } else if (touch.lookId === null) { touch.lookId = e.pointerId; touch.lx = e.clientX; touch.ly = e.clientY; }
});
canvas.addEventListener('pointermove', e => {
  if (dragging && e.pointerType === 'mouse' && e.buttons) {
    player.input.lookX += (e.clientX - dragging.x) * 0.004; player.input.lookY += (e.clientY - dragging.y) * 0.004;
    dragging = { x: e.clientX, y: e.clientY };
  }
  if (e.pointerId === touch.stickId) {
    const dx = THREE.MathUtils.clamp(e.clientX - touch.ox, -55, 55), dy = THREE.MathUtils.clamp(e.clientY - touch.oy, -55, 55);
    touch.forward = Math.abs(dy) > 8 ? -dy / 55 : 0; touch.turn = Math.abs(dx) > 8 ? dx / 55 : 0;
    $('stick').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  }
  if (e.pointerId === touch.lookId) {
    player.input.lookX += (e.clientX - touch.lx) * 0.006; player.input.lookY += (e.clientY - touch.ly) * 0.004;
    touch.lx = e.clientX; touch.ly = e.clientY;
  }
});
const release = e => {
  if (e.pointerType === 'mouse') dragging = null;
  if (e.pointerId === touch.stickId) { touch.stickId = null; touch.forward = touch.turn = 0; $('stick').hidden = true; }
  if (e.pointerId === touch.lookId) touch.lookId = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
$('act').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });
let muted = false;
function toggleMute() { muted = !muted; setMuted(muted); $('mute').setAttribute('aria-pressed', String(muted)); }
$('mute').addEventListener('click', toggleMute);

// ——— Interactions ———
let offer = null;
const flat = v => new THREE.Vector2(v.x, v.z);
function nearestOffer() {
  const p = flat(player.position);
  const facing = target => { const f = player.forward(); const d = new THREE.Vector3(target.x - player.position.x, 0, target.z - player.position.z).normalize(); return f.dot(d) > 0.35; };
  const options = [];
  if (G.phase === 'home') {
    const spout = world.home.spoutTip;
    if (p.distanceTo(flat(spout)) < 0.75) options.push({ kind: 'drink', label: 'drink', d: p.distanceTo(flat(spout)) });
    if (miso && p.distanceTo(flat(miso.root.position)) < 1.25) options.push({ kind: 'nuzzle', label: 'nuzzle Miso', d: 1 });
  }
  if ((G.phase === 's1' || G.phase === 's2') && G.inChamber) {
    const c = maze.chamber, L = G.lever[G.session - 1];
    const dl = p.distanceTo(flat(c.leverPos)); if (dl < 1.1 && facing(c.leverPos)) options.push({ kind: 'press', label: 'press', d: dl });
    const dc = p.distanceTo(flat(c.cupPos)); if (dc < 1.0 && L.cup > 0) options.push({ kind: 'cup', label: 'eat', d: dc - 0.2 });
    const df = p.distanceTo(flat(c.freePos)); if (df < 1.15) options.push({ kind: 'free', label: 'eat', d: df });
  }
  if (G.phase === 'garden') for (const r of [miso, ...friends]) {
    const d = p.distanceTo(flat(r.root.position)); if (d < 1.3) options.push({ kind: 'nuzzle', label: 'nuzzle', d, rat: r });
  }
  options.sort((a, b) => a.d - b.d);
  return options[0] ?? null;
}
function interact() {
  if (!offer) { if (G.phase !== 'home') sfx.sniff(); return; }
  if (offer.kind === 'press') leverPress();
  if (offer.kind === 'cup') { const L = G.lever[G.session - 1]; L.cup--; sfx.crunch(); updateCup(); }
  if (offer.kind === 'free') { const L = G.lever[G.session - 1]; if (L.freeEatAt == null) L.freeEatAt = G.clock; sfx.crunch(); }
  if (offer.kind === 'drink') { sfx.sip(); world.home.drop.scale.setScalar(0.3); }
  if (offer.kind === 'nuzzle') { sfx.sniff(); (offer.rat ?? miso).nuzzled = G.t; }
}

// ——— The lever ———
function leverPress() {
  const L = G.lever[G.session - 1];
  L.presses.push(G.clock); L.lastPress = G.t;
  const at = maze.chamber.leverPos.clone().setY(0.5);
  sfx.lever(at);
  player.rearUp(true); later(0.22, () => player.rearUp(false));
  maze.chamber.lever.rotation.x = 0.36;
  if (L.extinct) return;
  if (++L.count < L.req) return;
  L.count = 0; L.pellets++;
  if (G.session === 1 && L.pellets >= 8) { L.extinct = true; L.extinctionAt = G.clock; }
  L.req = G.session === 1 && L.pellets < 2 ? 1 : 1 + Math.floor(Math.random() * 5);
  const cup = maze.chamber.cupPos.clone().setY(0.5);
  later(0.12, () => {
    sfx.solenoid(cup); sfx.pelletDrop(cup); sfx.chime(cup);
    L.cup = Math.min(6, L.cup + 1); updateCup();
    maze.chamber.troughLight.material.color.set('#ffe6a8'); later(0.5, () => maze.chamber.troughLight.material.color.set('#555'));
    if (L.pellets === 1) caption('[click — a chime]', 2.5);
  });
}
function updateCup() { const L = G.lever[G.session - 1]; maze.chamber.cupPellets.forEach((p, i) => (p.visible = i < L.cup)); }

// ——— Forks ———
function choose(side) {
  const k = G.k, fork = G.forks[k], cell = maze.cells[k];
  G.chosen = side;
  const other = side === 'L' ? ['C', 'D'] : ['A', 'B'];
  for (const d of [...other, 'E']) if (maze.setDoor(`${k}${d}`, 'closed')) {
    const door = maze.doors.get(`${k}${d}`); sfx.door(toWorld(door.col, door.row).setY(1));
  }
  const record = { ...fork, pick: side, dwell: G.clock - (G.enteredFork ?? G.clock), at: G.clock, traceIndex: G.trace[G.session - 1].length };
  G.choices[G.session - 1].push(record);
  if (G.session === 2) {
    G.predictor.observe(fork, side);
    if (k + 1 < oracle.SESSION_ONE.length) sealFork(k + 1);
  }
  if (miso.task?.fork === k && !miso.task.started) miso.task = null;
  void cell;
}
async function sealFork(k) {
  const fork = G.forks[k];
  const { pick } = G.predictor.predict(fork);
  const s = await oracle.seal([oracle.sessionTwoForkLine(k, fork, pick)]);
  G.predictions[k] = { pick, seal: s };
  maze.setPlaque(k, s.hash.slice(0, 8));
}
function forkStep() {
  const cell = maze.cells[G.k];
  if (!cell) return;
  const m = cell.marks, tile = maze.tileOf(player.position);
  if (G.enteredFork === null && tile.col >= m.E.col + 1 && tile.col <= m.E.col + 2) G.enteredFork = G.clock;
  if (!G.chosen) {
    if (tile.col === m.A.col && tile.row === m.A.row) choose('L');
    else if (tile.col === m.C.col && tile.row === m.C.row) choose('R');
  }
  if (G.chosen && tile.col >= m.X.col - 1) {
    const d = G.chosen === 'L' ? 'B' : 'D';
    if (maze.setDoor(`${G.k}${d}`, 'closed')) sfx.door(toWorld(maze.doors.get(`${G.k}${d}`).col, m.B.row).setY(1));
    G.k++; G.chosen = null; G.enteredFork = null;
    setupForkCue(G.k);
    if ((G.session === 1 && (G.k === 2 || G.k === 5)) || (G.session === 2 && G.k === 3)) later(1.2, leanOver);
  }
}
/** Lamps, drafts, calls, and the companion for the fork ahead. */
function setupForkCue(k) {
  pool.forEach(l => (l.intensity = 0));
  for (const [i, idx] of [[0, k], [1, k + 1]]) {
    const s = maze.cueState[idx];
    if (s?.light) { pool[i].position.copy(s.light.position); pool[i].color.set(s.light.color); pool[i].intensity = s.light.intensity * (i ? 0.6 : 1); }
  }
  const s = maze.cueState[k];
  if (s?.follow) {
    const p = s.follow, side = G.forks[k].side;
    const row = side === 'L' ? -1 : 1;
    miso.root.visible = true;
    miso.root.position.copy(toWorld(maze.cells[k].ox + 2.1, CENTER + row * 0.9));
    miso.root.rotation.y = -Math.PI / 2;
    miso.action = 'sniff';
    const armDir = p.arm.clone().sub(p.corner).normalize();
    miso.task = { fork: k, started: false, path: [p.threshold.clone().setX(p.threshold.x + 0.1), p.door.clone(), p.corner.clone(), p.corner.clone().addScaledVector(armDir, 2), p.corner.clone().addScaledVector(armDir, 4.5)] };
  }
}
function cueSounds() {
  const s = maze.cueState[G.k];
  if (!s || G.chosen || G.inChamber) return;
  if (G.t < G.cues.next) return;
  if (s.sound) { sfx.chirp(s.sound); G.cues.next = G.t + 1.4 + Math.random(); }
  else if (s.draft) { sfx.wind(s.draft.from.clone().setY(1), 3.2); G.cues.next = G.t + 2.8; }
  else G.cues.next = G.t + 0.5;
}

// ——— Sessions ———
function placeAtStart() {
  player.place(maze.start, -Math.PI / 2);
  player.pitch = -0.02;
}
function beginSession(n) {
  G.events.length = 0;
  G.session = n; G.k = 0; G.chosen = null; G.enteredFork = null; G.inChamber = false; G.chamberT = 0;
  G.lever[n - 1] = newLever(n);
  maze.resetDoors();
  maze.setCues(G.forks);
  maze.chamber.cupPellets.forEach(p => (p.visible = false));
  maze.chamber.cueLight.material.emissiveIntensity = 0;
  maze.cells.forEach((c, k) => maze.setPlaque(k, n === 2 && G.predictions[k] ? G.predictions[k].seal.hash.slice(0, 8) : null));
  setupForkCue(0);
  setLighting('lab'); ambience('maze');
  setPhase(`s${n}`);
  later(1.6, () => { maze.setDoor('0E', 'open'); sfx.door(toWorld(3, CENTER).setY(2)); });
  later(9, () => { voices(new THREE.Vector3(player.position.x + 8, 16, player.position.z - 10), 5, 105); caption('[voices, somewhere above]', 3); });
}
function sessionStep(dt) {
  const n = G.session, L = G.lever[n - 1];
  G.clock += dt;
  const last = G.trace[n - 1].at(-1);
  if (!last || Math.hypot(last.x - player.position.x, last.z - player.position.z) > 0.12) G.trace[n - 1].push({ x: player.position.x, z: player.position.z, t: G.clock });
  if (!G.inChamber) {
    forkStep(); cueSounds();
    if (player.position.x > CHAMBER.x0 - 0.35) enterChamber();
  } else {
    G.chamberT += dt;
    const blink = !L.extinct && G.t - L.lastPress > 2.5 ? (Math.sin(G.t * 5) > 0 ? 3 : 0.3) : L.extinct ? 0.05 : 2.4;
    maze.chamber.cueLight.material.emissiveIntensity = blink;
    maze.chamber.lever.rotation.x = 0.08 + (maze.chamber.lever.rotation.x - 0.08) * Math.exp(-dt * 12);
    if (n === 1) {
      const nudge = (L.extinct && G.t - L.lastPress > 20) || G.chamberT > 150;
      pool[2].intensity += ((nudge ? 3.5 : 0) - pool[2].intensity) * Math.min(1, dt * 1.5);
      if (player.position.x > CHAMBER.x1 - 0.2 + 0.35 && Math.abs(player.position.z) < 0.45) endSessionOne();
    } else if (player.position.x > GARDEN.x0 + 0.2) enterGarden();
  }
}
function enterChamber() {
  G.inChamber = true;
  maze.setDoor('chamber', 'closed'); sfx.door(toWorld(75, CENTER).setY(1));
  pool.forEach(l => (l.intensity = 0));
  pool[0].position.set(maze.chamber.center.x - 1.4, 2.3, 0); pool[0].color.set('#fff1d8'); pool[0].intensity = 6;
  pool[2].position.set(CHAMBER.exitCol + 0.3, 1.0, 0); pool[2].color.set(G.session === 2 ? '#fff4d8' : '#c8d8ff'); pool[2].intensity = 0;
  ambience('chamber');
  if (G.session === 2) { maze.setDoor('exit', 'open'); pool[2].intensity = 8; later(0.5, () => sfx.door(toWorld(81, CENTER).setY(1))); }
  later(14, () => { if (!G.inChamber || !G.phase.startsWith('s')) return; sfx.phone(new THREE.Vector3(-18, 5, 6)); caption('[a phone chimes, somewhere above]', 3); });
}

async function endSessionOne() {
  setPhase('reveal');
  document.exitPointerLock?.();
  sfx.glove(); sfx.whoosh();
  fade(true, true);
  await wait(900);
  G.feed = { session: 1, u: 0, duration: reduced ? 0.1 : 10, shown: 0 };
  enterFeed(1);
  fade(false);
  $('reveal').hidden = false;
  $('reveal-eyebrow').textContent = `TRACKING · SUBJECT ${SUBJECT} · SESSION 1`;
  $('reveal-title').textContent = 'Written before you woke up.';
  const lines = G.seals.s1.lines.slice(1);
  const outcomes = oracle.scoreSessionOne(G.choices[0], G.lever[0]);
  G.s1Outcomes = outcomes;
  const log = $('reveal-log'); log.replaceChildren();
  lines.forEach((text, i) => log.append(logItem(text, outcomes[i])));
  $('seal-body').replaceChildren(await sealBlock('Session 1 protocol', G.seals.s1));
}
function logItem(text, outcome) {
  const li = document.createElement('li');
  const span = document.createElement('span'); span.textContent = text;
  const b = document.createElement('b');
  b.textContent = outcome === true ? 'yes' : outcome === false ? 'no' : '…';
  li.className = outcome === true ? 'hit' : outcome === false ? 'miss' : 'pending';
  li.append(span, b); return li;
}
async function sealBlock(title, s) {
  const div = document.createElement('div'); div.className = 'seal';
  const h = document.createElement('b'); h.textContent = title;
  const pre = document.createElement('pre'); pre.textContent = s.text;
  const shown = document.createElement('p'); shown.append('Shown before: ', Object.assign(document.createElement('code'), { textContent: s.hash }));
  const again = await oracle.sha256(s.text);
  const now = document.createElement('p'); now.append('SHA-256 of the text above, computed now: ', Object.assign(document.createElement('code'), { textContent: again }));
  const verdict = document.createElement('p'); verdict.className = again === s.hash ? 'ok' : 'bad';
  verdict.textContent = again === s.hash ? 'Match. The text was fixed before the choices it describes.' : 'No match.';
  div.append(h, pre, shown, now, verdict);
  return div;
}
$('reveal-next').addEventListener('click', async () => {
  $('reveal').hidden = true;
  fade(true, true);
  await wait(800);
  exitFeed();
  G.forks = oracle.sessionTwoForks();
  G.predictor = oracle.createPredictor(G.choices[0]);
  G.seals.meta = await oracle.seal(oracle.sessionTwoMetaLines(SUBJECT));
  await sealFork(0);
  hudSession('SESSION 2 · PROTOCOL', G.seals.meta.hash);
  $('hud-cam').textContent = `SUBJ ${SUBJECT}`;
  placeAtStart();
  beginSession(2);
  sfx.seal();
  fade(false);
  canvas.focus();
  if (!coarse) caption('click to look around', 3);
});

// ——— The tracking feed ———
function enterFeed(session) {
  document.getElementById('game').classList.add('feed');
  player.whiskers.visible = false;
  setLighting('feed');
  world.tubeMesh.visible = false;
  self.root.visible = true;
  miso.root.visible = false;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -50; sun.shadow.camera.right = sun.shadow.camera.top = 50; sun.shadow.camera.updateProjectionMatrix();
  $('hud-cam').textContent = `CAM 01 · TOP`;
  G.feedSession = session;
  ambience('silent');
}
function exitFeed() {
  document.getElementById('game').classList.remove('feed');
  world.tubeMesh.visible = true;
  player.whiskers.visible = true;
  self.root.visible = false;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -10; sun.shadow.camera.right = sun.shadow.camera.top = 10; sun.shadow.camera.updateProjectionMatrix();
  camera.fov = povFov(); camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
  G.feed = null;
  overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
}
/** Frame the apparatus in the part of the screen the panel leaves free. */
function feedCamera() {
  const w = canvas.clientWidth, h = canvas.clientHeight, narrow = w < 700;
  const rect = narrow ? { x: 0, y: 64, w, h: h * 0.4 - 64 } : { x: 0, y: 70, w: w - 520, h: h - 120 };
  const upp = Math.max(88 / rect.w, 14 / rect.h);
  camera.fov = 40;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const height = h * upp / (2 * tan);
  const cx = 40 - (rect.x + rect.w / 2 - w / 2) * upp, cz = -(rect.y + rect.h / 2 - h / 2) * upp;
  camera.up.set(0, 0, -1);
  camera.position.set(cx, height, cz);
  camera.lookAt(cx, 0, cz);
  camera.updateProjectionMatrix();
}
function forkRoute(k, side) {
  const m = maze.cells[k].marks, s = side === 'L' ? -1 : 1, door = side === 'L' ? m.A : m.C, end = side === 'L' ? m.B : m.D;
  return [toWorld(m.E.col, CENTER), toWorld(m.E.col + 1.5, CENTER), toWorld(door.col - 0.4, door.row), toWorld(door.col, door.row + s * 0.9),
    toWorld(end.col, end.row + s * 0.9), toWorld(end.col + 0.5, end.row), toWorld(m.X.col - 1, CENTER), toWorld(m.X.col, CENTER)];
}
const overlay = $('overlay');
function project(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * overlay.clientWidth, y: (1 - p.y) / 2 * overlay.clientHeight };
}
function feedStep(dt) {
  const f = G.feed; if (!f) return;
  feedCamera();
  const trace = G.trace[f.session - 1];
  const before = f.u;
  f.u = Math.min(1, f.u + dt / f.duration);
  const idx = Math.floor(ease(f.u) * (trace.length - 1));
  const at = trace[Math.max(0, idx)] ?? { x: 0, z: 0 };
  const next = trace[Math.min(trace.length - 1, idx + 3)] ?? at;
  self.root.position.set(at.x, 0, at.z);
  if (next !== at) self.root.rotation.y = Math.atan2(next.x - at.x, next.z - at.z);
  self.update(dt, { speed: f.u < 1 ? 2 : 0, action: f.u < 1 ? 'walk' : 'sniff' });
  const items = [...$('reveal-log').children];
  const choices = G.choices[f.session - 1];
  choices.forEach((c, k) => { if (idx >= c.traceIndex && !items[k].classList.contains('shown')) { items[k].classList.add('shown'); sfx.tick(); } });
  if (f.u >= 1 && before < 1) {
    items.forEach((li, i) => later(0.35 * (i - choices.length + 1), () => { if (!li.classList.contains('shown')) { li.classList.add('shown'); sfx.tick(); } }));
    later(0.35 * (items.length - choices.length) + 0.6, () => {
      const hits = G.s1Outcomes.filter(Boolean).length;
      $('reveal-score').textContent = `${hits} of ${G.s1Outcomes.length}, sealed before you woke up.`;
      $('reveal-note').hidden = false;
      $('reveal-next').hidden = false;
    });
  }
  drawFeed(f.session, idx);
}
function drawFeed(session, idx) {
  const ctx = overlay.getContext('2d');
  const w = overlay.clientWidth, h = overlay.clientHeight, dpr = Math.min(devicePixelRatio, 2);
  if (overlay.width !== w * dpr) { overlay.width = w * dpr; overlay.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const choices = G.choices[session - 1];
  const predicted = k => session === 1 ? oracle.pull(oracle.SESSION_ONE[k]) : G.predictions[k]?.pick;
  ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  for (let k = 0; k < maze.cells.length; k++) {
    const side = predicted(k); if (!side) continue;
    ctx.beginPath(); forkRoute(k, side).forEach((p, i) => { const s = project(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.stroke();
  }
  ctx.setLineDash([]);
  const trace = G.trace[session - 1];
  ctx.strokeStyle = session === 1 ? '#ffd23f' : '#3fe0ff'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i <= idx && i < trace.length; i++) { const s = project(new THREE.Vector3(trace[i].x, 0, trace[i].z)); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
  ctx.stroke();
  ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
  maze.cells.forEach((cell, k) => {
    const s = project(toWorld(cell.ox + 1.5, CENTER + 3.2));
    const c = choices[k], done = c && idx >= c.traceIndex;
    ctx.fillStyle = done ? (c.pick === predicted(k) ? '#8ef0a8' : '#ff8c7a') : 'rgba(255,255,255,0.7)';
    ctx.fillText(done ? `F${k + 1} ${c.pick === predicted(k) ? '✓' : '✗'}` : `F${k + 1}`, s.x, s.y);
  });
  const r = project(self.root.position);
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.strokeRect(r.x - 14, r.y - 14, 28, 28);
  ctx.beginPath(); ctx.moveTo(r.x - 20, r.y); ctx.lineTo(r.x - 8, r.y); ctx.moveTo(r.x + 8, r.y); ctx.lineTo(r.x + 20, r.y); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'left'; ctx.fillText(`S${SUBJECT}`, r.x + 17, r.y - 16);
}

// ——— The garden and the rise ———
function enterGarden() {
  setPhase('garden');
  maze.setDoor('exit', 'closed');
  setLighting('garden'); ambience('garden');
  pool.forEach(l => (l.intensity = 0));
  miso.root.visible = true; miso.task = null;
  miso.root.position.set(GARDEN.x0 + 4, 0, 1.5); miso.root.rotation.y = -Math.PI / 2 - 0.4; miso.action = 'sniff';
  friends.forEach(f => (f.root.visible = true));
  later(24, beginRise);
}
function gardenStep() {
  const c = new THREE.Vector2(GARDEN.cx, 0), p = flat(player.position), d = p.distanceTo(c);
  if (d > GARDEN.radius && player.position.x > GARDEN.x0 + 1.5) {
    const v = p.sub(c).setLength(GARDEN.radius).add(c); player.position.x = v.x; player.position.z = v.y;
  }
}
const rise = { from: null };
function beginRise() {
  if (G.phase !== 'garden' || G.feed) return;
  setPhase('rise');
  document.exitPointerLock?.();
  sfx.phone(new THREE.Vector3(player.position.x, 12, player.position.z));
  rise.from = { pos: camera.position.clone(), look: camera.position.clone().add(player.forward()) };
  self.root.visible = true; self.root.position.set(player.position.x, 0, player.position.z); self.root.rotation.y = player.yaw + Math.PI;
  player.whiskers.visible = false;
}
const KEYS = () => {
  const px = self.root.position.x, pz = self.root.position.z;
  return [
    { t: 0, pos: rise.from.pos, look: rise.from.look },
    { t: 4, pos: new THREE.Vector3(px, 4.5, pz + 0.4), look: new THREE.Vector3(px, 0, pz) },
    { t: 10, pos: new THREE.Vector3(GARDEN.cx + 12, 10.8, 26), look: new THREE.Vector3(GARDEN.cx - 8, 0, 0) },
    { t: 18, pos: new THREE.Vector3(62, 11.3, 50), look: new THREE.Vector3(34, -2.5, 0) },
    { t: 23, pos: new THREE.Vector3(8, 11.4, 44), look: new THREE.Vector3(10, -3, -4) },
  ];
};
function riseStep(dt) {
  const t = G.phaseT;
  if (t < 23) {
    const ks = KEYS();
    let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[i + 1], u = ease(THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1));
    camera.position.lerpVectors(a.pos, b.pos, u);
    camera.up.set(0, 1, 0);
    camera.lookAt(new THREE.Vector3().lerpVectors(a.look, b.look, u));
    if (t > 5.5 && !rise.lab) { rise.lab = true; setLighting('lab'); ambience('maze'); }
    if (t > 15 && !rise.voices) { rise.voices = true; voices(new THREE.Vector3(-14, 8, 6), 4, 120); }
    if (t > 21.8 && !rise.dark) { rise.dark = true; fade(true); }
    self.update(dt, { speed: 0, action: 'sniff' });
    return;
  }
  if (!rise.city) {
    rise.city = true;
    for (const o of [maze.group, world.lab, world.home.rack, world.garden.garden, world.cohort.cohort, miso.root, self.root, ...friends.map(f => f.root)]) o.visible = false;
    world.city.city.visible = true;
    setLighting('city'); ambience('city');
    camera.far = 20000; camera.near = 0.5; camera.updateProjectionMatrix();
    fade(false);
    chorus(10, 8);
    later(7, () => chorus(40, 9));
  }
  const tc = t - 23, G0 = world.city.GROUND;
  const cityKeys = [
    { t: 0, pos: new THREE.Vector3(55, 3.5, 118), look: new THREE.Vector3(55, 6, 0) },
    { t: 7, pos: new THREE.Vector3(70, 45, 330), look: new THREE.Vector3(55, 8, 0) },
    { t: 14, pos: new THREE.Vector3(380, 420, 1500), look: new THREE.Vector3(40, G0, 0) },
    { t: 21, pos: new THREE.Vector3(700, 1500, 3300), look: new THREE.Vector3(0, G0, 0) },
  ];
  let i = 0; while (i < cityKeys.length - 2 && tc > cityKeys[i + 1].t) i++;
  const a = cityKeys[i], b = cityKeys[i + 1], u = ease(THREE.MathUtils.clamp((tc - a.t) / (b.t - a.t), 0, 1));
  camera.position.lerpVectors(a.pos, b.pos, u);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3().lerpVectors(a.look, b.look, u));
  if (tc > 20 && !rise.end) { rise.end = true; fade(true); later(1.6, showEnding); }
}

// ——— The end ———
async function showEnding() {
  setPhase('end');
  $('hud').hidden = true;
  const s1 = G.s1Outcomes ?? oracle.scoreSessionOne(G.choices[0], G.lever[0]);
  const s2 = G.choices[1].map((c, k) => c.pick === G.predictions[k]?.pick);
  const meta = oracle.scoreSessionTwoMeta(G.choices[0], G.choices[1], G.lever[1], G.shared);
  G.endScores = { s1, s2, meta };
  $('end-subject').textContent = String(SUBJECT);
  $('end-s1').textContent = `${s1.filter(Boolean).length} / ${s1.length}`;
  $('end-s2').textContent = `${s2.filter(Boolean).length} / ${s2.length}`;
  $('end-meta').textContent = `${meta.slice(0, 4).filter(Boolean).length} / 4`;
  const log = $('end-log'); log.replaceChildren();
  G.choices[1].forEach((c, k) => log.append(logItem(oracle.sessionTwoForkLine(k, c, G.predictions[k].pick).replace(/^S2 /, ''), s2[k])));
  oracle.SESSION_TWO_META.slice(0, 4).forEach((line, i) => log.append(logItem(line, meta[i])));
  const seals = $('end-seals'); seals.replaceChildren(await sealBlock('Session 1 protocol', G.seals.s1), await sealBlock('Session 2 statements', G.seals.meta));
  for (const [k, p] of G.predictions.entries()) if (p) seals.append(await sealBlock(`Session 2, fork ${k + 1}`, p.seal));
  $('ending').hidden = false;
  fade(false);
  store.set('nosepoke.wakings', String(SUBJECT - 22));
}
$('port').addEventListener('click', async () => {
  const { s1, s2 } = G.endScores;
  const text = `nosepoke: it sealed a prediction before each of my choices. Not knowing: ${s1.filter(Boolean).length}/${s1.length}. Trying to beat it: ${s2.filter(Boolean).length}/${s2.length}.`;
  let done = false;
  try { if (navigator.share) { await navigator.share({ text, url: SITE }); done = true; } } catch { /* dismissed */ }
  if (!done) { try { await navigator.clipboard.writeText(`${text} ${SITE}`); done = true; } catch { /* no clipboard */ } }
  if (!done) return;
  sfx.chime();
  G.shared = true;
  $('port').classList.add('poked');
  $('port-note').textContent = navigator.share ? 'yes · response recorded' : 'yes · copied · response recorded';
  $('port-note').classList.add('hit');
});
$('again').addEventListener('click', () => location.reload());

// ——— Home cage, lights, the hand ———
function homeStep(dt) {
  const r = 0.26, x0 = HOME.x - HOME.w / 2 + r, x1 = HOME.x + HOME.w / 2 - r, z0 = HOME.z - HOME.d / 2 + r, z1 = HOME.z + HOME.d / 2 - r;
  player.position.x = THREE.MathUtils.clamp(player.position.x, x0, x1);
  player.position.z = THREE.MathUtils.clamp(player.position.z, z0, z1);
  const toMiso = flat(player.position).sub(flat(miso.root.position));
  if (toMiso.length() < 0.55) { toMiso.setLength(0.55); player.position.x = miso.root.position.x + toMiso.x; player.position.z = miso.root.position.z + toMiso.y; }
  G.walked = (G.walked ?? 0) + Math.abs(player.speed) * dt;
  world.home.drop.scale.setScalar(Math.min(1, world.home.drop.scale.x + dt * 0.3));
  if (!G.morning && (G.phaseT > 26 || G.walked > 9)) morning();
  if (G.handDown) {
    const hand = world.hand.hand;
    const target = new THREE.Vector3(player.position.x, 0.95, player.position.z);
    hand.position.lerp(target, Math.min(1, dt * 1.1));
    hand.rotation.y = Math.atan2(target.x - HOME.x - 4, target.z - HOME.z) * 0.2;
    world.hand.curl(0.15);
    if (hand.position.distanceTo(target) < 0.25) beginLift();
  }
}
function morning() {
  G.morning = true;
  sfx.thump(new THREE.Vector3(-20, 4, 20));
  const flick = [0, 120, 260, 330, 600];
  flick.forEach((ms, i) => setTimeout(() => setLighting(i % 2 ? 'night' : 'lab'), ms));
  setTimeout(() => { ambience('cage'); caption('[the lights come on]', 2.5); }, 650);
  later(2.2, () => { voices(new THREE.Vector3(HOME.x + 7, 8, HOME.z + 2), 3.5, 118); caption('[voices]', 2.5); });
  later(5.5, () => { sfx.lid(); G.lidOff = G.t; });
  later(7.5, () => {
    const hand = world.hand.hand; hand.visible = true;
    hand.position.set(HOME.x + 0.5, 7, HOME.z - 0.5); hand.rotation.set(0.25, 0, 0);
    G.handDown = true; sfx.glove();
  });
}
function lidStep() {
  if (!G.lidOff) return;
  const u = ease(Math.min(1, (G.t - G.lidOff) / 1.2)), lid = world.home.lid;
  lid.position.set(HOME.x + u * 1.6, HOME.y + HOME.h + u * 4.5, HOME.z);
  lid.rotation.z = u * 0.5;
}
const lift = {};
function beginLift() {
  G.handDown = false;
  setPhase('lift');
  document.exitPointerLock?.();
  sfx.glove(); sfx.whoosh(); sfx.sniff();
  lift.from = camera.position.clone(); lift.yaw = player.yaw;
  document.getElementById('game').classList.add('lifted');
}
function liftStep() {
  const t = G.phaseT, T = 5.5, u = Math.min(1, t / T);
  const start = lift.from, end = new THREE.Vector3(maze.start.x, EYE, 0);
  const pos = new THREE.Vector3().lerpVectors(start, end, ease(u));
  pos.y = THREE.MathUtils.lerp(start.y, end.y, ease(u)) + Math.sin(Math.PI * Math.min(1, u * 1.1)) * 6.5;
  pos.x += Math.sin(t * 2.3) * 0.08; pos.z += Math.cos(t * 1.7) * 0.08;
  camera.position.copy(pos);
  const yaw = THREE.MathUtils.lerp(lift.yaw, -Math.PI / 2 + Math.PI * 2 * Math.round((lift.yaw + Math.PI / 2) / (Math.PI * 2)), ease(u)) + Math.sin(t * 1.9) * 0.25 * (1 - u);
  camera.rotation.set(-0.35 * Math.sin(Math.PI * u) + Math.sin(t * 2.7) * 0.08, yaw, Math.sin(t * 2.1) * 0.12 * (1 - u), 'YXZ');
  const hand = world.hand.hand;
  hand.position.copy(pos).add(new THREE.Vector3(0, 0.62, 0)); hand.rotation.set(0.2, yaw, 0);
  world.hand.curl(1);
  if (u >= 1) {
    document.getElementById('game').classList.remove('lifted');
    player.place(maze.start, -Math.PI / 2);
    G.handUp = G.t;
    world.home.lid.position.set(HOME.x, HOME.y + HOME.h, HOME.z); world.home.lid.rotation.z = 0; G.lidOff = null;
    miso.root.visible = false;
    hudSession('SESSION 1 · PROTOCOL', G.seals.s1.hash);
    $('hud-cam').textContent = `SUBJ ${SUBJECT}`;
    G.clock = 0;
    beginSession(1);
  }
}
function handUpStep(dt) {
  if (G.handUp == null) return;
  const hand = world.hand.hand;
  world.hand.curl(0);
  hand.position.y += dt * 3.5;
  if (G.t - G.handUp > 3) { hand.visible = false; G.handUp = null; }
}

// ——— Companions ———
function misoStep(dt) {
  if (!miso) return;
  const task = miso.task;
  let speed = 0;
  if (task) {
    if (!task.started && player.position.distanceTo(miso.root.position) < 3.4) { task.started = true; sfx.chirp(miso.root.position.clone().setY(0.4)); }
    if (task.started && task.path.length) {
      const target = task.path[0], d = new THREE.Vector3(target.x - miso.root.position.x, 0, target.z - miso.root.position.z);
      if (d.length() < 0.08) task.path.shift();
      else { speed = 2.6; miso.root.position.addScaledVector(d.normalize(), Math.min(d.length(), speed * dt)); miso.root.rotation.y = Math.atan2(d.x, d.z); }
      if (!task.path.length || (task.path.length <= 2 && !lineOfSight(camera.position, miso.root.position.clone().setY(0.3)))) { miso.root.visible = false; miso.task = null; }
    }
  }
  const nuzzled = miso.nuzzled && G.t - miso.nuzzled < 2;
  miso.update(dt, { speed, action: speed ? 'walk' : nuzzled ? 'groom' : miso.action ?? 'sniff', energy: 0.4 });
}
function friendsStep(dt) {
  if (G.phase !== 'garden' && G.phase !== 'rise') return;
  for (const f of friends) {
    const s = f.state ??= { target: null, rest: Math.random() * 3 };
    let speed = 0;
    if (s.rest > 0) s.rest -= dt;
    else {
      if (!s.target) { const a = Math.random() * Math.PI * 2, r = Math.random() * 12; s.target = new THREE.Vector3(GARDEN.cx + Math.cos(a) * r, 0, Math.sin(a) * r); }
      const d = s.target.clone().sub(f.root.position); d.y = 0;
      if (d.length() < 0.2) { s.target = null; s.rest = 2 + Math.random() * 5; }
      else { speed = 1.4; f.root.position.addScaledVector(d.normalize(), speed * dt); f.root.rotation.y = Math.atan2(d.x, d.z); }
    }
    f.update(dt, { speed, action: speed ? 'walk' : s.rest > 3 ? 'groom' : 'sniff', energy: 0.6 });
  }
}
function neighborsStep() {
  for (const n of world.home.neighbors) { const u = n.userData; n.rotation.y += Math.sin(G.t * 0.4 + u.phase) * 0.004; n.position.x = u.home.x + Math.sin(G.t * 0.3 + u.phase) * 0.12; }
}

const cohortRoute = (() => {
  const pts = [];
  for (let k = 0; k < maze.cells.length; k++) pts.push(...forkRoute(k, Math.random() < 0.5 ? 'L' : 'R'));
  pts.push(toWorld(77, CENTER), toWorld(78, CENTER + 1.4));
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, lengths, total: lengths.at(-1) };
})();
function cohortStep(dt) {
  if (!world.cohort.cohort.visible || !['rise', 'lift', 'reveal'].includes(G.phase)) return;
  const { pts, lengths, total } = cohortRoute;
  for (const s of world.cohort.subjects) {
    s.u = (s.u + dt * 2.4 / total) % 1;
    const d = s.u * total;
    let i = 1; while (i < lengths.length - 1 && lengths[i] < d) i++;
    const a = pts[i - 1], b = pts[i], f = (d - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
    s.rat.position.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
    s.rat.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  }
}

// ——— Frame ———
let last = performance.now(), stepSoundAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (document.hidden || G.phase === 'loading') return;
  G.t += dt; G.phaseT += dt;
  for (const e of G.events.filter(e => e.at <= G.t)) { G.events.splice(G.events.indexOf(e), 1); e.fn(); }
  if (G.captionUntil && G.t > G.captionUntil) { $('caption').classList.remove('on'); G.captionUntil = 0; }
  readInput();
  const walking = ['home', 's1', 's2', 'garden'].includes(G.phase);
  if (walking || G.phase === 'title') {
    player.update(dt, G.t, {
      collide: G.phase === 'home' || G.phase === 'title' ? null : (p, r) => maze.collide(p, r),
      probe: G.phase === 'home' ? () => ({ left: 1, right: 1 }) : (p, h) => maze.probe(p, h),
      frozen: G.phase === 'title',
    });
    if (Math.abs(player.speed) > 0.5 && G.t > stepSoundAt) { sfx.step(); stepSoundAt = G.t + 0.11; }
  }
  if (G.phase === 'title') { camera.rotation.y += Math.sin(G.t * 0.3) * 0.0006; }
  if (G.phase === 'home') homeStep(dt);
  if (G.phase === 's1' || G.phase === 's2') sessionStep(dt);
  if (G.phase === 'garden') gardenStep();
  if (G.phase === 'lift') liftStep();
  if (G.phase === 'reveal') feedStep(dt);
  if (G.phase === 'rise') riseStep(dt);
  lidStep(); handUpStep(dt); misoStep(dt); friendsStep(dt); neighborsStep(); leanStep(dt); cohortStep(dt);
  maze.update(dt, G.t);
  world.garden.uniforms.time.value = G.t;
  world.city.uniforms.time.value = G.t;
  offer = walking ? nearestOffer() : null;
  $('prompt').hidden = !offer || coarse;
  if (offer) $('prompt').lastElementChild.textContent = offer.label;
  $('act').hidden = !coarse || !walking;
  $('act').style.opacity = offer ? 1 : 0.35;
  if (G.phase !== 'end' && G.phase !== 'title') {
    const s = Math.floor(G.clock);
    $('hud-time').textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(Math.floor((G.clock % 1) * 30)).padStart(2, '0')}`;
  }
  if (G.phase !== 'home' && G.phase !== 'title') G.clock += G.phase === 's1' || G.phase === 's2' ? 0 : dt;
  if (G.phase === 'home') G.clock += dt;
  const focus = G.feed ? new THREE.Vector3(40, 0, 0) : player.position;
  sun.target.position.copy(focus); sun.position.copy(focus).add(sunOffset);
  const f = player.forward();
  setListener(camera.position.x, camera.position.y, camera.position.z, f.x, f.z);
  renderer.render(scene, camera);
}

/** Keep at least ~64° of horizontal view in portrait, so both doors of a fork fit. */
const povFov = () => Math.min(105, Math.max(78, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(32)) / camera.aspect))));
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  if (!G.feed && G.phase !== 'rise') camera.fov = povFov();
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

// ——— Boot ———
async function boot() {
  try {
    [miso, self, ...friends] = await Promise.all([createRat({ hooded: true }), createRat(), createRat(), createRat({ hooded: true }), createRat()]);
    scene.add(miso.root, self.root, ...friends.map(f => f.root));
    self.root.visible = false;
    miso.root.position.set(HOME.x + 0.35, 0, HOME.z + 0.75); miso.root.rotation.y = 2.6; miso.action = 'sleep';
    friends.forEach((f, i) => { f.root.visible = false; f.root.position.set(GARDEN.cx - 4 + i * 5, 0, -3 + i * 3); });
    G.seals.s1 = await oracle.seal(oracle.sessionOneLines(SUBJECT));
    G.forks = oracle.SESSION_ONE.map(f => ({ ...f }));
    maze.setCues(G.forks);
    $('title-hash').textContent = G.seals.s1.hash.slice(0, 8);
    hudSession('PROTOCOL', G.seals.s1.hash);
    player.place(new THREE.Vector3(HOME.x - 0.25, 0, HOME.z - 0.85), Math.PI);
    setLighting('night');
    setPhase('title');
    resize();
    $('loading').hidden = true;
    window.nosepoke = { G, maze, player, oracle, watcher, sun, ready: true, get phase() { return G.phase; }, skipTo, forkRoute, interact, beginRise, get offer() { return offer; } };
  } catch (error) {
    console.error(error);
    $('loading').querySelector('p').textContent = 'This needs a browser with WebGL 2. Your graphics may be turned off.';
  }
}
$('begin').addEventListener('click', () => {
  startAudio(); ambience('cage');
  $('title').hidden = true; $('hud').hidden = false;
  $('hud-cam').textContent = 'CAM 04 · COLONY · NIGHT';
  $('eyelids').classList.add('open');
  setPhase('home');
  G.clock = 0;
  canvas.focus();
  if (!coarse) caption('click to look around', 3);
});

/** Test hook: jump to a phase with plausible history. */
async function skipTo(phase) {
  startAudio();
  $('title').hidden = true; $('hud').hidden = false; $('eyelids').classList.add('open');
  miso.root.visible = false;
  if (phase === 's1') {
    hudSession('SESSION 1 · PROTOCOL', G.seals.s1.hash);
    player.place(maze.start, -Math.PI / 2); beginSession(1);
    return;
  }
  const coin = () => (Math.random() < 0.5 ? 'L' : 'R');
  G.choices[0] = oracle.SESSION_ONE.map((f, k) => ({ ...f, pick: Math.random() < 0.8 ? oracle.pull(f) : coin(), dwell: 1 + Math.random(), traceIndex: k }));
  G.lever[0] = { ...newLever(1), presses: [3, 4, 5, 6, 7, 8, 9, 9.5, 10, 10.3, 10.5], extinctionAt: 8 };
  G.s1Outcomes = oracle.scoreSessionOne(G.choices[0], G.lever[0]);
  G.forks = oracle.sessionTwoForks();
  G.predictor = oracle.createPredictor(G.choices[0]);
  G.seals.meta = await oracle.seal(oracle.sessionTwoMetaLines(SUBJECT));
  for (let k = 0; k < G.forks.length; k++) {
    await sealFork(k);
    const pick = coin();
    G.choices[1].push({ ...G.forks[k], pick, dwell: 2 + Math.random() * 3, traceIndex: k });
    G.predictor.observe(G.forks[k], pick);
  }
  G.lever[1] = { ...newLever(2), presses: [2] };
  G.session = 2;
  hudSession('SESSION 2 · PROTOCOL', G.seals.meta.hash);
  maze.setCues(G.forks);
  setLighting('lab');
  if (G.feed) { $('reveal').hidden = true; exitFeed(); }
  if (phase === 'garden' || phase === 'rise') {
    player.place(new THREE.Vector3(GARDEN.x0 + 3, 0, 0), -Math.PI / 2);
    enterGarden();
    if (phase === 'rise') beginRise();
  }
  if (phase === 'end') showEnding();
}
requestAnimationFrame(frame);
boot();
