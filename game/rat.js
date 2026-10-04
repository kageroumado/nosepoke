import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

const assetURL = new URL('../assets/3d/rat.gltf', import.meta.url);
const loader = new GLTFLoader();
let asset;
const actions = new Set(['idle', 'walk', 'groom', 'scratch', 'sleep', 'sniff']);

function approach(value, target, amount) {
  return value + (target - value) * Math.min(1, amount);
}

function pivot(root, name) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Rat asset is missing ${name}`);
  return node;
}

/** Load a poseable rat. Its ground origin faces +Z in Three.js coordinates. */
export async function createRat({ hooded = false } = {}) {
  const gltf = await (asset ??= loader.loadAsync(assetURL.href).catch(error => {
    asset = undefined;
    throw error;
  }));
  const model = gltf.scene.clone(true);
  const root = new THREE.Group();
  root.name = 'Rat';
  root.add(model);

  const materialCopies = new Map();
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const copy = (mat) => {
      if (!materialCopies.has(mat)) {
        const cloned = mat.clone();
        if (cloned.name === 'HoodFur' && hooded) cloned.color.set(0x54413c);
        materialCopies.set(mat, cloned);
      }
      return materialCopies.get(mat);
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(copy)
      : copy(node.material);
  });

  const head = pivot(root, 'HeadPivot');
  const ears = ['EarPivot_L', 'EarPivot_R'].map((name) => pivot(root, name));
  const fronts = ['FrontFootPivot_L', 'FrontFootPivot_R'].map((name) => pivot(root, name));
  const hinds = ['HindFootPivot_L', 'HindFootPivot_R'].map((name) => pivot(root, name));
  const tail = Array.from({ length: 6 }, (_, i) => pivot(root, `TailPivot_${i}`));
  const tailSkin = pivot(root, 'TailSkin');
  const tailSteps = 28;
  const tailSides = 10;
  const tailStride = tailSides + 1;
  const tailPositions = new Float32Array((tailSteps + 1) * tailStride * 3);
  const tailUVs = new Float32Array((tailSteps + 1) * tailStride * 2);
  const tailIndices = [];
  for (let i = 0; i <= tailSteps; i++) {
    for (let j = 0; j <= tailSides; j++) {
      const k = (i * tailStride + j) * 2;
      tailUVs[k] = j / tailSides;
      tailUVs[k + 1] = i / tailSteps;
    }
  }
  for (let i = 0; i < tailSteps; i++) {
    for (let j = 0; j < tailSides; j++) {
      const a = i * tailStride + j;
      const b = a + 1;
      tailIndices.push(a, b, b + tailStride, a, b + tailStride, a + tailStride);
    }
  }
  const tailGeometry = new THREE.BufferGeometry();
  tailGeometry.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
  tailGeometry.setAttribute('uv', new THREE.BufferAttribute(tailUVs, 2));
  tailGeometry.setIndex(tailIndices);
  tailSkin.geometry = tailGeometry;
  const tailCenter = new THREE.Vector3();
  const tailTangent = new THREE.Vector3();
  const tailNormal = new THREE.Vector3();
  const tailBinormal = new THREE.Vector3();
  const tailPoint = new THREE.Vector3();

  function updateTailSkin() {
    tail[0].updateWorldMatrix(true, true);
    const points = tail.map((joint) => {
      joint.getWorldPosition(tailPoint);
      return tail[0].worldToLocal(tailPoint.clone());
    });
    const tip = tail[5].localToWorld(new THREE.Vector3(0, -0.20, 0));
    points.push(tail[0].worldToLocal(tip));
    const curve = new THREE.CatmullRomCurve3(points);
    for (let i = 0; i <= tailSteps; i++) {
      const t = i / tailSteps;
      curve.getPoint(t, tailCenter);
      curve.getTangent(t, tailTangent).normalize();
      tailNormal.set(0, 0, 1).cross(tailTangent).normalize();
      tailBinormal.copy(tailTangent).cross(tailNormal).normalize();
      const radius = 0.044 * Math.pow(1 - t, 0.82) + 0.001;
      for (let j = 0; j <= tailSides; j++) {
        const angle = j * Math.PI * 2 / tailSides;
        const k = (i * tailStride + j) * 3;
        tailPositions[k] = tailCenter.x + radius * (Math.cos(angle) * tailNormal.x + Math.sin(angle) * tailBinormal.x);
        tailPositions[k + 1] = tailCenter.y + radius * (Math.cos(angle) * tailNormal.y + Math.sin(angle) * tailBinormal.y);
        tailPositions[k + 2] = tailCenter.z + radius * (Math.cos(angle) * tailNormal.z + Math.sin(angle) * tailBinormal.z);
      }
    }
    tailGeometry.attributes.position.needsUpdate = true;
    tailGeometry.computeVertexNormals();
    const normals = tailGeometry.attributes.normal;
    for (let i = 0; i <= tailSteps; i++) {
      const first = i * tailStride;
      const last = first + tailSides;
      tailNormal.fromBufferAttribute(normals, first);
      tailBinormal.fromBufferAttribute(normals, last);
      tailNormal.add(tailBinormal).normalize();
      normals.setXYZ(first, tailNormal.x, tailNormal.y, tailNormal.z);
      normals.setXYZ(last, tailNormal.x, tailNormal.y, tailNormal.z);
    }
    tailGeometry.computeBoundingSphere();
  }
  const body = pivot(root, 'RatRoot');
  const base = {
    head: head.rotation.clone(),
    ears: ears.map((p) => p.rotation.clone()),
    fronts: fronts.map((p) => p.rotation.clone()),
    hinds: hinds.map((p) => p.rotation.clone()),
    tail: tail.map((p) => p.rotation.clone()),
    body: body.position.clone(),
  };
  let time = 0;
  let currentAction = 'idle';

  function setAction(action) {
    if (!actions.has(action)) throw new RangeError(`Unknown rat action: ${action}`);
    if (action !== currentAction) {
      currentAction = action;
    }
  }

  function update(dt, { speed = 0, action = currentAction, energy = 0.5 } = {}) {
    setAction(action);
    const step = Math.max(0, Math.min(dt, 0.1));
    time += step;
    const blend = 1 - Math.pow(0.0001, step);
    const pulse = Math.sin(time * 3.1);
    const stride = Math.sin(time * (9 + Math.min(speed, 2) * 5));
    const walking = currentAction === 'walk' ? 1 : Math.min(1, Math.max(0, speed * 1.7));
    const restful = currentAction === 'sleep' ? 1 : 0;
    const grooming = currentAction === 'groom' ? 1 : 0;
    const scratching = currentAction === 'scratch' ? 1 : 0;
    const sniffing = currentAction === 'sniff' ? 1 : 0;
    const alertness = 0.4 + Math.max(0, Math.min(energy, 1)) * 0.6;
    const breathe = Math.sin(time * (restful ? 1.7 : 3.2)) * (restful ? 0.007 : 0.004);

    body.position.y = approach(body.position.y, base.body.y + breathe + walking * Math.abs(stride) * 0.008 - restful * 0.055, blend);
    head.rotation.x = approach(head.rotation.x, base.head.x + sniffing * (0.07 + 0.075 * Math.sin(time * 13)) + grooming * -0.14 + restful * 0.22 + alertness * pulse * 0.012, blend);
    head.rotation.y = approach(head.rotation.y, base.head.y + grooming * 0.08 * Math.sin(time * 8) + sniffing * 0.055 * Math.sin(time * 4), blend);
    head.rotation.z = approach(head.rotation.z, base.head.z + restful * 0.09, blend);

    for (let i = 0; i < 2; i++) {
      const opposite = i === 0 ? 1 : -1;
      fronts[i].rotation.x = approach(fronts[i].rotation.x,
        base.fronts[i].x + walking * opposite * stride * 0.48 + grooming * (i === 0 ? -1.03 - 0.12 * Math.sin(time * 11) : -0.45), blend);
      fronts[i].rotation.z = approach(fronts[i].rotation.z,
        base.fronts[i].z + grooming * (i === 0 ? 0.3 : -0.22), blend);
      hinds[i].rotation.x = approach(hinds[i].rotation.x,
        base.hinds[i].x - walking * opposite * stride * 0.38 + scratching * (i === 1 ? -0.55 - 0.2 * Math.sin(time * 17) : 0), blend);
      ears[i].rotation.z = approach(ears[i].rotation.z,
        base.ears[i].z + (i === 0 ? -1 : 1) * (restful * 0.25 + 0.018 * Math.sin(time * 2.7 + i)), blend);
    }
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.y = approach(tail[i].rotation.y,
        base.tail[i].y + Math.sin(time * (restful ? 1 : 2.3) - i * 0.55) * (restful ? 0.035 : 0.075), blend);
      tail[i].rotation.x = approach(tail[i].rotation.x,
        base.tail[i].x + (0.015 + 0.014 * Math.sin(time * 1.6 + i * 0.4)), blend);
    }
    updateTailSkin();
  }

  updateTailSkin();
  return { root, update, setAction };
}
