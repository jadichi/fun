// Frame-by-frame export with Puppeteer. Time comes only from timeline.json.
//   node scripts/render.js --mode=styleframes [--scene=s03] [--t=12.5] [--w=1920 --h=1080]
//   node scripts/render.js --mode=video --w=1280 --h=720 --fps=15 [--subs] [--workers=4]
//        [--from=0 --to=20] [--crf=20 --preset=veryfast] --out=render/tmp/video.mp4
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

export function chromePath() {
  const c = [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const found = c.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Kein Chrome/Chromium gefunden. Bitte CHROME_PATH setzen.');
  return found;
}

export async function openRenderer({ port, w, h, subs = false, only = null }) {
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars', `--window-size=${w},${h}`],
    defaultViewport: { width: w, height: h, deviceScaleFactor: 1 },
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.log(`[page ${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html?w=${w}&h=${h}${subs ? '&subs=1' : ''}${only ? `&only=${only}` : ''}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  const err = await page.evaluate('window.__error');
  if (err) throw new Error(err);
  // returns the frame at time T as a Buffer (png or jpeg)
  const frame = async (T, type = 'png', quality = 0.95) => {
    const url = await page.evaluate((T, type, quality) => { window.renderAt(T); return document.querySelector('canvas').toDataURL(`image/${type}`, quality); }, T, type, quality);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };
  return { browser, page, frame };
}

async function styleframes() {
  const w = +(args.w || 1920), h = +(args.h || 1080);
  const timeline = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
  const { server, port } = await startServer();
  const r = await openRenderer({ port, w, h, only: args.scene || null });
  const dir = path.join(root, 'render', 'styleframes');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of timeline.scenes) {
    if (args.scene && args.scene !== s.id) continue;
    const us = args.u ? String(args.u).split(',').map(Number) : [s.still];
    for (const u of us) {
      const T = args.t ? +args.t : s.start + s.duration * u;
      const t0 = Date.now();
      const buf = await r.frame(T);
      const name = args.u ? `${s.file}_u${String(Math.round(u * 100)).padStart(3, '0')}.png` : `${s.file}.png`;
      fs.writeFileSync(path.join(dir, name), buf);
      console.log(`${name}  T=${T.toFixed(2)}s  ${Date.now() - t0}ms`);
    }
  }
  await r.browser.close();
  server.close();
}

// Frame-by-frame video export. The frame range is split across several headless browsers;
// each pipes JPEG frames into its own ffmpeg, the segments are joined without re-encoding.
async function video() {
  const w = +(args.w || 1920), h = +(args.h || 1080), fps = +(args.fps || 30);
  const timeline = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
  const from = +(args.from || 0), to = Math.min(+(args.to || timeline.meta.duration), timeline.meta.duration);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps), total = f1 - f0;
  const workers = Math.max(1, Math.min(+(args.workers || Math.min(4, os.cpus().length)), total));
  const out = path.resolve(root, args.out || 'render/tmp/video.mp4');
  const tmp = path.join(root, 'render', 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { server, port } = await startServer();
  const started = Date.now();
  let done = 0, lastLog = 0;
  const log = () => {
    const el = (Date.now() - started) / 1000, rate = done / el;
    console.log(`  ${done}/${total} Bilder  ${rate.toFixed(1)} fps  Rest ca. ${Math.round((total - done) / (rate || 1) / 60)} min`);
  };
  const segs = await Promise.all([...Array(workers).keys()].map(async (k) => {
    const a = f0 + Math.floor((total * k) / workers), b = f0 + Math.floor((total * (k + 1)) / workers);
    const seg = path.join(tmp, `seg_${path.basename(out, '.mp4')}_${String(k).padStart(2, '0')}.mp4`);
    const r = await openRenderer({ port, w, h, subs: !!args.subs });
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', String(args.preset || 'medium'), '-crf', String(args.crf || 18), '-pix_fmt', 'yuv420p',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
      '-r', String(fps), '-video_track_timescale', '30000', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));
    for (let f = a; f < b; f++) {
      const buf = await r.frame(f / fps, 'jpeg', +(args.q || 0.95));
      if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res));
      done++;
      if (Date.now() - lastLog > 20000) { lastLog = Date.now(); log(); }
    }
    ff.stdin.end();
    await closed;
    await r.browser.close();
    return seg;
  }));
  server.close();
  const list = path.join(tmp, `concat_${path.basename(out, '.mp4')}.txt`);
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n') + '\n');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  segs.forEach((s) => fs.rmSync(s));
  fs.rmSync(list);
  console.log(`${path.relative(root, out)}: ${total} Bilder in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = args.mode || 'styleframes';
  if (mode === 'styleframes') await styleframes();
  else if (mode === 'video') await video();
  else throw new Error(`Unbekannter Modus: ${mode}`);
}
