// HUD drawn into a 2D canvas (design space 1920x1080) and composited in the final shader pass,
// so glitches and chromatic aberration hit the type as well.
// Contains: countdown clock (top right), FAKT / SZENARIO label (top left), source line
// (bottom left), kinetic typography, 3D-anchored labels and optional subtitles.
import { clockState } from './clock.js';
import { heatColor, css, sat, easeOut, easeInOut, smooth, hash, lerp, PAL } from './util.js';

const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

export function createHud(W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const k = W / 1920;

  const text = (str, x, y, { font, color, align = 'left', spacing = 0, glow = 0, alpha = 1, base = 'alphabetic' }) => {
    g.font = font; g.textAlign = align; g.textBaseline = base;
    g.letterSpacing = `${spacing}px`;
    g.globalAlpha = sat(alpha);
    g.fillStyle = color;
    if (glow > 0) { g.shadowColor = color; g.shadowBlur = glow; g.fillText(str, x, y); }
    g.shadowBlur = 0;
    g.fillText(str, x, y);
    g.globalAlpha = 1;
  };
  const width = (str, font, spacing = 0) => { g.font = font; g.letterSpacing = `${spacing}px`; return g.measureText(str).width; };

  function drawClock(tl, T, frame) {
    const c = clockState(tl, T);
    if (c.alpha <= 0.001) return;
    const col = heatColor(c.heat);
    const bright = [lerp(col[0], 1, 0.55), lerp(col[1], 1, 0.55), lerp(col[2], 1, 0.55)];
    const flash = 1 - c.tickPhase; // 1 right at a tick
    let x = 1848, y = 70;
    if (c.jitter) { x += (hash(frame * 1.3) - 0.5) * 7 * c.jitter; y += (hash(frame * 2.1) - 0.5) * 5 * c.jitter; }
    if (c.heat > 0.9 && !c.frozen) { x += (hash(frame * 3.7) - 0.5) * 5; y += (hash(frame * 4.9) - 0.5) * 3; }

    let main = c.main;
    // digits scramble right after a chapter jump
    if (c.scenario && c.sinceStart !== undefined && c.sinceStart < 0.6 && c.mode !== 'today') {
      const p = c.sinceStart / 0.6;
      main = [...main].map((ch, i) => (/\d/.test(ch) && hash(frame * 7 + i * 13) > p ? String(Math.floor(hash(frame + i * 31) * 10)) : ch)).join('');
    }
    if (c.jitter > 0.3 && hash(frame * 9.1) > 0.86) {
      main = [...main].map((ch, i) => (i === 3 && /\d/.test(ch) ? String(Math.floor(hash(frame * 5) * 10)) : ch)).join('');
    }

    const a = c.alpha;
    if (c.label) text(c.label, x, y, { font: `600 19px ${SANS}`, color: css(col, 0.85), align: 'right', spacing: 5, alpha: a });
    if (c.mode === 'today') {
      const pop = easeOut(sat(c.pop / 0.7));
      text('HEUTE', x + 6, y + 108, { font: `800 ${Math.round(112 + 10 * (1 - pop))}px ${SANS}`, color: css([0.86, 0.93, 1]), align: 'right', spacing: 10 + 40 * (1 - pop), glow: 16, alpha: a });
      g.globalAlpha = a * 0.7; g.fillStyle = css(PAL.blue); g.fillRect(x - 372 * pop, y + 132, 372 * pop, 3); g.globalAlpha = 1;
      return;
    }
    const size = c.mode === 'year' ? 124 : c.mode === 'hour' ? 124 : 92;
    text(main, x + 4, y + (size > 100 ? 122 : 100), { font: `700 ${size}px ${MONO}`, color: css(bright), align: 'right', spacing: -2, glow: 12 + 12 * flash, alpha: a * (c.frozen ? 0.92 : 0.9 + 0.1 * flash) });
    let yy = y + (size > 100 ? 150 : 128);
    if (c.small) { text(c.small, x, yy + 22, { font: `500 28px ${MONO}`, color: css(col, 0.9), align: 'right', spacing: 2, alpha: a }); yy += 40; }
    // granularity marks: months of the year, days of the month, hours, minutes
    if (c.marks) {
      const total = 372, gap = c.marks > 31 ? 2 : 4, w = (total - gap * (c.marks - 1)) / c.marks;
      for (let i = 0; i < c.marks; i++) {
        const on = i < Math.floor(c.filled + 1e-6), cur = i === Math.floor(c.filled + 1e-6);
        g.globalAlpha = a * (on ? 0.95 : cur ? 0.35 + 0.6 * flash : 0.2);
        g.fillStyle = css(on || cur ? bright : col);
        g.fillRect(x - total + i * (w + gap), yy, w, on ? 12 : 8);
      }
      g.globalAlpha = 1;
      text(c.unit, x, yy + 40, { font: `600 16px ${SANS}`, color: css(col, 0.7), align: 'right', spacing: 5, alpha: a });
    }
  }

  function drawLabel(scene, t) {
    let kind = scene.kind, sw = 1;
    if (kind === 'threshold') { kind = t < scene.marks.turn ? 'fact' : 'scenario'; sw = sat(Math.abs(t - scene.marks.turn) / 0.35); }
    const x = 72, y = 62, h = 44;
    const fin = sat(t / 0.5) * sw;
    const title = (scene.kind === 'scenario' ? scene.title : scene.chapter).toUpperCase().replace(':', ' ·').replace('?', '');
    if (kind === 'fact') {
      const w = 104;
      g.globalAlpha = 0.9 * fin; g.strokeStyle = css(PAL.blue); g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w, h);
      text('FAKT', x + w / 2 + 3, y + 31, { font: `700 21px ${SANS}`, color: css(PAL.ice), align: 'center', spacing: 5, alpha: fin });
      text(title, x + w + 24, y + 31, { font: `500 19px ${SANS}`, color: css(PAL.ice, 0.62), spacing: 4, alpha: fin });
    } else {
      const col = heatColor(Math.max(0.5, scene.heat));
      const w = 176;
      g.globalAlpha = fin; g.fillStyle = css(col); g.shadowColor = css(col); g.shadowBlur = 24; g.fillRect(x, y, w, h + 2); g.shadowBlur = 0;
      text('SZENARIO', x + w / 2 + 3, y + 32, { font: `800 21px ${SANS}`, color: '#0a0606', align: 'center', spacing: 5, alpha: fin });
      text(title, x + w + 24, y + 31, { font: `500 19px ${SANS}`, color: css(col, 0.8), spacing: 4, alpha: fin });
    }
    g.globalAlpha = 1;
  }

  function drawSource(scene, t) {
    for (const s of scene.sources) {
      const a = sat((t - s.start) / 0.4) * sat((s.end - t) / 0.4);
      if (a <= 0) continue;
      const fact = scene.kind === 'fact';
      const col = fact ? PAL.blue : heatColor(Math.max(0.5, scene.heat));
      const x = 72, y = 1016;
      g.globalAlpha = a; g.fillStyle = css(col); g.fillRect(x, y - 44, 3, 50); g.globalAlpha = 1;
      text(fact ? 'QUELLE' : 'EINORDNUNG', x + 18, y - 26, { font: `700 15px ${SANS}`, color: css(col, 0.95), spacing: 4, alpha: a });
      text(s.text, x + 18, y + 2, { font: `500 23px ${SANS}`, color: 'rgba(226,234,246,0.9)', spacing: 0.3, alpha: a });
    }
  }

  const fmtNum = (v, c) => {
    const n = Math.round(v);
    return (c.sep ? n.toLocaleString('de-DE') : String(n)) + (c.suffix || '');
  };

  function drawTypo(scene, t) {
    for (const c of scene.typo) {
      if (t < c.start || t > c.end) continue;
      const lt = t - c.start, dur = c.end - c.start;
      const inn = easeOut(sat(lt / 0.55)), out = sat((c.end - t) / 0.35);
      const col = scene.kind === 'fact' ? [0.84, 0.92, 1] : (() => { const h = heatColor(scene.heat); return [lerp(h[0], 1, 0.5), lerp(h[1], 1, 0.5), lerp(h[2], 1, 0.5)]; })();
      const accent = heatColor(scene.kind === 'fact' ? 0 : Math.max(0.5, scene.heat));
      if (c.kind === 'big' || c.kind === 'morph') {
        let str = c.text;
        if (c.count) str = fmtNum(lerp(c.count.from, c.count.to, easeInOut(sat(lt / Math.min(1.6, dur * 0.5)))), c.count);
        if (c.kind === 'morph') {
          const p = sat((lt - dur * 0.42) / 0.5);
          const n = Math.max(c.text.length, c.to.length);
          str = '';
          for (let i = 0; i < n; i++) {
            const th = (i + 1) / n;
            if (p >= th) str += c.to[i] || '';
            else if (p > th - 0.35 && p > 0) str += 'ABCDEFGHIKLMNORSTUWZ'[Math.floor(hash(Math.floor(lt * 30) + i * 17) * 20)];
            else str += c.text[i] || '';
          }
        }
        const size = str.length > 7 ? 140 : 190;
        const x = 72, y = 760 + 26 * (1 - inn);
        g.globalAlpha = inn * out; g.fillStyle = css(accent); g.fillRect(x, y - size * 0.86 - 46, 64 * inn, 5); g.globalAlpha = 1;
        text(c.sub || '', x + 2, y - size * 0.86 - 4, { font: `600 22px ${SANS}`, color: css(accent, 0.95), spacing: 6, alpha: inn * out });
        text(str, x - 6, y, { font: `800 ${size}px ${SANS}`, color: css(col), spacing: -4 + 26 * (1 - inn), glow: 14, alpha: inn * out });
      } else if (c.kind === 'word') {
        const p = sat(lt / dur);
        const a = sat(lt / 0.12) * sat((c.end - t) / 0.3);
        text(c.text, 960 + 14, 600, { font: `800 150px ${SANS}`, color: css(col), align: 'center', spacing: 14 + 46 * p, glow: 16, alpha: a * 0.95 });
      } else if (c.kind === 'statement') {
        const words = c.text.split(' ');
        const font = `600 62px ${SANS}`;
        const maxW = 1380; const lines = [[]]; let cur = 0;
        for (const w of words) {
          const ww = width(w + ' ', font);
          if (cur + ww > maxW && lines.at(-1).length) { lines.push([]); cur = 0; }
          lines.at(-1).push(w); cur += ww;
        }
        const total = words.length, speak = c.speakEnd - c.start;
        let idx = 0;
        const y0 = 500 - (lines.length - 1) * 44;
        text('„', 960 - width(lines[0].join(' '), font) / 2 - 70, y0 + 6, { font: `800 110px ${SANS}`, color: css(PAL.blue, 0.8), alpha: inn * out });
        lines.forEach((ln, li) => {
          const lw = width(ln.join(' '), font);
          let x = 960 - lw / 2;
          for (const w of ln) {
            const wt = (idx / total) * speak * 0.96;
            const a = easeOut(sat((lt - wt) / 0.45));
            text(w, x, y0 + li * 88 + 10 * (1 - a), { font, color: css([0.9, 0.95, 1]), glow: 6, alpha: a * out });
            x += width(w + ' ', font); idx++;
          }
        });
        text('STATEMENT ON AI RISK · 2023', 960, y0 + lines.length * 88 + 26, { font: `600 20px ${SANS}`, color: css(PAL.blue, 0.9), align: 'center', spacing: 6, alpha: sat((lt - speak) / 0.6 + 1) * inn * out * 0.9 });
      } else if (c.kind === 'question') {
        const endFade = sat((c.end - t) / 1.4);
        text(c.text, 960, 520 + 16 * (1 - inn), { font: `700 78px ${SANS}`, color: css([0.92, 0.96, 1]), align: 'center', spacing: 1 + 18 * (1 - inn), glow: 12, alpha: inn * endFade });
        const sa = easeOut(sat((t - c.subStart) / 0.7));
        text(c.sub, 960, 628 + 12 * (1 - sa), { font: `600 54px ${SANS}`, color: css(PAL.blue), align: 'center', spacing: 2, glow: 10, alpha: sa * endFade });
      }
    }
  }

  function drawLabels(labels) {
    for (const l of labels || []) {
      if (l.alpha <= 0) continue;
      text(l.text, l.x * 1920, l.y * 1080, {
        font: `${l.weight || 700} ${l.size || 28}px ${l.mono ? MONO : SANS}`, color: css(l.color || [1, 1, 1]),
        align: l.align || 'center', spacing: l.spacing ?? 3, glow: l.glow ?? 14, alpha: l.alpha ?? 1, base: 'middle',
      });
    }
  }

  function drawSubtitle(scene, t) {
    const l = scene.narration.find((n) => t >= n.start - 0.05 && t <= n.end + 0.25);
    if (!l) return;
    const font = `500 34px ${SANS}`;
    const rows = []; let cur = '';
    for (const w of l.text.split(' ')) { if (width((cur + ' ' + w).trim(), font) > 1240 && cur) { rows.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    rows.push(cur);
    rows.forEach((r, i) => {
      const y = 940 - (rows.length - 1 - i) * 46;
      const w = width(r, font);
      g.globalAlpha = 0.55; g.fillStyle = '#000'; g.fillRect(960 - w / 2 - 16, y - 34, w + 32, 46); g.globalAlpha = 1;
      text(r, 960, y, { font, color: 'rgba(255,255,255,0.96)', align: 'center' });
    });
  }

  // state: { timeline, T, frame, scene, t, labels, subtitles, hudAlpha }
  function draw(st) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(k, 0, 0, k, 0, 0);
    if (st.hide) return;
    drawTypo(st.scene, st.t);
    drawLabels(st.labels);
    if (st.chrome !== false) { drawLabel(st.scene, st.t); drawSource(st.scene, st.t); }
    drawClock(st.timeline, st.T, st.frame);
    if (st.subtitles) drawSubtitle(st.scene, st.t);
  }

  return { canvas, draw };
}
