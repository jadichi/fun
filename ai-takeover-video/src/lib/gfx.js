// Shared Three.js building blocks: soft additive particles, fading lines, light shafts, dust.
// Everything animates from a `uTime` uniform that the engine sets from the timeline.
import * as THREE from 'three';
import { rng } from './util.js';

let _soft;
export function softTexture() {
  if (_soft) return _soft;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _soft = new THREE.CanvasTexture(c);
  return _soft;
}

const POINT_VS = /* glsl */ `
  attribute vec3 color;
  attribute float aSize;
  attribute float aPhase;
  attribute float aBirth;
  uniform float uTime, uScale, uSize, uTwinkle, uFog, uReveal, uRevealSoft, uDrift, uNear;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float ph = aPhase * 6.2831;
    p += uDrift * vec3(sin(uTime * 0.21 + ph), cos(uTime * 0.17 + ph * 1.7), sin(uTime * 0.13 + ph * 2.3));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = max(-mv.z, 0.05);
    gl_PointSize = min(aSize * uSize * uScale / d, 220.0 * uScale / 60.0);
    float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.8 + aPhase * 2.2) + ph * 7.0));
    float born = smoothstep(aBirth, aBirth + uRevealSoft, uReveal);
    vAlpha = exp(-uFog * d) * tw * born * smoothstep(0.0, uNear, d);
    vColor = color;
  }`;
const POINT_FS = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, r);
    a = a * a * (0.6 + 0.9 * smoothstep(0.45, 0.0, r));
    gl_FragColor = vec4(vColor * uTint, a * vAlpha * uOpacity);
  }`;

// data: { pos: Float32Array(n*3), col?, size?, phase?, birth? }
export function makePoints(data, opts = {}) {
  const n = data.pos.length / 3;
  const r = rng(opts.seed ?? 7);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
  const col = data.col ?? new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const size = data.size ?? new Float32Array(n).fill(1);
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const phase = data.phase ?? Float32Array.from({ length: n }, () => r());
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aBirth', new THREE.BufferAttribute(data.birth ?? new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: POINT_VS, fragmentShader: POINT_FS,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 1 }, uSize: { value: opts.size ?? 1 },
      uTwinkle: { value: opts.twinkle ?? 0 }, uFog: { value: opts.fog ?? 0.02 },
      uReveal: { value: 1e9 }, uRevealSoft: { value: opts.revealSoft ?? 0.05 },
      uDrift: { value: opts.drift ?? 0 }, uNear: { value: opts.near ?? 0.6 },
      uOpacity: { value: opts.opacity ?? 1 }, uTint: { value: new THREE.Color(1, 1, 1) },
    },
    transparent: true, depthWrite: false, depthTest: opts.depthTest ?? false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.userData.isFx = true;
  return p;
}

const LINE_VS = /* glsl */ `
  attribute vec3 color;
  attribute float aBirth;
  uniform float uFog, uReveal, uRevealSoft;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = exp(-uFog * max(-mv.z, 0.0)) * smoothstep(aBirth, aBirth + uRevealSoft, uReveal);
    vColor = color;
  }`;
const LINE_FS = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(vColor * uTint, vAlpha * uOpacity); }`;

// data: { pos: Float32Array(segments*6), col?, birth? }  (pairs of vertices)
export function makeLines(data, opts = {}) {
  const n = data.pos.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(data.col ?? new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aBirth', new THREE.BufferAttribute(data.birth ?? new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: LINE_VS, fragmentShader: LINE_FS,
    uniforms: {
      uFog: { value: opts.fog ?? 0.02 }, uReveal: { value: 1e9 }, uRevealSoft: { value: opts.revealSoft ?? 0.05 },
      uOpacity: { value: opts.opacity ?? 0.5 }, uTint: { value: new THREE.Color(1, 1, 1) },
    },
    transparent: true, depthWrite: false, depthTest: opts.depthTest ?? false, blending: THREE.AdditiveBlending,
  });
  const l = opts.strip ? new THREE.Line(g, m) : new THREE.LineSegments(g, m);
  l.frustumCulled = false;
  return l;
}

// Fake volumetric light: an open cone whose brightness falls off along its length and at its rim.
export function lightShaft({ color = [0.3, 0.6, 1], height = 10, radius = 2, top = 0.05, opacity = 0.35 } = {}) {
  const g = new THREE.CylinderGeometry(top, radius, height, 48, 1, true);
  g.translate(0, -height / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity, uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float along = pow(vUv.y, 1.4);
        float streak = 0.75 + 0.25 * sin(vUv.x * 60.0 + uTime * 0.4) * sin(vUv.x * 23.0 - uTime * 0.25);
        gl_FragColor = vec4(uColor, rim * along * streak * uOpacity);
      }`,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

export function glow(color = [1, 1, 1], scale = 1, opacity = 1) {
  const m = new THREE.SpriteMaterial({
    map: softTexture(), color: new THREE.Color(...color), transparent: true, opacity,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

// Slow drifting dust that gives the fog something to light up.
export function dust({ count = 1500, box = [30, 16, 30], color = [0.5, 0.7, 1], size = 0.9, seed = 3, fog = 0.03, opacity = 0.5 } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = r.range(-box[0], box[0]);
    pos[i * 3 + 1] = r.range(-box[1], box[1]);
    pos[i * 3 + 2] = r.range(-box[2], box[2]);
    const b = r.range(0.3, 1);
    col[i * 3] = color[0] * b; col[i * 3 + 1] = color[1] * b; col[i * 3 + 2] = color[2] * b;
    sz[i] = r.range(0.4, 1.6) * size;
  }
  return makePoints({ pos, col, size: sz }, { fog, opacity, drift: 0.6, twinkle: 0.5, seed });
}

// Recursively push the timeline time and resolution scale into every fx material.
export function setTime(root, time, scale) {
  root.traverse((o) => {
    const u = o.material?.uniforms;
    if (!u) return;
    if (u.uTime) u.uTime.value = time;
    if (u.uScale) u.uScale.value = scale;
  });
}

export const setColor = (arr, i, c, k = 1) => { arr[i * 3] = c[0] * k; arr[i * 3 + 1] = c[1] * k; arr[i * 3 + 2] = c[2] * k; };

// A glowing "mind": bright core, wide halo and a shell of orbiting particles.
export function orb({ color = [0.3, 0.62, 1], radius = 0.45, shell = 420, seed = 21 } = {}) {
  const group = new THREE.Group();
  const halo = glow(color, radius * 11, 0.3);
  const mid = glow(color, radius * 3.6, 0.8);
  const core = glow([1, 1, 1], radius * 1.3, 1);
  const r = rng(seed);
  const pos = new Float32Array(shell * 3), col = new Float32Array(shell * 3), sz = new Float32Array(shell);
  for (let i = 0; i < shell; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = radius * (0.85 + r() * 0.5), s = Math.sqrt(1 - u * u);
    pos[i * 3] = rr * s * Math.cos(th); pos[i * 3 + 1] = rr * u; pos[i * 3 + 2] = rr * s * Math.sin(th);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1; sz[i] = r.range(0.02, 0.06);
  }
  const pts = makePoints({ pos, col, size: sz }, { fog: 0, twinkle: 0.7, seed });
  group.add(halo, mid, core, pts);
  const c = new THREE.Color();
  return {
    group, halo, mid, core, pts,
    set(colArr, intensity = 1, time = 0) {
      c.setRGB(...colArr);
      halo.material.color.copy(c); mid.material.color.copy(c);
      pts.material.uniforms.uTint.value.setRGB(lerpN(colArr[0], 1, 0.4), lerpN(colArr[1], 1, 0.4), lerpN(colArr[2], 1, 0.4));
      halo.material.opacity = 0.3 * intensity; mid.material.opacity = 0.8 * intensity; core.material.opacity = intensity;
      pts.material.uniforms.uOpacity.value = intensity;
      pts.rotation.set(time * 0.31, time * 0.47, time * 0.13);
    },
  };
}
const lerpN = (a, b, t) => a + (b - a) * t;

const _v = new THREE.Vector3();
// World position -> HUD coordinates (0..1, origin top left). Camera matrices must be current.
export function project(x, y, z, camera) {
  _v.set(x, y, z).project(camera);
  return { x: _v.x * 0.5 + 0.5, y: -_v.y * 0.5 + 0.5, behind: _v.z > 1 };
}
export function aim(camera, px, py, pz, lx, ly, lz) {
  camera.position.set(px, py, pz);
  camera.lookAt(lx, ly, lz);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}
// A flat rectangle outline / filled quad helper (additive).
export function quad(w, h, color, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}
