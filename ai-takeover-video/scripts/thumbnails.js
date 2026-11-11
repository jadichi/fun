// Three thumbnail candidates (1280x720 PNG): strong frames from the film plus large type.
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.js';
import { openRenderer, root } from './render.js';

const tl = JSON.parse(fs.readFileSync(path.join(root, 'timeline.json'), 'utf8'));
const S = (id) => tl.scenes.find((s) => s.id === id);
const s02 = S('s02'), s08 = S('s08'), s10 = S('s10');
const specs = [
  { name: 'thumb_1_uhr', T: s10.start + s10.marks.silence * 0.55, thumb: { heat: 1, size: 260, lines: [{ text: 'DIE UHR' }, { text: 'LÄUFT', accent: true }], sub: 'EIN KI-SZENARIO · BELEGT BIS 2026' } },
  { name: 'thumb_2_wettlauf', T: s08.start + s08.marks.vote - 2.2, thumb: { heat: 0.6, size: 190, lines: [{ text: 'WER BREMST,' }, { text: 'VERLIERT?', accent: true }], sub: 'KI-WETTLAUF · WAS BELEGT IST, WAS NICHT' } },
  { name: 'thumb_3_test', T: s02.start + s02.marks.two + 2.2, thumb: { heat: 0.85, size: 330, lines: [{ text: '96 %', accent: true }, { text: 'ERPRESSUNG', size: 170 }], sub: 'ZWEI KI-MODELLE IM SICHERHEITSTEST · 2025' } },
];
const dir = path.join(root, 'render', 'thumbnails');
fs.mkdirSync(dir, { recursive: true });
const { server, port } = await startServer();
const r = await openRenderer({ port, w: 1280, h: 720 });
for (const s of specs) {
  fs.writeFileSync(path.join(dir, `${s.name}.png`), await r.frame(s.T, 'png', 1, { thumb: s.thumb }));
  console.log(`render/thumbnails/${s.name}.png`);
}
await r.browser.close();
server.close();
