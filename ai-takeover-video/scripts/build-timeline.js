// Resolves timeline.src.js into timeline.json with absolute times.
// Uses measured voice timings from tts/timings.json when present, estimates otherwise.
// Also writes render/subtitles.srt and render/youtube-chapters.txt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meta, scenes as src } from '../timeline.src.js';
import { tickTimes } from '../src/lib/clock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const timingsFile = path.join(root, 'tts', 'timings.json');
let timings = fs.existsSync(timingsFile) ? JSON.parse(fs.readFileSync(timingsFile, 'utf8')) : null;
// placeholder takes from `tts/generate.js --mock` only count when asked for explicitly
if (timings?._mock && !process.argv.includes('--mock')) timings = null;
const complete = timings && src.every((sc) => timings[sc.id]?.takes?.length && timings[sc.id].takes.every((t) => t?.lines?.length));
if (timings && !complete) { console.warn('tts/timings.json ist unvollständig – es wird mit Schätzwerten gerechnet.'); timings = null; }

const fps = meta.fps;
const r3 = (x) => Math.round(x * 1000) / 1000;
const words = (s) => s.trim().split(/\s+/).length;

// k scales the breathing room (lead/tail) of every scene; used to fit the 3:00..5:00 window
function resolve(k) {
let cursor = 0;
const scenes = src.map((sc) => {
  const measured = timings?.[sc.id];
  const lead = Math.max(0.25, sc.lead * k), tail = Math.max(0.35, sc.tail * k);
  let t = lead;
  const narration = [];
  const takes = [];
  const marks = {};
  let take = { id: `${sc.id}_a`, lines: [], start: t };
  let lineIdx = 0;

  const closeTake = () => {
    if (!take.lines.length) return;
    take.text = take.lines.map((l) => l.text).join(' ');
    take.duration = r3(take.lines.at(-1).end - take.start);
    takes.push(take);
  };

  sc.lines.forEach((entry, raw) => {
    if (typeof entry !== 'string') {
      // silence: music and sfx drop out completely
      closeTake();
      marks.silence = r3(t);
      t += entry.silence;
      marks.silenceEnd = r3(t);
      take = { id: `${sc.id}_${String.fromCharCode(97 + takes.length)}`, lines: [], start: t };
      return;
    }
    const m = measured?.takes?.[takes.length]?.lines?.[take.lines.length];
    let start, end;
    if (m) {
      start = take.start + m.start;
      end = take.start + m.end;
    } else {
      start = t;
      end = t + (words(entry) / meta.wpm) * 60;
    }
    const line = { i: lineIdx++, text: entry, start: r3(start), end: r3(end), take: take.id };
    narration.push(line);
    take.lines.push(line);
    t = end + (m ? 0 : meta.lineGap);
    if (!m && raw === sc.lines.length - 1) t = end;
  });
  closeTake();
  takes.forEach((tk) => { tk.start = r3(tk.start); delete tk.lines; });

  const lastEnd = narration.at(-1).end;
  const duration = Math.ceil((lastEnd + tail) * fps) / fps;
  const at = (a) => {
    const base = a.line === -1 || a.line === undefined ? (a.line === -1 ? duration : 0) : narration[a.line].start;
    return r3(Math.max(0, Math.min(duration, base + (a.dt || 0))));
  };

  for (const [k, a] of Object.entries(sc.marks || {})) marks[k] = at(a);

  const sources = (sc.sources || []).map((s, i, arr) => {
    const start = at({ line: s.line, dt: 0.1 });
    const next = arr[i + 1];
    const end = s.until !== undefined ? narration[s.until].end + 0.6 : next ? at({ line: next.line }) - 0.25 : duration - 0.5;
    return { text: s.text, start, end: r3(Math.min(duration, end)) };
  });

  const typo = (sc.typo || []).map((c) => {
    const start = at(c);
    let end = start + (c.dur || 3);
    if (c.toLine !== undefined) end = narration[c.toLine].end + 0.8;
    if (c.toEnd) end = duration;
    const out = { ...c, start, end: r3(Math.min(duration, end)) };
    if (c.kind === 'statement') out.speakEnd = narration[c.line].end;
    if (c.subLine !== undefined) out.subStart = narration[c.subLine].start;
    delete out.line; delete out.dt; delete out.dur; delete out.toLine; delete out.toEnd; delete out.subLine;
    return out;
  });

  const c = sc.clock;
  const clock = { ...c };
  if (c.mode === 'today') {
    clock.tBlack = at({ line: c.blackLine, dt: -0.2 });
    clock.tToday = at({ line: c.todayLine, dt: c.todayDt });
  } else {
    clock.t0 = c.startLine !== undefined ? at({ line: c.startLine }) : 0;
    clock.t1 = c.endMark ? marks[c.endMark] : duration;
  }
  delete clock.startLine; delete clock.endMark; delete clock.blackLine; delete clock.todayLine; delete clock.todayDt;

  const scene = {
    id: sc.id, file: sc.file, title: sc.title, chapter: sc.chapter, kind: sc.kind, heat: sc.heat,
    transition: sc.transition, start: r3(cursor), duration: r3(duration), still: sc.still,
    clock, narration, takes, marks, sources, typo,
    sfx: (sc.sfx || []).map((x) => ({ type: x.type, t: at(x), ...(x.dur ? { dur: x.dur } : {}) })),
  };
  cursor += duration;
  return scene;
});
return { scenes, duration: cursor };
}

// fit: shrink or stretch the pauses until the film is between 3:00 and 5:00 (with margin)
let k = 1, res = resolve(1);
const MAX = 296, MIN = 184;
while (res.duration > MAX && k > 0.2) { k -= 0.05; res = resolve(k); }
while (res.duration < MIN && k < 4) { k += 0.1; res = resolve(k); }
if (k !== 1) console.log(`Pausen skaliert mit Faktor ${k.toFixed(2)}, damit die Länge passt.`);
const { scenes } = res;
let cursor = res.duration;

// clock ticks and chapter impacts become sfx cues (absolute scene-local times)
for (const s of scenes) {
  if (s.clock.mode !== 'today') {
    for (const T of tickTimes(s)) s.sfx.push({ type: `tick_${s.clock.mode}`, t: r3(T - s.start) });
  }
  if (s.transition.startsWith('glitch')) s.sfx.unshift({ type: 'glitch', t: 0 }, { type: s.transition === 'glitch_hard' ? 'impact_hard' : 'impact', t: 0 });
  if (s.transition === 'impact') s.sfx.unshift({ type: 'impact_soft', t: 0 });
  s.sfx.sort((a, b) => a.t - b.t);
}

const duration = r3(cursor);
const timeline = {
  meta: { ...meta, duration, voice: timings ? (timings._mock ? 'mock' : 'measured') : 'estimated', padScale: +k.toFixed(2), generated: 'npm run timeline' },
  scenes,
};
fs.writeFileSync(path.join(root, 'timeline.json'), JSON.stringify(timeline, null, 1));

// --- subtitles ---------------------------------------------------------------------------
const tc = (x) => {
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60), ms = Math.round((x % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};
const wrap = (text, max = 42) => {
  const out = []; let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
};
// split long lines into cues of at most two rows, time proportional to characters
const cues = [];
for (const s of scenes) for (const l of s.narration) {
  const rows = wrap(l.text);
  const chunks = [];
  for (let i = 0; i < rows.length; i += 2) chunks.push(rows.slice(i, i + 2).join('\n'));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let t = s.start + l.start;
  for (const c of chunks) {
    const d = ((l.end - l.start) * c.length) / total;
    cues.push({ start: t, end: t + d, text: c });
    t += d;
  }
}
fs.mkdirSync(path.join(root, 'render'), { recursive: true });
fs.writeFileSync(path.join(root, 'render', 'subtitles.srt'),
  cues.map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(Math.min(c.end + 0.15, cues[i + 1]?.start ?? c.end + 0.15))}\n${c.text}\n`).join('\n'));

// --- YouTube chapters ------------------------------------------------------------------------
const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
fs.writeFileSync(path.join(root, 'render', 'youtube-chapters.txt'),
  scenes.map((s) => `${mmss(s.start)} ${s.chapter}`).join('\n') + '\n');

const total = mmss(duration);
console.log(`timeline.json: ${scenes.length} Szenen, ${total} (${duration}s), Stimme: ${timeline.meta.voice}`);
if (duration < 180 || duration > 300) {
  console.error(`WARNUNG: Gesamtlänge ${total} liegt außerhalb von 3:00 bis 5:00.`);
  console.error('Stellschrauben: ELEVENLABS_SPEED in .env anpassen oder den Text in timeline.src.js kürzen/verlängern.');
  if (strict) process.exit(1);
}
