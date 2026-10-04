import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/BufferGeometryUtils.js';
import { soilTexture } from './textures.js';
import { GARDEN, WALL_H } from './maze.js';

/**
 * Everything beyond the apparatus: the home cage in its rack, the room it all stands
 * in, the garden under its painted sky, and the city the room stands in.
 * The bench top is y = 0; the room floor is 5.2 units below; the ceiling 12 above.
 */
export const FLOOR_Y = -5.2;
export const CEILING_Y = 12;
export const HOME = { x: -7, y: 0, z: -13, w: 1.9, d: 3.0, h: 1.3 };

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

function merged(list, material, { shadow = true } = {}) {
  const m = new THREE.Mesh(mergeGeometries(list), material);
  m.castShadow = shadow; m.receiveShadow = true;
  list.forEach(g => g.dispose());
  return m;
}

/** A plain white lab rat for the far cages and the other benches. */
function ratBlob(material) {
  const body = new THREE.SphereGeometry(0.28, 14, 10).scale(1, 0.85, 2).translate(0, 0.24, 0);
  const head = new THREE.SphereGeometry(0.18, 12, 8).scale(1, 0.9, 1.4).translate(0, 0.28, 0.62);
  const tail = new THREE.CylinderGeometry(0.02, 0.05, 1.1, 6).rotateX(Math.PI / 2 - 0.1).translate(0, 0.1, -1.05);
  return new THREE.Mesh(mergeGeometries([body, head, tail]), material);
}

function buildLab(scene) {
  const lab = new THREE.Group(); lab.name = 'lab'; scene.add(lab);
  const roomMat = std('#1b2428', { side: THREE.BackSide, roughness: 1 });
  const room = new THREE.Mesh(new THREE.BoxGeometry(200, CEILING_Y - FLOOR_Y, 110), roomMat);
  room.position.set(55, (CEILING_Y + FLOOR_Y) / 2, 0); lab.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 110), std('#2c3638', { roughness: 0.55, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(55, FLOOR_Y + 0.01, 0); floor.receiveShadow = true; lab.add(floor);

  const benchMat = std('#3d4a4c', { roughness: 0.5 });
  const legMat = std('#8c9596', { metalness: 0.7, roughness: 0.35 });
  const benches = [];
  function bench(x0, x1, z0, z1) {
    const top = new THREE.BoxGeometry(x1 - x0, 0.35, z1 - z0).translate((x0 + x1) / 2, -0.19, (z0 + z1) / 2);
    benches.push(top);
    for (const x of [x0 + 0.6, x1 - 0.6]) for (const z of [z0 + 0.6, z1 - 0.6]) {
      benches.push(new THREE.BoxGeometry(0.35, -FLOOR_Y, 0.35).translate(x, FLOOR_Y / 2, z));
    }
  }
  bench(-3, 82, -4.5, 4.5);
  bench(80, 121.5, -21, 21);
  bench(-9.5, -4.5, -21, 21);
  for (const z of [-30, 30]) bench(-3, 82, z - 4.5, z + 4.5);
  lab.add(merged(benches, benchMat));
  const legs = [];
  for (let x = -2; x <= 120; x += 12) legs.push(new THREE.BoxGeometry(0.3, 0.3, 0.3).translate(x, FLOOR_Y + 0.15, 0));
  lab.add(merged(legs, legMat, { shadow: false }));

  const tubes = [];
  for (let x = -10; x <= 150; x += 11) for (const z of [-26, -9, 9, 26]) {
    tubes.push(new THREE.BoxGeometry(7, 0.12, 0.35).translate(x, CEILING_Y - 0.1, z));
  }
  const tubeMesh = merged(tubes, new THREE.MeshBasicMaterial({ color: '#f2f6f0' }), { shadow: false });
  lab.add(tubeMesh);

  // The researcher's desk: two monitors, one showing the tracking view.
  const desk = new THREE.Group(); desk.position.set(-18, FLOOR_Y, 6); lab.add(desk);
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 11), benchMat); deskTop.position.y = 4.2; desk.add(deskTop);
  const monitorCanvas = document.createElement('canvas'); monitorCanvas.width = 512; monitorCanvas.height = 288;
  const monitorTex = new THREE.CanvasTexture(monitorCanvas); monitorTex.colorSpace = THREE.SRGBColorSpace;
  for (const [z, map] of [[-2.4, monitorTex], [2.4, null]]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 4.6), std('#111416'));
    frame.position.set(0.5, 6.4, z); desk.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.4), new THREE.MeshBasicMaterial({ color: map ? '#ffffff' : '#20303a', map }));
    screen.position.set(0.66, 6.4, z); screen.rotation.y = Math.PI / 2; desk.add(screen);
  }
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.8), std('#0f1113', { roughness: 0.3 }));
  phone.position.set(-0.5, 4.4, -0.2); phone.rotation.y = 0.3; desk.add(phone);
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.66), new THREE.MeshBasicMaterial({ color: '#0b0d10' }));
  phoneScreen.rotation.x = -Math.PI / 2; phoneScreen.position.set(-0.5, 4.45, -0.2); phoneScreen.rotation.z = 0.3; desk.add(phoneScreen);
  const chair = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 20), std('#252b2e'));
  chair.position.set(-4, 2.6, 0); desk.add(chair);

  return { lab, room, tubeMesh, monitorCanvas, monitorTex, phoneScreen };
}

/** The ventilated rack: five cages across, three high. The subject lives in the middle one. */
function buildRack(scene) {
  const rack = new THREE.Group(); rack.name = 'rack'; scene.add(rack);
  const plastic = new THREE.MeshStandardMaterial({ color: '#dfe7e6', transparent: true, opacity: 0.16, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const wire = std('#b9c0c1', { metalness: 0.8, roughness: 0.35 });
  const rails = [], bars = [], floors = [];
  const cages = [];
  for (let level = -1; level <= 1; level++) for (let j = -2; j <= 2; j++) {
    const x = HOME.x, y = HOME.y + level * 1.75, z = HOME.z + j * 3.4;
    cages.push({ x, y, z, home: level === 0 && j === 0 });
    floors.push(new THREE.BoxGeometry(HOME.w, 0.04, HOME.d).translate(x, y - 0.02, z));
    rails.push(new THREE.BoxGeometry(HOME.w + 0.3, 0.06, 0.08).translate(x, y - 0.08, z - HOME.d / 2 - 0.2));
    rails.push(new THREE.BoxGeometry(HOME.w + 0.3, 0.06, 0.08).translate(x, y - 0.08, z + HOME.d / 2 + 0.2));
    if (level === 0 && j === 0) continue;
    for (let b = 0; b < 16; b++) bars.push(new THREE.CylinderGeometry(0.01, 0.01, HOME.d, 4).rotateX(Math.PI / 2).translate(x - HOME.w / 2 + 0.1 + b * 0.11, y + HOME.h, z));
  }
  const walls = [];
  for (const c of cages) {
    walls.push(new THREE.BoxGeometry(HOME.w, HOME.h, HOME.d).translate(c.x, c.y + HOME.h / 2, c.z));
  }
  const plasticMesh = new THREE.Mesh(mergeGeometries(walls), plastic); plasticMesh.renderOrder = 2; rack.add(plasticMesh);
  rack.add(merged(floors, std('#cdbb96'), { shadow: false }), merged(rails, wire, { shadow: false }), merged(bars, wire, { shadow: false }));
  const posts = [];
  for (const z of [HOME.z - 8.6, HOME.z + 8.6]) for (const x of [HOME.x - 1.3, HOME.x + 1.3]) posts.push(new THREE.BoxGeometry(0.12, 8, 0.12).translate(x, 0.2, z));
  rack.add(merged(posts, wire));

  // Bedding in every cage; the neighbors sleep, sniff, and turn.
  const chip = new THREE.BoxGeometry(0.06, 0.008, 0.022);
  const bedding = new THREE.InstancedMesh(chip, std('#e2cf9f', { roughness: 1 }), cages.length * 450);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0, seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const c of cages) for (let i = 0; i < 450; i++) {
    p.set(c.x + (rand() - 0.5) * (HOME.w - 0.1), c.y + 0.01 + rand() * 0.05, c.z + (rand() - 0.5) * (HOME.d - 0.1));
    q.setFromEuler(e.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6));
    s.setScalar(0.7 + rand() * 1.1);
    bedding.setMatrixAt(n++, m.compose(p, q, s));
    bedding.setColorAt(n - 1, new THREE.Color().setHSL(0.1 + rand() * 0.03, 0.45, 0.62 + rand() * 0.18));
  }
  bedding.receiveShadow = true; rack.add(bedding);
  const neighborMat = std('#efe9e0', { roughness: 0.9 });
  const neighbors = cages.filter(c => !c.home).map((c, i) => {
    const r = ratBlob(neighborMat);
    r.position.set(c.x + (rand() - 0.5) * 0.6, c.y, c.z + (rand() - 0.5) * 1.4);
    r.rotation.y = rand() * Math.PI * 2; r.scale.setScalar(0.95);
    r.userData = { phase: i * 1.7, home: r.position.clone() };
    rack.add(r); return r;
  });

  // The subject's own cage: water bottle, wire lid with a food hopper.
  const lid = new THREE.Group(); lid.position.set(HOME.x, HOME.y + HOME.h, HOME.z); rack.add(lid);
  const lidBars = [];
  for (let b = 0; b < 18; b++) lidBars.push(new THREE.CylinderGeometry(0.012, 0.012, HOME.d, 5).rotateX(Math.PI / 2).translate(-HOME.w / 2 + 0.05 + b * 0.107, 0, 0));
  for (let b = 0; b < 3; b++) lidBars.push(new THREE.CylinderGeometry(0.014, 0.014, HOME.w, 5).rotateZ(Math.PI / 2).translate(0, 0, -HOME.d / 2 + 0.05 + b * (HOME.d - 0.1) / 2));
  const hopper = [];
  for (let b = 0; b < 12; b++) {
    const zz = -0.2 + b * 0.09;
    hopper.push(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4).translate(-0.35, -0.35, zz).rotateZ(0));
    hopper.push(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4).rotateZ(0.9).translate(0, -0.3, zz));
  }
  lid.add(merged([...lidBars, ...hopper], wire));
  const chow = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.045), std('#b58d58'), 70);
  for (let i = 0; i < 70; i++) chow.setMatrixAt(i, m.makeTranslation(-0.2 + (i % 5) * 0.08 - Math.floor(i / 35) * 0.05, -0.42 + Math.floor(i / 5) % 3 * 0.1 + (i % 2) * 0.03, -0.2 + (Math.floor(i / 15) % 5) * 0.21));
  lid.add(chow);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 20), new THREE.MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.35, roughness: 0.05 }));
  bottle.position.set(0.5, 0.95, 1.05); bottle.rotation.x = 0.9; lid.add(bottle);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.6, 10), std('#cfd6d7', { metalness: 0.9, roughness: 0.2 }));
  spout.position.set(0.5, -0.1, 1.2); spout.rotation.x = 0.9; lid.add(spout);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: '#dff1f7', transparent: true, opacity: 0.8, roughness: 0 }));
  drop.position.set(0.5, -0.36, 1.37); lid.add(drop);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ map: cageCard(), roughness: 0.8 }));
  card.position.set(HOME.x + HOME.w / 2 + 0.03, HOME.y + 0.95, HOME.z - 0.8); card.rotation.y = Math.PI / 2; rack.add(card);

  return { rack, lid, drop, neighbors, spoutTip: new THREE.Vector3(HOME.x + 0.5, HOME.y + 0.9, HOME.z + 1.4) };
}

function cageCard() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#c33f3f'; g.fillRect(0, 0, 256, 18);
  g.fillStyle = '#2a2a28'; g.font = 'bold 20px ui-monospace, Menlo, monospace';
  g.fillText('SUBJ 23', 14, 50);
  g.font = '15px ui-monospace, Menlo, monospace';
  g.fillText('PROTOCOL 7-14', 14, 80); g.fillText('SESSION 1', 14, 104); g.fillText('♂  P62', 14, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** The garden, lit by a lamp and covered by a painted sky. */
function buildGarden(scene) {
  const garden = new THREE.Group(); garden.name = 'garden'; scene.add(garden);
  const cx = GARDEN.cx, R = 19.5;
  const soil = soilTexture(); soil.repeat.set(8, 8);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshStandardMaterial({ map: soil, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0.005, 0); ground.receiveShadow = true; garden.add(ground);

  const uniforms = { time: { value: 0 } };
  const bladeGeo = new THREE.PlaneGeometry(0.05, 1, 1, 4).translate(0, 0.5, 0);
  const pos = bladeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1 - y * 0.92)); }
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.85 });
  bladeMat.onBeforeCompile = shader => {
    shader.uniforms.time = uniforms.time;
    shader.vertexShader = 'uniform float time;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float sway = sin(time * 1.3 + ip.x * 0.7 + ip.z * 0.5) * 0.18 + sin(time * 2.9 + ip.z) * 0.05;
      transformed.x += sway * position.y * position.y;
      transformed.z += sway * 0.5 * position.y * position.y;`);
  };
  const N = 16000;
  const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let seed = 9; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R - 0.3);
    p.set(cx + Math.cos(a) * r, 0, Math.sin(a) * r);
    if (p.x < GARDEN.x0 + 1.5 && Math.abs(p.z) < 1.5) { i--; continue; }
    q.setFromEuler(e.set((rand() - 0.5) * 0.35, rand() * Math.PI, (rand() - 0.5) * 0.35));
    const h = 0.35 + rand() * rand() * 1.5;
    s.set(1 + rand(), h, 1);
    grass.setMatrixAt(i, m.compose(p, q, s));
    grass.setColorAt(i, col.setHSL(0.24 + rand() * 0.07, 0.35 + rand() * 0.2, 0.28 + rand() * 0.2));
  }
  grass.receiveShadow = true; garden.add(grass);

  const leaf = new THREE.CircleGeometry(0.2, 12).scale(1, 1.1, 1).translate(0, 0.19, 0).rotateX(-Math.PI / 2 + 0.25);
  const clover = new THREE.InstancedMesh(leaf, std('#5b8a4f', { side: THREE.DoubleSide, emissive: '#2c4a25' }), 900);
  for (let i = 0; i < 300; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R - 1), h = 0.06 + rand() * 0.2;
    for (let k = 0; k < 3; k++) {
      q.setFromEuler(e.set(0, k * 2.09 + a, 0));
      clover.setMatrixAt(i * 3 + k, m.compose(p.set(cx + Math.cos(a) * r, h, Math.sin(a) * r), q, s.setScalar(0.9 + rand() * 0.8)));
    }
  }
  clover.castShadow = true; garden.add(clover);
  const stems = [], petals = [], hearts = [];
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R - 1), h = 0.8 + rand() * 1.6;
    const x = cx + Math.cos(a) * r, z = Math.sin(a) * r;
    stems.push(new THREE.CylinderGeometry(0.018, 0.025, h, 5).translate(x, h / 2, z));
    for (let k = 0; k < 8; k++) {
      const pa = k / 8 * Math.PI * 2;
      petals.push(new THREE.SphereGeometry(0.09, 8, 6).scale(1.9, 0.25, 0.8).translate(0.17, 0, 0).rotateY(pa).translate(x, h, z));
    }
    hearts.push(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 0.6, 1).translate(x, h + 0.02, z));
  }
  garden.add(merged(stems, std('#5e8454')), merged(petals, std('#f3eed8', { roughness: 0.6, side: THREE.DoubleSide, emissive: '#5e5a4a' })), merged(hearts, std('#e2b84d')));
  const stones = [];
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, r = 4 + rand() * (R - 6), sz = 0.5 + rand() * 1.2;
    stones.push(new THREE.DodecahedronGeometry(sz, 1).scale(1.3, 0.6, 1).translate(cx + Math.cos(a) * r, sz * 0.25, Math.sin(a) * r));
  }
  garden.add(merged(stones, std('#8e8c83', { flatShading: true })));

  // The sky: painted on the inside of a dome, plain white shell on the outside.
  const domeGeo = new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.46, 1);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position * vec3(1.0, 2.17, 1.0)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform float time;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float y = clamp(vDir.y, 0.0, 1.0);
        vec3 horizon = vec3(0.93, 0.89, 0.78), zenith = vec3(0.42, 0.66, 0.86);
        vec3 c = mix(horizon, zenith, pow(y, 0.6));
        vec2 uv = vDir.xz / (0.35 + y) * 2.2 + vec2(time * 0.01, 0.0);
        float cl = n(uv) * 0.55 + n(uv * 2.1) * 0.3 + n(uv * 4.3) * 0.15;
        c = mix(c, vec3(1.0, 0.98, 0.94), smoothstep(0.55, 0.8, cl) * 0.75 * smoothstep(0.05, 0.3, y));
        float sun = max(dot(vDir, normalize(vec3(-0.3, 0.8, 0.35))), 0.0);
        c += vec3(1.0, 0.9, 0.7) * (pow(sun, 60.0) * 1.2 + pow(sun, 6.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(domeGeo, skyMat); sky.position.set(cx, 0, 0); garden.add(sky);
  const shell = new THREE.Mesh(domeGeo, std('#e9e7e1', { roughness: 0.6 })); shell.position.set(cx, 0, 0); garden.add(shell);
  const seams = [];
  for (let i = 0; i < 16; i++) seams.push(new THREE.TorusGeometry(R + 0.03, 0.03, 4, 48, Math.PI / 2).scale(1, 0.46, 1).rotateY(i / 16 * Math.PI * 2).rotateX(0));
  const seamMesh = merged(seams.map(g => g.rotateZ(0)), std('#b8b6ae'), { shadow: false });
  seamMesh.position.set(cx, 0, 0); seamMesh.rotation.x = 0; garden.add(seamMesh);
  seamMesh.visible = false;
  return { garden, uniforms, sky, shell, center: new THREE.Vector3(cx, 0, 0) };
}

/** Windows as a shader, so a whole city of lit rooms is one draw call. */
function buildCity(scene) {
  const city = new THREE.Group(); city.name = 'city'; city.visible = false; scene.add(city);
  const FLOOR = 16;
  const uniforms = { time: { value: 0 }, fade: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float aSeed; varying vec3 vPos; varying vec3 vNormal; varying float vSeed;
      void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vPos = wp.xyz; vSeed = aSeed;
        vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `varying vec3 vPos; varying vec3 vNormal; varying float vSeed; uniform float time; uniform float fade;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      void main(){
        vec3 base = vec3(0.007, 0.009, 0.013);
        if (vNormal.y > 0.5) { float f = 1.0 - exp(-pow(length(vPos - cameraPosition) * 0.00032, 2.0)); gl_FragColor = vec4(mix(base * 0.6, vec3(0.012, 0.015, 0.022), f), 1.0); return; }
        float u = abs(vNormal.x) > 0.5 ? vPos.z : vPos.x;
        vec2 cell = vec2(u / 9.0, (vPos.y + 400.0) / ${FLOOR}.0);
        vec2 f = fract(cell), id = floor(cell);
        float inWin = step(0.18, f.x) * step(f.x, 0.82) * step(0.28, f.y) * step(f.y, 0.78);
        float r = h(vec3(id, vSeed));
        float lit = step(0.6, r);
        float lab = step(abs(vSeed - 7.7), 0.01) * step(${FLOOR_Y.toFixed(1)}, vPos.y) * step(vPos.y, ${CEILING_Y.toFixed(1)});
        lit = max(lit, lab);
        float screen = step(0.5, h(vec3(id.yx, vSeed + 3.0)));
        float flicker = 0.75 + 0.25 * sin(time * (2.0 + r * 5.0) + r * 40.0) * screen;
        vec3 warm = vec3(1.0, 0.72, 0.42), blue = vec3(0.45, 0.62, 1.0);
        vec3 c = base + inWin * lit * mix(mix(warm, blue, screen) * flicker, vec3(0.85, 0.95, 1.0), lab) * 0.95;
        float fogF = 1.0 - exp(-pow(length(vPos - cameraPosition) * 0.00032, 2.0));
        c = mix(c, vec3(0.012, 0.015, 0.022), fogF);
        gl_FragColor = vec4(c * fade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const N = 5600;
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const seeds = new Float32Array(N);
  const mesh = new THREE.InstancedMesh(box, mat, N);
  const m = new THREE.Matrix4(); let seed = 21;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const GROUND = FLOOR_Y - FLOOR * 4;
  let n = 0;
  const block = 150;
  for (let bx = -22; bx <= 22 && n < N - 1; bx++) for (let bz = -22; bz <= 22 && n < N - 1; bz++) {
    for (let k = 0; k < 3 && n < N - 1; k++) {
      const w = 40 + rand() * 70, d = 40 + rand() * 70;
      const x = bx * block + (k - 1) * 48 + rand() * 10, z = bz * block + (rand() - 0.5) * 40;
      if (Math.abs(x - 55) < 150 && Math.abs(z) < 110) continue;
      const dist = Math.hypot(x, z);
      const floors = Math.max(2, Math.round(rand() * rand() * 34 * Math.exp(-dist / 2400) + 2 + rand() * 3));
      m.compose(new THREE.Vector3(x, GROUND, z), new THREE.Quaternion(), new THREE.Vector3(w, floors * FLOOR, d));
      mesh.setMatrixAt(n, m); seeds[n] = rand() * 100; n++;
    }
  }
  // The building the lab is in.
  m.compose(new THREE.Vector3(55, GROUND, 0), new THREE.Quaternion(), new THREE.Vector3(215, (CEILING_Y - GROUND) + FLOOR * 3, 125));
  mesh.setMatrixAt(n, m); seeds[n] = 7.7; n++;
  mesh.count = n;
  box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  city.add(mesh);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshBasicMaterial({ color: '#030405' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; city.add(ground);
  const streets = [];
  for (let i = -22; i <= 22; i++) {
    streets.push(new THREE.PlaneGeometry(6, 6800).rotateX(-Math.PI / 2).translate(i * block + 75, GROUND + 0.2, 0));
    streets.push(new THREE.PlaneGeometry(6800, 6).rotateX(-Math.PI / 2).translate(0, GROUND + 0.2, i * block + 75));
  }
  const streetMesh = new THREE.Mesh(mergeGeometries(streets), new THREE.MeshBasicMaterial({ color: '#2a2012', fog: true }));
  city.add(streetMesh);
  return { city, uniforms, GROUND };
}

/** A gloved hand, built to be seen from underneath. */
function buildHand(scene) {
  const hand = new THREE.Group(); hand.name = 'hand'; hand.visible = false; scene.add(hand);
  const glove = new THREE.MeshStandardMaterial({ color: '#8f86ea', roughness: 0.38, metalness: 0.0, emissive: '#1d1840' });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32).scale(1.25, 0.45, 1.5), glove); hand.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group(); f.position.set(-0.45 + i * 0.3, -0.05, 0.62); hand.add(f);
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7 - Math.abs(i - 1.5) * 0.12, 8, 16).rotateX(Math.PI / 2).translate(0, 0, 0.38), glove);
    f.add(seg); fingers.push(f);
  }
  const thumb = new THREE.Group(); thumb.position.set(0.6, -0.05, -0.1); thumb.rotation.y = 0.9; hand.add(thumb);
  thumb.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.55, 6, 12).rotateX(Math.PI / 2).translate(0, 0, 0.35), glove));
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.8, 20).rotateX(Math.PI / 2).translate(0, 0.05, -1.5), glove);
  hand.add(cuff);
  hand.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { hand, fingers, thumb, curl(v) { fingers.forEach(f => (f.rotation.x = v * 1.3)); thumb.rotation.x = v * 0.8; } };
}

/** The tracking system's record of where the subject went. */
function buildTraces(scene) {
  const traces = [0xffd23f, 0x3fe0ff].map(color => {
    const max = 20000;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    line.renderOrder = 20; line.visible = false; line.frustumCulled = false;
    scene.add(line);
    return { line, count: 0, max, last: null };
  });
  return {
    traces,
    add(i, p) {
      const t = traces[i];
      if (t.count >= t.max) return;
      if (t.last && t.last.distanceToSquared(p) < 0.01) return;
      t.line.geometry.attributes.position.setXYZ(t.count++, p.x, 0.08 + i * 0.02, p.z);
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.geometry.setDrawRange(0, t.count);
      t.last = p.clone();
    },
    show(v) { traces.forEach(t => (t.line.visible = v)); },
  };
}

/** Other benches: the same apparatus, other subjects. */
function buildCohort(scene, maze) {
  const cohort = new THREE.Group(); cohort.name = 'cohort'; scene.add(cohort);
  const ratMat = std('#f1ece4');
  const subjects = [];
  for (const z of [-30, 30]) {
    const copy = new THREE.Group(); copy.position.z = z; cohort.add(copy);
    for (const key of ['maze', 'cap', 'chamber', 'floor']) if (maze.meshes[key]) copy.add(new THREE.Mesh(maze.meshes[key].geometry, maze.meshes[key].material));
    for (let i = 0; i < 2; i++) {
      const rat = ratBlob(ratMat); rat.scale.setScalar(0.85); copy.add(rat);
      subjects.push({ rat, u: (z > 0 ? 0.2 : 0.55) + i * 0.33 });
    }
  }
  return { cohort, subjects };
}

export function createScenery(scene, maze) {
  return {
    ...buildLab(scene),
    home: buildRack(scene),
    garden: buildGarden(scene),
    city: buildCity(scene),
    hand: buildHand(scene),
    tracking: buildTraces(scene),
    cohort: buildCohort(scene, maze),
  };
}
export { WALL_H };
