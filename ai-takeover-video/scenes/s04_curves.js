// S04 · The curves. A neural net grows along an exponential curve; the camera pulls out and
// the nodes turn out to be data centres: a city of light at night.
import * as THREE from 'three';
import { makePoints, makeLines, dust, glow, aim, project } from '../src/lib/gfx.js';
import { makeCity, expCurve } from '../src/lib/city.js';
import { rng, smooth, sat, lerp, PAL, easeInOut, easeOut } from '../src/lib/util.js';

export default function create() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 400);
  const r = rng(404);

  // --- A: curve + growing net ---------------------------------------------------------------
  const A = new THREE.Group();
  scene.add(A);
  const { pts, f } = expCurve({ w: 15, h: 6.4, k: 4.4 });
  const cp = [], cb = [];
  for (let i = 0; i < pts.length - 1; i++) { cp.push(pts[i][0], pts[i][1] - 2.6, 0, pts[i + 1][0], pts[i + 1][1] - 2.6, 0); cb.push(pts[i][3], pts[i + 1][3]); }
  const curve = makeLines({ pos: new Float32Array(cp), birth: new Float32Array(cb) }, { fog: 0, opacity: 1, revealSoft: 0.01 });
  curve.material.uniforms.uTint.value.setRGB(0.75, 0.88, 1);
  A.add(curve);
  // axes
  const axes = makeLines({ pos: new Float32Array([-7.5, -2.6, 0, 7.9, -2.6, 0, -7.5, -2.6, 0, -7.5, 4.2, 0]) }, { fog: 0, opacity: 0.22 });
  axes.material.uniforms.uTint.value.setRGB(...PAL.blue);
  A.add(axes);
  // net: clusters hang on the curve, each larger than the last
  const np = [], nc = [], ns = [], nb = [], ep = [], ec = [], eb = [];
  const STEPS = 15;
  for (let s = 0; s < STEPS; s++) {
    const x = 0.06 + (s / (STEPS - 1)) * 0.92, y = f(x) * 6.4 - 2.6, wx = (x - 0.5) * 15;
    const n = Math.round(4 + 150 * f(x) + s * 2), rad = 0.25 + 1.9 * Math.pow(f(x), 0.7);
    const local = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, b = Math.acos(r() * 2 - 1), rr = rad * Math.cbrt(r());
      const p = [wx + rr * Math.sin(b) * Math.cos(a), y + rr * Math.cos(b) * 0.9, rr * Math.sin(b) * Math.sin(a)];
      local.push(p);
      np.push(...p); const k = r.range(0.45, 1); nc.push(k, k, k); ns.push(i === 0 ? 0.2 : r.range(0.05, 0.11)); nb.push(x + r() * 0.02);
      if (i > 0) {
        // connect to the nearest of a few earlier nodes: short, local edges
        let best = 0, bd = 1e9;
        for (let q = 0; q < 5; q++) { const j = r.int(0, i - 1), d = Math.hypot(p[0] - local[j][0], p[1] - local[j][1], p[2] - local[j][2]); if (d < bd) { bd = d; best = j; } }
        ep.push(...p, ...local[best]); ec.push(0.6, 0.6, 0.6, 0.6, 0.6, 0.6); eb.push(x + 0.02, x + 0.02);
      }
    }
  }
  const nodes = makePoints({ pos: new Float32Array(np), col: new Float32Array(nc), size: new Float32Array(ns), birth: new Float32Array(nb) }, { fog: 0.012, twinkle: 0.4, revealSoft: 0.03 });
  const edges = makeLines({ pos: new Float32Array(ep), col: new Float32Array(ec), birth: new Float32Array(eb) }, { fog: 0.012, opacity: 0.2, revealSoft: 0.03 });
  A.add(edges, nodes);
  const head = glow([0.8, 0.9, 1], 0.9, 1);
  A.add(head);
  // flaws that light up when the vulnerabilities are mentioned
  const fp = [], fb = [];
  for (let i = 0; i < 260; i++) { const j = r.int(0, np.length / 3 - 1); fp.push(np[j * 3], np[j * 3 + 1], np[j * 3 + 2]); fb.push(r()); }
  const flaws = makePoints({ pos: new Float32Array(fp), birth: new Float32Array(fb), size: new Float32Array(260).fill(0.13) }, { fog: 0, twinkle: 0.9, revealSoft: 0.04 });
  flaws.material.uniforms.uTint.value.setRGB(...PAL.amber);
  A.add(flaws);
  A.add(dust({ count: 1200, box: [18, 9, 10], color: [0.4, 0.55, 0.9], size: 0.035, fog: 0.04, opacity: 0.45, seed: 2 }));

  // --- B: the city ---------------------------------------------------------------------------
  const city = makeCity({ seed: 9 });
  city.group.position.set(0, -60, 0);
  scene.add(city.group);

  function update({ t, u, marks, dur }) {
    const tc = marks.city;
    const grow = easeInOut(sat((t - 0.8) / (marks.vuln - 0.8))) * 1.02;
    const toCity = easeInOut(sat((t - tc) / 2.6));
    for (const o of [curve, nodes, edges]) o.material.uniforms.uReveal.value = grow;
    const tint = [lerp(PAL.blue[0], 0.8, 0.25), lerp(PAL.blue[1], 0.85, 0.25), 1];
    nodes.material.uniforms.uTint.value.setRGB(...tint);
    edges.material.uniforms.uTint.value.setRGB(...PAL.blue);
    const fa = 1 - toCity;
    nodes.material.uniforms.uOpacity.value = fa;
    edges.material.uniforms.uOpacity.value = 0.2 * fa;
    curve.material.uniforms.uOpacity.value = fa;
    axes.material.uniforms.uOpacity.value = 0.22 * fa;
    flaws.material.uniforms.uReveal.value = sat((t - marks.vuln) / 2.2);
    flaws.material.uniforms.uOpacity.value = fa * smooth(marks.vuln, marks.vuln + 0.3, t);
    const gx = Math.min(1, grow), hx = (gx - 0.5) * 15, hy = f(gx) * 6.4 - 2.6;
    head.position.set(hx, hy, 0);
    head.material.opacity = fa * (grow < 1 ? 1 : 0.6);

    city.setTint(PAL.blue, 1);
    city.setOpacity(Math.pow(toCity, 0.45));

    // camera: follow the head of the curve, then drop into the city
    const follow = easeInOut(sat(t / (marks.vuln + 2)));
    const ax = lerp(-4.5, 3.4, follow), ay = lerp(-0.6, 1.6, follow), az = lerp(11.5, 18.5, follow);
    const lx = lerp(-3.4, 3.0, follow), ly = lerp(-1.0, 1.9, follow);
    const drift = (t - tc) * 0.5;
    const bx = 0, by = -60 + 7.5 - drift * 0.05, bz = 16 - drift;
    aim(camera, lerp(ax, bx, toCity), lerp(ay, by, toCity), lerp(az, bz, toCity),
      lerp(lx, 0, toCity), lerp(ly, -60 + 1.2, toCity), lerp(0, -22 - drift, toCity));
    return { bloom: { strength: lerp(0.95, 1.05, toCity), radius: 0.7, threshold: 0.1 } };
  }
  return { scene, camera, update };
}
