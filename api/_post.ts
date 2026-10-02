// Drawing code for /api/og/post — the images for every social post that is
// not a job list (those are drawn by /api/og/social).
//
// Why text can't overlap here:
//  - Every line break is decided in this file, from Inter's real character
//    widths (measured from the font, see ADV below) — nothing is left to the
//    renderer's wrapping. Each line is drawn in its own box of a fixed height.
//  - Each text has a ladder of sizes and a maximum number of lines. It gets
//    the largest size that fits; if even the smallest doesn't, it is cut with
//    "…" and reported (check=1), so a person can shorten it.
//  - Each template stacks boxes of known height. If the stack is taller than
//    the space, the whole template is drawn one step smaller, up to 5 steps.
//
// Files starting with _ are not routes on Vercel.

import { h, icon, img, type El } from './_og';

export type SizeKey = 'portrait' | 'square' | 'story';
export type Template = 'hero' | 'stat' | 'rank' | 'card' | 'steps' | 'myth' | 'text' | 'versus' | 'news' | 'cta' | 'grid';
export const TEMPLATES: Template[] = ['hero', 'stat', 'rank', 'card', 'steps', 'myth', 'text', 'versus', 'news', 'cta', 'grid'];

export type PostParams = {
  t: Template;
  size: SizeKey;
  /** Small label, top right. */
  k: string;
  /** Headline. */
  h: string;
  /** Line under the headline. */
  s: string;
  /** Country (ISO) — flag, and the photo if `img` is set. */
  cc: string;
  cc2: string;
  /** Photo URL (jpeg/png). */
  img: string;
  /** Photo credit. */
  cr: string;
  /** Rows: "a|b|c~a|b|c" — meaning depends on the template. */
  rows: string[][];
  /** Big number + its label (stat, cta). */
  n: string;
  u: string;
  /** Footnote, e.g. "Source: GOV.UK · checked Oct 2026". */
  src: string;
  /** Button and footer link. */
  cta: string;
  link: string;
  /** Carousel position, e.g. "2/4". */
  p: string;
  /** Phrases to mark in the headline, comma-separated; the last place each appears is marked. */
  hl: string[];
  /** Myth / fact. */
  m: string;
  f: string;
  /** blue (default) | ink | light */
  th: 'blue' | 'ink' | 'light';
};

export type Issue = { level: 'error' | 'warning'; message: string };
export type Loader = (url: string, kind: 'flag' | 'logo' | 'photo') => Promise<string | null>;

const SIZES: Record<SizeKey, { w: number; h: number; top: number; bottom: number; side: number; u: number }> = {
  portrait: { w: 1080, h: 1350, top: 60, bottom: 56, side: 64, u: 1 },
  square: { w: 1080, h: 1080, top: 50, bottom: 46, side: 60, u: 0.86 },
  // 9:16 — keeps clear of the app's own buttons at the top and bottom.
  story: { w: 1080, h: 1920, top: 170, bottom: 250, side: 68, u: 1.16 },
};

const BLUE = '#2563EB';
const INK = '#0F172A';
const MUTED = '#64748B';
const SANS = "'Inter', sans-serif";
const GRADIENT: Record<PostParams['th'], string> = {
  blue: 'linear-gradient(158deg, #1E3FAE 0%, #2563EB 46%, #3B82F6 100%)',
  ink: 'linear-gradient(158deg, #0B1633 0%, #172554 55%, #1E40AF 100%)',
  light: 'linear-gradient(158deg, #1D4ED8 0%, #2563EB 50%, #60A5FA 100%)',
};

// ---------------------------------------------------------------------------
// Text measuring — Inter advance widths (per 1000 em) for ASCII 32–126.
// ---------------------------------------------------------------------------
type Weight = 400 | 600 | 700 | 800;
const ADV: Record<400 | 600 | 800, number[]> = {
  400: [281, 288, 466, 633, 642, 982, 644, 300, 365, 365, 501, 662, 288, 460, 288, 360, 631, 407, 610, 618, 646, 593, 620, 566, 619, 620, 288, 302, 662, 662, 662, 511, 966, 690, 654, 730, 722, 601, 590, 746, 743, 269, 571, 672, 565, 903, 753, 765, 639, 765, 644, 642, 646, 744, 690, 985, 682, 679, 629, 365, 360, 365, 471, 456, 323, 562, 612, 571, 612, 583, 370, 613, 591, 242, 242, 549, 242, 876, 591, 600, 612, 612, 376, 528, 327, 591, 562, 818, 546, 562, 552, 426, 333, 426, 662],
  600: [252, 321, 523, 644, 650, 1004, 663, 326, 373, 373, 540, 673, 319, 465, 319, 379, 660, 423, 623, 636, 666, 612, 640, 576, 640, 640, 319, 329, 673, 673, 673, 543, 999, 728, 659, 737, 722, 605, 588, 749, 746, 277, 580, 703, 565, 922, 759, 769, 645, 773, 652, 650, 660, 736, 728, 1020, 720, 713, 652, 373, 379, 373, 481, 469, 351, 574, 624, 583, 624, 591, 389, 625, 612, 262, 262, 569, 262, 900, 612, 609, 624, 624, 397, 549, 353, 612, 587, 839, 569, 588, 566, 455, 359, 455, 673],
  800: [219, 358, 586, 655, 660, 1029, 683, 354, 382, 382, 583, 686, 353, 471, 353, 400, 692, 441, 638, 657, 688, 634, 662, 588, 664, 662, 353, 360, 686, 686, 686, 579, 1036, 770, 665, 744, 723, 610, 585, 752, 749, 286, 590, 738, 565, 943, 766, 773, 652, 782, 662, 660, 677, 727, 770, 1059, 761, 752, 679, 382, 400, 382, 493, 484, 382, 588, 638, 595, 638, 601, 410, 639, 635, 283, 283, 593, 283, 927, 635, 619, 638, 638, 420, 573, 382, 635, 615, 863, 594, 618, 581, 486, 388, 486, 686],
};
const EXTRA: Record<string, number> = { '€': 690, '£': 650, '’': 330, '‘': 330, '“': 580, '”': 570, '–': 500, '—': 1000, '…': 1058, '·': 353, '→': 1000, '×': 686, '•': 500, '°': 430, '«': 560, '»': 560 };

function charWidth(ch: string, weight: Weight): number {
  const table = ADV[weight === 700 ? 800 : weight];
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return table[c - 32];
  if (EXTRA[ch]) return EXTRA[ch];
  // Accented Latin letters are as wide as their base letter.
  const base = ch.normalize('NFKD').charCodeAt(0);
  if (base >= 32 && base <= 126) return table[base - 32];
  if (c >= 0x2e80) return 1000; // CJK and other full-width scripts
  return 640; // other alphabets (Cyrillic, Greek, ə, ı…): a safe average
}
/** Width in px. 3% is added so a line that "just fits" really does. */
export function textWidth(text: string, size: number, weight: Weight, tracking = 0): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, weight);
  return ((w * size) / 1000) * 1.03 + tracking * text.length;
}

function breakLines(text: string, size: number, weight: Weight, maxW: number, tracking = 0): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, weight, tracking) <= maxW) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the line: split it.
      let w = word;
      while (textWidth(w, size, weight, tracking) > maxW && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && textWidth(w.slice(0, n), size, weight, tracking) > maxW) n--;
        lines.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export type Fitted = { size: number; lines: string[]; cut: boolean };

/** The largest size from `sizes` whose lines fit in `maxLines`; otherwise the smallest, cut with "…". */
export function fitText(text: string, sizes: number[], weight: Weight, maxW: number, maxLines: number, tracking = 0): Fitted {
  const clean = text.replace(/[ \t]+/g, ' ').trim();
  for (const size of sizes) {
    const lines = breakLines(clean, size, weight, maxW, tracking);
    if (lines.length <= maxLines) return { size, lines, cut: false };
  }
  const size = sizes[sizes.length - 1];
  const lines = breakLines(clean, size, weight, maxW, tracking).slice(0, maxLines);
  let last = lines[maxLines - 1] ?? '';
  while (last.length > 1 && textWidth(`${last}…`, size, weight, tracking) > maxW) last = last.slice(0, -1);
  lines[maxLines - 1] = `${last.replace(/[\s,.;:–—-]+$/, '')}…`;
  return { size, lines, cut: true };
}

/** One line, cut to a width. */
function oneLine(text: string, size: number, weight: Weight, maxW: number): string {
  return fitText(text, [size], weight, maxW, 1).lines[0];
}

// ---------------------------------------------------------------------------
// Boxes of known height
// ---------------------------------------------------------------------------
type Box = { el: El; h: number };

function textBox(f: Fitted, o: { weight: Weight; color: string; lh?: number; width: number; align?: 'left' | 'center'; tracking?: number; opacity?: number }): Box {
  const lh = Math.round(f.size * (o.lh ?? 1.14));
  return {
    h: lh * f.lines.length,
    el: h(
      'div',
      { flexDirection: 'column', width: o.width, height: lh * f.lines.length, flexShrink: 0, overflow: 'hidden', alignItems: o.align === 'center' ? 'center' : 'flex-start' },
      ...f.lines.map((line) =>
        h('div', { height: lh, alignItems: 'center', fontSize: f.size, fontWeight: o.weight, color: o.color, letterSpacing: o.tracking ?? 0, whiteSpace: 'nowrap', fontFamily: SANS, opacity: o.opacity, flexShrink: 0 }, line)
      )
    ),
  };
}

const bareWord = (w: string) => w.toLowerCase().replace(/^[“"'‘(]+|[.,!?:;’'”")]+$/g, '');

/**
 * Which words of `text` to mark. Each entry of `phrases` is one or more
 * words; the LAST place where they appear in a row is marked, so "offer it
 * to them" marks the end of the sentence and not an earlier "to offer".
 */
function markIndexes(text: string, phrases: string[]): Set<number> {
  const words = text.split(/\s+/).filter(Boolean).map(bareWord);
  const out = new Set<number>();
  for (const phrase of phrases) {
    const want = phrase.split(/\s+/).filter(Boolean).map(bareWord).filter(Boolean);
    if (!want.length) continue;
    for (let i = words.length - want.length; i >= 0; i--) {
      if (want.every((w, k) => words[i + k] === w)) {
        want.forEach((_, k) => out.add(i + k));
        break;
      }
    }
  }
  return out;
}

/** Headline with marked words (a marker box behind them). `hi` = word positions in the whole text. */
function markedBox(f: Fitted, hi: Set<number>, o: { weight: Weight; color: string; hiColor: string; hiBg: string; width: number; align?: 'left' | 'center'; tracking?: number }): Box {
  const lh = Math.round(f.size * 1.2);
  let at = 0;
  const lines = f.lines.map((line) => line.split(' ').filter(Boolean).map((w) => ({ w, on: !f.cut && hi.has(at++) })));
  return {
    h: lh * f.lines.length,
    el: h(
      'div',
      { flexDirection: 'column', width: o.width, height: lh * f.lines.length, flexShrink: 0, overflow: 'hidden', alignItems: o.align === 'center' ? 'center' : 'flex-start' },
      ...lines.map((parts) =>
        h(
          'div',
          { height: lh, alignItems: 'center', flexShrink: 0 },
          ...parts.map(({ w, on }, i) => {
            const prevOn = i > 0 && parts[i - 1].on;
            const nextOn = i + 1 < parts.length && parts[i + 1].on;
            const pad = Math.round(f.size * 0.1);
            const gap = Math.round(f.size * 0.22); // a space in Inter 800
            const r = Math.round(f.size * 0.14);
            return h(
              'div',
              {
                fontSize: f.size,
                fontWeight: o.weight,
                letterSpacing: o.tracking ?? 0,
                color: on ? o.hiColor : o.color,
                backgroundColor: on ? o.hiBg : undefined,
                height: Math.round(f.size * 1.08),
                alignItems: 'center',
                whiteSpace: 'nowrap',
                fontFamily: SANS,
                // The marker box takes its room from the spaces around the word, so the line stays as
                // wide as measured. Neighbouring marked words join into one box.
                paddingLeft: on && !prevOn ? pad : 0,
                paddingRight: on ? (nextOn ? gap : pad) : 0,
                marginLeft: on && !prevOn && i > 0 ? -pad : 0,
                marginRight: i + 1 < parts.length ? (on ? (nextOn ? 0 : gap - pad) : gap) : 0,
                borderTopLeftRadius: on && !prevOn ? r : 0,
                borderBottomLeftRadius: on && !prevOn ? r : 0,
                borderTopRightRadius: on && !nextOn ? r : 0,
                borderBottomRightRadius: on && !nextOn ? r : 0,
              },
              w
            );
          })
        )
      )
    ),
  };
}

const space = (px: number): Box => ({ h: Math.round(px), el: h('div', { height: Math.round(px), flexShrink: 0 }) });
const total = (boxes: (Box | null)[]) => boxes.reduce((n, b) => n + (b ? b.h : 0), 0);
function column(boxes: (Box | null)[], style: Record<string, unknown> = {}): El {
  return h('div', { flexDirection: 'column', flexShrink: 0, ...style }, ...boxes.map((b) => b?.el));
}

// --- Small drawings -----------------------------------------------------------
function svg(size: number, paths: string[], o: { stroke: string; fill?: string; width?: number }): El {
  return {
    type: 'svg',
    props: { width: size, height: size, viewBox: '0 0 24 24', fill: o.fill ?? 'none', stroke: o.stroke, strokeWidth: o.width ?? 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0 }, children: paths.map((d) => ({ type: 'path', props: { d } })) },
  } as unknown as El;
}
const P = {
  globe: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  swipe: ['M5 12h14', 'm13 6 6 6-6 6'],
  comment: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
  bookmark: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z'],
  plus: ['M5 12h14', 'M12 5v14'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
};

function brand(color: string, size: number): El {
  return h(
    'div',
    { alignItems: 'center', flexShrink: 0 },
    icon('plane', Math.round(size * 1.05), color, 2.2),
    h('div', { fontSize: size, fontWeight: 400, color, marginLeft: Math.round(size * 0.25), fontFamily: SANS }, 'made'),
    h('div', { fontSize: size, fontWeight: 800, color, fontFamily: SANS }, 'visa')
  );
}
function pill(text: string, size: number, o: { bg: string; color: string; maxW: number; border?: string }): El {
  const t = oneLine(text.toUpperCase(), size, 800, o.maxW - size * 1.8);
  return h('div', { backgroundColor: o.bg, color: o.color, border: o.border ? `2px solid ${o.border}` : undefined, fontSize: size, fontWeight: 800, letterSpacing: 1, height: Math.round(size * 2), padding: `0 ${Math.round(size * 0.9)}px`, borderRadius: 999, alignItems: 'center', whiteSpace: 'nowrap', fontFamily: SANS, flexShrink: 0 }, t);
}
function flagCircle(src: string | null, size: number, code: string, ring = 'rgba(255,255,255,0.9)'): El {
  return src
    ? h('div', { width: size, height: size, borderRadius: 999, border: `${Math.max(3, Math.round(size * 0.045))}px solid ${ring}`, overflow: 'hidden', flexShrink: 0, backgroundColor: 'white' }, img(src, { width: size, height: size, objectFit: 'cover' }))
    : h('div', { width: size, height: size, borderRadius: 999, border: `${Math.max(3, Math.round(size * 0.045))}px solid ${ring}`, backgroundColor: 'rgba(255,255,255,0.16)', color: 'white', fontSize: Math.round(size * 0.34), fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: SANS }, code.toUpperCase().slice(0, 2));
}
function logoBox(src: string | null, name: string, size: number): El {
  return src
    ? img(src, { width: size, height: size, borderRadius: Math.round(size * 0.22), objectFit: 'contain', border: '2px solid #E2E8F0', backgroundColor: 'white', padding: Math.round(size * 0.08), flexShrink: 0 })
    : h('div', { width: size, height: size, borderRadius: Math.round(size * 0.22), backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: Math.round(size * 0.46), fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: SANS }, (name.trim()[0] ?? '·').toUpperCase());
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

export const FLAG_URL = (code: string) => `https://hatscripts.github.io/circle-flags/flags/${code.toLowerCase()}.svg`;
const isCode = (c: string) => /^[a-z]{2}$/i.test(c);
/** Rank rows name a company by its id; the server looks the logo up (no image URLs in the query). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function drawPost(q: PostParams, load: Loader): Promise<{ tree: El; issues: Issue[]; width: number; height: number }> {
  const S = SIZES[q.size];
  const issues: Issue[] = [];
  const inner = S.w - S.side * 2;
  const U = (n: number) => Math.round(n * S.u);

  // Assets (never a placeholder: what can't be loaded is left out).
  const logoUrls = q.t === 'rank' ? q.rows.map((r) => (UUID.test(r[4] ?? '') ? r[4] : '')) : [];
  const rowFlags = q.t === 'rank' || q.t === 'versus' ? q.rows.map((r) => (isCode(r[3] ?? '') ? r[3] : '')) : [];
  const [flag1, flag2, photo, logos, flags] = await Promise.all([
    isCode(q.cc) ? load(FLAG_URL(q.cc), 'flag') : null,
    isCode(q.cc2) ? load(FLAG_URL(q.cc2), 'flag') : null,
    q.img && /^https:\/\//.test(q.img) && (q.t === 'hero' || q.t === 'news' || q.t === 'stat' || q.t === 'cta') ? load(q.img, 'photo') : null,
    Promise.all(logoUrls.map((u) => (u ? load(u, 'logo') : null))),
    Promise.all(rowFlags.map((c) => (c ? load(FLAG_URL(c), 'flag') : null))),
  ]);
  if (q.img && !photo && (q.t === 'hero' || q.t === 'news')) issues.push({ level: 'warning', message: 'Photo couldn’t be loaded — drawn without it' });

  const headerH = U(58);
  const footerH = U(92);
  const gap = U(30);
  const bodyH = S.h - S.top - S.bottom - headerH - footerH - gap * 2;

  // --- Header: brand, label, carousel position --------------------------------
  const kick = U(21);
  const header = h(
    'div',
    { height: headerH, width: inner, alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    brand('white', U(34)),
    h(
      'div',
      { alignItems: 'center' },
      q.k ? pill(q.k, kick, { bg: 'rgba(255,255,255,0.18)', color: 'white', maxW: inner * 0.55 }) : null,
      q.p ? h('div', { marginLeft: 14, fontSize: kick, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: SANS, whiteSpace: 'nowrap' }, q.p) : null
    )
  );

  // --- Footer: button + link ----------------------------------------------------
  const linkSize = U(25);
  const ctaSize = U(28);
  const linkText = q.link || 'madevisa.com';
  const ctaText = q.cta ? oneLine(q.cta, ctaSize, 800, inner * 0.5) : '';
  const footer = h(
    'div',
    { height: footerH, width: inner, alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    ctaText
      ? h('div', { backgroundColor: 'white', color: BLUE, fontSize: ctaSize, fontWeight: 800, height: U(66), padding: `0 ${U(30)}px`, borderRadius: 999, alignItems: 'center', whiteSpace: 'nowrap', fontFamily: SANS }, ctaText, h('div', { marginLeft: 12, alignItems: 'center' }, svg(U(28), P.arrow, { stroke: BLUE, width: 2.8 })))
      : h('div', {}),
    h(
      'div',
      { alignItems: 'center' },
      svg(Math.round(linkSize * 1.1), P.globe, { stroke: 'rgba(255,255,255,0.92)', width: 2.2 }),
      h('div', { marginLeft: 10, fontSize: linkSize, fontWeight: 700, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', fontFamily: SANS }, oneLine(linkText, linkSize, 700, inner * (ctaText ? 0.4 : 0.8)))
    )
  );

  // --- Body: try smaller steps until the stack fits -----------------------------
  let body: El = h('div', {});
  // Largest first: a short text fills the image, a long one steps down until everything
  // fits without being cut. If nothing fits uncut, the largest size that fits the height wins.
  const STEPS = [1.36, 1.24, 1.12, 1, 0.92, 0.84, 0.76, 0.68, 0.6];
  let chosen: { body: El; issues: Issue[]; clean: boolean } | null = null;
  for (let step = 0; step < STEPS.length && !chosen?.clean; step++) {
    const z = STEPS[step];
    const F = (n: number) => Math.max(14, Math.round(n * S.u * z));
    const sizes = (...ns: number[]) => ns.map(F);
    const stepIssues: Issue[] = [];
    const mark = (f: Fitted, what: string) => {
      if (f.cut) stepIssues.push({ level: 'warning', message: `${what} shortened to fit` });
      return f;
    };
    let boxes: (Box | null)[] = [];
    let justify = 'center';
    const src = q.src ? textBox(fitText(q.src, [F(22)], 600, inner, 2), { weight: 600, color: 'rgba(255,255,255,0.78)', width: inner, lh: 1.3 }) : null;

    if (q.t === 'hero') {
      // Flag, headline, sub, up to three facts. With a photo the text sits at the bottom over a blue fade.
      justify = photo ? 'flex-end' : 'center';
      const stats = q.rows.slice(0, 3).filter((r) => r[0]);
      const fl = F(photo ? 112 : 168);
      const tileW = stats.length ? Math.floor((inner - F(18) * (stats.length - 1)) / stats.length) : 0;
      const tileH = F(158);
      boxes = [
        flag1 || isCode(q.cc) ? { h: fl, el: flagCircle(flag1, fl, q.cc) } : null,
        flag1 || isCode(q.cc) ? space(F(photo ? 26 : 40)) : null,
        textBox(mark(fitText(q.h, sizes(98, 86, 74, 64), 800, inner, 3, -1.5), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.06, tracking: -1.5 }),
        q.s ? space(F(20)) : null,
        q.s ? textBox(mark(fitText(q.s, sizes(38, 34), 600, inner, 3), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.92)', width: inner, lh: 1.28 }) : null,
        stats.length ? space(F(36)) : null,
        stats.length
          ? {
              h: tileH,
              el: h(
                'div',
                { width: inner, height: tileH, flexShrink: 0 },
                ...stats.map((r, i) => {
                  const tw = tileW - F(40);
                  const v = mark(fitText(r[0], sizes(58, 50, 42, 34, 28, 24), 800, tw, 1), 'A fact');
                  const l = mark(fitText(r[1] ?? '', sizes(23, 20, 18), 600, tw, 2), 'A fact label');
                  return h(
                    'div',
                    { width: tileW, height: tileH, marginLeft: i ? F(18) : 0, flexDirection: 'column', justifyContent: 'center', padding: `0 ${F(20)}px`, borderRadius: F(26), backgroundColor: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.22)', overflow: 'hidden', flexShrink: 0 },
                    textBox(v, { weight: 800, color: 'white', width: tw, lh: 1.12 }).el,
                    h('div', { height: F(4), flexShrink: 0 }),
                    textBox(l, { weight: 600, color: 'rgba(255,255,255,0.88)', width: tw, lh: 1.2 }).el
                  );
                })
              ),
            }
          : null,
        src ? space(F(22)) : null,
        src,
      ];
    } else if (q.t === 'stat') {
      // One number that fills the width, its label, a line of context.
      const num = fitText(q.n || q.h, sizes(260, 220, 184, 150, 120, 96), 800, inner, 1, -4);
      boxes = [
        flag1 || isCode(q.cc) ? { h: F(96), el: flagCircle(flag1, F(96), q.cc) } : null,
        flag1 || isCode(q.cc) ? space(F(30)) : null,
        q.n && q.h ? textBox(mark(fitText(q.h, sizes(46, 40, 36), 700, inner, 3), 'Headline'), { weight: 700, color: 'rgba(255,255,255,0.92)', width: inner, lh: 1.2 }) : null,
        q.n && q.h ? space(F(14)) : null,
        textBox(mark(num, 'Number'), { weight: 800, color: 'white', width: inner, lh: 1.02, tracking: -4 }),
        q.u ? space(F(10)) : null,
        q.u ? textBox(mark(fitText(q.u, sizes(50, 44, 38), 800, inner, 2), 'Label'), { weight: 800, color: '#BFDBFE', width: inner, lh: 1.16 }) : null,
        q.s ? space(F(32)) : null,
        q.s ? textBox(mark(fitText(q.s, sizes(34, 30), 600, inner, 4), 'Context'), { weight: 600, color: 'rgba(255,255,255,0.9)', width: inner, lh: 1.32 }) : null,
        src ? space(F(30)) : null,
        src,
      ];
    } else if (q.t === 'rank') {
      // Headline, then a white card of rows: flag or logo · name · value, with a bar.
      const rows = q.rows.slice(0, q.size === 'square' ? 5 : 6).filter((r) => r[0]);
      const pad = F(30);
      const cardW = inner;
      const w = cardW - pad * 2;
      const rowH = F(q.rows.some((r) => r[2]) ? 124 : 104);
      const badge = F(62);
      const head = textBox(mark(fitText(q.h, sizes(64, 56, 50, 44), 800, inner, 3, -1), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.1, tracking: -1 });
      const sub = q.s ? textBox(mark(fitText(q.s, sizes(30, 27), 600, inner, 2), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.9)', width: inner, lh: 1.3 }) : null;
      const cardH = rowH * rows.length + pad;
      boxes = [
        head,
        sub ? space(F(12)) : null,
        sub,
        space(F(30)),
        {
          h: cardH,
          el: h(
            'div',
            { flexDirection: 'column', width: cardW, height: cardH, backgroundColor: 'white', borderRadius: F(30), padding: `${Math.round(pad / 2)}px ${pad}px`, flexShrink: 0, overflow: 'hidden' },
            ...rows.map((r, i) => {
              const value = oneLine(r[1] ?? '', F(36), 800, w * 0.36);
              const valueW = value ? Math.ceil(textWidth(value, F(36), 800)) + 4 : 0;
              const nameW = w - badge - F(22) - (valueW ? valueW + F(18) : 0);
              const pct = Math.max(3, Math.min(100, Number(r[2]) || 0));
              const hasBar = Boolean(r[2]);
              const lead = flags[i] ? flagCircle(flags[i], badge, r[3], '#E2E8F0') : r[4] !== undefined && r[4] !== '' ? logoBox(logos[i], r[0], badge) : h('div', { width: badge, height: badge, borderRadius: 999, backgroundColor: '#EFF6FF', color: '#1D4ED8', fontSize: F(30), fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: SANS }, String(i + 1));
              const sublabel = r[5] ? oneLine(r[5], F(22), 600, nameW) : '';
              return h(
                'div',
                { height: rowH, width: w, alignItems: 'center', borderTop: i ? '2px solid #EEF2F7' : 'none', flexShrink: 0, overflow: 'hidden' },
                lead,
                h(
                  'div',
                  { flexDirection: 'column', width: nameW, marginLeft: F(22), overflow: 'hidden' },
                  h('div', { fontSize: F(34), fontWeight: 800, color: INK, whiteSpace: 'nowrap', fontFamily: SANS, height: F(42), alignItems: 'center' }, oneLine(r[0], F(34), 800, nameW)),
                  sublabel ? h('div', { fontSize: F(22), fontWeight: 600, color: MUTED, whiteSpace: 'nowrap', fontFamily: SANS, height: F(30), alignItems: 'center' }, sublabel) : null,
                  hasBar ? h('div', { marginTop: F(10), width: nameW, height: F(12), borderRadius: 999, backgroundColor: '#EEF2F7' }, h('div', { width: Math.round((nameW * pct) / 100), height: F(12), borderRadius: 999, backgroundColor: i === 0 ? BLUE : '#93C5FD' })) : null
                ),
                valueW ? h('div', { width: valueW, marginLeft: F(18), justifyContent: 'flex-end', fontSize: F(36), fontWeight: 800, color: i === 0 ? BLUE : INK, whiteSpace: 'nowrap', fontFamily: SANS, flexShrink: 0 }, value) : null
              );
            })
          ),
        },
        src ? space(F(20)) : null,
        src,
      ];
    } else if (q.t === 'card') {
      // Headline on blue, then a white card: label + value rows ("|text" = a tick-list row).
      const rows = q.rows.slice(0, 7).filter((r) => r[0] || r[1]);
      const pad = F(34);
      const w = inner - pad * 2;
      const head = textBox(mark(fitText(q.h, sizes(64, 56, 50, 44), 800, inner - (flag1 ? F(110) : 0), 3, -1), 'Headline'), { weight: 800, color: 'white', width: inner - (flag1 ? F(110) : 0), lh: 1.1, tracking: -1 });
      const sub = q.s ? textBox(mark(fitText(q.s, sizes(30, 27), 600, inner, 3), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.9)', width: inner, lh: 1.3 }) : null;
      const rowBoxes: Box[] = rows.map((r, i) => {
        const tick = !r[0];
        const tw = tick ? w - F(52) : w;
        const label = !tick ? textBox(fitText(r[0].toUpperCase(), [F(20)], 800, tw, 1, 1), { weight: 800, color: MUTED, width: tw, lh: 1.3, tracking: 1 }) : null;
        const value = textBox(mark(fitText(r[1] ?? '', tick ? sizes(31, 28) : sizes(34, 30, 27), tick ? 600 : 800, tw, tick ? 2 : 3), 'A row'), { weight: tick ? 600 : 800, color: INK, width: tw, lh: 1.22 });
        const inside = total([label, label ? space(F(4)) : null, value]);
        const rowH = inside + F(tick ? 22 : 28);
        return {
          h: rowH,
          el: h(
            'div',
            { width: w, height: rowH, alignItems: 'center', borderTop: i ? '2px solid #EEF2F7' : 'none', flexShrink: 0, overflow: 'hidden' },
            tick ? h('div', { width: F(36), height: F(36), borderRadius: 999, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginRight: F(16), flexShrink: 0 }, svg(F(22), P.check, { stroke: '#15803D', width: 3.2 })) : null,
            column([label, label ? space(F(4)) : null, value], { width: tw })
          ),
        };
      });
      const cardH = total(rowBoxes) + pad;
      boxes = [
        {
          h: head.h,
          el: h('div', { width: inner, height: head.h, alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }, head.el, flag1 ? flagCircle(flag1, F(88), q.cc) : null),
        },
        sub ? space(F(12)) : null,
        sub,
        space(F(28)),
        { h: cardH, el: h('div', { flexDirection: 'column', width: inner, height: cardH, backgroundColor: 'white', borderRadius: F(30), padding: `${Math.round(pad / 2)}px ${pad}px`, flexShrink: 0, overflow: 'hidden' }, ...rowBoxes.map((b) => b.el)) },
        src ? space(F(20)) : null,
        src,
      ];
    } else if (q.t === 'steps') {
      // Headline, then numbered steps: title, detail, optional tag ("About 1 hour").
      const rows = q.rows.slice(0, 4).filter((r) => r[0]);
      const num = F(70);
      const tw = inner - num - F(26) - F(56);
      const head = textBox(mark(fitText(q.h, sizes(62, 54, 48, 42), 800, inner, 3, -1), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.1, tracking: -1 });
      const sub = q.s ? textBox(mark(fitText(q.s, sizes(30, 27), 600, inner, 2), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.9)', width: inner, lh: 1.3 }) : null;
      const stepBoxes: (Box | null)[] = [];
      rows.forEach((r, i) => {
        const title = textBox(mark(fitText(r[0], sizes(35, 31, 28), 800, tw, 3), `Step ${i + 1}`), { weight: 800, color: INK, width: tw, lh: 1.2 });
        const detail = r[1] ? textBox(mark(fitText(r[1], sizes(26, 24), 600, tw, 3), `Step ${i + 1} detail`), { weight: 600, color: MUTED, width: tw, lh: 1.3 }) : null;
        const tagText = r[2] ? oneLine(r[2], F(20), 800, tw - F(30)) : '';
        const tag: Box | null = tagText ? { h: F(38), el: h('div', { height: F(38), alignItems: 'center', flexShrink: 0 }, h('div', { height: F(38), padding: `0 ${F(15)}px`, borderRadius: 999, backgroundColor: '#EFF6FF', color: '#1D4ED8', fontSize: F(20), fontWeight: 800, alignItems: 'center', whiteSpace: 'nowrap', fontFamily: SANS }, tagText)) } : null;
        const col = [title, detail ? space(F(6)) : null, detail, tag ? space(F(10)) : null, tag];
        const hh = Math.max(num, total(col)) + F(44);
        if (i) stepBoxes.push(space(F(16)));
        stepBoxes.push({
          h: hh,
          el: h(
            'div',
            { width: inner, height: hh, backgroundColor: 'white', borderRadius: F(28), padding: `0 ${F(28)}px`, alignItems: 'center', flexShrink: 0, overflow: 'hidden' },
            h('div', { width: num, height: num, borderRadius: 999, backgroundColor: BLUE, color: 'white', fontSize: F(36), fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: SANS }, String(i + 1)),
            column(col, { width: tw, marginLeft: F(26) })
          ),
        });
      });
      boxes = [head, sub ? space(F(12)) : null, sub, space(F(28)), ...stepBoxes, src ? space(F(20)) : null, src];
    } else if (q.t === 'myth') {
      // Two panels: what people believe, and what is true.
      const pad = F(36);
      const w = inner - pad * 2;
      const panel = (label: string, text: string, good: boolean): Box => {
        const t = textBox(mark(fitText(text, good ? sizes(46, 41, 36, 32, 28) : sizes(44, 39, 35, 31, 27), good ? 800 : 700, w, 6), good ? 'Fact' : 'Myth'), { weight: good ? 800 : 700, color: good ? INK : 'white', width: w, lh: 1.2 });
        const tagH = F(44);
        const hh = pad * 2 + tagH + F(18) + t.h;
        return {
          h: hh,
          el: h(
            'div',
            { flexDirection: 'column', width: inner, height: hh, borderRadius: F(30), padding: pad, backgroundColor: good ? 'white' : 'rgba(15,23,42,0.34)', border: good ? 'none' : '2px solid rgba(255,255,255,0.28)', flexShrink: 0, overflow: 'hidden' },
            h(
              'div',
              { height: tagH, alignItems: 'center', flexShrink: 0 },
              h('div', { width: tagH, height: tagH, borderRadius: 999, backgroundColor: good ? '#DCFCE7' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: F(14) }, svg(F(26), good ? P.check : P.x, { stroke: good ? '#15803D' : 'white', width: 3.2 })),
              h('div', { fontSize: F(24), fontWeight: 800, letterSpacing: 2, color: good ? '#15803D' : 'white', fontFamily: SANS }, label)
            ),
            h('div', { height: F(18), flexShrink: 0 }),
            t.el
          ),
        };
      };
      boxes = [
        q.h ? textBox(mark(fitText(q.h, sizes(46, 40), 800, inner, 2, -0.5), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.12, tracking: -0.5 }) : null,
        q.h ? space(F(26)) : null,
        panel('MYTH', q.m, false),
        space(F(20)),
        panel('FACT', q.f, true),
        src ? space(F(20)) : null,
        src,
      ];
    } else if (q.t === 'text') {
      // One statement, big, with marked words.
      const f = mark(fitText(q.h, sizes(104, 92, 80, 70, 60, 52), 800, inner, 6, -2), 'Statement');
      boxes = [
        flag1 ? { h: F(96), el: flagCircle(flag1, F(96), q.cc) } : null,
        flag1 ? space(F(30)) : null,
        markedBox(f, markIndexes(q.h, q.hl), { weight: 800, color: 'white', hiColor: '#0B1633', hiBg: '#FDE047', width: inner, tracking: -2 }),
        q.s ? space(F(34)) : null,
        q.s ? textBox(mark(fitText(q.s, sizes(38, 34, 30), 600, inner, 5), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.92)', width: inner, lh: 1.32 }) : null,
        src ? space(F(30)) : null,
        src,
      ];
    } else if (q.t === 'versus') {
      // Two flags and a question; optional comparison rows (label | left | right).
      const rows = q.rows.slice(0, 5).filter((r) => r[0]);
      const big = F(rows.length ? 190 : 250);
      const colW = Math.floor((inner - F(120)) / 2);
      const nameSize = F(40);
      const head = textBox(mark(fitText(q.h, sizes(70, 62, 54, 46), 800, inner, 3, -1), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.1, tracking: -1, align: 'center' });
      const side = (flag: string | null, code: string, name: string) =>
        h(
          'div',
          { flexDirection: 'column', alignItems: 'center', width: colW },
          flagCircle(flag, big, code),
          h('div', { marginTop: F(18), height: F(52), fontSize: nameSize, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', fontFamily: SANS, alignItems: 'center' }, oneLine(name, nameSize, 800, colW))
        );
      const flagsH = big + F(18) + F(52);
      const rowH = F(88);
      const tableH = rowH * rows.length + F(20);
      const tableW = inner - F(40);
      const mid = Math.floor(tableW * 0.4);
      const cell = Math.floor((tableW - mid) / 2);
      boxes = [
        head,
        space(F(40)),
        {
          h: flagsH,
          el: h(
            'div',
            { width: inner, height: flagsH, alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 },
            side(flag1, q.cc, q.n),
            h('div', { width: F(120), height: big, alignItems: 'center', justifyContent: 'center' }, h('div', { width: F(92), height: F(92), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', color: 'white', fontSize: F(34), fontWeight: 800, alignItems: 'center', justifyContent: 'center', fontFamily: SANS }, 'or')),
            side(flag2, q.cc2, q.u)
          ),
        },
        rows.length ? space(F(34)) : null,
        rows.length
          ? {
              h: tableH,
              el: h(
                'div',
                { flexDirection: 'column', width: inner, height: tableH, backgroundColor: 'white', borderRadius: F(28), padding: `${F(10)}px ${F(20)}px`, flexShrink: 0, overflow: 'hidden' },
                ...rows.map((r, i) =>
                  h(
                    'div',
                    { height: rowH, width: tableW, alignItems: 'center', borderTop: i ? '2px solid #EEF2F7' : 'none', flexShrink: 0 },
                    h('div', { width: cell, justifyContent: 'center', fontSize: F(31), fontWeight: 800, color: INK, whiteSpace: 'nowrap', fontFamily: SANS }, oneLine(r[1] ?? '', F(31), 800, cell - 8)),
                    (() => {
                      const l = mark(fitText(r[0].toUpperCase(), sizes(19, 17, 15), 800, mid - 12, 1, 0.6), 'A comparison label');
                      return h('div', { width: mid, justifyContent: 'center', fontSize: l.size, fontWeight: 800, letterSpacing: 0.6, color: MUTED, whiteSpace: 'nowrap', fontFamily: SANS }, l.lines[0]);
                    })(),
                    h('div', { width: cell, justifyContent: 'center', fontSize: F(31), fontWeight: 800, color: INK, whiteSpace: 'nowrap', fontFamily: SANS }, oneLine(r[2] ?? '', F(31), 800, cell - 8))
                  )
                )
              ),
            }
          : null,
        q.s ? space(F(28)) : null,
        q.s ? textBox(mark(fitText(q.s, sizes(34, 30), 600, inner, 3), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.92)', width: inner, lh: 1.3, align: 'center' }) : null,
        src ? space(F(18)) : null,
        src,
      ];
    } else if (q.t === 'news') {
      // Headline, up to three points, the source. With a photo: text at the bottom.
      justify = photo ? 'flex-end' : 'center';
      const points = q.rows.slice(0, 3).map((r) => r[0]).filter(Boolean);
      const pw = inner - F(44);
      boxes = [
        flag1 ? { h: F(96), el: flagCircle(flag1, F(96), q.cc) } : null,
        flag1 ? space(F(24)) : null,
        textBox(mark(fitText(q.h, sizes(76, 66, 58, 50, 44), 800, inner, 4, -1), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.1, tracking: -1 }),
        q.s ? space(F(20)) : null,
        q.s ? textBox(mark(fitText(q.s, sizes(34, 30), 600, inner, 4), 'Summary'), { weight: 600, color: 'rgba(255,255,255,0.92)', width: inner, lh: 1.32 }) : null,
        points.length ? space(F(26)) : null,
        ...points.flatMap((text, i): (Box | null)[] => {
          const f = mark(fitText(text, sizes(31, 28), 600, pw, 3), `Point ${i + 1}`);
          const t = textBox(f, { weight: 600, color: 'white', width: pw, lh: 1.28 });
          const dot = F(14);
          return [
            i ? space(F(14)) : null,
            { h: t.h, el: h('div', { width: inner, height: t.h, alignItems: 'flex-start', flexShrink: 0 }, h('div', { width: dot, height: dot, borderRadius: 999, backgroundColor: '#FDE047', marginTop: Math.round((f.size * 1.28 - dot) / 2), marginRight: F(44) - dot, flexShrink: 0 }), t.el) },
          ];
        }),
        src ? space(F(28)) : null,
        src,
      ];
    } else if (q.t === 'cta') {
      // An invitation: what to do (big), why (sub), and up to three things you get.
      const chips = q.rows.slice(0, 3).map((r) => r[0]).filter(Boolean);
      const badge = F(120);
      const iconKey = q.n === 'comment' ? 'comment' : q.n === 'save' ? 'bookmark' : q.n === 'heart' ? 'heart' : 'plus';
      const chipBoxes: (Box | null)[] = chips.flatMap((c, i) => {
        const t = oneLine(c, F(30), 700, inner - F(110));
        return [
          i ? space(F(14)) : null,
          { h: F(74), el: h('div', { width: inner, height: F(74), borderRadius: F(22), backgroundColor: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.2)', alignItems: 'center', padding: `0 ${F(24)}px`, flexShrink: 0 }, svg(F(30), P.check, { stroke: '#FDE047', width: 3.2 }), h('div', { marginLeft: F(18), fontSize: F(30), fontWeight: 700, color: 'white', whiteSpace: 'nowrap', fontFamily: SANS }, t)) },
        ];
      });
      boxes = [
        { h: badge, el: h('div', { width: badge, height: badge, borderRadius: 999, backgroundColor: '#FDE047', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, svg(F(62), P[iconKey], { stroke: '#0B1633', width: 2.6 })) },
        space(F(34)),
        markedBox(mark(fitText(q.h, sizes(96, 84, 72, 62, 54), 800, inner, 4, -2), 'Headline'), markIndexes(q.h, q.hl), { weight: 800, color: 'white', hiColor: '#0B1633', hiBg: '#FDE047', width: inner, tracking: -2 }),
        q.s ? space(F(24)) : null,
        q.s ? textBox(mark(fitText(q.s, sizes(38, 34, 30), 600, inner, 4), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.92)', width: inner, lh: 1.3 }) : null,
        chips.length ? space(F(34)) : null,
        ...chipBoxes,
        src ? space(F(22)) : null,
        src,
      ];
    } else {
      // grid: headline + four numbers.
      const tiles = q.rows.slice(0, 4).filter((r) => r[0]);
      const g = F(20);
      const tw = Math.floor((inner - g) / 2);
      const th = F(q.size === 'square' ? 190 : 230);
      const rowsN = Math.ceil(tiles.length / 2);
      const gridH = th * rowsN + g * (rowsN - 1);
      const head = textBox(mark(fitText(q.h, sizes(64, 56, 50, 44), 800, inner, 3, -1), 'Headline'), { weight: 800, color: 'white', width: inner, lh: 1.1, tracking: -1 });
      const sub = q.s ? textBox(mark(fitText(q.s, sizes(30, 27), 600, inner, 3), 'Sub line'), { weight: 600, color: 'rgba(255,255,255,0.9)', width: inner, lh: 1.3 }) : null;
      const tile = (r: string[], i: number) => {
        const v = fitText(r[0], sizes(84, 72, 62, 52, 44), 800, tw - F(56), 1, -1.5);
        const l = fitText(r[1] ?? '', sizes(26, 24), 600, tw - F(56), 2);
        return h(
          'div',
          { width: tw, height: th, marginLeft: i % 2 ? g : 0, backgroundColor: i === 0 ? 'white' : 'rgba(255,255,255,0.16)', border: i === 0 ? 'none' : '2px solid rgba(255,255,255,0.22)', borderRadius: F(28), padding: `0 ${F(28)}px`, flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
          textBox(v, { weight: 800, color: i === 0 ? BLUE : 'white', width: tw - F(56), lh: 1.08, tracking: -1.5 }).el,
          h('div', { height: F(6), flexShrink: 0 }),
          textBox(l, { weight: 600, color: i === 0 ? MUTED : 'rgba(255,255,255,0.9)', width: tw - F(56), lh: 1.25 }).el
        );
      };
      boxes = [
        head,
        sub ? space(F(12)) : null,
        sub,
        space(F(30)),
        {
          h: gridH,
          el: h(
            'div',
            { flexDirection: 'column', width: inner, height: gridH, flexShrink: 0 },
            ...Array.from({ length: rowsN }, (_, r) => h('div', { width: inner, height: th, marginTop: r ? g : 0, flexShrink: 0 }, ...tiles.slice(r * 2, r * 2 + 2).map((t, i) => tile(t, r * 2 + i))))
          ),
        },
        src ? space(F(22)) : null,
        src,
      ];
    }

    const fits = total(boxes) <= bodyH;
    const last = step === STEPS.length - 1;
    const clean = fits && stepIssues.length === 0;
    if (clean || (fits && !chosen) || (last && !chosen)) {
      if (!fits) stepIssues.push({ level: 'error', message: 'Too much text for this image — shorten it or remove a row' });
      chosen = { body: h('div', { flexDirection: 'column', width: inner, height: bodyH, justifyContent: justify, flexShrink: 0, overflow: 'hidden' }, ...boxes.map((b) => b?.el)), issues: stepIssues, clean };
    }
  }
  if (chosen) {
    body = chosen.body;
    issues.push(...chosen.issues);
  }

  // --- Background: brand gradient, soft rings, and the photo behind a blue fade --
  const ring = (size: number, left: number, top: number, alpha: number) => h('div', { position: 'absolute', left, top, width: size, height: size, borderRadius: 999, border: `${Math.round(size * 0.11)}px solid rgba(255,255,255,${alpha})` });
  const background: (El | null)[] = [
    photo ? img(photo, { position: 'absolute', left: 0, top: 0, width: S.w, height: S.h, objectFit: 'cover' }) : null,
    photo
      ? h('div', { position: 'absolute', left: 0, top: 0, width: S.w, height: S.h, backgroundImage: 'linear-gradient(180deg, rgba(30,64,175,0.55) 0%, rgba(30,64,175,0.30) 24%, rgba(29,78,216,0.78) 56%, rgba(23,37,84,0.97) 100%)' })
      : null,
    !photo ? ring(Math.round(S.w * 0.62), Math.round(S.w * 0.6), -Math.round(S.w * 0.2), 0.07) : null,
    !photo ? ring(Math.round(S.w * 0.4), -Math.round(S.w * 0.16), Math.round(S.h * 0.74), 0.06) : null,
  ];
  const credit = photo && q.cr ? h('div', { position: 'absolute', right: S.side, top: S.top + headerH + 10, fontSize: U(17), fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontFamily: SANS, whiteSpace: 'nowrap' }, oneLine(`Photo: ${q.cr}`, U(17), 600, inner * 0.7)) : null;

  const tree = h(
    'div',
    { width: S.w, height: S.h, position: 'relative', backgroundImage: GRADIENT[q.th], backgroundColor: BLUE, fontFamily: SANS },
    ...background,
    credit,
    h(
      'div',
      { position: 'absolute', left: 0, top: 0, width: S.w, height: S.h, flexDirection: 'column', justifyContent: 'space-between', padding: `${S.top}px ${S.side}px ${S.bottom}px` },
      header,
      body,
      footer
    )
  );
  return { tree, issues, width: S.w, height: S.h };
}

// ---------------------------------------------------------------------------
// URL <-> params (the same rules on the server, in the admin panel and in the pipeline)
// ---------------------------------------------------------------------------

const clean = (s: string | null, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parsePost(q: URLSearchParams): PostParams | null {
  const t = q.get('t') as Template;
  if (!TEMPLATES.includes(t)) return null;
  const size = (['portrait', 'square', 'story'].includes(q.get('size') ?? '') ? q.get('size') : 'portrait') as SizeKey;
  const th = q.get('th');
  const rows = (q.get('rows') ?? '')
    .split('~')
    .map((r) => r.split('|').map((c) => clean(c, 400)))
    .filter((r) => r.some(Boolean))
    .slice(0, 8);
  return {
    t,
    size,
    k: clean(q.get('k'), 40),
    h: (q.get('h') ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 220),
    s: clean(q.get('s'), 320),
    cc: clean(q.get('cc'), 2).toLowerCase(),
    cc2: clean(q.get('cc2'), 2).toLowerCase(),
    img: clean(q.get('img'), 600),
    cr: clean(q.get('cr'), 60),
    rows,
    n: clean(q.get('n'), 40),
    u: clean(q.get('u'), 90),
    src: clean(q.get('src'), 140),
    cta: clean(q.get('cta'), 30),
    link: clean(q.get('link'), 44),
    p: clean(q.get('p'), 8),
    hl: clean(q.get('hl'), 200).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4),
    m: clean(q.get('m'), 260),
    f: clean(q.get('f'), 320),
    th: th === 'ink' || th === 'light' ? th : 'blue',
  };
}
