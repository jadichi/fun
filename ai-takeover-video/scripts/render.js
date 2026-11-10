// Frame-by-frame export with Puppeteer. Time comes only from timeline.json.
//   node scripts/render.js --mode=styleframes [--scene=s03] [--t=12.5] [--w=1920 --h=1080]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if ((args.mode || 'styleframes') === 'styleframes') await styleframes();
}
