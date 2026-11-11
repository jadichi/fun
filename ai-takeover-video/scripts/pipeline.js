// One command per deliverable.
//   node scripts/pipeline.js preview   -> render/preview.mp4  (720p, 15 fps, subtitles burned in)
//   node scripts/pipeline.js final     -> render/final.mp4    (1080p, 30 fps, with voice when available)
// Extra flags are passed on to the renderer, e.g.  npm run final -- --gpu --workers=6
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'preview';
const extra = process.argv.slice(3);
const run = (cmd, a) => { console.log(`\n> ${cmd} ${a.join(' ')}`); execFileSync(cmd, a, { cwd: root, stdio: 'inherit' }); };
const node = (script, ...a) => run('node', [script, ...a]);
const exists = (f) => fs.existsSync(path.join(root, f));
fs.mkdirSync(path.join(root, 'render', 'tmp'), { recursive: true });

// 1) voice: generate (cached) when a key is present, otherwise use what is there
function voice() {
  if (process.env.ELEVENLABS_API_KEY) node('tts/generate.js');
  else console.log('\nKein ELEVENLABS_API_KEY in .env – vorhandene Takes werden verwendet, sonst läuft der Film ohne Stimme.');
}
// 2) timeline from the measured voice lengths (aborts outside 3:00..5:00), then voice.wav
function timeline() {
  node('scripts/build-timeline.js', '--strict');
  node('tts/assemble.js');
  return exists('audio/voice.wav');
}
const mux = (video, audio, out, abr) => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', abr, '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);

if (mode === 'preview') {
  voice();
  const hasVoice = timeline();
  node('audio/synth.js');
  node('scripts/mix.js', '--out=audio/mix_preview.wav');
  // with a voice the preview needs no subtitles; pass --subs to burn them in anyway
  node('scripts/render.js', '--mode=video', '--w=1280', '--h=720', '--fps=15', ...(hasVoice ? [] : ['--subs']), '--crf=25', '--maxrate=2500k', '--bufsize=5000k', '--out=render/tmp/preview_video.mp4', ...extra);
  mux('render/tmp/preview_video.mp4', 'audio/mix_preview.wav', 'render/preview.mp4', '192k');
  console.log(`\nFertig: render/preview.mp4 (${hasVoice ? 'mit Stimme' : 'ohne Stimme, Untertitel eingebrannt'})`);
} else if (mode === 'final') {
  voice();
  const hasVoice = timeline();
  node('audio/synth.js');
  node('scripts/mix.js', '--out=audio/mix.wav');
  node('scripts/render.js', '--mode=video', '--w=1920', '--h=1080', '--fps=30', '--preset=slow', '--crf=18', '--maxrate=12M', '--bufsize=24M', '--q=0.97', '--out=render/tmp/final_video.mp4', ...extra);
  mux('render/tmp/final_video.mp4', 'audio/mix.wav', 'render/final.mp4', '320k');
  node('scripts/thumbnails.js');
  const tl = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
  const d = tl.meta.duration;
  console.log(`\nFertig: render/final.mp4 · ${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')} · ${hasVoice ? 'mit Stimme' : 'OHNE Stimme'}`);
  console.log('Dazu: render/subtitles.srt · render/youtube-chapters.txt · render/thumbnails/');
} else throw new Error(`Unbekannter Modus: ${mode}`);
