// Procedural score and sound design. Pure Node DSP, deterministic (seeded noise, no clock).
// Reads timeline.json, writes audio/music.wav and audio/sfx.wav (48 kHz, 16 bit, stereo).
//
// Music: dark ambient. Drone + pad per scene, root climbs a semitone per escalation chapter,
// pulse tempo rises with the countdown, and everything stops dead for the silence in S10.
// SFX: every cue in timeline.json (clock ticks, glitches, impacts, whooshes, data noise).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tl = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
const SR = 48000, TAU = Math.PI * 2;
const DUR = tl.meta.duration;
const N = Math.ceil((DUR + 0.25) * SR);

// --- utilities ---------------------------------------------------------------------------
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const panLR = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

class Bus {
  constructor() { this.L = new Float32Array(N); this.R = new Float32Array(N); this.sL = new Float32Array(N); this.sR = new Float32Array(N); }
}
const music = new Bus(), sfx = new Bus();

// State-variable filter (Chamberlin), one instance per channel.
class SVF {
  constructor() { this.lp = 0; this.bp = 0; }
  run(x, fc, q) {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6.5)) / SR);
    this.lp += f * this.bp;
    const hp = x - this.lp - q * this.bp;
    this.bp += f * hp;
    return this;
  }
}

// --- voices --------------------------------------------------------------------------------
// Pitched tone with attack/release, optional exponential decay and pitch glide.
function tone(bus, { t, dur, f0, f1 = f0, gain = 0.2, attack = 0.004, release = 0.05, decay = 0, type = 'sine', pan = 0, send = 0.2, curve = 1, fm = 0, fmRatio = 2 }) {
  const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
  const [pl, pr] = panLR(pan);
  let ph = 0, mph = 0;
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    if (i < 0) continue; if (i >= N) break;
    const x = k / n, tt = k / SR;
    const f = f0 * Math.pow(f1 / f0, Math.pow(x, curve));
    mph += (f * fmRatio) / SR;
    ph += f / SR;
    const p = ph + (fm ? (fm * Math.sin(TAU * mph)) / TAU : 0);
    const fr = p - Math.floor(p);
    const s = type === 'sine' ? Math.sin(TAU * p) : type === 'saw' ? 2 * fr - 1 : type === 'tri' ? 4 * Math.abs(fr - 0.5) - 1 : fr < 0.5 ? 1 : -1;
    let e = Math.min(1, tt / attack) * Math.min(1, (dur - tt) / release);
    if (decay) e *= Math.exp(-tt / decay);
    const v = s * e * gain;
    bus.L[i] += v * pl; bus.R[i] += v * pr;
    bus.sL[i] += v * pl * send; bus.sR[i] += v * pr * send;
  }
}

// Filtered noise: band sweeps from f0 to f1. shape: 'flat' | 'swell' (rises to the end) | 'decay'
function noise(bus, { t, dur, gain = 0.2, f0 = 800, f1 = f0, q = 0.5, attack = 0.01, release = 0.05, shape = 'flat', decay = 0.2, pan = 0, pan1 = pan, send = 0.3, seed = 1, mode = 'bp', power = 2.5, crush = 0 }) {
  const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
  const r = rng(Math.floor(t * 1000) + seed * 7919);
  const fl = new SVF(), fr2 = new SVF();
  let held = 0;
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    if (i >= N) break;
    const x = k / n, tt = k / SR;
    let w = r() * 2 - 1, w2 = r() * 2 - 1;
    if (crush) { if (k % crush === 0) held = w; w = held; w2 = held; }
    if (i < 0) continue;
    const fc = f0 * Math.pow(f1 / f0, x);
    fl.run(w, fc, q); fr2.run(w2, fc, q);
    const a = mode === 'bp' ? fl.bp : mode === 'lp' ? fl.lp : w - fl.lp, b = mode === 'bp' ? fr2.bp : mode === 'lp' ? fr2.lp : w2 - fr2.lp;
    let e = Math.min(1, tt / attack) * Math.min(1, (dur - tt) / release);
    if (shape === 'swell') e *= Math.pow(x, power);
    else if (shape === 'decay') e *= Math.exp(-tt / decay);
    else if (shape === 'arc') e *= Math.sin(Math.PI * x);
    const [pl, pr] = panLR(lerp(pan, pan1, x));
    const vl = a * e * gain * pl, vr = b * e * gain * pr;
    bus.L[i] += vl; bus.R[i] += vr; bus.sL[i] += vl * send; bus.sR[i] += vr * send;
  }
}

// Sustained chord: detuned saws per note through a slowly moving low-pass. The body of the score.
function pad(bus, { t0, t1, notes, gain = 0.1, cut0 = 400, cut1 = cut0, attack = 2, release = 2.5, send = 0.5, detune = 7, lfo = 0.07, q = 0.9, seed = 1, sub = 0 }) {
  const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor(t1 * SR)), dur = t1 - t0;
  const r = rng(seed * 131 + Math.floor(t0 * 10));
  const voices = [];
  for (const m of notes) for (const ch of [0, 1]) for (const d of [-1, 1]) {
    voices.push({ ch, f: midi(m) * Math.pow(2, ((d * detune * (0.6 + 0.8 * r())) / 1200)), ph: r(), g: 0.7 + 0.6 * r() });
  }
  const fl = [new SVF(), new SVF()], fl2 = [new SVF(), new SVF()];
  const subF = sub ? midi(sub) : 0;
  let sph = 0;
  const norm = gain / Math.sqrt(notes.length);
  for (let i = i0; i < i1; i++) {
    const tt = (i - i0) / SR, x = tt / dur;
    const e = Math.min(1, tt / attack) * Math.min(1, (dur - tt) / release);
    const acc = [0, 0];
    for (const v of voices) { v.ph += v.f / SR; if (v.ph >= 1) v.ph -= 1; acc[v.ch] += (2 * v.ph - 1) * v.g; }
    const fc = lerp(cut0, cut1, x) * (1 + 0.35 * Math.sin(TAU * lfo * tt + seed));
    let l = fl2[0].run(fl[0].run(acc[0], fc, q).lp, fc, q).lp, rr = fl2[1].run(fl[1].run(acc[1], fc, q).lp, fc, q).lp;
    if (subF) { sph += subF / SR; const s = Math.sin(TAU * sph) * 1.6; l += s; rr += s; }
    const g = e * e * norm;
    bus.L[i] += l * g; bus.R[i] += rr * g; bus.sL[i] += l * g * send; bus.sR[i] += rr * g * send;
  }
}

const kick = (bus, t, gain = 0.5, f = 52) => {
  tone(bus, { t, dur: 0.5, f0: f * 2.6, f1: f, curve: 0.25, gain, attack: 0.002, release: 0.1, decay: 0.16, send: 0.08 });
  noise(bus, { t, dur: 0.03, gain: gain * 0.25, f0: 2500, q: 1.2, shape: 'decay', decay: 0.008, send: 0.05 });
};
const bell = (bus, t, m, gain = 0.08, pan = 0, decay = 1.6) => {
  const f = midi(m);
  tone(bus, { t, dur: decay * 4, f0: f, gain, decay, attack: 0.004, release: 0.3, pan, send: 0.9 });
  tone(bus, { t, dur: decay * 2, f0: f * 2.76, gain: gain * 0.25, decay: decay * 0.4, attack: 0.003, release: 0.2, pan, send: 0.9 });
  tone(bus, { t, dur: decay * 1.5, f0: f * 5.4, gain: gain * 0.1, decay: decay * 0.2, attack: 0.002, release: 0.1, pan, send: 0.9 });
};
const bassNote = (bus, t, m, gain, len = 0.16) => {
  tone(bus, { t, dur: len, f0: midi(m), gain: gain * 0.9, type: 'tri', attack: 0.004, release: 0.05, decay: len * 0.6, send: 0.1 });
  tone(bus, { t, dur: len, f0: midi(m + 12), gain: gain * 0.25, type: 'saw', attack: 0.004, release: 0.04, decay: len * 0.3, send: 0.15 });
};

// --- MUSIC ---------------------------------------------------------------------------------
const byId = Object.fromEntries(tl.scenes.map((s) => [s.id, s]));
const S = (id) => byId[id];
const D2 = 38; // MIDI D2

// per scene: root (semitones above D), tempo, intensity
const plan = {
  s01: { root: 0, chord: [0, 7, 14], bpm: 0, level: 0.4, cut: [260, 520] },
  s02: { root: 0, chord: [0, 3, 7, 14], bpm: 60, level: 0.5, cut: [420, 620] },
  s03: { root: -4, chord: [0, 4, 7, 11], bpm: 60, level: 0.5, cut: [460, 700] }, // Bb maj7: unsettling calm
  s04: { root: 0, chord: [0, 3, 7, 10], bpm: 72, level: 0.6, cut: [420, 1100] },
  s05: { root: 0, chord: [0, 1, 7], bpm: 0, level: 0.62, cut: [500, 900] }, // minor second: the ground shifts
  s06: { root: 1, chord: [0, 3, 7, 10], bpm: 84, level: 0.72, cut: [500, 1100] },
  s07: { root: 2, chord: [0, 3, 7, 13], bpm: 96, level: 0.8, cut: [550, 1300] },
  s08: { root: 3, chord: [0, 3, 6, 13], bpm: 112, level: 0.9, cut: [650, 1500] },
  s09: { root: 4, chord: [0, 1, 6, 12], bpm: 132, level: 1.0, cut: [750, 1900] },
  s10: { root: 5, chord: [0, 1, 6, 11], bpm: 152, level: 1.0, cut: [850, 2600] },
};

for (const s of tl.scenes) {
  const p = plan[s.id];
  if (!p) continue;
  const t0 = s.start, t1 = s.start + s.duration;
  const rootM = D2 + p.root;
  const isScenario = s.kind === 'scenario';
  const end = s.id === 's10' ? s.start + s.marks.silence : t1;
  // drone: root an octave down plus a fifth, always there
  pad(music, { t0: t0 - 1.2, t1: end + (s.id === 's10' ? 0 : 1.6), notes: [rootM - 12, rootM - 12, rootM - 5], gain: 0.2 * p.level, cut0: 110 + 60 * s.heat, cut1: 150 + 160 * s.heat, attack: 1.8, release: s.id === 's10' ? 0.03 : 2.2, send: 0.25, detune: 9, sub: rootM - 24, seed: 3 });
  // harmony
  pad(music, { t0: t0 - 0.6, t1: end + (s.id === 's10' ? 0 : 1.4), notes: p.chord.map((c) => rootM + 12 + c), gain: 0.12 * p.level, cut0: p.cut[0], cut1: p.cut[1], attack: isScenario ? 1.0 : 2.4, release: s.id === 's10' ? 0.03 : 2.0, send: 0.6, seed: 5 });
  // a thin high line that creeps up with the heat
  if (s.heat > 0.25) pad(music, { t0: t0 + 2, t1: end, notes: [rootM + 36 + p.chord[1], rootM + 43], gain: 0.02 + 0.03 * s.heat, cut0: 1500, cut1: 3000 + 2500 * s.heat, attack: 3, release: s.id === 's10' ? 0.03 : 1.5, send: 0.8, detune: 14, seed: 9 });

  // pulse: heartbeat in the fact scenes, a machine in the scenario chapters
  if (p.bpm) {
    const beat = 60 / p.bpm;
    const startBeat = s.id === 's02' ? s.marks.flip : s.id === 's03' ? 1 : s.id === 's04' ? s.marks.curve : 0.05;
    const span = end - t0 - startBeat;
    let tb = 0, n = 0;
    while (tb < span - 0.05) {
      const T = t0 + startBeat + tb, x = tb / span;
      // S10 accelerates into the silence
      const accel = s.id === 's10' ? 1 + 0.55 * x * x : 1;
      const b = beat / accel;
      if (!isScenario) {
        // lub-dub
        kick(music, T, 0.2 * p.level, 46);
        kick(music, T + beat * 0.27, 0.11 * p.level, 42);
        if (s.id === 's04') { // growth: a soft rising arpeggio
          const arp = [0, 3, 7, 10, 12, 15, 19, 22];
          for (let k = 0; k < 2; k++) bell(music, T + (k * beat) / 2, rootM + 24 + arp[(n * 2 + k) % arp.length], 0.02 + 0.035 * x, ((n * 2 + k) % 3 - 1) * 0.5, 0.5);
        }
      } else {
        const g = 0.2 + 0.18 * s.heat;
        kick(music, T, g * 1.25, 48 + p.root);
        const div = s.heat > 0.65 ? 4 : 2;
        for (let k = 0; k < div; k++) {
          const acc = k === 0 ? 1 : 0.6;
          const oct = s.heat > 0.8 && k === 2 ? 12 : 0;
          bassNote(music, T + (k * b) / div, rootM - 12 + oct, g * 0.42 * acc * (0.6 + 0.4 * x), (b / div) * 0.9);
        }
        // metallic off-beat tick that gets more insistent
        if (s.heat > 0.5) noise(music, { t: T + b / 2, dur: 0.05, gain: 0.035 + 0.07 * (s.heat - 0.5), f0: 7000, q: 0.6, shape: 'decay', decay: 0.012, pan: n % 2 ? 0.5 : -0.5, send: 0.2, seed: n });
      }
      tb += b; n++;
    }
  }
  // each chapter ends with a swell into the next time jump
  if (isScenario && s.id !== 's10') noise(music, { t: t1 - 3.2, dur: 3.2, gain: 0.07 + 0.08 * s.heat, f0: 300, f1: 5000, q: 0.35, shape: 'swell', power: 3, send: 0.5, seed: 77 });
}

// S01: lonely bells over the drone
{ const s = S('s01'), r = rng(11); const notes = [69, 65, 64, 62, 69, 72, 64, 57];
  let t = 2.2, k = 0; while (t < s.duration - 1.5) { bell(music, s.start + t, notes[k % notes.length], 0.05, r() * 1.2 - 0.6, 2.2); t += 1.9 + r() * 1.4; k++; } }
// S03: two bells for the two doors
{ const s = S('s03'); bell(music, s.start + s.marks.test + 0.3, 70, 0.07, -0.4, 2.4); bell(music, s.start + s.marks.real + 0.3, 63, 0.09, 0.4, 3.0); bell(music, s.start + s.marks.real + 0.36, 64, 0.06, 0.4, 3.0); }

// S10 after the silence: only a very low, very quiet floor
{ const s = S('s10'); const t0 = s.start + s.marks.silenceEnd;
  pad(music, { t0, t1: s.start + s.duration, notes: [D2 - 7, D2 - 7], gain: 0.2, cut0: 90, cut1: 70, attack: 0.02, release: 0.25, send: 0.3, sub: D2 - 19, seed: 21 });
  pad(music, { t0: t0 + 1.5, t1: s.start + s.duration, notes: [D2 + 53, D2 + 54], gain: 0.012, cut0: 5000, cut1: 5000, attack: 3, release: 0.25, send: 0.9, detune: 4, seed: 23 }); }

// S11: nothing until the clock says HEUTE, then open, calm, unresolved
{ const s = S('s11'); const t0 = s.start + s.marks.back, t1 = s.start + s.duration, tq = s.start + s.marks.question, ts = s.start + s.marks.statement;
  pad(music, { t0, t1: t1 - 0.2, notes: [D2 - 12, D2 - 12, D2 - 5], gain: 0.1, cut0: 140, cut1: 110, attack: 3, release: 4, send: 0.3, sub: D2 - 24, seed: 31 });
  pad(music, { t0: t0 + 0.5, t1: tq + 2, notes: [D2 + 12, D2 + 19, D2 + 26], gain: 0.085, cut0: 500, cut1: 900, attack: 3.5, release: 4, send: 0.7, seed: 33 }); // Dsus2
  pad(music, { t0: ts - 1, t1: tq + 1, notes: [D2 + 24, D2 + 28, D2 + 31, D2 + 38], gain: 0.07, cut0: 700, cut1: 1500, attack: 3, release: 4, send: 0.8, seed: 35 }); // D major colour under the statement
  pad(music, { t0: tq - 0.5, t1: t1 - 0.2, notes: [D2 + 24, D2 + 25, D2 + 31], gain: 0.06, cut0: 900, cut1: 500, attack: 2.5, release: 3.5, send: 0.8, seed: 37 }); // the question stays open
  const r = rng(41), notes = [74, 69, 76, 66, 81, 74, 69, 78];
  let t = 1.5, k = 0; while (t0 + t < tq - 1) { bell(music, t0 + t, notes[k % notes.length], 0.045, r() * 1.2 - 0.6, 2.6); t += 2.3 + r() * 1.5; k++; }
  bell(music, tq + 0.2, 74, 0.05, 0, 3); bell(music, s.start + s.narration.at(-1).start + 0.3, 75, 0.045, 0, 4); }

// --- SFX -----------------------------------------------------------------------------------
const fx = {
  tick_year: (t, i) => { tone(sfx, { t, dur: 0.09, f0: i % 2 ? 1250 : 1650, gain: 0.2, decay: 0.014, pan: 0.35, send: 0.35 }); noise(sfx, { t, dur: 0.03, gain: 0.25, f0: 4200, q: 0.7, shape: 'decay', decay: 0.006, pan: 0.35, send: 0.3, seed: i }); },
  tick_month: (t, i) => { tone(sfx, { t, dur: 0.08, f0: i % 2 ? 1500 : 1900, gain: 0.17, decay: 0.012, pan: 0.35, send: 0.3 }); noise(sfx, { t, dur: 0.025, gain: 0.22, f0: 4800, q: 0.7, shape: 'decay', decay: 0.005, pan: 0.35, send: 0.25, seed: i }); },
  tick_day: (t, i) => { tone(sfx, { t, dur: 0.06, f0: i % 2 ? 1800 : 2300, gain: 0.14, decay: 0.01, pan: 0.35, send: 0.25 }); noise(sfx, { t, dur: 0.02, gain: 0.18, f0: 5500, q: 0.7, shape: 'decay', decay: 0.004, pan: 0.35, send: 0.2, seed: i }); },
  tick_hour: (t, i, n) => { tone(sfx, { t, dur: 0.04, f0: (i % 2 ? 2200 : 2700) * (1 + 0.35 * (i / n)), gain: 0.1 + 0.05 * (i / n), decay: 0.007, pan: 0.35, send: 0.2 }); noise(sfx, { t, dur: 0.015, gain: 0.13, f0: 6500, q: 0.7, shape: 'decay', decay: 0.003, pan: 0.35, send: 0.15, seed: i }); },
  tick_big: (t) => { tone(sfx, { t, dur: 0.5, f0: 880, gain: 0.3, decay: 0.05, pan: 0.3, send: 0.8 }); tone(sfx, { t, dur: 0.3, f0: 110, f1: 70, gain: 0.35, decay: 0.07, send: 0.3 }); noise(sfx, { t, dur: 0.04, gain: 0.35, f0: 3500, q: 0.6, shape: 'decay', decay: 0.008, pan: 0.3, send: 0.6 }); },
  glitch: (t, i) => {
    const r = rng(Math.floor(t * 100) + 3);
    let x = -0.22;
    while (x < 0.6) {
      const d = 0.015 + r() * 0.07;
      if (r() > 0.3) noise(sfx, { t: t + x, dur: d, gain: 0.22 * (x < 0 ? 0.6 : 1), f0: 500 + r() * 7000, q: 0.3 + r(), attack: 0.001, release: 0.002, pan: r() * 1.6 - 0.8, send: 0.1, seed: i * 31 + Math.floor(x * 1000), crush: 2 + Math.floor(r() * 14) });
      else tone(sfx, { t: t + x, dur: d, f0: 200 + r() * 5000, f1: 200 + r() * 5000, type: 'square', gain: 0.07, attack: 0.001, release: 0.002, pan: r() * 1.6 - 0.8, send: 0.1 });
      x += d + r() * 0.03;
    }
  },
  impact: (t) => { tone(sfx, { t, dur: 2.2, f0: 95, f1: 32, curve: 0.3, gain: 0.75, decay: 0.55, attack: 0.002, release: 0.3, send: 0.25 }); noise(sfx, { t, dur: 0.9, gain: 0.5, f0: 2200, f1: 180, q: 0.5, shape: 'decay', decay: 0.16, send: 0.7 }); },
  impact_hard: (t) => { tone(sfx, { t, dur: 3, f0: 120, f1: 27, curve: 0.3, gain: 0.95, decay: 0.8, attack: 0.002, release: 0.3, send: 0.3, fm: 1.5, fmRatio: 0.5 }); noise(sfx, { t, dur: 1.4, gain: 0.7, f0: 4000, f1: 120, q: 0.45, shape: 'decay', decay: 0.25, send: 0.8 }); tone(sfx, { t, dur: 1.5, f0: 46, gain: 0.3, type: 'saw', decay: 0.35, send: 0.4 }); },
  impact_soft: (t) => { tone(sfx, { t, dur: 1.6, f0: 80, f1: 38, curve: 0.3, gain: 0.45, decay: 0.4, send: 0.3 }); noise(sfx, { t, dur: 0.5, gain: 0.18, f0: 1200, f1: 200, q: 0.5, shape: 'decay', decay: 0.1, send: 0.7 }); },
  hit: (t) => { tone(sfx, { t, dur: 2, f0: 70, f1: 36, curve: 0.3, gain: 0.7, decay: 0.5, send: 0.3 }); tone(sfx, { t, dur: 2.5, f0: midi(53), gain: 0.1, type: 'saw', decay: 0.8, send: 0.9 }); tone(sfx, { t, dur: 2.5, f0: midi(54), gain: 0.1, type: 'saw', decay: 0.8, send: 0.9 }); noise(sfx, { t, dur: 0.6, gain: 0.3, f0: 1800, f1: 200, q: 0.5, shape: 'decay', decay: 0.12, send: 0.7 }); },
  hit_soft: (t) => { tone(sfx, { t, dur: 1.4, f0: 62, f1: 40, curve: 0.3, gain: 0.4, decay: 0.35, send: 0.3 }); tone(sfx, { t, dur: 1.6, f0: 392, gain: 0.05, decay: 0.5, send: 0.9 }); },
  whoosh: (t) => noise(sfx, { t: t - 0.5, dur: 1.5, gain: 0.3, f0: 250, f1: 3200, q: 0.5, shape: 'arc', pan: -0.8, pan1: 0.8, send: 0.5, attack: 0.2, release: 0.3 }),
  whoosh_long: (t) => { noise(sfx, { t: t - 0.4, dur: 3.4, gain: 0.3, f0: 150, f1: 2600, q: 0.45, shape: 'arc', pan: 0.8, pan1: -0.8, send: 0.6, attack: 0.3, release: 0.5 }); tone(sfx, { t: t - 0.4, dur: 3.4, f0: 60, f1: 140, gain: 0.12, type: 'tri', attack: 1.5, release: 1.5, send: 0.4 }); },
  riser: (t, i, n, c) => { const d = c.dur || 3; noise(sfx, { t, dur: d, gain: 0.26, f0: 400, f1: 7000, q: 0.4, shape: 'swell', power: 2.6, send: 0.5, release: 0.02 }); tone(sfx, { t, dur: d, f0: 110, f1: 440, curve: 1.6, gain: 0.07, type: 'saw', attack: d * 0.7, release: 0.02, send: 0.6 }); },
  reverse: (t) => { noise(sfx, { t: t - 2.2, dur: 2.2, gain: 0.3, f0: 3000, f1: 6500, q: 0.3, shape: 'swell', power: 4, send: 0.7, release: 0.015, mode: 'hp' }); },
  data: (t) => { const r = rng(Math.floor(t * 50)); for (let k = 0; k < 22; k++) tone(sfx, { t: t + k * 0.045 + r() * 0.02, dur: 0.035, f0: 900 + Math.floor(r() * 12) * 320, gain: 0.05, type: r() > 0.5 ? 'square' : 'sine', attack: 0.002, release: 0.01, pan: r() * 1.6 - 0.8, send: 0.35 }); },
  blip: (t) => { tone(sfx, { t, dur: 0.07, f0: 1320, gain: 0.12, attack: 0.002, release: 0.03, send: 0.6 }); tone(sfx, { t: t + 0.07, dur: 0.12, f0: 1980, gain: 0.1, attack: 0.002, release: 0.08, send: 0.7 }); },
  alarm: (t) => { for (let k = 0; k < 4; k++) tone(sfx, { t: t + k * 0.42, dur: 0.36, f0: k % 2 ? 622 : 740, gain: 0.07, type: 'tri', attack: 0.02, release: 0.12, pan: -0.3, send: 1.2 }); },
  drone_in: (t) => tone(sfx, { t, dur: 5, f0: 55, f1: 73.4, gain: 0.16, attack: 3, release: 1.5, send: 0.5 }),
  sub_drop: (t) => { tone(sfx, { t, dur: 4.5, f0: 70, f1: 24, curve: 0.5, gain: 0.85, decay: 1.4, attack: 0.004, release: 0.5, send: 0.2 }); noise(sfx, { t, dur: 2.5, gain: 0.12, f0: 500, f1: 90, q: 0.5, shape: 'decay', decay: 0.6, send: 0.8 }); },
  stop: (t) => { tone(sfx, { t: t - 0.35, dur: 0.35, f0: 900, f1: 40, curve: 0.6, gain: 0.3, type: 'saw', attack: 0.01, release: 0.004, send: 0 }); noise(sfx, { t: t - 0.35, dur: 0.35, gain: 0.25, f0: 6000, f1: 200, q: 0.5, release: 0.004, send: 0 }); tone(sfx, { t, dur: 0.12, f0: 60, f1: 35, gain: 0.5, decay: 0.03, send: 0 }); },
  pad_swell: (t) => noise(sfx, { t: t - 1.5, dur: 4, gain: 0.07, f0: 600, f1: 1800, q: 0.3, shape: 'arc', send: 1.0, attack: 1, release: 1.5 }),
};
for (const s of tl.scenes) {
  const counts = {}, seen = {};
  for (const c of s.sfx) counts[c.type] = (counts[c.type] || 0) + 1;
  for (const c of s.sfx) {
    const i = (seen[c.type] = (seen[c.type] ?? -1) + 1);
    if (!fx[c.type]) { console.warn('unbekannter SFX-Typ:', c.type); continue; }
    fx[c.type](s.start + c.t, i, counts[c.type], c);
  }
}

// --- reverb (Freeverb topology) ----------------------------------------------------------------
function reverb(inL, inR, { room = 0.86, damp = 0.3, spread = 23 } = {}) {
  const k = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const mk = (off) => ({
    combs: combT.map((n) => ({ buf: new Float32Array(Math.round((n + off) * k)), i: 0, store: 0 })),
    aps: apT.map((n) => ({ buf: new Float32Array(Math.round((n + off) * k)), i: 0 })),
  });
  const ch = [mk(0), mk(spread)], out = [new Float32Array(N), new Float32Array(N)];
  const fb = room * 0.28 + 0.7;
  for (let n = 0; n < N; n++) {
    const x = (inL[n] + inR[n]) * 0.015;
    for (let c = 0; c < 2; c++) {
      let acc = 0;
      for (const cb of ch[c].combs) {
        const y = cb.buf[cb.i];
        cb.store = y * (1 - damp) + cb.store * damp;
        cb.buf[cb.i] = x + cb.store * fb;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        acc += y;
      }
      for (const ap of ch[c].aps) {
        const b = ap.buf[ap.i], y = -acc + b;
        ap.buf[ap.i] = acc + b * 0.5;
        if (++ap.i >= ap.buf.length) ap.i = 0;
        acc = y;
      }
      out[c][n] = acc;
    }
  }
  return out;
}

// --- master: reverb, silence gate, fades, soft clip, normalise ---------------------------------
const s10 = S('s10'), s11 = S('s11');
const gates = [
  [s10.start + s10.marks.silence, s10.start + s10.marks.silenceEnd], // absolute silence before the point of no return
  [s11.start, s11.start + s11.marks.back - 0.05], // black: "Stopp."
];
function finish(bus, { wet, peak, room, name, gateAll, pre = 1 }) {
  const [wL, wR] = reverb(bus.sL, bus.sR, { room });
  let max = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let g = Math.min(1, t / 0.4) * Math.min(1, (DUR - t) / 2.5);
    gates.forEach(([a, b], gi) => {
      if (!gateAll && gi === 1) return; // sfx may still speak in the black (the stop itself)
      if (t > a - 0.04 && t < b) g *= t < a ? (a - t) / 0.04 : 0;
    });
    let l = (bus.L[i] + wL[i] * wet) * g * pre, r = (bus.R[i] + wR[i] * wet) * g * pre;
    l = Math.tanh(l * 1.4) / 1.4; r = Math.tanh(r * 1.4) / 1.4;
    bus.L[i] = l; bus.R[i] = r;
    max = Math.max(max, Math.abs(l), Math.abs(r));
  }
  const k = peak / (max || 1);
  const pcm = Buffer.alloc(44 + N * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28);
  pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
  const dr = rng(99);
  for (let i = 0; i < N; i++) {
    const d = (dr() - dr()) / 65536; // TPDF dither
    pcm.writeInt16LE(Math.round(clamp(bus.L[i] * k + d, -1, 1) * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(clamp(bus.R[i] * k + d, -1, 1) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path.join(root, 'audio', name), pcm);
  console.log(`${name}: ${(N / SR).toFixed(1)}s, Spitze vor Normalisierung ${max.toFixed(2)}`);
}
finish(music, { wet: 1.0, peak: 0.7, room: 0.9, name: 'music.wav', gateAll: true, pre: 0.5 });
finish(sfx, { wet: 0.8, peak: 0.8, room: 0.82, name: 'sfx.wav', gateAll: false, pre: 0.8 });
