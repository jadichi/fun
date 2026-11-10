// Data centres as a city of light seen at night: wireframe halls, roof lights, cooling
// towers with beacons. Colours are neutral so scenes can tint them (blue -> amber).
import * as THREE from 'three';
import { makePoints, makeLines, glow } from './gfx.js';
import { rng } from './util.js';

export function makeCity({ seed = 9, nx = 30, nz = 46, cell = 3.4, fog = 0.016 } = {}) {
  const r = rng(seed);
  const lp = [], lc = [], pp = [], pc = [], ps = [];
  const box = (x, z, w, d, h, b) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const e = [[x0, 0, z0, x1, 0, z0], [x1, 0, z0, x1, 0, z1], [x1, 0, z1, x0, 0, z1], [x0, 0, z1, x0, 0, z0],
      [x0, h, z0, x1, h, z0], [x1, h, z0, x1, h, z1], [x1, h, z1, x0, h, z1], [x0, h, z1, x0, h, z0],
      [x0, 0, z0, x0, h, z0], [x1, 0, z0, x1, h, z0], [x1, 0, z1, x1, h, z1], [x0, 0, z1, x0, h, z1]];
    e.forEach((s, i) => { lp.push(...s); const k = b * (i >= 4 && i < 8 ? 1 : 0.45); lc.push(k, k, k, k, k, k); });
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const cx = (i - nx / 2 + 0.5) * cell, cz = -j * cell;
    // campuses: density varies smoothly so the city has districts and dark gaps
    const dens = 0.5 + 0.5 * Math.sin(i * 0.55 + 1.3) * Math.cos(j * 0.37 + 0.4) + 0.25 * Math.sin(i * 1.7 + j * 1.1);
    if (r() > 0.35 + dens * 0.6) continue;
    const big = r() > 0.82;
    const w = cell * (big ? 0.9 : r.range(0.55, 0.78)), d = cell * r.range(0.3, 0.46), h = r.range(0.22, 0.5) * (big ? 1.6 : 1);
    const b = r.range(0.5, 1);
    box(cx, cz, w, d, h, b);
    // roof units
    const n = big ? 7 : r.int(3, 5);
    for (let k = 0; k < n; k++) for (let m = 0; m < 2; m++) {
      pp.push(cx - w / 2 + (w * (k + 0.5)) / n, h + 0.02, cz + (m ? 0.25 : -0.25) * d);
      const q = r.range(0.5, 1) * b; pc.push(q, q, q); ps.push(r.range(0.05, 0.09));
    }
    if (r() > 0.86) { // cooling tower with beacon
      const tx = cx + r.range(-0.4, 0.4) * w, tz = cz + d * 0.8, th = r.range(1.2, 3.2);
      lp.push(tx, 0, tz, tx, th, tz); lc.push(0.25, 0.25, 0.25, 0.9, 0.9, 0.9);
      pp.push(tx, th, tz); pc.push(1.4, 1.4, 1.4); ps.push(0.2);
    }
  }
  // roads: faint dotted lines between the rows
  for (let j = 0; j < nz; j += 2) for (let x = -nx * cell * 0.5; x < nx * cell * 0.5; x += 0.55) {
    pp.push(x, 0, -j * cell + cell * 0.5); const q = 0.16; pc.push(q, q, q); ps.push(0.045);
  }
  const lines = makeLines({ pos: new Float32Array(lp), col: new Float32Array(lc) }, { fog, opacity: 0.55 });
  const points = makePoints({ pos: new Float32Array(pp), col: new Float32Array(pc), size: new Float32Array(ps) }, { fog, twinkle: 0.35, seed });
  const horizon = glow([1, 1, 1], 1, 0.35);
  horizon.scale.set(260, 16, 1);
  horizon.position.set(0, 2, -nz * cell * 0.95);
  const group = new THREE.Group();
  group.add(lines, points, horizon);
  const c = new THREE.Color();
  return {
    group, lines, points, horizon,
    setTint(col, k = 1) {
      c.setRGB(col[0] * k, col[1] * k, col[2] * k);
      lines.material.uniforms.uTint.value.copy(c);
      points.material.uniforms.uTint.value.copy(c);
      horizon.material.color.copy(c);
    },
    setOpacity(o) { lines.material.uniforms.uOpacity.value = 0.55 * o; points.material.uniforms.uOpacity.value = o; horizon.material.opacity = 0.2 * o; },
  };
}

// Exponential curve y = e^(k x) sampled as a polyline, in a box of the given size.
export function expCurve({ w = 14, h = 6.5, k = 4.2, n = 220, x0 = 0, x1 = 1 } = {}) {
  const pts = [];
  const f = (x) => (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push([(x - 0.5) * w, f(x) * h, 0, x]); }
  return { pts, f };
}
