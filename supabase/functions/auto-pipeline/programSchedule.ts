// When to post, and which kind of post — pure functions, no I/O.
// Used by the pipeline (program.ts) and by the admin panel, which shows the
// same plan as a preview before the program is started.
//
// Rules:
//  - Each network gets its own number of posts a day, placed in the times of
//    day that suit it. Every day uses a different set of time windows than
//    the day before and a different minute inside each window.
//  - Two networks never post at the same moment (at least ~12 minutes apart),
//    and avoid the same kind of post within a few hours of each other.
//  - The kind of post follows the pillar mix (programCatalog.ts): the pillar
//    that is furthest behind its share goes next. Never the same format twice
//    in a row, never twice on one day, and each format rests for its cooldown.

import {
  DAY_PARTS,
  FORMATS,
  FORMAT_BY_KEY,
  PILLAR_ORDER,
  RHYTHM,
  isFormatOn,
  mixFor,
  perDayFor,
  type DayPart,
  type FormatDef,
  type Pillar,
  type Platform,
  type ProgramSettings,
} from './programCatalog.ts';

// --- Time zones ---------------------------------------------------------------

const DTF = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = DTF.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    } catch {
      f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    }
    DTF.set(tz, f);
  }
  return f;
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type LocalTime = { key: string; weekday: number; minutes: number; part: DayPart | null };

/** The wall-clock date and time of an instant in a time zone. */
export function localTime(ms: number, tz: string): LocalTime {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  const part = (Object.keys(DAY_PARTS) as DayPart[]).find((k) => minutes >= DAY_PARTS[k].from - 20 && minutes <= DAY_PARTS[k].to + 40) ?? null;
  return { key: `${p.year}-${p.month}-${p.day}`, weekday: Math.max(0, WEEKDAYS.indexOf(p.weekday)), minutes, part };
}

function offsetMinutes(ms: number, tz: string): number {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - ms) / 60_000);
}

/** The instant when it is `minutes` past midnight on local day `key` ("YYYY-MM-DD"). */
export function atLocal(key: string, minutes: number, tz: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let ms = naive - offsetMinutes(naive, tz) * 60_000;
  ms = naive - offsetMinutes(ms, tz) * 60_000; // once more, for days when the clocks change
  return ms;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

// --- Repeatable randomness -----------------------------------------------------
// Seeded by network + date, so planning twice gives the same times (no
// duplicates when two runs overlap) while every day still looks different.

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Times of day ----------------------------------------------------------------

export type DayTime = { part: DayPart; minutes: number };

/**
 * `count` posting times for one network on one day.
 * `prev` = the windows used the day before (to pick a different set);
 * `taken` = minutes already used by other networks that day (to stay clear of them).
 */
export function planDay(platform: Platform, key: string, count: number, prev: DayPart[] = [], taken: number[] = [], salt = ''): DayTime[] {
  if (count <= 0) return [];
  const r = rng(`${platform}|${key}|times|${salt}`);
  const prefs = RHYTHM[platform].parts;
  const per = Math.ceil(count / prefs.length); // more posts than windows → split each window
  type Win = { part: DayPart; from: number; to: number; rank: number };
  const wins: Win[] = [];
  prefs.forEach((part, rank) => {
    const { from, to } = DAY_PARTS[part];
    const len = (to - from) / per;
    for (let i = 0; i < per; i++) wins.push({ part, from: Math.round(from + len * i), to: Math.round(from + len * (i + 1)), rank });
  });
  // Favourite windows are more likely, but any of the first count+2 can be picked.
  const pool = wins.filter((w) => w.rank < Math.min(prefs.length, Math.ceil(count / per) + 2));
  let chosen = pool
    .map((w) => ({ w, score: r() * (1 - w.rank * 0.07) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.w);
  // Same windows as yesterday? Swap one for a window that wasn't used.
  const sig = (a: { part: DayPart }[]) => [...new Set(a.map((x) => x.part))].sort().join(',');
  if (prev.length && sig(chosen) === [...new Set(prev)].sort().join(',')) {
    const spare = pool.find((w) => !chosen.includes(w));
    if (spare) chosen = [...chosen.slice(0, -1), spare];
  }
  const out: DayTime[] = chosen
    .map((w) => ({ part: w.part, minutes: Math.round(w.from + r() * Math.max(1, w.to - w.from - 1)) }))
    .sort((a, b) => a.minutes - b.minutes);
  // Keep clear of the other networks, and of this network's own posts.
  for (let i = 0; i < out.length; i++) {
    for (let guard = 0; guard < 6; guard++) {
      const clash = taken.some((t) => Math.abs(t - out[i].minutes) < 12);
      const close = i > 0 && out[i].minutes - out[i - 1].minutes < 50;
      if (!clash && !close) break;
      out[i].minutes += close ? 50 - (out[i].minutes - out[i - 1].minutes) + Math.round(r() * 9) : 13 + Math.round(r() * 9);
    }
    out[i].minutes = Math.min(out[i].minutes, 23 * 60 + 20);
  }
  return out;
}

// --- Which kind of post ------------------------------------------------------------

/** Networks lean on different pillars: a Telegram channel is a job feed, LinkedIn likes numbers. */
const BIAS: Partial<Record<Platform, Partial<Record<Pillar, number>>>> = {
  telegram: { jobs: 1.6, community: 0.6, news: 1.3 },
  linkedin: { market: 1.3, proof: 1.3, plan: 1.2, community: 0.7 },
  instagram: { visa: 1.2, community: 1.2 },
  tiktok: { visa: 1.2, community: 1.2, market: 0.8 },
};

export type Past = { kind: string; pillar: Pillar; at: number };

export type Pick = { platform: Platform; at: number; part: DayPart; weekday: number; dayKey: string };

/**
 * Formats for a slot, best first. `history` = this network's earlier posts
 * (any order). `unavailable` = formats with nothing to say right now.
 */
export function rankFormats(slot: Pick, history: Past[], settings: ProgramSettings, unavailable: Set<string> = new Set(), tz = settings.timezone, others: Past[] = []): FormatDef[] {
  const before = history.filter((h) => h.at < slot.at).sort((a, b) => b.at - a.at);
  const last = before[0];
  const sameDay = new Set(history.filter((h) => localTime(h.at, tz).key === slot.dayKey).map((h) => h.kind));
  const lastOf = new Map<string, number>();
  for (const h of before) if (!lastOf.has(h.kind)) lastOf.set(h.kind, h.at);
  // Posts planned later the same day also count for the cooldown (they sit close in time).
  for (const h of history) if (h.at >= slot.at && h.at - slot.at < 6 * 3_600_000 && !lastOf.has(h.kind)) lastOf.set(h.kind, slot.at - (h.at - slot.at));

  const eligible = FORMATS.filter((f) => {
    if (!isFormatOn(f, settings) || !f.platforms.includes(slot.platform) || unavailable.has(f.key)) return false;
    if (f.days && !f.days.includes(slot.weekday)) return false;
    if (last?.kind === f.key || sameDay.has(f.key)) return false;
    const t = lastOf.get(f.key);
    return t === undefined || slot.at - t >= f.cooldown * 3_600_000;
  });
  if (!eligible.length) return [];

  // The pillar furthest behind its share goes first.
  const mix = mixFor(settings);
  const pillars = PILLAR_ORDER.filter((p) => eligible.some((f) => f.pillar === p));
  const target: Record<string, number> = {};
  let sum = 0;
  for (const p of pillars) {
    target[p] = mix[p] * (BIAS[slot.platform]?.[p] ?? 1);
    sum += target[p];
  }
  const recent = before.slice(0, 24);
  const count: Record<string, number> = {};
  for (const h of recent) count[h.pillar] = (count[h.pillar] ?? 0) + 1;
  const deficit = (p: Pillar) => {
    if (!sum) return 0;
    let d = (target[p] / sum) * (recent.length + 1) - (count[p] ?? 0);
    if (last?.pillar === p) d -= 0.6; // prefer a change of subject
    if (before[1]?.pillar === p && last?.pillar === p) d -= 2; // never three in a row
    return d;
  };

  // The same kind of post on another network within a few hours looks like cross-posting: avoid it when there is a choice.
  const nearby = new Set(others.filter((o) => Math.abs(o.at - slot.at) < 4 * 3_600_000).map((o) => o.kind));
  // Reels reach people who don't follow yet, so each network gets about one a day: when it has had none
  // in the last 20 hours a reel goes first within its pillar; once it has, images go first again.
  const videoLately = history.some((h) => Math.abs(slot.at - h.at) < 20 * 3_600_000 && FORMAT_BY_KEY[h.kind]?.video);
  const r = rng(`${slot.platform}|${slot.at}|format`);
  // Formats that haven't run for a while come first, so a pillar works through
  // all of its formats before one returns; weight only tilts the order.
  const score = (f: FormatDef) => {
    const t = lastOf.get(f.key);
    const rest = t === undefined ? 5 : Math.max(0.3, Math.min(4, (slot.at - t) / (72 * 3_600_000)));
    return Math.pow(f.weight, 0.6) * (f.parts.includes(slot.part) ? 1.5 : 0.75) * rest * (0.8 + r() * 0.4) * (nearby.has(f.key) ? 0.15 : 1) * (f.video ? (videoLately ? 0.2 : 6) : 1);
  };
  const scored = eligible.map((f) => ({ f, pillar: deficit(f.pillar), s: score(f) }));
  return scored.sort((a, b) => b.pillar - a.pillar || b.s - a.s).map((x) => x.f);
}

export type Slot = { platform: Platform; at: number; part: DayPart; kind: string; pillar: Pillar };

/**
 * New slots for the coming days. `existing` = program posts already planned
 * or published (their times are kept; only the gaps are filled).
 */
export function planRange(o: {
  platforms: Platform[];
  settings: ProgramSettings;
  now: number;
  days: number;
  existing?: (Past & { platform: Platform })[];
  unavailable?: Set<string>;
  /** Earliest time a new slot may get (default: 25 minutes from now). */
  notBefore?: number;
}): Slot[] {
  const tz = o.settings.timezone || 'UTC';
  const existing = o.existing ?? [];
  const today = localTime(o.now, tz).key;
  const notBefore = o.notBefore ?? o.now + 25 * 60_000;
  const history = new Map<Platform, Past[]>();
  for (const p of o.platforms) history.set(p, existing.filter((e) => e.platform === p).map((e) => ({ kind: e.kind, pillar: e.pillar, at: e.at })));
  const out: Slot[] = [];

  for (let d = 0; d < o.days; d++) {
    const key = addDays(today, d);
    const weekday = weekdayOf(key);
    const weekend = weekday === 0 || weekday === 6;
    const dayStart = atLocal(key, 0, tz);
    const taken: number[] = [];
    const inDay = (at: number) => localTime(at, tz).key === key;
    for (const e of existing) if (inDay(e.at)) taken.push(Math.round((e.at - dayStart) / 60_000));
    // A different network goes first each day.
    const order = [...o.platforms].sort((a, b) => (hash(`${a}|${key}`) % 97) - (hash(`${b}|${key}`) % 97));
    for (const p of order) {
      const want = perDayFor(p, o.settings, weekend);
      const mine = history.get(p)!;
      const have = mine.filter((h) => inDay(h.at));
      if (have.length >= want) continue;
      const prevParts = mine.filter((h) => localTime(h.at, tz).key === addDays(key, -1)).map((h) => localTime(h.at, tz).part).filter((x): x is DayPart => Boolean(x));
      const times = planDay(p, key, want, prevParts, taken).filter((t) => {
        const at = dayStart + t.minutes * 60_000;
        return at >= notBefore && !have.some((h) => Math.abs(h.at - at) < 75 * 60_000);
      });
      for (const t of times.slice(0, want - have.length)) {
        const at = atLocal(key, t.minutes, tz);
        const slot: Pick = { platform: p, at, part: t.part, weekday, dayKey: key };
        const others = [...existing.filter((e) => e.platform !== p), ...out.filter((e) => e.platform !== p)];
        const best = rankFormats(slot, mine, o.settings, o.unavailable, tz, others)[0];
        if (!best) continue;
        mine.push({ kind: best.key, pillar: best.pillar, at });
        taken.push(t.minutes);
        out.push({ platform: p, at, part: t.part, kind: best.key, pillar: best.pillar });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
