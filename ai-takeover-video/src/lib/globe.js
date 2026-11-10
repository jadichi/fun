// Dotted globe with real coastlines (Natural Earth via world-atlas) and great-circle arcs.
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { makePoints, makeLines, setColor } from './gfx.js';
import { rng } from './util.js';

// Rasterise the land polygons into an equirectangular mask once.
export async function loadLand() {
  const topo = await fetch('/node_modules/world-atlas/land-110m.json').then((r) => r.json());
  const geo = feature(topo, topo.objects.land);
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  const polys = geo.features ? geo.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) : geo.geometry.coordinates;
  for (const poly of polys) {
    g.beginPath();
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => { const x = ((lon + 180) / 360) * w, y = ((90 - lat) / 180) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath();
    }
    g.fill('evenodd');
  }
  const data = g.getImageData(0, 0, w, h).data;
  return {
    isLand(lat, lon) {
      const x = Math.min(w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * w)));
      const y = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * h)));
      return data[(y * w + x) * 4] > 127;
    },
  };
}

export function latLon(lat, lon, r = 1, out = new THREE.Vector3()) {
  const phi = ((90 - lat) * Math.PI) / 180, th = ((lon + 180) * Math.PI) / 180;
  return out.set(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

// Fibonacci-sphere dots; land bright, ocean faint.
export function makeGlobe({ land, radius = 5, count = 42000, color = [0.3, 0.62, 1], seed = 11, size = 0.055 }) {
  const r = rng(seed);
  const pos = [], col = [], sz = [], landPts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count, rad = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
    const lat = (Math.asin(y) * 180) / Math.PI;
    let lon = ((th * 180) / Math.PI) % 360; if (lon > 180) lon -= 360;
    const isL = land.isLand(lat, lon);
    if (!isL && r() > 0.16) continue;
    latLon(lat, lon, radius, v);
    pos.push(v.x, v.y, v.z);
    const b = isL ? r.range(0.55, 1) : 0.12;
    col.push(color[0] * b, color[1] * b, color[2] * b);
    sz.push(size * (isL ? r.range(0.8, 1.3) : 0.7));
    if (isL) landPts.push([lat, lon]);
  }
  const dots = makePoints({ pos: new Float32Array(pos), col: new Float32Array(col), size: new Float32Array(sz) }, { fog: 0, twinkle: 0.25, seed });
  // dark core hides the far side
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.985, 64, 48), new THREE.MeshBasicMaterial({ color: 0x010203 }));
  dots.material.depthTest = true;
  // thin atmosphere rim
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.16, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uOpacity: { value: 0.3 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.5); gl_FragColor = vec4(uColor, f*uOpacity); }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  }));
  const group = new THREE.Group();
  group.add(core, dots, atmo);
  return { group, dots, core, atmo, landPts, radius };
}

const angle = (a, b) => {
  const va = latLon(a[0], a[1], 1), vb = latLon(b[0], b[1], 1);
  return va.angleTo(vb);
};

// Network that spreads over the land dots from the given origins (Prim-like growth).
// Returns line geometry whose aBirth encodes when each bit of arc appears (0..1).
export function makeNet({ landPts, origins, hubs = 150, extra = 120, radius = 5, colors, seed = 5, segs = 28, lift = 0.22 }) {
  const r = rng(seed);
  const nodes = origins.map((o, i) => ({ p: o, birth: 0, team: i }));
  const pool = [];
  for (let i = 0; i < hubs; i++) pool.push(r.pick(landPts));
  const edges = [];
  // grow: repeatedly attach the pool point closest to the connected set
  const dist = pool.map((p) => { let best = 1e9, bi = 0; nodes.forEach((n, i) => { const d = angle(p, n.p); if (d < best) { best = d; bi = i; } }); return { best, bi }; });
  const used = new Array(pool.length).fill(false);
  for (let k = 0; k < pool.length; k++) {
    let m = -1;
    for (let i = 0; i < pool.length; i++) if (!used[i] && (m < 0 || dist[i].best < dist[m].best)) m = i;
    used[m] = true;
    const parent = nodes[dist[m].bi];
    const node = { p: pool[m], birth: parent.birth + dist[m].best * 0.9 + 0.03, team: parent.team };
    nodes.push(node);
    edges.push({ a: parent, b: node, t0: parent.birth, t1: node.birth, team: parent.team });
    for (let i = 0; i < pool.length; i++) if (!used[i]) { const d = angle(pool[i], node.p); if (d < dist[i].best) { dist[i].best = d; dist[i].bi = nodes.length - 1; } }
  }
  const maxBirth = Math.max(...nodes.map((n) => n.birth));
  // extra cross links make the net dense late in the game
  for (let i = 0; i < extra; i++) {
    const a = r.pick(nodes), b = r.pick(nodes);
    if (a === b) continue;
    const d = angle(a.p, b.p);
    if (d < 0.25 || d > 2.2) continue;
    const t0 = Math.max(a.birth, b.birth) + r.range(0.05, 0.5) * maxBirth;
    edges.push({ a, b, t0, t1: t0 + d * 0.5, team: a.team });
  }
  const tMax = Math.max(...edges.map((e) => e.t1));
  const pos = [], col = [], birth = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  const pt = (e, s, out) => {
    latLon(e.a.p[0], e.a.p[1], 1, va); latLon(e.b.p[0], e.b.p[1], 1, vb);
    const om = va.angleTo(vb), so = Math.sin(om) || 1;
    out.copy(va).multiplyScalar(Math.sin((1 - s) * om) / so).addScaledVector(vb, Math.sin(s * om) / so);
    return out.normalize().multiplyScalar(radius * (1.004 + Math.sin(Math.PI * s) * lift * Math.min(1, om)));
  };
  for (const e of edges) {
    const c = colors[e.team % colors.length];
    for (let i = 0; i < segs; i++) {
      const s0 = i / segs, s1 = (i + 1) / segs;
      pt(e, s0, p0); pt(e, s1, p1);
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      col.push(...c, ...c);
      const b0 = (e.t0 + (e.t1 - e.t0) * s0) / tMax, b1 = (e.t0 + (e.t1 - e.t0) * s1) / tMax;
      birth.push(b0, b1);
    }
  }
  const lines = makeLines({ pos: new Float32Array(pos), col: new Float32Array(col), birth: new Float32Array(birth) }, { fog: 0, opacity: 0.75, revealSoft: 0.01, depthTest: true });
  // glowing hubs
  const hp = [], hc = [], hs = [], hb = [];
  for (const n of nodes) {
    latLon(n.p[0], n.p[1], radius * 1.006, va);
    hp.push(va.x, va.y, va.z);
    const c = colors[n.team % colors.length];
    hc.push(c[0], c[1], c[2]);
    hs.push(n.birth === 0 ? 0.42 : r.range(0.1, 0.2));
    hb.push(n.birth / tMax);
  }
  const hubsPts = makePoints({ pos: new Float32Array(hp), col: new Float32Array(hc), size: new Float32Array(hs), birth: new Float32Array(hb) }, { fog: 0, twinkle: 0.4, revealSoft: 0.02, depthTest: true });
  const group = new THREE.Group();
  group.add(lines, hubsPts);
  return { group, lines, hubs: hubsPts, setReveal(x) { lines.material.uniforms.uReveal.value = x; hubsPts.material.uniforms.uReveal.value = x; } };
}
export { setColor };
