// S11 · Back to TODAY. Hard cut to black, then the cool blue returns: the globe without any
// net, calm, a slow camera. At the end only the clock and the question remain.
import * as THREE from 'three';
import { dust, aim } from '../src/lib/gfx.js';
import { makeGlobe } from '../src/lib/globe.js';
import { smooth, sat, lerp, PAL, easeInOut } from '../src/lib/util.js';

export default function create({ land }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 400);
  const R = 5;
  const world = new THREE.Group();
  scene.add(world);
  const globe = makeGlobe({ land, radius: R, color: PAL.blue, count: 60000, size: 0.05 });
  world.add(globe.group);
  scene.add(dust({ count: 1600, box: [34, 18, 30], color: [0.4, 0.6, 1], size: 0.045, fog: 0.012, opacity: 0.5, seed: 41 }));

  function update({ t, u, marks, dur }) {
    const back = smooth(marks.back, marks.back + 2.6, t);
    world.rotation.y = 0.6 + t * 0.028;
    world.rotation.x = 0.3;
    const e = easeInOut(u);
    aim(camera, lerp(-3.4, -4.6, e), lerp(1.4, 0.7, e), lerp(25, 22, e), lerp(-5.6, -6.4, e), 1.6, 0);
    // the globe steps back for the statement and almost disappears for the final question
    const st = smooth(marks.statement - 0.6, marks.statement + 0.8, t);
    const qu = smooth(marks.question - 0.3, marks.question + 1.4, t);
    const exposure = back * lerp(lerp(1, 0.3, st), 0.14, qu);
    return { exposure, chrome: t > marks.back + 0.3 && t < marks.question, bloom: { strength: 0.9, radius: 0.7, threshold: 0.12 }, grain: 0.06 };
  }
  return { scene, camera, update };
}
