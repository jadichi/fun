// Final audio mix with ffmpeg.
//   music.wav + sfx.wav (+ voice.wav when it exists)
//   voice present: music and sfx are ducked under the voice (sidechaincompress)
//   master: peak limiter, then loudnorm to -14 LUFS / -1.5 dBTP (two-pass, linear)
// Usage: node scripts/mix.js [--out=audio/mix.wav]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const A = (f) => path.join(root, 'audio', f);
const out = path.resolve(root, args.out || 'audio/mix.wav');
const hasVoice = fs.existsSync(A('voice.wav')) && !args['no-voice'];
const TARGET = { I: -14, TP: -1.5, LRA: 20 };

const inputs = ['-i', A('music.wav'), '-i', A('sfx.wav'), ...(hasVoice ? ['-i', A('voice.wav')] : [])];
// premix graph -> [pre]
const graph = hasVoice
  ? [
    // voice on top; music sits about 11 dB under it while it speaks and comes up in longer pauses
    '[2:a]aformat=channel_layouts=stereo,highpass=f=70,asplit=3[v][vk1][vk2]',
    // a dip around 2.5 kHz keeps the score out of the way of the consonants
    '[0:a]volume=0.6,equalizer=f=2500:t=q:w=1.1:g=-4[m0]', '[1:a]volume=0.8[s0]',
    '[m0][vk1]sidechaincompress=threshold=0.03:ratio=5:attack=30:release=900:knee=6[m2]',
    '[s0][vk2]sidechaincompress=threshold=0.08:ratio=2:attack=10:release=400:knee=6[s2]',
    '[v][m2][s2]amix=inputs=3:normalize=0:duration=longest[pre]',
  ]
  : ['[0:a]volume=1.0[m]', '[1:a]volume=0.9[s]', '[m][s]amix=inputs=2:normalize=0:duration=longest[pre]'];

function measure(chain) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...inputs, '-filter_complex',
    [...graph, `[pre]${chain}loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json[o]`].join(';'), '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) { console.error(r.stderr.slice(-2000)); throw new Error('loudnorm-Messung fehlgeschlagen'); }
  return JSON.parse(m[0]);
}

// loudnorm under-reports inter-sample peaks on its input, so true peak is measured with ebur128.
function truePeak(chain) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...inputs, '-filter_complex',
    [...graph, `[pre]${chain}ebur128=peak=true[o]`].join(';'), '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return parseFloat(s.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]);
}

// 1) measure the premix; 2) bring it near target and catch the few peaks (impacts) with a limiter;
// 3) measure again; 4) loudnorm in linear mode lands exactly on target without pumping.
const m1 = measure('');
let gain = TARGET.I - parseFloat(m1.input_i), limit = -2.6, chain, m2;
for (let k = 0; k < 5; k++) {
  chain = `volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, limit / 20).toFixed(4)}:attack=4:release=60:level=disabled,`;
  m2 = measure(chain);
  const rest = TARGET.I - parseFloat(m2.input_i); // gain loudnorm still has to add
  const tp = truePeak(chain.replace(/,$/, ',')); // true peak after the limiter
  const over = tp + rest - TARGET.TP; // overshoot once loudnorm has added the rest
  if (process.env.MIX_DEBUG) console.log({ k, gain, limit, in_i: m2.input_i, in_tp: m2.input_tp, tp, rest, over, type: m2.normalization_type });
  if (over <= -0.05 && Math.abs(rest) < 0.6) break;
  gain += rest * 0.9;
  if (over > -0.05) limit -= over + 0.35;
}
const ln = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m2.input_i}:measured_TP=${m2.input_tp}:measured_LRA=${m2.input_lra}:measured_thresh=${m2.input_thresh}:offset=${m2.target_offset}:linear=true`;
const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', [...graph, `[pre]${chain}${ln}[o]`].join(';'),
  '-map', '[o]', '-ar', '48000', '-c:a', 'pcm_s24le', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);

const check = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
const sum = check.stderr.slice(check.stderr.lastIndexOf('Summary:'));
const I = sum.match(/I:\s+(-?[\d.]+) LUFS/)?.[1], TP = sum.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1], LRA = sum.match(/LRA:\s+(-?[\d.]+) LU/)?.[1];
console.log(`${path.relative(root, out)}: ${hasVoice ? 'mit Stimme (Sidechain-Ducking)' : 'ohne Stimme'} · ${I} LUFS · True Peak ${TP} dBFS · LRA ${LRA} LU`);
