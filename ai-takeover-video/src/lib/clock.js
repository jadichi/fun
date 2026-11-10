// Countdown clock logic. Pure functions of timeline time, shared by the renderer (browser)
// and the timeline builder (Node, for tick SFX cues).

export const MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

const ms = (iso) => Date.parse(iso + ':00Z');
const pad = (n) => String(n).padStart(2, '0');

// How many audible/visible ticks a scene gets, by clock granularity.
export function tickCount(clock) {
  if (!clock.from || clock.from === clock.to) return 0;
  const span = ms(clock.to) - ms(clock.from);
  const day = 86400000;
  if (clock.mode === 'year') return Math.max(1, Math.round(span / (30.4 * day))); // one per month
  if (clock.mode === 'month') return Math.round((span / (30.4 * day)) * 3); // three per month
  if (clock.mode === 'day') return Math.round((span / day) * 2); // two per day
  if (clock.mode === 'hour') return Math.round((span / 3600000) * 4); // four per hour
  return 0;
}

// Absolute tick times for one resolved scene.
export function tickTimes(scene) {
  const c = scene.clock;
  const n = tickCount(c);
  const out = [];
  for (let i = 1; i <= n; i++) out.push(scene.start + c.t0 + ((c.t1 - c.t0) * i) / n);
  return out;
}

function fmt(mode, date) {
  const y = date.getUTCFullYear(), mo = date.getUTCMonth(), d = date.getUTCDate();
  const h = date.getUTCHours(), mi = date.getUTCMinutes();
  const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  if (mode === 'year') return { main: String(y), small: '', unit: 'JAHR', marks: 12, filled: mo + (d - 1) / dim };
  if (mode === 'month') return { main: `${MONTHS[mo]} ${y}`, small: '', unit: 'MONAT', marks: dim, filled: d - 1 + h / 24 };
  if (mode === 'day') return { main: `${pad(d)}. ${MONTHS[mo]}`, small: String(y), unit: 'TAG', marks: 24, filled: h + mi / 60 };
  return { main: `${pad(h)}:${pad(mi)}`, small: `${pad(d)}. ${MONTHS[mo]} ${y}`, unit: 'STUNDE', marks: 60, filled: mi };
}

// State of the clock at absolute time T.
export function clockState(timeline, T) {
  const scenes = timeline.scenes;
  let i = scenes.findIndex((s) => T < s.start + s.duration);
  if (i < 0) i = scenes.length - 1;
  const s = scenes[i], c = s.clock, t = T - s.start;

  if (c.mode === 'today') {
    const prev = scenes[i - 1].clock;
    const frozen = fmt(prev.mode, new Date(ms(prev.to)));
    if (t < c.tToday) {
      // frozen, then fading to black
      const a = t < c.tBlack ? 1 : Math.max(0, 1 - (t - c.tBlack) / 0.5);
      return { ...frozen, mode: prev.mode, heat: 1, alpha: a, frozen: true, tickPhase: 1, scenario: true };
    }
    const a = Math.min(1, (t - c.tToday) / 0.6);
    return { main: 'HEUTE', small: '', unit: '', marks: 0, filled: 0, mode: 'today', heat: 0, alpha: a, pop: t - c.tToday, tickPhase: 1, scenario: false };
  }

  const span = c.t1 - c.t0;
  const p = span > 0 ? Math.min(1, Math.max(0, (t - c.t0) / span)) : 0;
  const date = new Date(ms(c.from) + (ms(c.to) - ms(c.from)) * p);
  const n = tickCount(c);
  // time since last tick, for the tick flash
  let tickPhase = 1;
  if (n > 0 && t >= c.t0) {
    const step = span / n;
    tickPhase = t >= c.t1 ? Math.min(1, (t - c.t1) / 0.35) : (((t - c.t0) % step) / Math.min(step, 0.35));
    tickPhase = Math.min(1, tickPhase);
  }
  const isFact = s.kind === 'fact';
  return {
    ...fmt(c.mode, date), mode: c.mode, heat: s.heat, alpha: 1, tickPhase,
    jitter: c.jitter && t >= c.t0 ? Math.min(1, (t - c.t0) / 2.5) : 0,
    frozen: n > 0 && t >= c.t1, scenario: !isFact,
    sinceStart: t, // for the chapter-jump roll animation
    label: isFact ? 'HEUTE' : s.kind === 'threshold' ? 'HEUTE' : 'SZENARIO-ZEIT',
  };
}
