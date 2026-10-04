import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/BufferGeometryUtils.js';
import { wallTexture, floorTexture, tapeTexture, plaqueTexture, softDot } from './textures.js';

/**
 * The apparatus as a tile grid. One tile is one world unit, about 17 cm; the rat is
 * 1.2 units long. Tile (col,row) is centered at x = col, z = row - CENTER.
 *
 * Eight fork cells are stamped from one template. Each fork's two arms rejoin at a
 * merge room, so every choice leads to the same next room. Seen from above the
 * apparatus is a chain of loops; seen from inside it is a series of decisions.
 */
export const WALL_H = 2.6;
export const CENTER = 22;
export const FORKS = 8;
const W = 124, H = 45;
const CELL = [
  '##########',
  '###.....##',
  '#..A###B.#',
  'E..#####.X',
  '#..C###D.#',
  '###.....##',
  '##########',
];
export const CHAMBER = { x0: 76, x1: 80, z0: -2, z1: 2, exitCol: 81 };
export const GARDEN = { x0: 82, x1: 119, z0: -19, z1: 19, cx: 100.5, radius: 17.5 };

export const toWorld = (col, row) => new THREE.Vector3(col, 0, row - CENTER);

function buildGrid() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const cells = [];
  for (let r = 21; r <= 23; r++) for (let c = 1; c <= 2; c++) g[r][c] = '.';
  for (let k = 0; k < FORKS; k++) {
    const ox = 3 + k * 9, oy = CENTER - 3;
    const cell = { index: k, ox, marks: {} };
    CELL.forEach((line, r) => [...line].forEach((ch, c) => {
      if (ch === '#') return;
      g[oy + r][ox + c] = '.';
      if (ch !== '.') cell.marks[ch] = { col: ox + c, row: oy + r };
    }));
    cells.push(cell);
  }
  for (let r = CENTER + CHAMBER.z0; r <= CENTER + CHAMBER.z1; r++) for (let c = CHAMBER.x0; c <= CHAMBER.x1; c++) g[r][c] = '.';
  g[CENTER][CHAMBER.exitCol] = '.';
  for (let r = CENTER + GARDEN.z0; r <= CENTER + GARDEN.z1; r++) for (let c = GARDEN.x0; c <= GARDEN.x1; c++) g[r][c] = '.';
  return { g, cells };
}

const region = (c, r) => (c >= GARDEN.x0 - 1 ? 'garden' : c >= CHAMBER.x0 - 1 && c <= CHAMBER.exitCol ? 'chamber' : 'maze');

export function createMaze(scene) {
  const { g, cells } = buildGrid();
  const blocked = new Set();
  const group = new THREE.Group();
  group.name = 'apparatus';
  scene.add(group);

  const wallTex = wallTexture();
  const floorTex = floorTexture();
  const materials = {
    maze: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.82, color: '#fffaf0' }),
    chamber: new THREE.MeshStandardMaterial({ color: '#aeb6b8', roughness: 0.38, metalness: 0.65 }),
    garden: new THREE.MeshStandardMaterial({ color: '#8c7b63', roughness: 0.9 }),
    cap: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.7 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.93 }),
    tray: new THREE.MeshStandardMaterial({ color: '#2b3033', roughness: 0.6, metalness: 0.4 }),
    rod: new THREE.MeshStandardMaterial({ color: '#c9ced0', roughness: 0.25, metalness: 0.9 }),
    door: new THREE.MeshStandardMaterial({ color: '#b9c9c7', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.82 }),
    frame: new THREE.MeshStandardMaterial({ color: '#8d9493', roughness: 0.4, metalness: 0.7 }),
  };

  const isFloor = (c, r) => g[r]?.[c] === '.';
  const walls = { maze: [], chamber: [], garden: [], cap: [] };
  const floors = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (isFloor(c, r)) {
      if (region(c, r) === 'maze') {
        const f = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(c, 0, r - CENTER);
        const uv = f.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + c) / 4, (uv.getY(i) - r) / 4);
        floors.push(f);
      }
      continue;
    }
    let near = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isFloor(c + dc, r + dr)) near = true;
    if (!near) continue;
    const kind = region(c, r);
    const h = kind === 'garden' ? 1.4 : WALL_H;
    const box = new THREE.BoxGeometry(1, h, 1).translate(c, h / 2, r - CENTER);
    const uv = box.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + (c % 2) * 0.5, uv.getY(i));
    walls[kind].push(box);
    if (kind === 'maze') walls.cap.push(new THREE.BoxGeometry(1.02, 0.05, 1.02).translate(c, h + 0.025, r - CENTER));
  }
  const meshes = {};
  for (const [kind, list] of Object.entries(walls)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), materials[kind]);
    m.castShadow = kind !== 'cap'; m.receiveShadow = true;
    group.add(m); meshes[kind] = m;
    list.forEach(x => x.dispose());
  }
  const floor = new THREE.Mesh(mergeGeometries(floors), materials.floor);
  floor.receiveShadow = true; group.add(floor);
  meshes.floor = floor;

  // The operant chamber: a steel rod floor over a waste tray, a ceiling with a house light.
  const chamber = new THREE.Group(); group.add(chamber);
  const cw = CHAMBER.x1 - CHAMBER.x0 + 1, cd = CHAMBER.z1 - CHAMBER.z0 + 1;
  const cx = (CHAMBER.x0 + CHAMBER.x1) / 2, cz = (CHAMBER.z0 + CHAMBER.z1) / 2;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(cw + 1, 0.1, cd), materials.tray);
  tray.position.set(cx + 0.5, -0.18, cz); tray.receiveShadow = true; chamber.add(tray);
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, cd, 8).rotateX(Math.PI / 2), materials.rod, Math.ceil((cw + 1) / 0.22));
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < rods.count; i++) { rods.setMatrixAt(i, m4.makeTranslation(CHAMBER.x0 - 0.5 + i * 0.22, -0.03, cz)); }
  rods.receiveShadow = true; rods.castShadow = true; chamber.add(rods);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.2, 0.08, cd + 0.2), materials.chamber);
  ceiling.position.set(cx, WALL_H + 0.04, cz); chamber.add(ceiling);
  const houseLight = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshBasicMaterial({ color: '#fff4dc' }));
  houseLight.rotation.x = Math.PI / 2; houseLight.position.set(cx - 1.4, WALL_H - 0.005, cz); chamber.add(houseLight);

  // Lever, magazine, cue light on the south wall; free food in the north-west corner.
  const southFace = CHAMBER.z1 + 0.5;
  const leverPos = new THREE.Vector3(cx - 0.8, 0, southFace);
  const cupPos = new THREE.Vector3(cx + 0.7, 0, southFace);
  const lever = new THREE.Group(); lever.position.set(leverPos.x, 0.34, southFace - 0.02); chamber.add(lever);
  const leverPlate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), materials.frame);
  leverPlate.position.set(0, 0.05, -0.025); lever.add(leverPlate);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: '#070808' }));
  slot.position.set(0, 0, -0.055); lever.add(slot);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: '#dfe4e6', roughness: 0.22, metalness: 0.85, emissive: '#3a3c3d' }));
  tongue.position.set(0, 0, -0.32); tongue.castShadow = true;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.04), tongue.material);
  lip.position.set(0, 0.02, -0.62); 
  const hinge = new THREE.Group(); hinge.position.z = -0.05; hinge.rotation.x = 0.08; hinge.add(tongue, lip); lever.add(hinge);
  const magazine = new THREE.Group(); magazine.position.set(cupPos.x, 0, southFace - 0.02); chamber.add(magazine);
  const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.06), materials.frame);
  magPlate.position.set(0, 0.45, -0.03); magazine.add(magPlate);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.3), new THREE.MeshStandardMaterial({ color: '#1f2426', roughness: 0.8 }));
  trough.position.set(0, 0.3, -0.12); magazine.add(trough);
  const troughLight = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: '#555' }));
  troughLight.position.set(0, 0.52, -0.271); troughLight.rotation.y = Math.PI; magazine.add(troughLight);
  const cueLight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ddd4b8', emissive: '#ffd27a', emissiveIntensity: 0 }));
  cueLight.rotation.x = -Math.PI / 2; cueLight.position.set(leverPos.x, 0.95, southFace - 0.02); chamber.add(cueLight);
  const pelletGeo = new THREE.SphereGeometry(0.055, 12, 8);
  const pelletMat = new THREE.MeshStandardMaterial({ color: '#c99a5e', roughness: 0.9 });
  const cupPellets = Array.from({ length: 6 }, (_, i) => {
    const p = new THREE.Mesh(pelletGeo, pelletMat);
    p.position.set(cupPos.x - 0.1 + (i % 3) * 0.1, 0.17 + Math.floor(i / 3) * 0.06, southFace - 0.14 - (i % 2) * 0.05);
    p.visible = false; chamber.add(p); return p;
  });
  const freePos = new THREE.Vector3(CHAMBER.x0 + 0.1, 0, CHAMBER.z0 + 0.1);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.14, 32), new THREE.MeshStandardMaterial({ color: '#d8dcd6', roughness: 0.3, metalness: 0.5 }));
  dish.position.set(freePos.x, 0.07, freePos.z); dish.castShadow = true; chamber.add(dish);
  const freePile = new THREE.InstancedMesh(pelletGeo, pelletMat, 40);
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39, rr = Math.sqrt(i / 40) * 0.3;
    freePile.setMatrixAt(i, m4.makeTranslation(freePos.x + Math.cos(a) * rr, 0.16 + (0.3 - rr) * 0.25, freePos.z + Math.sin(a) * rr));
  }
  chamber.add(freePile);

  // The chamber exit: a dark tunnel mouth, gated by a door on its far side.
  const exitPos = new THREE.Vector3(CHAMBER.exitCol, 0, 0);
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1, 1, 1, 1), new THREE.MeshStandardMaterial({ color: '#0d0f10', side: THREE.BackSide, roughness: 1 }));
  tunnel.position.set(exitPos.x, WALL_H / 2, 0); chamber.add(tunnel);

  // Guillotine doors: clear plates in steel frames, hanging above every doorway.
  const doors = new Map();
  const doorGeo = new THREE.BoxGeometry(0.05, WALL_H * 0.96, 0.98);
  function addDoor(id, col, row, face) {
    const x = col + (face === 'west' ? -0.5 : face === 'east' ? 0.5 : 0);
    const plate = new THREE.Mesh(doorGeo, materials.door);
    plate.position.set(x, WALL_H * 1.45, row - CENTER);
    plate.castShadow = true;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.1), materials.frame);
    frame.position.set(x, WALL_H * 1.95, row - CENTER);
    group.add(plate, frame);
    doors.set(id, { id, col, row, plate, open: WALL_H * 1.45, shut: WALL_H * 0.48, target: WALL_H * 1.45, closed: false });
  }
  for (const cell of cells) {
    const m = cell.marks, k = cell.index;
    addDoor(`${k}E`, m.E.col, m.E.row, 'center');
    addDoor(`${k}A`, m.A.col, m.A.row, 'west');
    addDoor(`${k}C`, m.C.col, m.C.row, 'west');
    addDoor(`${k}B`, m.B.col, m.B.row, 'east');
    addDoor(`${k}D`, m.D.col, m.D.row, 'east');
  }
  addDoor('chamber', 75, CENTER, 'center');
  addDoor('exit', CHAMBER.exitCol, CENTER, 'east');

  function setDoor(id, state, { instant = false } = {}) {
    const d = doors.get(id); if (!d) return false;
    const was = d.target;
    d.closed = state === 'closed';
    d.target = state === 'closed' ? d.shut : state === 'half' ? d.shut + WALL_H * 0.26 : d.open;
    if (d.closed) blocked.add(`${d.col},${d.row}`); else blocked.delete(`${d.col},${d.row}`);
    if (instant) d.plate.position.y = d.target;
    return was !== d.target;
  }
  function resetDoors() {
    for (const id of doors.keys()) setDoor(id, 'open', { instant: true });
    setDoor('exit', 'closed', { instant: true });
    setDoor('0E', 'closed', { instant: true });
  }

  // Fork plaques and cues.
  const plaques = cells.map(cell => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ map: plaqueTexture(`F${cell.index + 1}`), roughness: 0.6 }));
    m.position.set(cell.ox + 3 - 0.505, 1.1, 0); m.rotation.y = -Math.PI / 2;
    group.add(m); return m;
  });
  function setPlaque(k, code) {
    const mat = plaques[k].material;
    mat.map.dispose(); mat.map = plaqueTexture(`F${k + 1}`, code); mat.needsUpdate = true;
  }

  const cueGroup = new THREE.Group(); group.add(cueGroup);
  const tapeTex = tapeTexture();
  const dot = softDot();
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff2cf', emissive: '#ffcf7a', emissiveIntensity: 3 });
  let cueState = [];
  /** Where a side's doorway and arm are for fork k. */
  function sidePoints(k, side) {
    const m = cells[k].marks, mark = side === 'L' ? m.A : m.C;
    const armRow = side === 'L' ? mark.row - 1 : mark.row + 1;
    return {
      door: toWorld(mark.col, mark.row),
      arm: toWorld(mark.col + 1.5, armRow),
      corner: toWorld(mark.col, armRow),
      threshold: toWorld(mark.col - 0.5, mark.row),
    };
  }
  function setCues(forks) {
    cueGroup.clear();
    cueState = forks.map((fork, k) => {
      const state = { fork, k };
      const side = fork.side;
      if (!side) return state;
      const p = sidePoints(k, side);
      if (fork.cue === 'light') {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), lampMat);
        bulb.position.set(p.threshold.x + 0.15, 2.05, p.threshold.z);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4), materials.frame);
        cord.position.set(bulb.position.x, 2.8, bulb.position.z);
        cueGroup.add(bulb, cord);
        state.light = { position: p.corner.clone().setY(1.6), color: '#ffc978', intensity: 9 };
        state.glow = bulb.position.clone();
      }
      if (fork.cue === 'pellet') {
        const pellet = new THREE.Mesh(pelletGeo, new THREE.MeshStandardMaterial({ color: '#d5a868', emissive: '#6b4a1d', emissiveIntensity: 0.4 }));
        pellet.scale.setScalar(1.3); pellet.position.set(p.threshold.x + 0.35, 0.07, p.threshold.z + 0.05);
        pellet.castShadow = true; cueGroup.add(pellet); state.pellet = pellet;
      }
      if (fork.cue === 'tape') {
        for (const [y, rz] of [[0.95, 0.35], [0.95, -0.35]]) {
          const tape = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.16), new THREE.MeshStandardMaterial({ map: tapeTex, side: THREE.DoubleSide, roughness: 0.5 }));
          tape.position.set(p.threshold.x - 0.02, y, p.threshold.z); tape.rotation.set(0, Math.PI / 2, rz);
          cueGroup.add(tape);
        }
      }
      if (fork.cue === 'open') {
        state.halfShut = `${k}${side === 'L' ? 'C' : 'A'}`;
      }
      if (fork.cue === 'draft') {
        const n = 36, pos = new Float32Array(n * 3), seeds = Float32Array.from({ length: n }, (_, i) => (i * 0.618) % 1);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, color: '#dfe8c8', size: 0.07, transparent: true, opacity: 0.7, depthWrite: false }));
        cueGroup.add(pts);
        state.draft = { pts, seeds, from: p.arm, mid: p.corner, to: p.threshold.clone().add(new THREE.Vector3(-1.2, 0, 0)) };
        state.light = { position: p.arm.clone().setY(1.2), color: '#cfe6c4', intensity: 3 };
      }
      if (fork.cue === 'sound') state.sound = p.arm.clone().setY(0.4);
      if (fork.cue === 'follow') state.follow = p;
      return state;
    });
    for (const s of cueState) if (s.halfShut) setDoor(s.halfShut, 'half', { instant: true });
  }
  const tmp = new THREE.Vector3();
  function update(dt, t) {
    for (const d of doors.values()) {
      const y = d.plate.position.y;
      d.plate.position.y = y + (d.target - y) * Math.min(1, dt * (d.target < y ? 16 : 3));
    }
    for (const s of cueState) {
      if (s.draft) {
        const a = s.draft.pts.geometry.attributes.position;
        s.draft.seeds.forEach((seed, i) => {
          const u = (seed + t * 0.12) % 1;
          if (u < 0.5) tmp.lerpVectors(s.draft.from, s.draft.mid, u * 2); else tmp.lerpVectors(s.draft.mid, s.draft.to, (u - 0.5) * 2);
          a.setXYZ(i, tmp.x + Math.sin(i * 7 + t * 2) * 0.25, 0.2 + ((i * 0.37) % 1) * 1.4 + Math.sin(t * 1.3 + i) * 0.1, tmp.z + Math.cos(i * 5 + t * 1.7) * 0.25);
        });
        a.needsUpdate = true;
      }
      if (s.pellet) s.pellet.rotation.y = t;
    }
  }

  /** True if a circle at (x,z) with radius overlaps a wall or closed door. */
  function blockedAt(x, z) {
    const c = Math.round(x), r = Math.round(z) + CENTER;
    return !isFloor(c, r) || blocked.has(`${c},${r}`);
  }
  function collide(pos, radius) {
    const c0 = Math.round(pos.x), r0 = Math.round(pos.z);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc, rz = r0 + dr;
      if (!blockedAt(c, rz)) continue;
      const nx = THREE.MathUtils.clamp(pos.x, c - 0.5, c + 0.5), nz = THREE.MathUtils.clamp(pos.z, rz - 0.5, rz + 0.5);
      const dx = pos.x - nx, dz = pos.z - nz, d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d > 1e-5) { pos.x = nx + dx / d * radius; pos.z = nz + dz / d * radius; }
        else pos.x = c + (pos.x > c ? 0.5 + radius : -0.5 - radius);
      }
    }
    return pos;
  }
  /** Distance to the nearest wall on the left and right of a heading, for whiskers. */
  function probe(pos, heading, reach = 0.7) {
    const side = sign => {
      for (let s = 0.1; s <= reach; s += 0.1) {
        const a = heading + sign * Math.PI / 3;
        if (blockedAt(pos.x - Math.sin(a) * s, pos.z - Math.cos(a) * s)) return s / reach;
      }
      return 1;
    };
    return { left: side(1), right: side(-1) };
  }

  resetDoors();
  return {
    group, cells, meshes, doors, materials, setDoor, resetDoors, setCues, setPlaque, sidePoints,
    get cueState() { return cueState; },
    update, collide, blockedAt, probe,
    tileOf: p => ({ col: Math.round(p.x), row: Math.round(p.z) + CENTER }),
    chamber: { group: chamber, lever: hinge, leverPos, cupPos, freePos, exitPos, cueLight, troughLight, houseLight, cupPellets, ceiling, center: new THREE.Vector3(cx, 0, cz) },
    start: toWorld(1.3, CENTER),
  };
}
