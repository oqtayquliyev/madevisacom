// Shared by the share-image endpoints in api/og/*: element builder, fonts,
// logos, the standard 1200×630 response, and small Supabase REST reads
// (anon key — the same public read access the website has).
// Files starting with _ are not routes on Vercel.

import { ImageResponse } from '@vercel/og';

export const BLUE = '#2563EB';

// Tiny element builder — satori (inside @vercel/og) accepts plain
// { type, props } objects, so no JSX/React build step is needed here.
export type El = { type: string; props: Record<string, unknown> };
export function h(type: string, style: Record<string, unknown>, ...children: (El | string | null | false | undefined)[]): El {
  const kids = children.filter((c) => c !== null && c !== false && c !== undefined) as (El | string)[];
  return { type, props: { style: { display: 'flex', ...clean(style) }, children: kids.length === 1 ? kids[0] : kids } };
}
/** The renderer crashes on undefined/null style values — drop them. */
function clean(style: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}
export function img(src: string, style: Record<string, unknown>): El {
  return { type: 'img', props: { src, style: clean(style) } };
}

/** Logos can be any format; only png/jpeg/gif/svg render reliably, so inline those and skip the rest. */
export async function logoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/(png|jpeg|jpg|gif|svg\+xml)$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 1_500_000) return null;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/**
 * The site's own fonts, fetched as TTF from Google Fonts (satori can't use
 * woff2). Subset to the characters actually drawn, so it's small and fast.
 * If Google Fonts is unreachable the image still renders with the default font.
 */
export type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: 'normal' };
export async function googleFont(family: string, weight: 400 | 600 | 700 | 800, text: string): Promise<Font | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`, {
        signal: AbortSignal.timeout(2500),
      })
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok ? { name: family, data: await res.arrayBuffer(), weight, style: 'normal' } : null;
  } catch {
    return null;
  }
}

/** MadeVisa logo (public/og-logo.png) as a data URL. */
export async function brandLogo(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/og-logo.png`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export const TITLE_FONT = "'Fraunces', serif";
export const SANS = "'Inter', sans-serif";

/** Every string drawn in a tree — used to subset the fonts to just those characters. */
export function textOf(el: El | string | null | undefined): string {
  if (!el) return '';
  if (typeof el === 'string') return el;
  const kids = el.props.children as El | string | (El | string)[] | undefined;
  if (!kids) return '';
  return Array.isArray(kids) ? kids.map((k) => textOf(k)).join(' ') : textOf(kids);
}

/**
 * The standard share image: 1200×630 PNG, cached at the edge. Fonts are
 * subset to the text drawn. The PNG is rendered fully before responding, so a
 * rendering error can't turn into a blank response: it falls back to a simple
 * branded image (and `debug: true` returns the error as text instead).
 */
export async function shareImage(tree: El, opts: { titleFont?: boolean; maxAge?: number; debug?: boolean } = {}): Promise<Response> {
  const sMaxAge = opts.maxAge ?? 21600;
  const headers = { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=3600, s-maxage=${sMaxAge}, stale-while-revalidate=604800` };
  const render = async (t: El, titleFont: boolean) => {
    const text = `${textOf(t)} 0123456789`;
    const fonts = await Promise.all([
      googleFont('Inter', 400, text),
      googleFont('Inter', 600, text),
      googleFont('Inter', 700, text),
      googleFont('Inter', 800, text),
      titleFont ? googleFont('Fraunces', 700, text) : Promise.resolve(null),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = new ImageResponse(t as any, { width: 1200, height: 630, fonts: fonts.filter((f): f is Font => f !== null) });
    return res.arrayBuffer();
  };
  try {
    return new Response(await render(tree, Boolean(opts.titleFont)), { headers });
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error('share image failed', message);
    if (opts.debug) return new Response(message, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    try {
      const fallback = h(
        'div',
        { width: 1200, height: 630, backgroundColor: BLUE, color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: "'Inter', sans-serif" },
        h('div', { fontSize: 88, fontWeight: 700 }, 'madevisa'),
        h('div', { fontSize: 32, marginTop: 12 }, 'Jobs straight from company career pages')
      );
      // Short cache so a fixed version replaces it quickly.
      return new Response(await render(fallback, false), { headers: { ...headers, 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
    } catch {
      return new Response('Share image unavailable', { status: 500, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }
  }
}

// --- Icons (Lucide shapes, drawn as inline SVG) -------------------------------

type Shape = { type: 'path' | 'circle' | 'rect'; props: Record<string, unknown> };
const P = (d: string): Shape => ({ type: 'path', props: { d } });
const ICONS = {
  plane: [P('M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z')],
  briefcase: [P('M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'), { type: 'rect', props: { width: 20, height: 14, x: 2, y: 6, rx: 2 } }],
  ghost: [P('M9 10h.01'), P('M15 10h.01'), P('M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z')],
  check: [{ type: 'circle', props: { cx: 12, cy: 12, r: 10 } }, P('m9 12 2 2 4-4')],
  x: [{ type: 'circle', props: { cx: 12, cy: 12, r: 10 } }, P('m15 9-6 6'), P('m9 9 6 6')],
  message: [P('M7.9 20A9 9 0 1 0 4 16.1L2 22Z')],
  users: [P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), { type: 'circle', props: { cx: 9, cy: 7, r: 4 } }, P('M22 21v-2a4 4 0 0 0-3-3.87'), P('M16 3.13a4 4 0 0 1 0 7.75')],
  cap: [P('M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z'), P('M22 10v6'), P('M6 12.5V16a6 3 0 0 0 12 0v-3.5')],
  globe: [{ type: 'circle', props: { cx: 12, cy: 12, r: 10 } }, P('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'), P('M2 12h20')],
  refresh: [P('M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), P('M3 3v5h5'), P('M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16'), P('M16 16h5v5')],
  up: [P('m5 12 7-7 7 7'), P('M12 19V5')],
  landmark: [P('M3 22h18'), P('M6 18v-7'), P('M10 18v-7'), P('M14 18v-7'), P('M18 18v-7'), P('M12 2 20 7H4z')],
} satisfies Record<string, Shape[]>;
export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size: number, color: string, strokeWidth = 2): El {
  return {
    type: 'svg',
    props: {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: { flexShrink: 0 },
      children: ICONS[name],
    },
  };
}

/**
 * A headline that wraps word by word, with some words highlighted
 * (marker box + stronger colour). Needs a fixed width to wrap within.
 */
export function words(
  text: string,
  highlight: string[],
  o: { size: number; width: number; weight?: number; color: string; hiColor?: string; hiBg?: string; hiWeight?: number; lineHeight?: number; tracking?: number; font?: string }
): El {
  const hi = new Set(highlight.map((w) => w.toLowerCase()));
  const isHi = (w: string) => hi.has(w.toLowerCase()) || hi.has(w.toLowerCase().replace(/[.,!?—:;]+$/, ''));
  const lh = Math.round(o.size * (o.lineHeight ?? 1.08));
  const kids: El[] = [];
  // "\n" forces a line break (a full-width empty item in the wrapping row).
  text.split('\n').forEach((line, li) => {
    if (li > 0) kids.push(h('div', { width: o.width, height: 0 }));
    const parts = line.split(/\s+/).filter(Boolean);
    parts.forEach((w, i) => {
      const on = isHi(w);
      const nextOn = i + 1 < parts.length && isHi(parts[i + 1]);
      kids.push(
        h(
          'div',
          {
            fontSize: o.size,
            fontWeight: on ? o.hiWeight ?? o.weight ?? 700 : o.weight ?? 700,
            color: on ? o.hiColor ?? o.color : o.color,
            height: lh,
            alignItems: 'center',
            letterSpacing: o.tracking ?? 0,
            fontFamily: o.font,
            // Neighbouring highlighted words join into one marker box.
            paddingLeft: on && o.hiBg ? Math.round(o.size * 0.12) : 0,
            paddingRight: on && o.hiBg ? (nextOn ? Math.round(o.size * 0.26) : Math.round(o.size * 0.12)) : 0,
            marginRight: on && o.hiBg && nextOn ? 0 : Math.round(o.size * 0.26),
            backgroundColor: on && o.hiBg ? o.hiBg : undefined,
            borderRadius: on && o.hiBg ? Math.round(o.size * 0.16) : 0,
          },
          w
        )
      );
    });
  });
  return h('div', { flexWrap: 'wrap', width: o.width, flexShrink: 0 }, ...kids);
}

/** Rounded fact tile, as on the job image. */
export function chip(label: string, value: string, strong = false): El {
  return h(
    'div',
    { flexDirection: 'column', padding: '14px 20px', borderRadius: 14, backgroundColor: strong ? '#EFF6FF' : '#F8FAFC', border: `2px solid ${strong ? '#BFDBFE' : '#E2E8F0'}`, marginRight: 14, marginBottom: 14 },
    h('div', { fontSize: 18, fontWeight: 600, color: '#64748B', marginBottom: 4, fontFamily: SANS }, label),
    h('div', { fontSize: strong ? 30 : 26, fontWeight: 700, color: '#0F172A', fontFamily: SANS }, value)
  );
}

/** "Button" pill with an ↗ arrow, like the site's Apply button. `light` = white pill for dark backgrounds. */
export function ctaPill(label: string, light = false): El {
  const fg = light ? '#0B1633' : 'white';
  return h(
    'div',
    { alignItems: 'center', backgroundColor: light ? 'white' : BLUE, color: fg, borderRadius: 999, padding: '18px 34px', fontSize: 26, fontWeight: 700, flexShrink: 0 },
    label,
    {
      type: 'svg',
      props: {
        width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: fg, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { marginLeft: 12 },
        children: [{ type: 'path', props: { d: 'M7 17L17 7' } }, { type: 'path', props: { d: 'M7 7h10v10' } }],
      },
    }
  );
}

/** Small rounded label with an optional icon. */
export function tag(text: string, o: { bg: string; color: string; border?: string; icon?: IconName; size?: number }): El {
  const size = o.size ?? 22;
  return h(
    'div',
    { alignItems: 'center', backgroundColor: o.bg, color: o.color, border: o.border ? `2px solid ${o.border}` : undefined, borderRadius: 999, padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.85)}px`, fontSize: size, fontWeight: 700, flexShrink: 0 },
    o.icon ? h('div', { marginRight: Math.round(size * 0.4) }, icon(o.icon, Math.round(size * 1.05), o.color, 2.4)) : null,
    text
  );
}

/** Company logo in a white rounded tile, or its initial. */
export function logoTile(src: string | null, name: string, size: number, radius = 16): El {
  return src
    ? img(src, { width: size, height: size, borderRadius: radius, objectFit: 'contain', border: '2px solid #E2E8F0', backgroundColor: 'white', padding: Math.round(size * 0.1), flexShrink: 0 })
    : h('div', { width: size, height: size, borderRadius: radius, backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: Math.round(size * 0.46), fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, (name.trim()[0] ?? '·').toUpperCase());
}

/** Rubber stamp (rotated, double ring) — the visa motif. */
export function stamp(lines: string[], o: { color: string; size: number; rotate: number; sub?: string }): El {
  const s = o.size;
  return h(
    'div',
    { width: s, height: s, borderRadius: 999, border: `${Math.round(s * 0.03)}px solid ${o.color}`, alignItems: 'center', justifyContent: 'center', transform: `rotate(${o.rotate}deg)`, opacity: 0.92, flexShrink: 0 },
    h(
      'div',
      { width: s * 0.84, height: s * 0.84, borderRadius: 999, border: `${Math.max(2, Math.round(s * 0.012))}px solid ${o.color}`, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
      o.sub ? h('div', { fontSize: Math.round(s * 0.075), fontWeight: 700, color: o.color, letterSpacing: 3, marginBottom: 4 }, o.sub) : null,
      ...lines.map((l) => h('div', { fontSize: Math.round(s * (lines.length > 1 ? 0.14 : 0.17)), fontWeight: 800, color: o.color, letterSpacing: 2, lineHeight: 1.05 }, l))
    )
  );
}

/** Blue frame + white card, the layout every MadeVisa share image uses. */
export function frame(...children: (El | null | false | undefined)[]): El {
  return h(
    'div',
    { width: '100%', height: '100%', backgroundColor: BLUE, padding: 44, fontFamily: SANS },
    h('div', { flexDirection: 'column', width: '100%', height: '100%', backgroundColor: 'white', borderRadius: 28, padding: '44px 52px' }, ...children)
  );
}

/** Bottom row: address on the left, call to action on the right. */
export function footer(left: string, sub: string, cta: string): El {
  return h(
    'div',
    { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #F1F5F9', paddingTop: 20 },
    h('div', { flexDirection: 'column' }, h('div', { fontSize: 22, fontWeight: 600, color: '#0F172A' }, left), h('div', { fontSize: 20, color: '#64748B', marginTop: 2 }, sub)),
    ctaPill(cta)
  );
}

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const fmt = (n: number) => n.toLocaleString('en-US');

export { restGet, rpc, countJobs, liveFilter, escHtml } from './_supa';
