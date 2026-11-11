// Voice-over with ElevenLabs. One request per take (= one scene; S10 has two takes around the
// silence). Uses the with-timestamps endpoint so every narration line gets an exact start and
// end time. Results: tts/<take>.mp3 and tts/timings.json, which build-timeline.js picks up.
//
//   .env:  ELEVENLABS_API_KEY=...            (required)
//          ELEVENLABS_VOICE_ID=...           (optional, see --list-voices)
//          ELEVENLABS_MODEL=eleven_multilingual_v2   (optional)
//          ELEVENLABS_SPEED=1.0              (optional, 0.7 .. 1.2)
//
//   node tts/generate.js                generate missing takes (cached by text + settings)
//   node tts/generate.js --force        regenerate everything
//   node tts/generate.js --only=s03_a   one take
//   node tts/generate.js --list-voices  show the voices of the account
//   node tts/generate.js --mock         no API call: silent placeholder takes for pipeline tests
import './_proxy.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { meta, scenes } from '../timeline.src.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tts');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // premade "Daniel"; set your own in .env
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const SPEED = +(process.env.ELEVENLABS_SPEED || 1.0);
const FORMAT = process.env.ELEVENLABS_FORMAT || 'mp3_44100_128'; // 192 kbit/s needs the Creator tier
const API = 'https://api.elevenlabs.io/v1';
const settings = { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: SPEED };

if (args['list-voices']) {
  if (!KEY) throw new Error('ELEVENLABS_API_KEY fehlt in .env');
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': KEY } });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  for (const v of (await r.json()).voices) console.log(`${v.voice_id}  ${v.name}  [${Object.values(v.labels || {}).join(', ')}]`);
  process.exit(0);
}

// takes: consecutive narration lines, split at silences
const takes = [];
for (const sc of scenes) {
  let cur = [], n = 0;
  const close = () => { if (cur.length) takes.push({ id: `${sc.id}_${String.fromCharCode(97 + n++)}`, scene: sc.id, lines: cur }); cur = []; };
  for (const l of sc.lines) (typeof l === 'string' ? cur.push(l) : close());
  close();
}
takes.forEach((t, i) => { t.text = t.lines.join(' '); t.prev = takes[i - 1]?.text; t.next = takes[i + 1]?.text; });

const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
const hash = (t) => crypto.createHash('sha1').update(JSON.stringify([t.text, VOICE, MODEL, settings])).digest('hex').slice(0, 12);

async function synth(t) {
  const r = await fetch(`${API}/text-to-speech/${VOICE}/with-timestamps?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t.text, model_id: MODEL, voice_settings: settings, previous_text: t.prev, next_text: t.next, seed: 2026 }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} bei ${t.id}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const al = j.alignment || j.normalized_alignment;
  fs.writeFileSync(path.join(dir, `${t.id}.mp3`), Buffer.from(j.audio_base64, 'base64'));
  // map every line to its character range in the take text
  const lines = [];
  let pos = 0;
  for (const l of t.lines) {
    const a = pos, b = pos + l.length - 1;
    lines.push({ start: al.character_start_times_seconds[Math.min(a, al.characters.length - 1)], end: al.character_end_times_seconds[Math.min(b, al.characters.length - 1)] });
    pos += l.length + 1;
  }
  return lines;
}

function mock(t) {
  // silent placeholder with a plausible length (135 words per minute) so the pipeline can be tested
  let x = 0.12; const lines = [];
  for (const l of t.lines) { const d = (l.split(/\s+/).length / 135) * 60; lines.push({ start: x, end: x + d }); x += d + 0.3; }
  const dur = x - 0.15;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', dur.toFixed(3), '-c:a', 'libmp3lame', '-b:a', '64k', path.join(dir, `${t.id}.mp3`)]);
  return lines;
}

if (!KEY && !args.mock) {
  console.error('ELEVENLABS_API_KEY fehlt. Lege eine Datei .env an (siehe .env.example) oder nutze --mock für einen Testlauf.');
  process.exit(2);
}
const file = path.join(dir, 'timings.json');
const timings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
if (!!timings._mock !== !!args.mock) for (const k of Object.keys(timings)) delete timings[k]; // never mix mock and real takes
if (args.mock) timings._mock = true;
let chars = 0;
for (const t of takes) {
  if (args.only && args.only !== t.id) continue;
  const idx = t.id.charCodeAt(t.id.length - 1) - 97;
  const sc = (timings[t.scene] ||= { takes: [] });
  const h = hash(t) + (args.mock ? '-mock' : '');
  const mp3 = path.join(dir, `${t.id}.mp3`);
  if (!args.force && sc.takes[idx]?.hash === h && fs.existsSync(mp3)) { console.log(`${t.id}: unverändert (Cache)`); continue; }
  const lines = args.mock ? mock(t) : await synth(t);
  chars += t.text.length;
  sc.takes[idx] = { id: t.id, hash: h, duration: probe(mp3), lines: lines.map((l) => ({ start: +l.start.toFixed(3), end: +l.end.toFixed(3) })) };
  console.log(`${t.id}: ${sc.takes[idx].duration.toFixed(2)}s  (${t.text.length} Zeichen)`);
  fs.writeFileSync(file, JSON.stringify(timings, null, 1));
}
fs.writeFileSync(file, JSON.stringify(timings, null, 1));
const total = Object.entries(timings).filter(([k]) => k !== '_mock').reduce((a, [, s]) => a + s.takes.reduce((b, t) => b + (t?.duration || 0), 0), 0);
const have = new Set(Object.entries(timings).filter(([k]) => k !== '_mock').flatMap(([, s]) => s.takes.filter(Boolean).map((t) => t.id)));
const wordCount = takes.filter((t) => have.has(t.id)).reduce((a, t) => a + t.text.split(/\s+/).length, 0);
console.log(`${args.mock ? 'MOCK · ' : ''}Stimme: ${have.size}/${takes.length} Takes, ${total.toFixed(1)}s für ${wordCount} Wörter (${Math.round(wordCount / (total / 60))} Wörter/Minute, Schätzung war ${meta.wpm}) · ${chars} Zeichen neu erzeugt`);
