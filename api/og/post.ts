// GET /api/og/post?t=<template>&size=portrait|square|story&…
//   → PNG for a social post that isn't a job list: country spotlights, visa
//     routes, numbers, rankings, steps, myth/fact, news, calls to action.
//   Templates: hero · stat · rank · card · steps · myth · text · versus · news · cta · grid · photo
//   (photo = a real photograph with one line of text; needs img)
//   Plus t=reel: transparent text layers for Reels (api/_reel.ts).
//
// Every text on the image is a URL parameter, so the admin panel can edit it
// before the post goes out (see api/_post.ts for the list and the layout rules):
//   k label · h headline · s sub line · n big number · u its label · src footnote
//   cta button · link footer link · p "2/4" · hl words to highlight · m/f myth/fact
//   cc / cc2 country (flag) · img photo · cr photo credit · th blue|ink|light
//   rows "a|b|c~a|b|c" (facts, list rows, steps… per template)
// Add &check=1 → JSON { ok, issues[] } instead of the image, from the same
// layout maths: the pipeline refuses to queue an image with an error, and
// shows warnings (a text that had to be shortened) next to the post.

import { ImageResponse } from '@vercel/og';
import { googleFont, logoDataUrl, textOf, type Font } from '../_og';
import { restGet } from '../_supa';
import { drawPost, parsePost, UUID, type Loader } from '../_post';
import { drawReel, parseReel } from '../_reel';

export const config = { runtime: 'edge' };

// Photos are only fetched from places we chose: this project's storage and the
// big free-photo hosts. Anything else is ignored (the image falls back to the
// gradient), so the endpoint can't be used to fetch arbitrary URLs.
const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);
function photoAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const own = (() => {
      try {
        return new URL(env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL') ?? '').hostname;
      } catch {
        return '';
      }
    })();
    return host === own || host === 'madevisa.com' || /(^|\.)(unsplash\.com|pexels\.com|wikimedia\.org|cloudinary\.com|supabase\.co)$/.test(host);
  } catch {
    return false;
  }
}

async function photoDataUrl(url: string): Promise<string | null> {
  if (!photoAllowed(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/(png|jpeg|jpg)$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 4_500_000) return null;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/** t=reel → a text layer for a Reel (transparent PNG, 1080×1920). See api/_reel.ts. */
async function reelLayer(url: URL, check: boolean): Promise<Response> {
  const q = parseReel(url.searchParams);
  if (!q) return check ? Response.json({ ok: false, issues: [{ level: 'error', message: 'Unknown reel layer' }] }, { headers: { 'Cache-Control': 'no-store' } }) : new Response('Unknown reel layer', { status: 400 });
  const { tree, issues, width, height } = await drawReel(q, (ref) => logoDataUrl(ref));
  if (check) return Response.json({ ok: !issues.some((i) => i.level === 'error'), width, height, issues }, { headers: { 'Cache-Control': 'no-store' } });
  const glyphs = `${textOf(tree)} 0123456789→…·#%+`;
  const fonts = (await Promise.all([googleFont('Inter', 400, glyphs), googleFont('Inter', 600, glyphs), googleFont('Inter', 700, glyphs), googleFont('Inter', 800, glyphs)])).filter((f): f is Font => f !== null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const png = await new ImageResponse(tree as any, { width, height, fonts }).arrayBuffer();
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=604800, immutable' } });
  } catch (e) {
    return new Response(`Render failed: ${e instanceof Error ? e.message : e}`, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const check = url.searchParams.get('check') === '1';
  if (url.searchParams.get('t') === 'reel') return reelLayer(url, check);
  const q = parsePost(url.searchParams);
  if (!q) {
    if (check) return Response.json({ ok: false, issues: [{ level: 'error', message: 'Unknown template' }] }, { headers: { 'Cache-Control': 'no-store' } });
    return new Response('Unknown template', { status: 400 });
  }
  if (!q.h && !q.n && q.t !== 'myth') {
    if (check) return Response.json({ ok: false, issues: [{ level: 'error', message: 'The image has no headline' }] }, { headers: { 'Cache-Control': 'no-store' } });
    return new Response('No headline', { status: 400 });
  }

  // Company logos: rank rows carry the company id; the logo URL comes from the database.
  const ids = [...new Set(q.rows.map((r) => r[4]).filter((x) => x && UUID.test(x)))];
  const logoById = new Map<string, string | null>();
  if (ids.length) {
    const rows = await restGet<{ id: string; logo_url: string | null }[]>(`program_publishers?select=id,logo_url&id=in.(${ids.join(',')})`);
    for (const r of rows ?? []) logoById.set(r.id, r.logo_url);
  }
  const load: Loader = (ref, kind) => (kind === 'photo' ? photoDataUrl(ref) : kind === 'logo' ? logoDataUrl(logoById.get(ref) ?? null) : logoDataUrl(ref));

  const { tree, issues, width, height } = await drawPost(q, load);
  if (check) return Response.json({ ok: !issues.some((i) => i.level === 'error'), width, height, issues }, { headers: { 'Cache-Control': 'no-store' } });

  const glyphs = `${textOf(tree)} 0123456789→…·#%+`;
  const fonts = (await Promise.all([googleFont('Inter', 400, glyphs), googleFont('Inter', 600, glyphs), googleFont('Inter', 700, glyphs), googleFont('Inter', 800, glyphs)])).filter((f): f is Font => f !== null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const png = await new ImageResponse(tree as any, { width, height, fonts }).arrayBuffer();
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=604800, immutable' } });
  } catch (e) {
    return new Response(`Render failed: ${e instanceof Error ? e.message : e}`, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
