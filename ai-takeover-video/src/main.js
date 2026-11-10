// Render engine. Deterministic: the only clock is the timeline time T passed to renderAt(T).
// Open /src/index.html?w=1920&h=1080[&subs=1][&t=12.5] or drive it frame by frame from
// scripts/render.js via window.renderAt(T).
import * as THREE from 'three';
import { createHud } from './lib/hud.js';
import { createPost } from './lib/post.js';
import { setTime } from './lib/gfx.js';
import { loadLand } from './lib/globe.js';
import { smooth, sat, hash, clamp } from './lib/util.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920), H = +(q.get('h') || 1080);
const subtitles = q.get('subs') === '1';

async function loadFonts() {
  const faces = [
    ['Inter', 500, '/node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2'],
    ['Inter', 600, '/node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2'],
    ['Inter', 700, '/node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2'],
    ['Inter', 800, '/node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2'],
    ['JetBrains Mono', 500, '/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2'],
    ['JetBrains Mono', 700, '/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2'],
  ];
  await Promise.all(faces.map(async ([family, weight, url]) => {
    const f = new FontFace(family, `url(${url})`, { weight: String(weight) });
    document.fonts.add(await f.load());
  }));
}

async function init() {
  const [timeline, land] = await Promise.all([
    fetch('/timeline.json').then((r) => r.json()),
    loadLand(),
    loadFonts(),
  ]);
  const fps = timeline.meta.fps;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);
  document.body.appendChild(renderer.domElement);

  const hud = createHud(W, H);
  const hudTex = new THREE.CanvasTexture(hud.canvas);
  hudTex.colorSpace = THREE.NoColorSpace;
  hudTex.minFilter = hudTex.magFilter = THREE.LinearFilter;
  hudTex.generateMipmaps = false;
  const post = createPost(renderer, W, H, hudTex);

  const only = q.get('only'); // optional: build a single scene (faster for look-dev)
  const instances = [];
  for (const s of timeline.scenes) {
    if (only && only !== s.id) { instances.push(null); continue; }
    const mod = await import(`/scenes/${s.file}.js`);
    instances.push(mod.default({ THREE, W, H, aspect: W / H, land, def: s, timeline }));
  }

  function renderAt(T) {
    T = clamp(T, 0, timeline.meta.duration - 1e-4);
    let idx = timeline.scenes.findIndex((s) => T < s.start + s.duration);
    if (idx < 0) idx = timeline.scenes.length - 1;
    const s = timeline.scenes[idx], inst = instances[idx];
    const t = T - s.start, rem = s.duration - t, frame = Math.round(T * fps);
    const next = timeline.scenes[idx + 1];

    const res = inst.update({ t, u: t / s.duration, dur: s.duration, T, marks: s.marks, def: s, frame }) || {};
    const fov = (inst.camera.fov * Math.PI) / 180;
    setTime(inst.scene, t, H / (2 * Math.tan(fov / 2)));
    inst.camera.aspect = W / H;
    inst.camera.updateProjectionMatrix();

    // --- transitions ---------------------------------------------------------------------
    let fade = 1, glitch = 0, flash = 0, hudGlitch = 0;
    const tr = s.transition;
    if (tr === 'open') fade = smooth(0, 1.8, t);
    if (tr === 'fade') fade = smooth(0, 0.5, t);
    if (tr === 'impact') flash = 0.3 * Math.max(0, 1 - t / 0.16);
    if (tr.startsWith('glitch')) {
      const hard = tr === 'glitch_hard';
      glitch = Math.pow(Math.max(0, 1 - t / (hard ? 1.1 : 0.65)), 1.4);
      flash = (hard ? 0.85 : 0.5) * Math.max(0, 1 - t / 0.1);
    }
    if (next) {
      if (next.transition === 'fade') fade *= smooth(0, 0.45, rem);
      if (next.transition.startsWith('glitch')) glitch = Math.max(glitch, smooth(0.3, 0, rem) * 0.85);
    } else fade *= smooth(0, 1.4, rem);
    // sparse deterministic glitch sparks once control is slipping
    if (s.heat > 0.65 && hash(Math.floor(T * 5) * 3.17) > 1.06 - s.heat * 0.14) glitch = Math.max(glitch, 0.22 + 0.2 * hash(frame));
    if (s.kind === 'threshold' && t > s.marks.turn) hudGlitch = sat((t - s.marks.turn) / 2) * (hash(Math.floor(frame / 2) * 1.7) > 0.86 ? 0.5 : 0.04);
    if (res.glitch) glitch = Math.max(glitch, res.glitch);
    if (res.fade !== undefined) fade *= res.fade;

    // --- render ------------------------------------------------------------------------------
    post.renderPass.scene = inst.scene;
    post.renderPass.camera = inst.camera;
    const b = res.bloom || {};
    post.bloom.strength = b.strength ?? 0.9;
    post.bloom.radius = b.radius ?? 0.6;
    post.bloom.threshold = b.threshold ?? 0.1;

    hud.draw({ timeline, T, frame, scene: s, t, labels: res.labels, subtitles, chrome: res.chrome, hide: res.hideHud });
    hudTex.needsUpdate = true;

    const u = post.final.uniforms;
    u.uSeed.value = frame % 4096;
    u.uGlitch.value = glitch;
    u.uHudGlitch.value = hudGlitch;
    u.uFlash.value = flash;
    u.uFade.value = fade;
    u.uCA.value = (0.0016 + 0.004 * s.heat) * (res.ca ?? 1);
    u.uGrain.value = res.grain ?? 0.075;
    u.uVignette.value = res.vignette ?? 0.85;
    u.uExposure.value = res.exposure ?? 1;
    post.composer.render();
    return true;
  }

  window.timeline = timeline;
  window.renderAt = renderAt;
  if (q.get('t')) renderAt(+q.get('t'));
  window.__ready = true;
}

init().catch((e) => { console.error(e); window.__error = String(e.stack || e); });
