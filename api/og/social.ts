// GET /api/og/social?layout=list|single|company|cards&ids=<8-hex,…>&size=portrait|square|story&h=<headline>&d=<date label>&s=<platform>
//   → PNG for a social post, drawn at the edge from live job data.
// Every text on the image can be changed from the admin panel before posting:
//   h    headline                     hi   headline icon: zap | party | none
//   d    date pill (empty = hidden)   tag  per-job tag, e.g. "Be an early applicant" (empty = hidden)
//   cta  button text                  link footer link text (globe icon in front)
//   hire company template: word under the company name ("is hiring")
//   sub  company template: small line under it (empty = hidden)
//   ht   0 = hide the role hashtags on the image
// Add &check=1 → JSON { ok, issues[] } instead of the image: the same layout
// maths, so the pipeline and the admin preview can see problems (a job no
// longer live, a title that had to be shortened, a logo that can't be drawn)
// BEFORE anything is published.
//
// Layout rules that make overlapping text impossible:
//  - every row / block has a fixed height and overflow hidden;
//  - titles are fitted first (largest size whose estimated line count fits),
//    then shortened with "…" only if even the smallest size doesn't fit;
//  - single-line texts are cut to a width budget;
//  - a logo is drawn only if it downloads as a real image — otherwise it is
//    left out (never a placeholder).

import { ImageResponse } from '@vercel/og';
import { googleFont, h, icon, img, logoDataUrl, textOf, type El, type Font } from '../_og';
import { rpc } from '../_supa';

export const config = { runtime: 'edge' };

type Job = {
  id: string;
  title: string;
  company: string;
  logo: string | null;
  city: string | null;
  country: string | null;
  iso: string | null;
  remote: boolean | null;
  work_arrangement: string | null;
  employment_type: string | null;
  experience: string | null;
  salary: string | null;
  visa: boolean | null;
  student: boolean | null;
  posted: string | null;
};

type Texts = { icon: 'zap' | 'party' | 'none'; tag: string; cta: string; link: string; hire: string; sub: string; hashtags: boolean };

type SizeKey = 'portrait' | 'square' | 'story';
const SIZES: Record<SizeKey, { w: number; h: number; top: number; bottom: number; side: number; head: number; title: number; meta: number; chip: number; maxRows: number }> = {
  // Instagram / Facebook / LinkedIn feed (4:5)
  portrait: { w: 1080, h: 1350, top: 64, bottom: 56, side: 60, head: 60, title: 34, meta: 23, chip: 18, maxRows: 5 },
  square: { w: 1080, h: 1080, top: 56, bottom: 48, side: 56, head: 52, title: 32, meta: 22, chip: 17, maxRows: 3 },
  // TikTok / Reels / Stories (9:16) — keeps clear of the app's own buttons at top and bottom
  story: { w: 1080, h: 1920, top: 170, bottom: 250, side: 64, head: 72, title: 40, meta: 26, chip: 20, maxRows: 5 },
};

const BLUE = '#2563EB';
const INK = '#0F172A';
const MUTED = '#64748B';
const SANS = "'Inter', sans-serif";

// --- Text fitting (Inter; average glyph width as a share of the font size) ---
const AVG = { 800: 0.58, 700: 0.56, 600: 0.54, 400: 0.5 } as const;
const linesFor = (text: string, size: number, width: number, weight: keyof typeof AVG) => Math.ceil((text.length * size * AVG[weight]) / width);
function cut(text: string, size: number, width: number, weight: keyof typeof AVG, lines = 1): { text: string; cut: boolean } {
  const budget = Math.floor((width * lines) / (size * AVG[weight]));
  if (text.length <= budget) return { text, cut: false };
  return { text: `${text.slice(0, Math.max(1, budget - 1)).replace(/[\s,.;:–—-]+\S*$/, '')}…`, cut: true };
}
/** Largest size from `sizes` that fits in `maxLines`; otherwise the smallest, shortened. */
function fit(text: string, sizes: number[], width: number, maxLines: number, weight: keyof typeof AVG = 800) {
  for (const s of sizes) if (linesFor(text, s, width, weight) <= maxLines) return { size: s, text, cut: false, lines: linesFor(text, s, width, weight) };
  const s = sizes[sizes.length - 1];
  const c = cut(text, s, width, weight, maxLines);
  return { size: s, text: c.text, cut: c.cut, lines: maxLines };
}

// Icons drawn here (not in ../_og) so this template owns its look.
function svg(size: number, paths: string[], o: { stroke: string; fill?: string; width?: number }): El {
  return {
    type: 'svg',
    props: {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: o.fill ?? 'none',
      stroke: o.stroke,
      strokeWidth: o.width ?? 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { flexShrink: 0 },
      children: paths.map((d) => ({ type: 'path', props: { d } })),
    },
  } as unknown as El;
}
const ZAP = ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'];
const PARTY = [
  'M5.8 11.3 2 22l10.7-3.79',
  'M4 3h.01',
  'M22 8h.01',
  'M15 2h.01',
  'M22 20h.01',
  'm22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10',
  'm22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17',
  'm11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7',
  'M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z',
];
const GLOBE = ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'];

/** "#CustomerExperienceAdvisor" from "Customer Experience Advisor | S1 | Retail Banking". */
export function roleTag(title: string): string {
  const core = title.replace(/\s*\((m|f|w|d|x)\/(m|f|w|d|x)(\/(m|f|w|d|x))?\)\s*/gi, ' ').split(/\s[|–—-]\s|[|,(/]/)[0];
  const words = core
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  const tag = words.join('').slice(0, 32);
  return tag.length >= 3 ? `#${tag}` : '';
}

/** "Be an early applicant" — same look as on the job page: bold caps, lightning. */
function earlyTag(text: string, size: number): El {
  return h(
    'div',
    { alignItems: 'center', backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '2px solid #BFDBFE', fontSize: size, fontWeight: 800, letterSpacing: 0.8, padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.6)}px`, borderRadius: 8, marginRight: 10, fontFamily: SANS, flexShrink: 0 },
    svg(Math.round(size * 1.05), ZAP, { stroke: '#1D4ED8', fill: '#1D4ED8', width: 1.5 }),
    h('div', { marginLeft: Math.round(size * 0.35) }, text.toUpperCase())
  );
}

const cleanTitle = (t: string) => t.replace(/\s*\((m|f|w|d|x)\/(m|f|w|d|x)(\/(m|f|w|d|x))?\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
const location = (j: Job) => {
  const wa = j.work_arrangement === 'remote' || (j.remote && !j.work_arrangement);
  const place = [j.city, j.country].filter(Boolean).join(', ');
  return place || (wa ? 'Remote' : '');
};
export function tagsFor(j: Job): string[] {
  const t: string[] = [];
  if (j.work_arrangement === 'remote' || (j.remote && !j.work_arrangement)) t.push('REMOTE');
  else if (j.work_arrangement === 'hybrid') t.push('HYBRID');
  if (j.visa) t.push('VISA SPONSORSHIP');
  if (j.student) t.push('STUDENT');
  return t;
}

// --- Pieces ---
function brand(color: string, size: number): El {
  return h(
    'div',
    { alignItems: 'center' },
    icon('plane', Math.round(size * 1.05), color, 2.2),
    h('div', { fontSize: size, fontWeight: 400, color, marginLeft: Math.round(size * 0.25), fontFamily: SANS }, 'made'),
    h('div', { fontSize: size, fontWeight: 800, color, fontFamily: SANS }, 'visa')
  );
}
function pill(text: string, o: { bg: string; color: string; size: number }): El {
  return h('div', { backgroundColor: o.bg, color: o.color, fontSize: o.size, fontWeight: 800, letterSpacing: 1, padding: `${Math.round(o.size * 0.45)}px ${Math.round(o.size * 0.9)}px`, borderRadius: 999, fontFamily: SANS, flexShrink: 0 }, text);
}
function chip(text: string, size: number, kind: 'salary' | 'tag'): El {
  return h(
    'div',
    {
      fontSize: size,
      fontWeight: kind === 'salary' ? 800 : 700,
      color: kind === 'salary' ? '#065F46' : '#1E40AF',
      backgroundColor: kind === 'salary' ? '#D1FAE5' : '#DBEAFE',
      padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.65)}px`,
      borderRadius: 8,
      marginRight: 10,
      letterSpacing: kind === 'tag' ? 0.6 : 0,
      fontFamily: SANS,
      flexShrink: 0,
    },
    text
  );
}

type Issue = { level: 'error' | 'warning'; message: string };

async function draw(layout: 'list' | 'single' | 'company' | 'cards', sizeKey: SizeKey, jobs: Job[], headline: string, dateLabel: string, T: Texts) {
  const S = SIZES[sizeKey];
  const issues: Issue[] = [];
  const inner = S.w - S.side * 2;
  const logos = await Promise.all(jobs.map((j) => logoDataUrl(j.logo)));
  jobs.forEach((j, i) => {
    if (j.logo && !logos[i]) issues.push({ level: 'warning', message: `${j.company}: logo couldn’t be drawn — left out` });
  });

  // Single-job and company images have no headline — just the brand row — so the card gets the room.
  const showHead = layout === 'list' && headline.trim() !== '';
  const headerH = !showHead ? (sizeKey === 'story' ? 150 : 100) : sizeKey === 'story' ? 330 : sizeKey === 'square' ? 200 : 250;
  const footerH = sizeKey === 'story' ? 150 : 110;
  const cardH = S.h - S.top - S.bottom - headerH - footerH;
  const tagSize = Math.round(S.chip * 0.95);

  // One spacing unit between every block (header ↔ card ↔ footer), so the
  // headline can never touch or overlap the white card.
  const GAP = sizeKey === 'story' ? 40 : sizeKey === 'square' ? 26 : 32;
  const iconSize = T.icon === 'none' ? 0 : Math.round(S.head * 0.95);
  const headW = inner - (iconSize ? iconSize + 18 : 0);
  const head = fit(headline || ' ', [S.head, Math.round(S.head * 0.86), Math.round(S.head * 0.74)], headW, 2, 800);
  if (showHead && head.cut) issues.push({ level: 'warning', message: 'Headline shortened to fit' });

  const header = h(
    'div',
    { flexDirection: 'column', height: headerH, flexShrink: 0, justifyContent: 'space-between', paddingBottom: GAP },
    h(
      'div',
      { alignItems: 'center', justifyContent: 'space-between', width: inner },
      brand('white', sizeKey === 'story' ? 40 : 34),
      layout === 'cards'
        ? pill(cut((headline || 'New jobs this week').toUpperCase(), sizeKey === 'story' ? 24 : 21, inner * 0.6, 800).text, { bg: 'rgba(255,255,255,0.18)', color: 'white', size: sizeKey === 'story' ? 24 : 21 })
        : dateLabel
          ? pill(dateLabel.toUpperCase(), { bg: 'rgba(255,255,255,0.18)', color: 'white', size: sizeKey === 'story' ? 22 : 19 })
          : null
    ),
    !showHead
      ? null
      : h(
      'div',
      { alignItems: 'center', width: inner, overflow: 'hidden', maxHeight: Math.round(head.size * 1.12 * 2) + 4 },
      iconSize ? h('div', { marginRight: 18, flexShrink: 0 }, T.icon === 'zap' ? svg(iconSize, ZAP, { stroke: '#FDE047', fill: '#FDE047', width: 1.5 }) : svg(iconSize, PARTY, { stroke: '#FDE047', width: 2.2 })) : null,
      h('div', { width: headW, fontSize: head.size, fontWeight: 800, color: 'white', lineHeight: 1.1, letterSpacing: -1, fontFamily: SANS }, head.text)
    )
  );

  let body: El;
  if (layout === 'list') {
    const rows = jobs.slice(0, S.maxRows);
    if (jobs.length > S.maxRows) issues.push({ level: 'warning', message: `Only ${S.maxRows} jobs fit this size — ${jobs.length - S.maxRows} left out` });
    const padY = 22;
    const rowH = Math.floor((cardH - padY * 2) / Math.max(rows.length, 3));
    const textW = inner - 56 - 8; // card padding (no number column)
    body = h(
      'div',
      { flexDirection: 'column', width: inner, height: cardH, backgroundColor: 'white', borderRadius: 28, padding: `${padY}px 28px`, flexShrink: 0, overflow: 'hidden' },
      ...rows.map((j, i) => {
        const t = fit(cleanTitle(j.title), [S.title, Math.round(S.title * 0.88)], textW, 2, 800);
        if (t.cut) issues.push({ level: 'warning', message: `Title shortened: ${j.title}` });
        const logoSize = Math.round(S.meta * 1.35);
        const metaText = cut([j.company, location(j)].filter(Boolean).join(' · '), S.meta, textW - (logos[i] ? logoSize + 12 : 0), 600).text;
        const chips: El[] = [];
        let used = 0;
        const room = textW;
        const tryChip = (text: string, kind: 'salary' | 'tag') => {
          const wdt = text.length * S.chip * (kind === 'salary' ? 0.62 : 0.66) + S.chip * 1.3 + 10;
          if (used + wdt > room) return false;
          used += wdt;
          chips.push(chip(text, S.chip, kind));
          return true;
        };
        if (T.tag) {
          // Lightning + caps text: estimate its width like a chip.
          const wdt = T.tag.length * tagSize * 0.7 + tagSize * 2.6 + 10;
          if (used + wdt <= room) {
            used += wdt;
            chips.push(earlyTag(T.tag, tagSize));
          }
        }
        if (j.salary) {
          const sal = cut(j.salary, S.chip, room * 0.5, 800).text;
          tryChip(sal, 'salary');
        }
        for (const tg of tagsFor(j)) tryChip(tg, 'tag');
        const rt = T.hashtags ? roleTag(j.title) : '';
        if (rt && used + rt.length * S.chip * 0.6 <= room) chips.push(h('div', { fontSize: S.chip, fontWeight: 700, color: BLUE, fontFamily: SANS, flexShrink: 0, alignItems: 'center' }, rt));
        return h(
          'div',
          { height: rowH, flexShrink: 0, alignItems: 'center', borderTop: i === 0 ? 'none' : '2px solid #EEF2F7', overflow: 'hidden' },
          h(
            'div',
            { flexDirection: 'column', width: textW, overflow: 'hidden' },
            h('div', { fontSize: t.size, fontWeight: 800, color: INK, lineHeight: 1.15, fontFamily: SANS, maxHeight: Math.round(t.size * 1.15 * 2) + 2, overflow: 'hidden' }, t.text),
            h(
              'div',
              { alignItems: 'center', marginTop: 8, height: Math.round(S.meta * 1.5), overflow: 'hidden' },
              logos[i] ? img(logos[i]!, { width: logoSize, height: logoSize, borderRadius: 6, objectFit: 'contain', marginRight: 12, backgroundColor: 'white', border: '1px solid #E2E8F0' }) : null,
              h('div', { fontSize: S.meta, fontWeight: 600, color: MUTED, fontFamily: SANS, whiteSpace: 'nowrap' }, metaText)
            ),
            chips.length ? h('div', { marginTop: 10, height: Math.round(S.chip * 2.1), alignItems: 'center', overflow: 'hidden' }, ...chips) : null
          )
        );
      })
    );
  } else if (layout === 'cards') {
    // One white card per job: logo · title · company and place · salary on the right.
    const max = sizeKey === 'story' ? 5 : sizeKey === 'square' ? 3 : 4;
    const rows = jobs.slice(0, max);
    if (jobs.length > max) issues.push({ level: 'warning', message: `Only ${max} jobs fit this size — ${jobs.length - max} left out` });
    const gap = sizeKey === 'story' ? 26 : 20;
    const cardHeight = Math.min(sizeKey === 'story' ? 210 : 170, Math.floor((cardH - gap * (rows.length - 1)) / Math.max(rows.length, 1)));
    const pad = 26;
    const logoSize = Math.round(cardHeight * 0.48);
    const titleSize = sizeKey === 'story' ? 40 : 34;
    const metaSize = sizeKey === 'story' ? 28 : 24;
    body = h(
      'div',
      { flexDirection: 'column', width: inner, height: cardH, flexShrink: 0, justifyContent: 'center', overflow: 'hidden' },
      ...rows.map((j, i) => {
        const logo = logos[i];
        const salW = j.salary ? Math.min(inner * 0.34, j.salary.length * titleSize * 0.62 * 0.8 + 10) : 0;
        const textW = inner - pad * 2 - (logo ? logoSize + 24 : 0) - (salW ? salW + 20 : 0);
        const title = cut(cleanTitle(j.title), titleSize, textW, 800);
        if (title.cut) issues.push({ level: 'warning', message: `Title shortened: ${j.title}` });
        const meta = cut([j.company, location(j)].filter(Boolean).join(' · '), metaSize, textW, 600).text;
        return h(
          'div',
          { width: inner, height: cardHeight, marginTop: i ? gap : 0, backgroundColor: 'white', borderRadius: 26, padding: `0 ${pad}px`, alignItems: 'center', flexShrink: 0, overflow: 'hidden' },
          logo ? img(logo, { width: logoSize, height: logoSize, borderRadius: 16, objectFit: 'contain', border: '2px solid #E2E8F0', marginRight: 24, backgroundColor: 'white', padding: Math.round(logoSize * 0.08) }) : null,
          h(
            'div',
            { flexDirection: 'column', width: textW, overflow: 'hidden' },
            h('div', { fontSize: titleSize, fontWeight: 800, color: INK, fontFamily: SANS, whiteSpace: 'nowrap', letterSpacing: -0.5 }, title.text),
            h('div', { marginTop: 6, fontSize: metaSize, fontWeight: 600, color: MUTED, fontFamily: SANS, whiteSpace: 'nowrap' }, meta)
          ),
          j.salary
            ? h('div', { marginLeft: 20, width: salW, justifyContent: 'flex-end', fontSize: Math.round(titleSize * 0.8), fontWeight: 800, color: BLUE, fontFamily: SANS, whiteSpace: 'nowrap' }, cut(j.salary, Math.round(titleSize * 0.8), salW, 800).text)
            : null
        );
      })
    );
  } else if (layout === 'company') {
    // Company only: logo, name, "is hiring". The role details live in the caption.
    const j = jobs[0];
    const logo = logos[0];
    const pad = 56;
    const w = inner - pad * 2;
    const logoSize = sizeKey === 'story' ? 260 : sizeKey === 'square' ? 180 : 230;
    const name = fit(j.company, [Math.round(S.head * 1.15), S.head, Math.round(S.head * 0.82)], w, 2, 800);
    if (name.cut) issues.push({ level: 'warning', message: 'Company name shortened to fit' });
    const hire = T.hire ? fit(T.hire, [Math.round(S.head * 0.9), Math.round(S.head * 0.7)], w, 1, 800) : null;
    body = h(
      'div',
      { flexDirection: 'column', width: inner, height: cardH, backgroundColor: 'white', borderRadius: 32, padding: pad, flexShrink: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
      logo
        ? img(logo, { width: logoSize, height: logoSize, borderRadius: 36, objectFit: 'contain', border: '2px solid #E2E8F0', backgroundColor: 'white', padding: Math.round(logoSize * 0.1) })
        : h('div', { width: logoSize, height: logoSize, borderRadius: 36, backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: Math.round(logoSize * 0.46), fontWeight: 800, alignItems: 'center', justifyContent: 'center', fontFamily: SANS }, (j.company.trim()[0] ?? '·').toUpperCase()),
      h('div', { marginTop: GAP * 1.2, width: w, justifyContent: 'center', textAlign: 'center', fontSize: name.size, fontWeight: 800, color: INK, lineHeight: 1.1, letterSpacing: -1, fontFamily: SANS, maxHeight: Math.round(name.size * 1.1 * 2) + 4, overflow: 'hidden' }, name.text),
      hire ? h('div', { marginTop: 14, fontSize: hire.size, fontWeight: 800, color: BLUE, fontFamily: SANS, whiteSpace: 'nowrap' }, hire.text) : null,
      T.tag ? h('div', { marginTop: GAP }, earlyTag(T.tag, Math.round(tagSize * 1.3))) : null,
      T.sub ? h('div', { marginTop: GAP * 0.8, fontSize: Math.round(S.meta * 1.05), fontWeight: 600, color: MUTED, fontFamily: SANS, whiteSpace: 'nowrap' }, cut(T.sub, Math.round(S.meta * 1.05), w, 600).text) : null
    );
  } else {
    const j = jobs[0];
    const logo = logos[0];
    const pad = 48;
    const w = inner - pad * 2;
    const t = fit(cleanTitle(j.title), [Math.round(S.head * 1.1), S.head, Math.round(S.head * 0.84), Math.round(S.head * 0.7)], w, 3, 800);
    if (t.cut) issues.push({ level: 'warning', message: 'Title shortened to fit' });
    const sal = j.salary ? fit(j.salary, [Math.round(S.head * 0.95), Math.round(S.head * 0.75), Math.round(S.head * 0.6)], w, 2, 800) : null;
    const logoSize = sizeKey === 'story' ? 110 : 92;
    const loc = location(j);
    const tags = tagsFor(j);
    body = h(
      'div',
      { flexDirection: 'column', width: inner, height: cardH, backgroundColor: 'white', borderRadius: 32, padding: pad, flexShrink: 0, overflow: 'hidden', justifyContent: 'space-between' },
      h(
        'div',
        { alignItems: 'center', height: logoSize, overflow: 'hidden' },
        logo ? img(logo, { width: logoSize, height: logoSize, borderRadius: 18, objectFit: 'contain', border: '2px solid #E2E8F0', marginRight: 24, backgroundColor: 'white' }) : null,
        h(
          'div',
          { flexDirection: 'column', width: w - (logo ? logoSize + 24 : 0) },
          h('div', { fontSize: Math.round(S.meta * 1.4), fontWeight: 800, color: INK, fontFamily: SANS, whiteSpace: 'nowrap' }, cut(j.company, Math.round(S.meta * 1.4), w - (logo ? logoSize + 24 : 0), 800).text),
          loc ? h('div', { fontSize: Math.round(S.meta * 1.1), fontWeight: 600, color: MUTED, marginTop: 4, fontFamily: SANS, whiteSpace: 'nowrap' }, cut(loc, Math.round(S.meta * 1.1), w - (logo ? logoSize + 24 : 0), 600).text) : null
        )
      ),
      h('div', { fontSize: t.size, fontWeight: 800, color: INK, lineHeight: 1.1, letterSpacing: -1, fontFamily: SANS, maxHeight: Math.round(t.size * 1.1 * 3) + 4, overflow: 'hidden' }, t.text),
      sal ? h('div', { fontSize: sal.size, fontWeight: 800, color: BLUE, lineHeight: 1.1, fontFamily: SANS, maxHeight: Math.round(sal.size * 1.1 * 2) + 4, overflow: 'hidden' }, sal.text) : null,
      T.tag || tags.length
        ? h('div', { height: Math.round(S.chip * 1.4 * 2.1), alignItems: 'center', overflow: 'hidden' }, T.tag ? earlyTag(T.tag, Math.round(tagSize * 1.3)) : null, ...tags.slice(0, T.tag ? 2 : 3).map((tg) => chip(tg, Math.round(S.chip * 1.3), 'tag')))
        : null,
      h('div', { fontSize: Math.round(S.meta * 0.95), fontWeight: 600, color: MUTED, fontFamily: SANS }, 'Straight from the company’s careers page')
    );
  }

  // Always the jobs page — the caption carries each job's own link.
  const shortLink = T.link || 'madevisa.com/jobs';
  const linkSize = sizeKey === 'story' ? 28 : 24;
  const footer = h(
    'div',
    { height: footerH, flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', width: inner, paddingTop: GAP },
    T.cta
      ? h(
          'div',
          { backgroundColor: 'white', color: BLUE, fontSize: sizeKey === 'story' ? 34 : 28, fontWeight: 800, padding: sizeKey === 'story' ? '20px 36px' : '16px 30px', borderRadius: 999, alignItems: 'center', fontFamily: SANS },
          cut(T.cta, sizeKey === 'story' ? 34 : 28, inner * 0.55, 800).text,
          h('div', { marginLeft: 12 }, '→')
        )
      : h('div', {}),
    h(
      'div',
      { alignItems: 'center' },
      svg(Math.round(linkSize * 1.1), GLOBE, { stroke: 'rgba(255,255,255,0.92)', width: 2.2 }),
      h('div', { marginLeft: 10, fontSize: linkSize, fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontFamily: SANS }, cut(shortLink, linkSize, inner * 0.4, 700).text)
    )
  );

  const tree = h(
    'div',
    { width: S.w, height: S.h, backgroundColor: BLUE, flexDirection: 'column', padding: `${S.top}px ${S.side}px ${S.bottom}px`, fontFamily: SANS, justifyContent: 'space-between' },
    header,
    body,
    footer
  );
  return { tree, issues, width: S.w, height: S.h };
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams;
  const lq = q.get('layout');
  const layout = lq === 'single' ? 'single' : lq === 'company' ? 'company' : lq === 'cards' ? 'cards' : 'list';
  const sizeKey = (['portrait', 'square', 'story'].includes(q.get('size') ?? '') ? q.get('size') : 'portrait') as SizeKey;
  const prefixes = (q.get('ids') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}$/.test(x)).slice(0, 5);
  // Lists: "3 new jobs" by default, never salary wording. Single / company images: no headline at all.
  const rawHead = (q.get('h') ?? '').slice(0, 120);
  const headline = layout === 'cards' ? rawHead || 'New jobs this week' : layout !== 'list' ? '' : rawHead && !/salar/i.test(rawHead) ? rawHead : `${prefixes.length} new jobs`;
  // A param that is present but empty hides that text; absent = default.
  const text = (k: string, dflt: string, max = 60) => (q.has(k) ? (q.get(k) ?? '').trim().slice(0, max) : dflt);
  const dateLabel = text('d', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), 30);
  const hi = q.get('hi');
  const T: Texts = {
    icon: hi === 'party' || hi === 'none' ? hi : 'zap',
    tag: text('tag', 'Be an early applicant', 32),
    cta: text('cta', 'Apply on MadeVisa', 30),
    link: text('link', '', 40),
    hire: text('hire', 'is hiring', 30),
    sub: text('sub', 'Role & how to apply in the caption', 60),
    hashtags: q.get('ht') !== '0',
  };
  const check = q.get('check') === '1';

  const jobs = prefixes.length ? (await rpc<Job[]>('social_image_jobs', { p_prefixes: prefixes })) ?? [] : [];
  const missing = prefixes.filter((p) => !jobs.some((j) => j.id.startsWith(p)));

  if (!jobs.length) {
    if (check) return Response.json({ ok: false, issues: [{ level: 'error', message: 'None of these jobs is live any more' }] }, { headers: { 'Cache-Control': 'no-store' } });
    return new Response('No live jobs', { status: 404 });
  }

  const { tree, issues, width, height } = await draw(layout, sizeKey, layout === 'list' || layout === 'cards' ? jobs : jobs.slice(0, 1), headline, dateLabel, T);
  for (const m of missing) issues.push({ level: 'error', message: `Job ${m} is no longer live` });

  if (check) {
    return Response.json({ ok: !issues.some((i) => i.level === 'error'), width, height, jobs: jobs.length, issues }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const glyphs = `${textOf(tree)} 0123456789→…·#`;
  const fonts = (await Promise.all([googleFont('Inter', 400, glyphs), googleFont('Inter', 600, glyphs), googleFont('Inter', 700, glyphs), googleFont('Inter', 800, glyphs)])).filter((f): f is Font => f !== null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const png = await new ImageResponse(tree as any, { width, height, fonts }).arrayBuffer();
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=604800, immutable' } });
  } catch (e) {
    return new Response(`Render failed: ${e instanceof Error ? e.message : e}`, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
