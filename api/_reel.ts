// Text layers for Reels (/api/og/post?t=reel&sc=…) — transparent 1080×1920
// PNGs that the renderer (scripts/render-reels.mjs) lays over city footage.
//
// The look, borrowed from the reels that do well in this niche and redrawn
// in MadeVisa's style: every line of text sits in its own rounded box that
// hugs the words (white, MadeVisa blue or marker yellow), big enough to read
// with the sound off, and nothing near the edges where Instagram and TikTok
// put their own buttons.
//
// Layers (sc=):
//   frame  always on: soft dark fades top and bottom, the logo, the address
//   hook   label + flag + the opening lines                       (0–3 s)
//   list   a short headline and up to 4 rows that appear one by one
//   cta    what to do next: lines, the link, "comment X"
//   bg     the fallback background when there is no footage or photo (plain=1: white)
//   job    a whole white screen, one opportunity: "<Company> is hiring", the role,
//          the flag and the place — fast job reels show one of these per role
//   follow a whole white screen: "Follow @handle for daily job opportunities"
//   (frame with plain=1 draws nothing: white reels need no dark fades)
//   thumb  the cover (thumbnail): 2–4 huge lines in boxes and the flag — laid over a
//          frame of the video (which already carries the logo) by the renderer.
//          Everything sits inside the middle
//          1080×1440 (Instagram's profile grid crops covers to 3:4), readable at grid size.
// Parameters:
//   l     lines, "~" between them. First character sets the box:
//         "*" blue · "!" yellow · "-" dark · none = white
//   k     label above the lines      kc  its colour: blue | red | green | yellow | white
//   cc    country (flag)             s   small line under the boxes
//   rows  list rows "title|detail~title|detail"
//   n     how many lines / rows are visible (the rest keep their place but are
//         invisible) — the renderer steps n up to reveal them one by one
//   link  address in the pill        c   comment prompt, e.g. Comment “GERMANY”
//   co    company (job)  pl  place (job)  logo  company logo URL (job)  fh  handle (job, follow)
//
// The same no-overlap rules as api/_post.ts: line breaks are computed here
// from Inter's real widths, each box has a fixed height, and the block steps
// down in size until it fits the safe area.

import { h, icon, img, type El } from './_og';
import { FLAG_URL, breakLines, oneLine, textWidth, type Issue, type Loader } from './_post';

export type ReelScene = 'frame' | 'hook' | 'list' | 'cta' | 'bg' | 'job' | 'follow' | 'thumb';
export type ReelParams = {
  sc: ReelScene;
  l: string[];
  k: string;
  kc: 'blue' | 'red' | 'green' | 'yellow' | 'white';
  cc: string;
  s: string;
  rows: string[][];
  n: number;
  link: string;
  c: string;
  co: string;
  pl: string;
  logo: string;
  fh: string;
  plain: boolean;
};

const W = 1080;
const H = 1920;
// Clear of the apps' own interface: title bar on top, caption and buttons below and on the right.
const SAFE = { left: 70, right: 150, top: 300, bottom: 470 };
const BOX_W = W - SAFE.left - SAFE.right;
const BLUE = '#2563EB';
const INK = '#0B1633';
const SANS = "'Inter', sans-serif";

const KICKER: Record<ReelParams['kc'], { bg: string; fg: string }> = {
  blue: { bg: BLUE, fg: 'white' },
  red: { bg: '#DC2626', fg: 'white' },
  green: { bg: '#16A34A', fg: 'white' },
  yellow: { bg: '#FDE047', fg: INK },
  white: { bg: 'white', fg: BLUE },
};
const STYLE: Record<string, { bg: string; fg: string }> = {
  '*': { bg: BLUE, fg: 'white' },
  '!': { bg: '#FDE047', fg: INK },
  '-': { bg: 'rgba(11,22,51,0.86)', fg: 'white' },
  '': { bg: 'white', fg: INK },
};

type Line = { text: string; style: string; group: number };

/** The lines at a size: each given line may wrap into several boxes. */
function layout(lines: string[], size: number): Line[] {
  const pad = Math.round(size * 0.3);
  const out: Line[] = [];
  lines.forEach((raw, group) => {
    const style = /^[*!-]/.test(raw) ? raw[0] : '';
    const text = style ? raw.slice(1).trim() : raw.trim();
    if (!text) return;
    for (const part of breakLines(text, size, 800, BOX_W - pad * 2, -1)) out.push({ text: part, style, group });
  });
  return out;
}

/** No word is wider than a box at this size (a wider one would be split in the middle). */
function wordsFit(lines: string[], size: number): boolean {
  const room = BOX_W - Math.round(size * 0.3) * 2;
  return lines.every((raw) => raw.replace(/^[*!-]/, '').split(/\s+/).every((w) => textWidth(w, size, 800, -1) <= room));
}

function lineBoxes(lines: Line[], size: number, visible: number): { el: El; h: number } {
  const pad = Math.round(size * 0.3);
  const boxH = Math.round(size * 1.3);
  const gap = Math.round(size * 0.1);
  return {
    h: lines.length * boxH + Math.max(0, lines.length - 1) * gap,
    el: h(
      'div',
      { flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 },
      ...lines.map((ln, i) =>
        h(
          'div',
          {
            height: boxH,
            marginTop: i ? gap : 0,
            padding: `0 ${pad}px`,
            borderRadius: Math.round(size * 0.22),
            backgroundColor: STYLE[ln.style].bg,
            color: STYLE[ln.style].fg,
            fontSize: size,
            fontWeight: 800,
            letterSpacing: -1,
            alignItems: 'center',
            whiteSpace: 'nowrap',
            fontFamily: SANS,
            flexShrink: 0,
            // Lines not revealed yet keep their place, so nothing jumps when they appear.
            opacity: ln.group < visible ? 1 : 0,
          },
          ln.text
        )
      )
    ),
  };
}

function svg(size: number, paths: string[], stroke: string, width = 2.4): El {
  return { type: 'svg', props: { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0 }, children: paths.map((d) => ({ type: 'path', props: { d } })) } } as unknown as El;
}
const GLOBE = ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'];
const COMMENT = ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'];

/** A small text in a dark translucent box (readable on any footage). */
function note(text: string, size: number, maxLines: number): { el: El; h: number; cut: boolean } {
  const pad = Math.round(size * 0.5);
  let lines = breakLines(text, size, 700, BOX_W - pad * 2);
  const cut = lines.length > maxLines;
  if (cut) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].replace(/[\s,.;:–—-]+\S*$/, '')}…`];
  const lh = Math.round(size * 1.32);
  const hh = lines.length * lh + pad;
  return {
    cut,
    h: hh,
    el: h(
      'div',
      { flexDirection: 'column', justifyContent: 'center', height: hh, padding: `0 ${pad}px`, borderRadius: Math.round(size * 0.45), backgroundColor: 'rgba(11,22,51,0.78)', flexShrink: 0 },
      ...lines.map((ln) => h('div', { height: lh, alignItems: 'center', fontSize: size, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', fontFamily: SANS }, ln))
    ),
  };
}

export async function drawReel(q: ReelParams, load: Loader): Promise<{ tree: El; issues: Issue[]; width: number; height: number }> {
  const issues: Issue[] = [];
  const flag = /^[a-z]{2}$/i.test(q.cc) ? await load(FLAG_URL(q.cc), 'flag') : null;
  const full = (children: (El | null)[], style: Record<string, unknown> = {}) => h('div', { width: W, height: H, position: 'relative', fontFamily: SANS, ...style }, ...children);

  // --- White reels: plain background, no fades, whole-screen job and follow cards ------
  if (q.sc === 'bg' && q.plain) return { width: W, height: H, issues, tree: full([], { backgroundColor: 'white' }) };
  if (q.sc === 'frame' && q.plain) return { width: W, height: H, issues, tree: full([]) };
  if (q.sc === 'job' || q.sc === 'follow') return drawWhite(q, flag, load, issues);
  if (q.sc === 'thumb') return drawThumb(q, flag, issues);

  // --- Fallback background: brand gradient, rings, a big flag -------------------
  if (q.sc === 'bg') {
    const ring = (size: number, left: number, top: number, alpha: number) => h('div', { position: 'absolute', left, top, width: size, height: size, borderRadius: 999, border: `${Math.round(size * 0.11)}px solid rgba(255,255,255,${alpha})` });
    return {
      width: W,
      height: H,
      issues,
      tree: full(
        [
          ring(900, 480, -260, 0.08),
          ring(620, -260, 1380, 0.07),
          ring(380, 640, 1500, 0.05),
          flag ? h('div', { position: 'absolute', left: 620, top: 300, width: 560, height: 560, borderRadius: 999, overflow: 'hidden', opacity: 0.28 }, img(flag, { width: 560, height: 560, objectFit: 'cover' })) : null,
        ],
        { backgroundImage: 'linear-gradient(165deg, #172554 0%, #1D4ED8 42%, #2563EB 70%, #3B82F6 100%)', backgroundColor: BLUE }
      ),
    };
  }

  // --- Always-on layer: fades, logo, address --------------------------------------
  if (q.sc === 'frame') {
    const size = 44;
    return {
      width: W,
      height: H,
      issues,
      tree: full([
        h('div', { position: 'absolute', left: 0, top: 0, width: W, height: 520, backgroundImage: 'linear-gradient(180deg, rgba(11,22,51,0.62) 0%, rgba(11,22,51,0) 100%)' }),
        h('div', { position: 'absolute', left: 0, top: H - 760, width: W, height: 760, backgroundImage: 'linear-gradient(180deg, rgba(11,22,51,0) 0%, rgba(11,22,51,0.74) 100%)' }),
        h(
          'div',
          { position: 'absolute', left: SAFE.left, top: 190, height: 84, padding: '0 30px', borderRadius: 999, backgroundColor: 'white', alignItems: 'center' },
          icon('plane', Math.round(size * 1.05), BLUE, 2.2),
          h('div', { fontSize: size, fontWeight: 400, color: BLUE, marginLeft: 12, fontFamily: SANS }, 'made'),
          h('div', { fontSize: size, fontWeight: 800, color: BLUE, fontFamily: SANS }, 'visa')
        ),
      ]),
    };
  }

  const kick = q.k ? KICKER[q.kc] : null;
  const kicker = kick
    ? { h: 70, el: h('div', { height: 70, padding: '0 28px', borderRadius: 999, backgroundColor: kick.bg, color: kick.fg, fontSize: 32, fontWeight: 800, letterSpacing: 2, alignItems: 'center', whiteSpace: 'nowrap', fontFamily: SANS, flexShrink: 0 }, q.k.toUpperCase().slice(0, 30)) }
    : null;
  const flagBox = flag ? { h: 150, el: h('div', { width: 150, height: 150, borderRadius: 999, border: '8px solid white', overflow: 'hidden', backgroundColor: 'white', flexShrink: 0 }, img(flag, { width: 150, height: 150, objectFit: 'cover' })) } : null;
  const area = H - SAFE.top - SAFE.bottom;

  // --- Rows that appear one by one ---------------------------------------------------
  let rowsBox: { el: El; h: number } | null = null;
  if (q.sc === 'list') {
    const rows = q.rows.slice(0, 4).filter((r) => r[0]);
    const pad = 30;
    const num = 76;
    const tw = BOX_W - pad * 2 - num - 26;
    const els: El[] = [];
    let total = 0;
    rows.forEach((r, i) => {
      let title = breakLines(r[0], 46, 800, tw);
      if (title.length > 2) {
        title = [title[0], `${title[1].replace(/[\s,.;:–—-]+\S*$/, '')}…`];
        issues.push({ level: 'warning', message: `Row ${i + 1} shortened to fit` });
      }
      let sub = r[1] ? breakLines(r[1], 32, 600, tw) : [];
      if (sub.length > 2) sub = [sub[0], `${sub[1].replace(/[\s,.;:–—-]+\S*$/, '')}…`];
      const inner = title.length * 56 + sub.length * 42 + (sub.length ? 6 : 0);
      const rh = Math.max(num, inner) + 44;
      total += rh + (i ? 18 : 0);
      els.push(
        h(
          'div',
          { width: BOX_W, height: rh, marginTop: i ? 18 : 0, padding: `0 ${pad}px`, borderRadius: 30, backgroundColor: 'white', alignItems: 'center', flexShrink: 0, opacity: i < q.n ? 1 : 0 },
          h('div', { width: num, height: num, borderRadius: 999, backgroundColor: BLUE, color: 'white', fontSize: 40, fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: SANS }, String(i + 1)),
          h(
            'div',
            { flexDirection: 'column', width: tw, marginLeft: 26 },
            ...title.map((t) => h('div', { height: 56, alignItems: 'center', fontSize: 46, fontWeight: 800, color: INK, whiteSpace: 'nowrap', fontFamily: SANS, letterSpacing: -0.5 }, t)),
            sub.length ? h('div', { height: 6 }) : null,
            ...sub.map((t) => h('div', { height: 42, alignItems: 'center', fontSize: 32, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontFamily: SANS }, t))
          )
        )
      );
    });
    rowsBox = { h: total, el: h('div', { flexDirection: 'column', flexShrink: 0 }, ...els) };
  }

  // --- The link and the comment prompt (cta) ---------------------------------------------
  // One line each: the largest size at which the whole text fits the pill; if none does, the end is cut (and noted).
  const pillText = (text: string, sizes: number[], what: string) => {
    const room = BOX_W - 144;
    const size = sizes.find((s) => textWidth(text, s, 800) <= room) ?? sizes[sizes.length - 1];
    const shown = oneLine(text, size, 800, room);
    if (shown !== text) issues.push({ level: 'warning', message: `${what} shortened to fit` });
    return { size, shown };
  };
  const linkText = q.sc === 'cta' && q.link ? pillText(q.link, [48, 42, 38, 34, 30], 'Link') : null;
  const commentText = q.sc === 'cta' && q.c ? pillText(q.c, [46, 40, 36, 32], 'Comment prompt') : null;
  const linkBox =
    linkText
      ? {
          h: 104,
          el: h(
            'div',
            { height: 104, padding: '0 36px', borderRadius: 999, backgroundColor: BLUE, alignItems: 'center', flexShrink: 0 },
            svg(50, GLOBE, 'white'),
            h('div', { marginLeft: 18, fontSize: linkText.size, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', fontFamily: SANS }, linkText.shown)
          ),
        }
      : null;
  const commentBox =
    commentText
      ? {
          h: 104,
          el: h('div', { height: 104, padding: '0 34px', borderRadius: 28, backgroundColor: '#FDE047', alignItems: 'center', flexShrink: 0 }, svg(50, COMMENT, INK, 2.6), h('div', { marginLeft: 18, fontSize: commentText.size, fontWeight: 800, color: INK, whiteSpace: 'nowrap', fontFamily: SANS }, commentText.shown)),
        }
      : null;
  // The small line: three lines, or a size down and four, before anything is cut.
  const small = q.s ? [note(q.s, 40, 3), note(q.s, 36, 4), note(q.s, 34, 4)].find((x, i) => !x.cut || i === 2)! : null;
  if (small?.cut) issues.push({ level: 'warning', message: 'Small line shortened to fit' });
  // On the opening screen the small line arrives last, after every big line.
  const smallOn = q.sc !== 'hook' || q.n > q.l.length;

  // --- The lines: the largest size at which the whole block fits ------------------------
  const ladder = q.sc === 'list' ? [70, 62, 54] : q.sc === 'cta' ? [104, 92, 80, 70, 60] : [136, 120, 104, 92, 80, 70, 60, 52, 46];
  // A long sentence (a myth, a news headline) may run to eight short lines; a headline over a list gets three.
  const maxLines = q.sc === 'list' ? 3 : 8;
  const fixed = [kicker ? kicker.h + 26 : 0, flagBox ? flagBox.h + 30 : 0, rowsBox ? rowsBox.h + 36 : 0, linkBox ? linkBox.h + 34 : 0, commentBox ? commentBox.h + 22 : 0, small ? small.h + 30 : 0].reduce((a, b) => a + b, 0);
  let chosen: { lines: Line[]; size: number } | null = null;
  for (const size of ladder) {
    const lines = layout(q.l, size);
    const hh = lines.length * Math.round(size * 1.3) + Math.max(0, lines.length - 1) * Math.round(size * 0.1);
    if (lines.length <= maxLines && hh + fixed <= area && (wordsFit(q.l, size) || size === ladder[ladder.length - 1])) {
      chosen = { lines, size };
      break;
    }
  }
  if (!chosen) {
    const size = ladder[ladder.length - 1];
    chosen = { lines: layout(q.l, size).slice(0, maxLines), size };
    issues.push({ level: q.l.length ? 'warning' : 'error', message: q.l.length ? 'Too much text for one screen — the last lines are left out' : 'This screen has no text' });
  }
  const boxes = lineBoxes(chosen.lines, chosen.size, q.sc === 'hook' ? q.n : 99);

  const stack: (El | null)[] = [
    kicker?.el ?? null,
    kicker ? h('div', { height: 26, flexShrink: 0 }) : null,
    flagBox?.el ?? null,
    flagBox ? h('div', { height: 30, flexShrink: 0 }) : null,
    boxes.el,
    rowsBox ? h('div', { height: 36, flexShrink: 0 }) : null,
    rowsBox?.el ?? null,
    linkBox ? h('div', { height: 34, flexShrink: 0 }) : null,
    linkBox?.el ?? null,
    commentBox ? h('div', { height: 22, flexShrink: 0 }) : null,
    commentBox?.el ?? null,
    small ? h('div', { height: 30, flexShrink: 0 }) : null,
    small ? h('div', { opacity: smallOn ? 1 : 0, flexShrink: 0 }, small.el) : null,
  ];
  const tree = full([
    h('div', { position: 'absolute', left: SAFE.left, top: SAFE.top, width: BOX_W, height: area, flexDirection: 'column', alignItems: 'flex-start', justifyContent: q.sc === 'list' ? 'flex-start' : 'center', overflow: 'hidden' }, ...stack),
  ]);
  return { tree, issues, width: W, height: H };
}

/** One white screen: a job ("<Company> is hiring · Role · flag Place") or the follow card. Big, still, readable in a second. */
async function drawWhite(q: ReelParams, flag: string | null, load: Loader, issues: Issue[]): Promise<{ tree: El; issues: Issue[]; width: number; height: number }> {
  const handle = `@${(q.fh || 'madevisacom').replace(/^@/, '')}`;
  const mark = h(
    'div',
    { position: 'absolute', left: SAFE.left, top: 190, height: 80, alignItems: 'center' },
    icon('plane', 46, BLUE, 2.2),
    h('div', { fontSize: 44, fontWeight: 400, color: INK, marginLeft: 12, fontFamily: SANS }, 'made'),
    h('div', { fontSize: 44, fontWeight: 800, color: INK, fontFamily: SANS }, 'visa')
  );
  const big = (text: string, ladder: number[], maxLines: number, color = INK) => {
    for (const size of ladder) {
      const lines = breakLines(text, size, 800, BOX_W, -2);
      // Never split a word (a handle, a long title word) in the middle.
      const whole = text.split(/\s+/).every((w) => textWidth(w, size, 800, -2) <= BOX_W);
      if (lines.length <= maxLines && whole) return { size, lines };
    }
    const size = ladder[ladder.length - 1];
    const lines = breakLines(text, size, 800, BOX_W, -2);
    if (lines.length > maxLines) issues.push({ level: 'warning', message: 'Role shortened to fit' });
    return { size, lines: lines.slice(0, maxLines), color };
  };
  const block = (f: { size: number; lines: string[] }, color = INK) =>
    h('div', { flexDirection: 'column', flexShrink: 0 }, ...f.lines.map((ln) => h('div', { height: Math.round(f.size * 1.1), alignItems: 'center', fontSize: f.size, fontWeight: 800, color, letterSpacing: -2, whiteSpace: 'nowrap', fontFamily: SANS }, ln)));

  if (q.sc === 'follow') {
    const lines = big(handle, [120, 104, 92, 80, 68, 60], 1);
    return {
      width: W,
      height: H,
      issues,
      tree: h(
        'div',
        { width: W, height: H, position: 'relative', fontFamily: SANS, backgroundColor: 'white' },
        mark,
        h(
          'div',
          { position: 'absolute', left: SAFE.left, top: SAFE.top, width: BOX_W, height: H - SAFE.top - SAFE.bottom, flexDirection: 'column', justifyContent: 'center' },
          h('div', { fontSize: 64, fontWeight: 800, color: '#6B7280', fontFamily: SANS, marginBottom: 18 }, 'Follow'),
          block(lines, BLUE),
          h('div', { marginTop: 36, fontSize: 52, fontWeight: 700, color: INK, fontFamily: SANS, lineHeight: 1.25, width: BOX_W }, 'for new job opportunities every day'),
          h('div', { marginTop: 40, alignSelf: 'flex-start', height: 96, padding: '0 34px', borderRadius: 999, backgroundColor: INK, color: 'white', alignItems: 'center', fontSize: 42, fontWeight: 800, fontFamily: SANS }, 'madevisa.com/jobs')
        )
      ),
    };
  }

  const logo = /^https:\/\//.test(q.logo) ? await load(q.logo, 'logo') : null;
  const company = oneLine(q.co || 'A company', 52, 800, BOX_W - (logo ? 150 : 0));
  const role = big(q.l[0] || 'New role', [118, 104, 92, 82, 72, 62], 4);
  const place = q.pl ? oneLine(q.pl, 54, 700, BOX_W - 110) : '';
  return {
    width: W,
    height: H,
    issues,
    tree: h(
      'div',
      { width: W, height: H, position: 'relative', fontFamily: SANS, backgroundColor: 'white' },
      mark,
      h(
        'div',
        { position: 'absolute', left: SAFE.left, top: SAFE.top, width: BOX_W, height: H - SAFE.top - SAFE.bottom, flexDirection: 'column', justifyContent: 'center' },
        h(
          'div',
          { alignItems: 'center', height: 120, flexShrink: 0 },
          logo ? h('div', { width: 120, height: 120, borderRadius: 26, border: '3px solid #E5E7EB', backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginRight: 28, overflow: 'hidden', flexShrink: 0 }, img(logo, { width: 100, height: 100, objectFit: 'contain' })) : null,
          h('div', { flexDirection: 'column' }, h('div', { fontSize: 52, fontWeight: 800, color: INK, fontFamily: SANS, whiteSpace: 'nowrap' }, company), h('div', { fontSize: 36, fontWeight: 700, color: '#047857', fontFamily: SANS, marginTop: 4 }, 'is hiring'))
        ),
        h('div', { height: 54, flexShrink: 0 }),
        block(role),
        place
          ? h(
              'div',
              { alignItems: 'center', marginTop: 46, height: 84, flexShrink: 0 },
              flag ? h('div', { width: 84, height: 84, borderRadius: 999, overflow: 'hidden', marginRight: 24, border: '3px solid #E5E7EB', flexShrink: 0 }, img(flag, { width: 84, height: 84, objectFit: 'cover' })) : null,
              h('div', { fontSize: 54, fontWeight: 700, color: '#111827', fontFamily: SANS, whiteSpace: 'nowrap' }, place)
            )
          : null,
        q.s ? h('div', { marginTop: 34, alignSelf: 'flex-start', height: 72, padding: '0 26px', borderRadius: 999, backgroundColor: '#F3F4F6', color: '#374151', alignItems: 'center', fontSize: 34, fontWeight: 700, fontFamily: SANS, whiteSpace: 'nowrap' }, oneLine(q.s, 34, 700, BOX_W - 60)) : null
      ),
      h('div', { position: 'absolute', left: SAFE.left, top: H - SAFE.bottom + 40, width: BOX_W, fontSize: 36, fontWeight: 600, color: '#6B7280', fontFamily: SANS }, `Follow ${handle} for more`)
    ),
  };
}

/**
 * The cover. What makes people tap a reel in a grid or a feed: few words, very big, high
 * contrast, one line in yellow (the number or the punch), a face or a flag. All of it inside
 * the 3:4 middle, so the profile grid shows it whole.
 */
function drawThumb(q: ReelParams, flag: string | null, issues: Issue[]): { tree: El; issues: Issue[]; width: number; height: number } {
  const CROP = { top: 240 + 70, bottom: H - 240 - 150 }; // inside the 3:4 crop, clear of the grid's own edges
  const room = CROP.bottom - CROP.top;
  const flagH = flag ? 170 + 40 : 0;
  const ladder = [176, 160, 148, 136, 124, 112, 100, 90];
  let chosen: { lines: Line[]; size: number } | null = null;
  // The biggest words that fit in 4 lines (else 5): a cover is read in half a second.
  for (const most of [4, 5]) {
    for (const size of ladder) {
      const lines = layout(q.l, size);
      const hh = lines.length * Math.round(size * 1.3) + Math.max(0, lines.length - 1) * Math.round(size * 0.1);
      if (lines.length <= most && hh + flagH <= room && wordsFit(q.l, size)) {
        chosen = { lines, size };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) {
    const size = ladder[ladder.length - 1];
    chosen = { lines: layout(q.l, size).slice(0, 5), size };
    issues.push({ level: q.l.length ? 'warning' : 'error', message: q.l.length ? 'Cover text shortened to fit' : 'The cover has no text' });
  }
  const boxes = lineBoxes(chosen.lines, chosen.size, 99);
  return {
    width: W,
    height: H,
    issues,
    tree: h(
      'div',
      { width: W, height: H, position: 'relative', fontFamily: SANS },
      // A dark veil so white and yellow boxes pop over any footage.
      h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundImage: 'linear-gradient(180deg, rgba(11,22,51,0.55) 0%, rgba(11,22,51,0.25) 45%, rgba(11,22,51,0.65) 100%)' }),
      h(
        'div',
        { position: 'absolute', left: SAFE.left, top: CROP.top, width: BOX_W + 80, height: room, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' },
        flag ? h('div', { width: 170, height: 170, borderRadius: 999, border: '9px solid white', overflow: 'hidden', backgroundColor: 'white', flexShrink: 0, marginBottom: 40 }, img(flag, { width: 170, height: 170, objectFit: 'cover' })) : null,
        boxes.el
      )
    ),
  };
}

const clean = (s: string | null, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseReel(q: URLSearchParams): ReelParams | null {
  if (q.get('t') !== 'reel') return null;
  const sc = q.get('sc') as ReelScene;
  if (!['frame', 'hook', 'list', 'cta', 'bg', 'job', 'follow', 'thumb'].includes(sc)) return null;
  const kc = q.get('kc');
  const l = (q.get('l') ?? '').split('~').map((x) => clean(x, 240)).filter(Boolean).slice(0, 6);
  const rows = (q.get('rows') ?? '').split('~').map((r) => r.split('|').map((c) => clean(c, 160))).filter((r) => r.some(Boolean)).slice(0, 4);
  const n = Number(q.get('n'));
  return {
    sc,
    l,
    k: clean(q.get('k'), 30),
    kc: kc === 'red' || kc === 'green' || kc === 'yellow' || kc === 'white' ? kc : 'blue',
    cc: clean(q.get('cc'), 2).toLowerCase(),
    s: clean(q.get('s'), 200),
    rows,
    n: q.has('n') && Number.isFinite(n) ? Math.max(0, Math.min(8, Math.round(n))) : 99,
    link: clean(q.get('link'), 60),
    c: clean(q.get('c'), 48),
    co: clean(q.get('co'), 80),
    pl: clean(q.get('pl'), 80),
    logo: clean(q.get('logo'), 400),
    fh: clean(q.get('fh'), 30).replace(/[^A-Za-z0-9._@]/g, ''),
    plain: q.get('plain') === '1',
  };
}
