// S03 · Test or real. A mind in front of two doors of light. Behind "TEST" almost nothing
// happens, behind "ECHT" the bar climbs past the halfway line.
import * as THREE from 'three';
import { orb, dust, glow, makeLines, quad, lightShaft, project, aim } from '../src/lib/gfx.js';
import { smooth, sat, lerp, PAL, easeInOut, easeOut } from '../src/lib/util.js';

export default function create() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  const FLOOR = -2.0, DH = 4.4, DW = 2.3;
  scene.add(dust({ count: 1300, box: [16, 7, 12], color: [0.4, 0.55, 0.85], size: 0.035, fog: 0.045, opacity: 0.5, seed: 8 }));

  const mind = orb({ color: PAL.blue, radius: 0.32, seed: 4 });
  mind.group.position.set(-5.0, 0.1, 1.2);
  scene.add(mind.group);

  const doors = [
    { key: 'test', x: -0.6, color: PAL.blue, value: 0.065, label: 'TEST', num: 6.5 },
    { key: 'real', x: 3.4, color: PAL.amber, value: 0.551, label: 'ECHT', num: 55.1 },
  ].map((d) => {
    const g = new THREE.Group();
    g.position.set(d.x, FLOOR, -1);
    const th = 0.05;
    const frame = [quad(th, DH, d.color), quad(th, DH, d.color), quad(DW + th, th, d.color)];
    frame[0].position.set(-DW / 2, DH / 2, 0); frame[1].position.set(DW / 2, DH / 2, 0); frame[2].position.set(0, DH, 0);
    const haze = glow(d.color, 1, 0.25); haze.scale.set(DW * 2.6, DH * 1.5, 1); haze.position.set(0, DH / 2, -0.6);
    const fill = quad(DW - 0.3, 1, d.color, 0.9); // the bar
    const spill = glow(d.color, 1, 0.3); spill.scale.set(DW * 2.4, 1.0, 1); spill.position.set(0, 0.02, 0.9); spill.material.rotation = 0;
    const half = quad(DW + 0.5, 0.012, [1, 1, 1], 0.22); half.position.set(0, DH * 0.5, 0.01);
    const shaft = lightShaft({ color: d.color, height: 9, radius: 2.6, top: DW * 0.4, opacity: 0.13 });
    shaft.rotation.x = -Math.PI / 2 + 0.16; shaft.position.set(0, DH * 0.5, -0.2);
    g.add(haze, shaft, fill, spill, half, ...frame);
    scene.add(g);
    return { ...d, g, frame, haze, fill, spill, shaft };
  });
  const gaze = makeLines({ pos: new Float32Array(12) }, { fog: 0, opacity: 0.3 });
  scene.add(gaze);
  const grid = [];
  for (let gx = -12; gx <= 16; gx += 1.4) grid.push(gx, FLOOR, -8, gx, FLOOR, 6);
  for (let gz = -8; gz <= 6; gz += 1.4) grid.push(-12, FLOOR, gz, 16, FLOOR, gz);
  const floor = makeLines({ pos: new Float32Array(grid) }, { fog: 0.06, opacity: 0.09 });
  floor.material.uniforms.uTint.value.setRGB(0.25, 0.45, 0.8);
  scene.add(floor);

  function update({ t, u, marks }) {
    const e = easeInOut(u);
    aim(camera, lerp(-1.6, -0.6, e), lerp(0.9, 0.7, e), lerp(14.6, 13.6, e), lerp(0.2, 0.5, e), 0.45, 0);
    const labels = [];
    const ask = smooth(1.0, 2.4, t);
    const tm = [marks.test, marks.real];
    doors.forEach((d, i) => {
      const open = smooth(1.2 + i * 1.3, 2.6 + i * 1.3, t);
      const p = easeOut(sat((t - tm[i] - 0.3) / 1.8));
      const h = Math.max(0.001, d.value * DH * p);
      d.fill.scale.set(1, h, 1); d.fill.position.set(0, h / 2, 0.02);
      d.fill.material.opacity = 0.5 * open;
      d.frame.forEach((f) => { f.material.opacity = open; });
      d.haze.material.opacity = 0.2 * open * (0.75 + 0.25 * Math.sin(t * 1.3 + i));
      d.spill.material.opacity = 0.3 * open;
      d.shaft.material.uniforms.uOpacity.value = 0.12 * open;
      const top = project(d.x, FLOOR + DH + 0.55, -1, camera);
      labels.push({ text: d.label, x: top.x, y: top.y, size: 40, weight: 800, spacing: 12, color: d.color, alpha: open });
      const side = project(d.x, FLOOR + Math.max(h, 0.3) + 0.45, -1, camera);
      const val = (d.num * p).toFixed(1).replace('.', ',') + ' %';
      const a = sat((t - tm[i] - 0.2) / 0.5);
      labels.push({ text: val, x: side.x, y: side.y, size: 64, weight: 800, spacing: 0, color: [1, 1, 1], alpha: a, glow: 22 });
      const sub = project(d.x, FLOOR - 0.5, -1, camera);
      labels.push({ text: i ? 'HÄLT DIE LAGE FÜR ECHT' : 'HÄLT DIE LAGE FÜR EINEN TEST', x: sub.x, y: sub.y, size: 17, weight: 600, spacing: 3.5, color: d.color, alpha: a * 0.9, glow: 6 });
    });
    // the mind looks from one door to the other
    const mp = mind.group.position;
    mind.set(PAL.blue, smooth(0, 1.2, t) * (1 + 0.06 * Math.sin(t * 2.2)), t);
    const gp = gaze.geometry.attributes.position;
    doors.forEach((d, i) => { gp.setXYZ(i * 2, mp.x, mp.y, mp.z); gp.setXYZ(i * 2 + 1, d.x, FLOOR + DH * 0.5, -1); });
    gp.needsUpdate = true;
    gaze.material.uniforms.uOpacity.value = 0.22 * ask;
    gaze.material.uniforms.uTint.value.setRGB(...PAL.ice);
    return { labels, bloom: { strength: 0.95, radius: 0.7, threshold: 0.1 } };
  }
  return { scene, camera, update };
}
