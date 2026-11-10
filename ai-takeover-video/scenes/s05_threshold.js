// S05 · The threshold. The camera rests above the city of light. The measured curve ends,
// a dashed extrapolation runs on into the dark, and the colour tips from blue to amber.
import * as THREE from 'three';
import { makeLines, glow, aim, project } from '../src/lib/gfx.js';
import { makeCity } from '../src/lib/city.js';
import { smooth, sat, lerp, PAL, easeInOut, heatColor } from '../src/lib/util.js';

export default function create() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 400);
  const city = makeCity({ seed: 9 });
  scene.add(city.group);

  // curve in the sky: solid = measured, dashed = extrapolated
  const N = 260, sp = [], sb = [], dp = [], db = [];
  const P = (s) => { const x = lerp(-36, 22, s), y = 2.2 + 30 * (Math.exp(3.6 * s) - 1) / (Math.exp(3.6) - 1); return [x, y, -70]; };
  const SPLIT = 0.56;
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N, a = P(s0), b = P(s1);
    if (s1 <= SPLIT) { sp.push(...a, ...b); sb.push(s0, s1); }
    else if (i % 4 < 2) { dp.push(...a, ...b); db.push(s0, s1); }
  }
  const solid = makeLines({ pos: new Float32Array(sp), birth: new Float32Array(sb) }, { fog: 0, opacity: 1 });
  const dashed = makeLines({ pos: new Float32Array(dp), birth: new Float32Array(db) }, { fog: 0, opacity: 1, revealSoft: 0.01 });
  const knee = glow([1, 1, 1], 3.2, 1);
  knee.position.set(...P(SPLIT));
  scene.add(solid, dashed, knee);

  function update({ t, u, marks }) {
    const turn = smooth(marks.turn, marks.turn + 2.2, t);
    const col = heatColor(lerp(0, 0.5, turn));
    city.setTint(col, 1);
    city.setOpacity(1);
    solid.material.uniforms.uTint.value.setRGB(...PAL.ice);
    dashed.material.uniforms.uTint.value.setRGB(...heatColor(0.55));
    dashed.material.uniforms.uReveal.value = SPLIT + (1 - SPLIT) * easeInOut(sat((t - marks.turn - 0.4) / 5.5));
    knee.material.color.setRGB(...col);
    knee.material.opacity = 0.75 + 0.25 * Math.sin(t * 3);
    const d = (33 + t) * 0.5; // continues the drift of S04
    aim(camera, 0, 7.5 - d * 0.05 + t * 0.12, 16 - d - t * 0.05, 0, 1.2 + turn * 4.5, -22 - d - 10);
    const k = project(...P(SPLIT), camera);
    const labels = [
      { text: 'BELEGT', x: k.x - 0.09, y: k.y + 0.06, size: 19, weight: 700, spacing: 5, color: PAL.ice, alpha: smooth(0.6, 1.4, t) * 0.9, glow: 8 },
      { text: 'EXTRAPOLATION', x: k.x + 0.115, y: k.y - 0.105, size: 19, weight: 700, spacing: 5, color: heatColor(0.5), alpha: smooth(marks.turn + 1.4, marks.turn + 2.4, t), glow: 10 },
    ];
    return { labels, bloom: { strength: 1.05, radius: 0.7, threshold: 0.1 } };
  }
  return { scene, camera, update };
}
