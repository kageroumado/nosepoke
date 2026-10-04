import * as THREE from '../vendor/three/three.module.min.js';

/**
 * The subject, seen from inside. The camera sits at a rat's eye, about 5 cm off the
 * floor. Whiskers sweep at the edges of the view the way a rat's do while exploring,
 * about eight times a second, and fold back when a wall comes near.
 *
 * Heading is a yaw where forward is (-sin yaw, 0, -cos yaw).
 */
export const EYE = 0.3;
const RADIUS = 0.3;

export function createPlayer(camera) {
  const position = new THREE.Vector3();
  let yaw = 0, pitch = -0.05, bob = 0, rear = 0, rearTarget = 0, speedNow = 0;
  let locked = false;
  const input = { forward: 0, turn: 0, lookX: 0, lookY: 0, run: false };

  const whiskers = new THREE.Group();
  camera.add(whiskers);
  const whiskerMat = new THREE.MeshBasicMaterial({ color: '#f4efe6', transparent: true, opacity: 0.28, depthTest: false });
  const sides = [];
  for (const sign of [-1, 1]) {
    const side = new THREE.Group(); side.position.set(sign * 0.035, -0.062, -0.1); whiskers.add(side);
    const list = [];
    for (let i = 0; i < 6; i++) {
      const len = 0.11 + i * 0.022, droop = -0.012 - i * 0.008;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(sign * len * 0.5, droop * 0.3 + (i - 2.5) * 0.006, -len * 0.25),
        new THREE.Vector3(sign * len, droop + (i - 2.5) * 0.016, -len * 0.15 + i * 0.01));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.00045 + (5 - i) * 0.00005, 3), whiskerMat);
      m.renderOrder = 10; side.add(m); list.push(m);
    }
    sides.push({ sign, side, list });
  }

  function place(p, heading) { position.copy(p); yaw = heading; pitch = -0.05; }

  /**
   * Move with collision. `collide(pos, r)` pushes out of walls; `probe` gives whisker
   * clearance. `vigor` scales speed and is 1 by default.
   */
  function update(dt, t, { collide, probe, vigor = 1, frozen = false } = {}) {
    if (!frozen) {
      const turnRate = 2.4;
      yaw -= input.turn * turnRate * dt;
      yaw -= input.lookX; pitch -= input.lookY;
      input.lookX = input.lookY = 0;
      pitch = THREE.MathUtils.clamp(pitch, -0.9, 1.15);
      const target = input.forward * (input.run ? 5.2 : 3.1) * vigor;
      speedNow += (target - speedNow) * Math.min(1, dt * (target ? 9 : 14));
      if (Math.abs(speedNow) > 0.01) {
        position.x -= Math.sin(yaw) * speedNow * dt;
        position.z -= Math.cos(yaw) * speedNow * dt;
        if (collide) collide(position, RADIUS);
      }
    } else speedNow *= Math.exp(-dt * 10);
    bob += Math.abs(speedNow) * dt * 5.2;
    rear += (rearTarget - rear) * Math.min(1, dt * (rearTarget > rear ? 14 : 6));
    camera.position.set(position.x, EYE + Math.sin(bob * 2) * 0.012 * Math.min(1, Math.abs(speedNow)) + rear * 0.42, position.z);
    camera.rotation.set(pitch + rear * 0.45, yaw, Math.sin(bob) * 0.012, 'YXZ');

    const clearance = probe ? probe(position, yaw) : { left: 1, right: 1 };
    const exploring = Math.abs(speedNow) > 0.2 ? 1 : 0.45;
    for (const s of sides) {
      const near = s.sign < 0 ? clearance.left : clearance.right;
      const whisk = Math.sin(t * Math.PI * 2 * 8 + (s.sign > 0 ? 0.3 : 0)) * 0.2 * exploring;
      s.side.rotation.y = s.sign * (-(1 - near) * 0.7 + whisk - 0.05);
      s.side.rotation.x = rear * -0.4;
    }
  }

  return {
    position, input, place, update,
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v) { pitch = v; },
    get speed() { return speedNow; },
    get locked() { return locked; }, set locked(v) { locked = v; },
    rearUp(on) { rearTarget = on ? 1 : 0; },
    whiskers,
    forward: () => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
  };
}
