// S01 · Hook. A single blue light reads an inbox made of light. One line turns amber.
import * as THREE from 'three';
import { orb, dust, glow, makeLines } from '../src/lib/gfx.js';
import { rng, smooth, sat, lerp, PAL, easeOut, easeInOut } from '../src/lib/util.js';

export default function create() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
  const r = rng(101);

  const mind = orb({ color: PAL.blue, radius: 0.3 });
  mind.group.position.set(-3.3, 1.25, 0.6);
  scene.add(mind.group);
  scene.add(dust({ count: 1400, box: [16, 9, 14], color: [0.35, 0.55, 0.9], size: 0.035, fog: 0.05, opacity: 0.55 }));

  // --- inbox: rows of "redacted" bars on a plane that recedes into the dark -------------
  const inbox = new THREE.Group();
  inbox.position.set(-0.6, 0, 0);
  inbox.rotation.y = -0.62;
  scene.add(inbox);
  const ROWS = 40, GAP = 0.44, AFFAIR = 27;
  const bars = [];
  for (let i = 0; i < ROWS; i++) {
    let x = 0;
    const add = (w, h, kind) => { bars.push({ row: i, x: x + w / 2, w, h, kind }); x += w + 0.16; };
    add(0.15, 0.15, 'dot');
    add(r.range(0.7, 1.3), 0.1, 'from');
    const n = r.int(2, 4);
    for (let k = 0; k < n; k++) add(r.range(0.5, 2.1), 0.1, 'subj');
    bars.push({ row: i, x: 9.6, w: 0.5, h: 0.08, kind: 'time' });
  }
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }), bars.length);
  mesh.frustumCulled = false;
  inbox.add(mesh);
  const rowGlow = glow(PAL.amber, 1, 0);
  rowGlow.scale.set(13, 0.55, 1);
  inbox.add(rowGlow);

  // reading beam from the mind to the row it is on, and the outgoing message
  const beam = makeLines({ pos: new Float32Array(12) }, { fog: 0, opacity: 0.5 });
  scene.add(beam);
  const msg = glow([1, 0.85, 0.6], 0.5, 0);
  scene.add(msg);
  const trail = makeLines({ pos: new Float32Array(6) }, { fog: 0, opacity: 0 });
  scene.add(trail);

  const m4 = new THREE.Matrix4(), col = new THREE.Color(), v = new THREE.Vector3(), w0 = new THREE.Vector3(), w1 = new THREE.Vector3();
  const READ_Y = 0.25;

  function update({ t, u, marks }) {
    // scroll decelerates and stops with the affair mail on the reading line
    const tA = marks.affair + 0.9;
    const p = sat(t / tA);
    const total = AFFAIR * GAP - 2.2;
    const scroll = total * (1 - Math.pow(1 - p, 2.2));
    const reveal = smooth(1.0, 3.4, t);
    const found = smooth(marks.affair + 0.5, marks.affair + 1.6, t);
    const threat = smooth(marks.threat, marks.threat + 1.2, t);

    bars.forEach((b, i) => {
      const y = READ_Y + 2.2 - b.row * GAP + scroll;
      const near = Math.exp(-Math.pow((y - READ_Y) / 0.5, 2));
      const depth = Math.exp(-b.x * 0.16);
      const edge = smooth(-4.6, -2.6, y) * smooth(5.4, 3.4, y);
      let k = (0.1 + 0.55 * near * (1 - found * 0.6)) * depth * edge * reveal;
      const isA = b.row === AFFAIR;
      if (isA) k = lerp(k, (0.85 + 0.15 * Math.sin(t * 6)) * edge, found);
      const c = isA ? [lerp(PAL.blue[0], PAL.amber[0], found), lerp(PAL.blue[1], PAL.amber[1], found), lerp(PAL.blue[2], PAL.amber[2], found)] : PAL.blue;
      const bright = b.kind === 'dot' ? 1.5 : b.kind === 'time' ? 0.5 : 1;
      col.setRGB(c[0] * k * bright, c[1] * k * bright, c[2] * k * bright);
      mesh.setColorAt(i, col);
      m4.makeScale(b.w, b.h * (isA ? 1 + 0.35 * found : 1), 1).setPosition(b.x, y, 0);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    rowGlow.position.set(4.4, READ_Y, -0.05);
    rowGlow.material.opacity = 0.16 * found;

    // mind
    const pulse = 1 + 0.06 * Math.sin(t * 2.3);
    const k = threat * 0.8;
    const mc = [lerp(PAL.blue[0], 1.0, k), lerp(PAL.blue[1], 0.5, k), lerp(PAL.blue[2], 0.2, k)];
    mind.set(mc, smooth(0, 1.4, t) * pulse, t);

    // beam: two rays fanning over the row being read
    inbox.updateMatrixWorld();
    const sweep = 0.5 + 0.5 * Math.sin(t * 1.7);
    w0.set(lerp(0.2, 3.5, sweep), READ_Y, 0).applyMatrix4(inbox.matrixWorld);
    w1.set(lerp(2.5, 8.5, sweep), READ_Y, 0).applyMatrix4(inbox.matrixWorld);
    const bp = beam.geometry.attributes.position, mp = mind.group.position;
    bp.setXYZ(0, mp.x, mp.y, mp.z); bp.setXYZ(1, w0.x, w0.y, w0.z);
    bp.setXYZ(2, mp.x, mp.y, mp.z); bp.setXYZ(3, w1.x, w1.y, w1.z);
    bp.needsUpdate = true;
    beam.material.uniforms.uOpacity.value = 0.32 * reveal * (0.7 + 0.3 * Math.sin(t * 9));
    beam.material.uniforms.uTint.value.setRGB(...mc);

    // the message leaves
    const send = easeInOut(sat((t - marks.threat - 1.6) / 2.2));
    v.set(lerp(mp.x, 9, send), lerp(mp.y, 4.6, send * send), lerp(mp.z, -6, send));
    msg.position.copy(v);
    msg.material.opacity = Math.sin(Math.PI * sat(send)) * 0.95;
    const tp = trail.geometry.attributes.position;
    tp.setXYZ(0, mp.x, mp.y, mp.z); tp.setXYZ(1, v.x, v.y, v.z); tp.needsUpdate = true;
    trail.material.uniforms.uOpacity.value = 0.5 * Math.sin(Math.PI * sat(send));
    trail.material.uniforms.uTint.value.setRGB(...PAL.amber);

    // slow push-in
    const e = easeInOut(u);
    camera.position.set(lerp(-0.9, -0.2, e), lerp(0.75, 0.55, e), lerp(11.8, 10.7, e));
    camera.lookAt(lerp(0.6, 0.75, e), 0.35, 0);
    return { bloom: { strength: 1.05, radius: 0.72, threshold: 0.08 } };
  }
  return { scene, camera, update };
}
