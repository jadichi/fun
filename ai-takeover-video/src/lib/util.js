// Small deterministic helpers. Nothing here reads the wall clock.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (x) => clamp(x, 0, 1);
export const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - sat(t), 3);
export const easeIn = (t) => Math.pow(sat(t), 3);
export const easeInOut = (t) => { t = sat(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// window: fades in over `a` seconds after t0 and out over `b` seconds before t1
export const win = (t, t0, t1, a = 0.4, b = 0.4) => sat((t - t0) / a) * sat((t1 - t) / b);

export function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(f.range(a, b + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += f(); return (u - 2) / 1.1547; };
  return f;
}
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Colour language: cool blue = human / present, amber -> red = loss of control.
export const PAL = {
  blue: [0.30, 0.62, 1.0],
  ice: [0.72, 0.86, 1.0],
  amber: [1.0, 0.56, 0.14],
  red: [1.0, 0.16, 0.10],
  white: [1, 1, 1],
};
export function heatColor(h) {
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  if (h < 0.5) return mix(PAL.blue, PAL.amber, smooth(0.05, 0.5, h));
  return mix(PAL.amber, PAL.red, smooth(0.5, 1, h));
}
export const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
