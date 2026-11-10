// S06 · Chapter 1, the agents. Code streams through halls of light; one agent becomes
// hundreds, and they all fly towards the thing they are building.
import * as THREE from 'three';
import { makePoints, makeLines, glow, dust, aim } from '../src/lib/gfx.js';
import { rng, smooth, sat, lerp, PAL, easeInOut, heatColor } from '../src/lib/util.js';

function codeTexture(seed) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
  const words = ['def', 'train', 'step', 'agent', 'return', 'loss', 'grad', 'eval', 'plan', 'task', 'for', 'in', 'if', 'await', 'run', 'model', 'next', 'build', 'merge', 'test', 'pass', 'spawn', 'copy', 'while', 'score', 'weights', 'update', 'self'];
  g.font = '500 17px "JetBrains Mono", monospace';
  for (let y = 22; y < 1024; y += 24) {
    let x = 8 + r.int(0, 4) * 26;
    if (r() > 0.88) continue;
    while (x < 1000) {
      const w = r() > 0.25 ? r.pick(words) : ['=', '(', ')', '{', '}', '+=', '->', '::', '0x' + r.int(16, 255).toString(16)][r.int(0, 8)];
      const b = r() > 0.9 ? 1 : r.range(0.25, 0.7);
      g.fillStyle = `rgba(255,255,255,${b})`;
      g.fillText(w, x, y);
      x += g.measureText(w).width + 11;
      if (r() > 0.93) break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export default function create({ def }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 400);
  const r = rng(606);
  const col = heatColor(def.heat);
  const LEN = 120, HALF = 4.2, HEIGHT = 7;

  const walls = [];
  for (const side of [-1, 1]) for (const mirror of [0, 1]) {
    const tex = codeTexture(side > 0 ? 3 : 5);
    tex.repeat.set(LEN / HEIGHT, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(LEN, HEIGHT), new THREE.ShaderMaterial({
      uniforms: { tMap: { value: tex }, uColor: { value: new THREE.Color(...col) }, uOffset: { value: new THREE.Vector2() }, uOpacity: { value: mirror ? 0.22 : 0.85 }, uRepeat: { value: new THREE.Vector2(LEN / HEIGHT, 1) } },
      vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D tMap; uniform vec3 uColor; uniform vec2 uOffset, uRepeat; uniform float uOpacity; varying vec2 vUv; varying float vD;
        void main(){ float a = texture2D(tMap, vUv*uRepeat + uOffset).r; float fog = exp(-0.028*vD); float edge = smoothstep(0.0, 0.12, vUv.y)*smoothstep(1.0, 0.8, vUv.y);
        gl_FragColor = vec4(uColor, a*fog*edge*uOpacity); }`,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    m.position.set(side * HALF, mirror ? -HEIGHT - 0.02 : 0, -LEN / 2 + 6);
    m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (mirror) m.scale.y = -1;
    scene.add(m);
    walls.push({ m, side, mirror });
  }
  // ceiling and floor light strips
  const strips = [];
  for (const x of [-HALF, HALF, -1.4, 1.4]) for (const y of [HEIGHT / 2, -HEIGHT / 2]) strips.push(x, y, 6, x, y, -LEN);
  const strip = makeLines({ pos: new Float32Array(strips) }, { fog: 0.03, opacity: 0.35 });
  strip.material.uniforms.uTint.value.setRGB(...col);
  scene.add(strip);
  for (let z = 0; z > -LEN; z -= 6) {
    const rib = makeLines({ pos: new Float32Array([-HALF, -HEIGHT / 2, z, -HALF, HEIGHT / 2, z, HALF, -HEIGHT / 2, z, HALF, HEIGHT / 2, z, -HALF, HEIGHT / 2, z, HALF, HEIGHT / 2, z]) }, { fog: 0.03, opacity: 0.22 });
    rib.material.uniforms.uTint.value.setRGB(...col);
    scene.add(rib);
  }

  // agents
  const N = 700;
  const base = [];
  for (let i = 0; i < N; i++) base.push({ x: i === 0 ? 0 : r.range(-3.2, 3.2), y: i === 0 ? -0.2 : r.range(-2.6, 2.6), z0: i === 0 ? 0 : r.range(0, 90), sp: r.range(5, 9), birth: i === 0 ? 0 : Math.pow(i / N, 0.55) });
  const pos = new Float32Array(N * 3), size = new Float32Array(N), birth = Float32Array.from(base, (b) => b.birth);
  const cols = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const k = r.range(0.7, 1.2); cols[i * 3] = lerp(col[0], 1, 0.45) * k; cols[i * 3 + 1] = lerp(col[1], 1, 0.45) * k; cols[i * 3 + 2] = lerp(col[2], 1, 0.45) * k; size[i] = i === 0 ? 0.42 : r.range(0.14, 0.26); }
  const agents = makePoints({ pos, col: cols, size, birth }, { fog: 0.022, twinkle: 0.3, revealSoft: 0.04 });
  scene.add(agents);
  // short motion trails
  const tr = new Float32Array(N * 6), trc = new Float32Array(N * 6), trb = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { trb[i * 2] = trb[i * 2 + 1] = base[i].birth; for (let k = 0; k < 2; k++) { trc[i * 6 + k * 3] = col[0] * (k ? 0 : 0.9); trc[i * 6 + k * 3 + 1] = col[1] * (k ? 0 : 0.9); trc[i * 6 + k * 3 + 2] = col[2] * (k ? 0 : 0.9); } }
  const trails = makeLines({ pos: tr, col: trc, birth: trb }, { fog: 0.022, opacity: 0.7, revealSoft: 0.04 });
  scene.add(trails);

  // what they are building: a brighter light at the end of the hall
  const target = glow([1, 0.82, 0.6], 10, 0), targetCore = glow([1, 1, 1], 2.4, 0);
  target.position.set(0, 0, -96); targetCore.position.set(0, 0, -96);
  scene.add(target, targetCore);
  scene.add(dust({ count: 900, box: [4, 3.4, 60], color: col, size: 0.03, fog: 0.03, opacity: 0.45, seed: 12 }));

  function update({ t, u, marks, dur }) {
    const cz = 4 - t * 1.5 - 9 * easeInOut(u) * u; // accelerating dolly
    const scroll = t * 0.07;
    walls.forEach((w) => { w.m.material.uniforms.uOffset.value.set(w.side * scroll * 0.4, (w.side > 0 ? 1 : -1) * scroll); });
    // population: one agent, then explosive growth after "Tausende Kopien"
    const grow = 0.012 + 0.2 * smooth(marks.multiply - 3.5, marks.multiply, t) + 0.8 * easeInOut(sat((t - marks.multiply) / 5));
    agents.material.uniforms.uReveal.value = grow;
    trails.material.uniforms.uReveal.value = grow;
    const pa = agents.geometry.attributes.position, ta = trails.geometry.attributes.position;
    for (let i = 0; i < N; i++) {
      const b = base[i];
      let z;
      if (i === 0) z = cz - 11 - 1.2 * Math.sin(t * 0.7);
      else z = cz - 4 - ((b.z0 + b.sp * t) % 86);
      const wob = 0.25 * Math.sin(t * 1.3 + i);
      pa.setXYZ(i, b.x + wob * 0.4, b.y + wob, z);
      ta.setXYZ(i * 2, b.x + wob * 0.4, b.y + wob, z);
      ta.setXYZ(i * 2 + 1, b.x + wob * 0.4, b.y + wob, z + 0.35 * b.sp);
    }
    pa.needsUpdate = true; ta.needsUpdate = true;
    const built = smooth(marks.build, marks.build + 5, t);
    target.position.z = targetCore.position.z = cz - 92;
    target.material.opacity = 0.15 + 0.6 * built; targetCore.material.opacity = 0.2 + 0.8 * built;
    target.scale.setScalar(8 + 9 * built + 0.6 * Math.sin(t * 3));
    aim(camera, 0.5 * Math.sin(t * 0.21), -0.5 + 0.2 * Math.sin(t * 0.33), cz, 0.3 * Math.sin(t * 0.17), -0.1, cz - 30);
    camera.rotation.z = 0.02 * Math.sin(t * 0.4);
    return { bloom: { strength: 1.0, radius: 0.7, threshold: 0.12 } };
  }
  return { scene, camera, update };
}
