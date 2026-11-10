// S09 · Chapter 4, the net. It has closed around the globe. The camera races along the
// lines; blue is almost gone, red moves in.
import * as THREE from 'three';
import { dust, aim } from '../src/lib/gfx.js';
import { makeGlobe, makeNet } from '../src/lib/globe.js';
import { smooth, sat, lerp, PAL, easeInOut, easeIn, heatColor } from '../src/lib/util.js';

export default function create({ land, def }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.05, 400);
  const R = 5;
  const world = new THREE.Group();
  scene.add(world);
  const globe = makeGlobe({ land, radius: R, color: [0.3, 0.5, 0.9], count: 60000, size: 0.045 });
  const net = makeNet({ landPts: globe.landPts, origins: [[39, -98], [34, 108]], hubs: 330, extra: 620, radius: R, colors: [heatColor(0.7), heatColor(0.95)], seed: 8, lift: 0.3 });
  world.add(globe.group, net.group);
  scene.add(dust({ count: 1800, box: [30, 16, 30], color: [0.8, 0.35, 0.25], size: 0.045, fog: 0.012, opacity: 0.55, seed: 33 }));

  function update({ t, u, marks, dur }) {
    net.setReveal(0.55 + 0.47 * easeInOut(sat(t / (dur * 0.8))));
    const red = smooth(0, dur * 0.85, t);
    // land dots lose their blue
    globe.dots.material.uniforms.uTint.value.setRGB(lerp(1.2, 1.9, red), lerp(1.2, 0.5, red), lerp(1.2, 0.22, red));
    globe.atmo.material.uniforms.uOpacity.value = 0.12;
    globe.atmo.material.uniforms.uColor.value.setRGB(...heatColor(lerp(0.6, 1, red)));
    net.lines.material.uniforms.uOpacity.value = 0.45 + 0.25 * red;
    // camera: low, fast orbit that keeps accelerating
    const ang = 0.5 + t * 0.09 + 0.012 * t * t;
    const h = lerp(12.5, 9.2, easeInOut(u)) + 0.25 * Math.sin(t * 0.6);
    const tilt = 0.45 + 0.2 * Math.sin(t * 0.23);
    const px = Math.cos(ang) * h, pz = Math.sin(ang) * h, py = Math.sin(tilt) * 2.6;
    // look ahead along the orbit, at the horizon of the globe
    const la = ang + 0.55;
    aim(camera, px, py, pz, Math.cos(la) * R * 0.42, py * 0.2, Math.sin(la) * R * 0.42);
    camera.rotation.z += 0.12;
    world.rotation.y = t * 0.02;
    return { bloom: { strength: 0.8, radius: 0.65, threshold: 0.2 }, ca: 1.3 };
  }
  return { scene, camera, update };
}
