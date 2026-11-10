// S08 · Chapter 3, the race. Two nets spread over the globe from two points. Then ten
// lights around a table: six turn red, four stay blue.
import * as THREE from 'three';
import { glow, dust, makeLines, aim, project } from '../src/lib/gfx.js';
import { makeGlobe, makeNet, latLon } from '../src/lib/globe.js';
import { rng, smooth, sat, lerp, PAL, easeInOut, easeOut, heatColor } from '../src/lib/util.js';

export default function create({ land, def }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 400);
  const R = 5;
  const world = new THREE.Group();
  scene.add(world);
  const globe = makeGlobe({ land, radius: R, color: [0.26, 0.42, 0.72] });
  const net = makeNet({ landPts: globe.landPts, origins: [[39, -98], [34, 108]], hubs: 170, extra: 150, radius: R, colors: [heatColor(0.52), heatColor(0.78)], seed: 8 });
  world.add(globe.group, net.group);
  scene.add(dust({ count: 1500, box: [34, 18, 30], color: [0.6, 0.5, 0.45], size: 0.05, fog: 0.012, opacity: 0.5, seed: 31 }));
  // the safety team: one blue light that calls out
  const alarmPos = latLon(47, -30, R * 1.02);
  const alarm = glow(PAL.blue, 0.32, 0), alarmRing = glow(PAL.blue, 1, 0);
  world.add(alarm, alarmRing);
  alarm.position.copy(alarmPos); alarmRing.position.copy(alarmPos);

  // --- the council -----------------------------------------------------------------------------
  const council = new THREE.Group();
  council.position.set(0, -30, 0);
  scene.add(council);
  const seats = [];
  const TR = 3.4;
  const tp = [];
  for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2, b = ((i + 1) / 96) * Math.PI * 2; tp.push(Math.cos(a) * TR * 0.72, 0, Math.sin(a) * TR * 0.72 * 0.8, Math.cos(b) * TR * 0.72, 0, Math.sin(b) * TR * 0.72 * 0.8); }
  const table = makeLines({ pos: new Float32Array(tp) }, { fog: 0, opacity: 0.5 });
  council.add(table);
  const votes = [1, 1, 0, 1, 1, 0, 1, 0, 1, 0]; // six continue, four stop
  const flipOrder = [0, 3, 6, 1, 8, 4];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const p = [Math.cos(a) * TR, 0.35, Math.sin(a) * TR * 0.8];
    const core = glow([1, 1, 1], 0.24, 0), halo = glow(PAL.blue, 1.0, 0), refl = glow(PAL.blue, 1, 0);
    core.position.set(...p); halo.position.set(...p); refl.position.set(p[0] * 0.86, 0.01, p[2] * 0.86); refl.scale.set(1.5, 0.22, 1);
    council.add(halo, core, refl);
    seats.push({ core, halo, refl, vote: votes[i], order: flipOrder.indexOf(i) });
  }
  const c = new THREE.Color();

  function update({ t, u, marks }) {
    const toVote = easeInOut(sat((t - marks.vote + 0.5) / 1.3));
    const away = easeInOut(sat((t - marks.away) / 3.0));
    // globe
    world.rotation.y = -1.9 + t * 0.045;
    world.rotation.x = 0.28;
    const reveal = 0.02 + 0.62 * easeInOut(sat(t / marks.vote)) + 0.3 * away;
    net.setReveal(reveal);
    globe.dots.material.uniforms.uTint.value.setRGB(1, 1, 1);
    const al = smooth(marks.alarm, marks.alarm + 0.4, t) * (1 - smooth(marks.vote - 0.6, marks.vote + 0.4, t));
    const ph = ((t - marks.alarm) * 1.3) % 1;
    alarm.material.opacity = al; alarmRing.material.opacity = al * (1 - ph) * 0.35; alarmRing.scale.setScalar(0.3 + ph * 1.6);

    // council
    const res = marks.result;
    seats.forEach((s) => {
      const on = smooth(marks.vote - 0.2, marks.vote + 0.8, t);
      const f = s.vote ? smooth(res + s.order * 0.16, res + s.order * 0.16 + 0.3, t) : 0;
      const col = [lerp(PAL.ice[0], 1.0, f), lerp(PAL.ice[1], 0.14, f), lerp(PAL.ice[2], 0.08, f)];
      const stay = s.vote ? 1 : lerp(1, 0.9, smooth(res, res + 1, t));
      c.setRGB(...(s.vote ? col : [lerp(PAL.ice[0], PAL.blue[0], smooth(res, res + 1, t)), lerp(PAL.ice[1], PAL.blue[1], smooth(res, res + 1, t)), 1]));
      s.halo.material.color.copy(c); s.refl.material.color.copy(c);
      s.core.material.opacity = on; s.halo.material.opacity = 0.4 * on * stay * (1 + 0.3 * f); s.refl.material.opacity = 0.3 * on;
      s.halo.scale.setScalar(0.95 + 0.4 * f);
    });
    table.material.uniforms.uOpacity.value = 0.45 * smooth(marks.vote - 0.3, marks.vote + 0.6, t);
    table.material.uniforms.uTint.value.setRGB(0.6, 0.7, 0.9);

    // camera: orbit the globe, drop to the table, then rise so the globe looms over it
    const e = easeInOut(sat(t / marks.vote));
    const gx = lerp(-4.6, -3.0, e), gy = lerp(2.4, 1.8, e), gz = lerp(25, 22, e);
    const cy = -30 + lerp(5.0, 6.6, away), cz = lerp(11.5, 14.5, away);
    aim(camera, lerp(gx, 0, toVote), lerp(gy, cy, toVote), lerp(gz, cz, toVote),
      lerp(-2.4, -1.9, toVote), lerp(1.3, -30 + lerp(0.2, 5.5, away), toVote), 0);
    // while the council votes, the globe hangs above it, dim until "woanders"
    world.position.set(0, lerp(0, -30 + 13.5, toVote), lerp(0, -16, toVote));
    const dim = lerp(1, 0.12 + 0.88 * away, toVote);
    globe.dots.material.uniforms.uOpacity.value = dim;
    globe.atmo.material.uniforms.uOpacity.value = 0.3 * dim;
    net.lines.material.uniforms.uOpacity.value = 0.75 * dim;
    net.hubs.material.uniforms.uOpacity.value = dim;
    return { bloom: { strength: 0.8, radius: 0.65, threshold: 0.16 } };
  }
  return { scene, camera, update };
}
