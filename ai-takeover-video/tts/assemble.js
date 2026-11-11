// Places the generated takes on the timeline and writes audio/voice.wav (48 kHz stereo).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tl = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
const out = path.join(root, 'audio', 'voice.wav');
const takes = tl.scenes.flatMap((s) => s.takes.map((t) => ({ file: path.join(root, 'tts', `${t.id}.mp3`), at: s.start + t.start, id: t.id })));
const missing = takes.filter((t) => !fs.existsSync(t.file));
if (tl.meta.voice === 'estimated' || missing.length) {
  if (fs.existsSync(out)) fs.rmSync(out);
  console.log(`Keine vollständige Stimme vorhanden (${missing.length} Takes fehlen) – audio/voice.wav wird nicht erzeugt.`);
  process.exit(0);
}
const inputs = takes.flatMap((t) => ['-i', t.file]);
const graph = takes.map((t, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(t.at * 1000)}:all=1[a${i}]`).join(';')
  + `;${takes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${takes.length}:normalize=0:duration=longest,apad=whole_dur=${tl.meta.duration}[o]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[o]', '-t', String(tl.meta.duration), '-c:a', 'pcm_s24le', out], { stdio: 'inherit' });
console.log(`audio/voice.wav: ${takes.length} Takes, ${tl.meta.duration}s`);
