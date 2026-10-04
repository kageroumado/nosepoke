import * as THREE from '../vendor/three/three.module.min.js';

/** Deterministic value noise so every surface looks the same on every visit. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Scuffed pale plastic, the maze walls. */
export function wallTexture() {
  return canvasTexture(256, (g, n) => {
    const r = rng(7);
    g.fillStyle = '#d9d2c3'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '120,110,95' : '255,250,240'},${r() * 0.06})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3);
    }
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(90,80,70,${0.04 + r() * 0.07})`; g.lineWidth = 0.6;
      const x = r() * n, y = r() * n * 0.4 + n * 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 8); g.stroke();
    }
    const grad = g.createLinearGradient(0, n, 0, n * 0.7);
    grad.addColorStop(0, 'rgba(80,70,60,0.22)'); grad.addColorStop(1, 'rgba(80,70,60,0)');
    g.fillStyle = grad; g.fillRect(0, n * 0.7, n, n * 0.3);
  });
}

/** Grey floor with shavings and grit. */
export function floorTexture() {
  return canvasTexture(512, (g, n) => {
    const r = rng(11);
    g.fillStyle = '#6f746f'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 5000; i++) {
      const v = 80 + r() * 60;
      g.fillStyle = `rgba(${v},${v + 4},${v},${r() * 0.25})`;
      g.fillRect(r() * n, r() * n, 1, 1);
    }
    for (let i = 0; i < 90; i++) {
      g.save(); g.translate(r() * n, r() * n); g.rotate(r() * Math.PI);
      g.fillStyle = `rgba(${200 + r() * 40},${170 + r() * 30},${120 + r() * 20},${0.5 + r() * 0.4})`;
      g.fillRect(-3 - r() * 5, -1, 6 + r() * 10, 1.5 + r() * 2);
      g.restore();
    }
  }, { repeat: 1 });
}

/** Yellow-black hazard tape with lettering. */
export function tapeTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8c34a'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#1d1d1b';
  for (let x = -64; x < 512; x += 48) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 20, 64); g.lineTo(x + 44, 0); g.lineTo(x + 24, 0); g.fill(); }
  g.fillStyle = '#e8c34a'; g.fillRect(96, 12, 320, 40);
  g.fillStyle = '#1d1d1b'; g.font = 'bold 30px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('DO NOT ENTER', 256, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** The label on the pillar between two doors. */
export function plaqueTexture(title, code) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f1ede2'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#8b8577'; g.lineWidth = 3; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#2b2b28'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 40px ui-monospace, Menlo, monospace'; g.fillText(title, 128, code ? 44 : 64);
  if (code) { g.font = '26px ui-monospace, Menlo, monospace'; g.fillStyle = '#6a4b2c'; g.fillText(code, 128, 90); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** A soft round sprite for dust and leaves. */
export function softDot() {
  return canvasTexture(64, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, n, n);
  });
}

/** Soil and moss for the garden floor. */
export function soilTexture() {
  return canvasTexture(512, (g, n) => {
    const r = rng(5);
    g.fillStyle = '#4f5a37'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 7000; i++) {
      const green = r() < 0.6;
      g.fillStyle = green ? `rgba(${90 + r() * 50},${120 + r() * 50},${60 + r() * 20},${r() * 0.4})` : `rgba(${80 + r() * 40},${60 + r() * 30},${40},${r() * 0.4})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
    }
  });
}
