// GET /api/og/social?layout=list|single&ids=<8-hex,…>&size=portrait|square|story&h=<headline>&d=<date label>&s=<platform>
//   → PNG for a social post, drawn at the edge from live job data.
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

async function draw(layout: 'list' | 'single', sizeKey: SizeKey, jobs: Job[], headline: string, dateLabel: string, platform: string, origin: string) {
  const S = SIZES[sizeKey];
  const issues: Issue[] = [];
  const inner = S.w - S.side * 2;
  const logos = await Promise.all(jobs.map((j) => logoDataUrl(j.logo)));
  jobs.forEach((j, i) => {
    if (j.logo && !logos[i]) issues.push({ level: 'warning', message: `${j.company}: logo couldn’t be drawn — left out` });
  });

  const headerH = sizeKey === 'story' ? 330 : sizeKey === 'square' ? 200 : 250;
  const footerH = sizeKey === 'story' ? 150 : 110;
  const cardH = S.h - S.top - S.bottom - headerH - footerH;

  const head = fit(headline, [S.head, Math.round(S.head * 0.86), Math.round(S.head * 0.74)], inner, 2, 800);
  if (head.cut) issues.push({ level: 'warning', message: 'Headline shortened to fit' });

  const header = h(
    'div',
    { flexDirection: 'column', height: headerH, flexShrink: 0, justifyContent: 'space-between' },
    h('div', { alignItems: 'center', justifyContent: 'space-between', width: inner }, brand('white', sizeKey === 'story' ? 40 : 34), pill(dateLabel.toUpperCase(), { bg: 'rgba(255,255,255,0.18)', color: 'white', size: sizeKey === 'story' ? 22 : 19 })),
    h('div', { flexDirection: 'column', width: inner, overflow: 'hidden', maxHeight: Math.round(head.size * 1.12 * 2) + 4 }, h('div', { fontSize: head.size, fontWeight: 800, color: 'white', lineHeight: 1.1, letterSpacing: -1, fontFamily: SANS }, head.text))
  );

  let body: El;
  if (layout === 'list') {
    const rows = jobs.slice(0, S.maxRows);
    if (jobs.length > S.maxRows) issues.push({ level: 'warning', message: `Only ${S.maxRows} jobs fit this size — ${jobs.length - S.maxRows} left out` });
    const padY = 22;
    const rowH = Math.floor((cardH - padY * 2) / Math.max(rows.length, 3));
    const textW = inner - 56 - 40 - 30; // card padding + number column
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
        if (j.salary) {
          const sal = cut(j.salary, S.chip, room * 0.6, 800).text;
          tryChip(sal, 'salary');
        }
        for (const tg of tagsFor(j)) tryChip(tg, 'tag');
        return h(
          'div',
          { height: rowH, flexShrink: 0, alignItems: 'center', borderTop: i === 0 ? 'none' : '2px solid #EEF2F7', overflow: 'hidden' },
          h('div', { width: 56, flexShrink: 0, fontSize: Math.round(S.title * 0.8), fontWeight: 800, color: BLUE, fontFamily: SANS }, String(i + 1).padStart(2, '0')),
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
            chips.length ? h('div', { marginTop: 10, height: Math.round(S.chip * 1.9), overflow: 'hidden' }, ...chips) : null
          )
        );
      })
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
      tags.length ? h('div', { height: Math.round(S.chip * 1.4 * 1.9), overflow: 'hidden' }, ...tags.slice(0, 3).map((tg) => chip(tg, Math.round(S.chip * 1.3), 'tag'))) : null,
      h('div', { fontSize: Math.round(S.meta * 0.95), fontWeight: 600, color: MUTED, fontFamily: SANS }, 'Straight from the company’s careers page')
    );
  }

  const shortLink = layout === 'single' ? `madevisa.com/j/${jobs[0].id.slice(0, 8)}` : 'madevisa.com/jobs';
  const footer = h(
    'div',
    { height: footerH, flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', width: inner },
    h(
      'div',
      { backgroundColor: 'white', color: BLUE, fontSize: sizeKey === 'story' ? 34 : 28, fontWeight: 800, padding: sizeKey === 'story' ? '20px 36px' : '16px 30px', borderRadius: 999, alignItems: 'center', fontFamily: SANS },
      'Apply on MadeVisa',
      h('div', { marginLeft: 12 }, '→')
    ),
    h('div', { fontSize: sizeKey === 'story' ? 28 : 24, fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontFamily: SANS }, shortLink)
  );

  const tree = h(
    'div',
    { width: S.w, height: S.h, backgroundColor: BLUE, flexDirection: 'column', padding: `${S.top}px ${S.side}px ${S.bottom}px`, fontFamily: SANS, justifyContent: 'space-between' },
    header,
    body,
    footer
  );
  void platform;
  void origin;
  return { tree, issues, width: S.w, height: S.h };
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams;
  const layout = q.get('layout') === 'single' ? 'single' : 'list';
  const sizeKey = (['portrait', 'square', 'story'].includes(q.get('size') ?? '') ? q.get('size') : 'portrait') as SizeKey;
  const prefixes = (q.get('ids') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}$/.test(x)).slice(0, 5);
  const headline = (q.get('h') ?? '').slice(0, 120) || (layout === 'single' ? 'Now hiring' : `${prefixes.length} fresh roles worth your attention`);
  const dateLabel = (q.get('d') ?? '').slice(0, 30) || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const check = q.get('check') === '1';

  const jobs = prefixes.length ? (await rpc<Job[]>('social_image_jobs', { p_prefixes: prefixes })) ?? [] : [];
  const missing = prefixes.filter((p) => !jobs.some((j) => j.id.startsWith(p)));

  if (!jobs.length) {
    if (check) return Response.json({ ok: false, issues: [{ level: 'error', message: 'None of these jobs is live any more' }] }, { headers: { 'Cache-Control': 'no-store' } });
    return new Response('No live jobs', { status: 404 });
  }

  const { tree, issues, width, height } = await draw(layout, sizeKey, layout === 'single' ? jobs.slice(0, 1) : jobs, headline, dateLabel, q.get('s') ?? '', url.origin);
  for (const m of missing) issues.push({ level: 'error', message: `Job ${m} is no longer live` });

  if (check) {
    return Response.json({ ok: !issues.some((i) => i.level === 'error'), width, height, jobs: jobs.length, issues }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const text = `${textOf(tree)} 0123456789→…·`;
  const fonts = (await Promise.all([googleFont('Inter', 400, text), googleFont('Inter', 600, text), googleFont('Inter', 700, text), googleFont('Inter', 800, text)])).filter((f): f is Font => f !== null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const png = await new ImageResponse(tree as any, { width, height, fonts }).arrayBuffer();
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=604800, immutable' } });
  } catch (e) {
    return new Response(`Render failed: ${e instanceof Error ? e.message : e}`, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
