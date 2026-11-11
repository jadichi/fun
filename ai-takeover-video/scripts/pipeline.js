// One command per deliverable.
//   node scripts/pipeline.js preview   -> render/preview.mp4  (720p, 15 fps, subtitles burned in)
//   node scripts/pipeline.js final     -> render/final.mp4    (1080p, 30 fps, voice if available)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'preview';
const run = (cmd, a) => { console.log(`\n> ${cmd} ${a.join(' ')}`); execFileSync(cmd, a, { cwd: root, stdio: 'inherit' }); };
const node = (script, ...a) => run('node', [script, ...a]);
fs.mkdirSync(path.join(root, 'render', 'tmp'), { recursive: true });

if (mode === 'preview') {
  node('scripts/build-timeline.js', '--strict');
  node('audio/synth.js');
  node('scripts/mix.js', '--no-voice', '--out=audio/mix_preview.wav');
  node('scripts/render.js', '--mode=video', '--w=1280', '--h=720', '--fps=15', '--subs', '--crf=21', '--out=render/tmp/preview_video.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', 'render/tmp/preview_video.mp4', '-i', 'audio/mix_preview.wav', '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'render/preview.mp4']);
  console.log('\nFertig: render/preview.mp4');
} else throw new Error(`Unbekannter Modus: ${mode}`);
