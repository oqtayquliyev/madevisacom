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
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
export function img(src: string, style: Record<string, unknown>): El {
  return { type: 'img', props: { src, style } };
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
export type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' };
export async function googleFont(family: string, weight: 400 | 600 | 700, text: string): Promise<Font | null> {
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

/** The standard share image: 1200×630 PNG, cached at the edge. */
export async function shareImage(tree: El, text: string, opts: { titleFont?: boolean; maxAge?: number } = {}): Promise<Response> {
  const fonts = await Promise.all([
    googleFont('Inter', 400, text),
    googleFont('Inter', 600, text),
    googleFont('Inter', 700, text),
    opts.titleFont ? googleFont('Fraunces', 700, text) : Promise.resolve(null),
  ]);
  const sMaxAge = opts.maxAge ?? 21600;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(tree as any, {
    width: 1200,
    height: 630,
    fonts: fonts.filter((f): f is Font => f !== null),
    headers: { 'Cache-Control': `public, max-age=3600, s-maxage=${sMaxAge}, stale-while-revalidate=604800` },
  });
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

/** Blue "button" pill with an ↗ arrow, like the site's Apply button. */
export function ctaPill(label: string): El {
  return h(
    'div',
    { alignItems: 'center', backgroundColor: BLUE, color: 'white', borderRadius: 999, padding: '18px 34px', fontSize: 26, fontWeight: 700 },
    label,
    {
      type: 'svg',
      props: {
        width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'white', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { marginLeft: 12 },
        children: [{ type: 'path', props: { d: 'M7 17L17 7' } }, { type: 'path', props: { d: 'M7 7h10v10' } }],
      },
    }
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
