// GET /api/og/job?id=<first 8 chars of the job id | full uuid>
// → 1200×630 PNG share image for that job, rendered at the edge with @vercel/og.
// Linked from the job page's og:image (and served to link-preview bots by middleware.ts).

import { ImageResponse } from '@vercel/og';
import { fetchShareJob, postedLabel, type ShareJob } from '../_jobShare';

export const config = { runtime: 'edge' };

const BLUE = '#2563EB';

// Tiny element builder — satori (inside @vercel/og) accepts plain
// { type, props } objects, so no JSX/React build step is needed here.
type El = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, ...children: (El | string | null | false | undefined)[]): El {
  const kids = children.filter((c) => c !== null && c !== false && c !== undefined) as (El | string)[];
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
function img(src: string, style: Record<string, unknown>): El {
  return { type: 'img', props: { src, style } };
}

/** Logos can be any format; only png/jpeg/gif/svg render reliably, so inline those and skip the rest. */
async function logoDataUrl(url: string | null): Promise<string | null> {
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
type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' };
async function googleFont(family: string, weight: 400 | 600 | 700, text: string): Promise<Font | null> {
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
async function brandLogo(origin: string): Promise<string | null> {
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

const SLAB = "'Roboto Slab', serif";
const SANS = "'Inter', sans-serif";

function chip(label: string, value: string, strong = false): El {
  return h(
    'div',
    { flexDirection: 'column', padding: '14px 20px', borderRadius: 14, backgroundColor: strong ? '#EFF6FF' : '#F8FAFC', border: `2px solid ${strong ? '#BFDBFE' : '#E2E8F0'}`, marginRight: 14, marginBottom: 14 },
    h('div', { fontSize: 18, fontWeight: 600, color: '#64748B', marginBottom: 4, fontFamily: SANS }, label),
    h('div', { fontSize: strong ? 30 : 26, fontWeight: 700, color: '#0F172A', fontFamily: strong ? SLAB : SANS }, value)
  );
}

function render(job: ShareJob | null, logo: string | null, brand: string | null): El {
  if (!job) {
    return h(
      'div',
      { width: '100%', height: '100%', backgroundColor: BLUE, color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' },
      brand ? img(brand, { width: 596, height: 122 }) : h('div', { fontSize: 72, fontWeight: 700, fontFamily: SLAB }, 'MadeVisa'),
      h('div', { fontSize: 32, marginTop: 12, opacity: 0.85 }, 'Jobs, programs, study and visas — in one place')
    );
  }
  const title = job.title.length > 90 ? `${job.title.slice(0, 87)}…` : job.title;
  const chips: El[] = [];
  if (job.salary) chips.push(chip('Salary', job.salary.length > 34 ? `${job.salary.slice(0, 32)}…` : job.salary, true));
  if (job.location) chips.push(chip('Location', job.location.length > 30 ? `${job.location.slice(0, 28)}…` : job.location));
  if (job.type) chips.push(chip('Type', job.type));
  if (job.workArrangement) chips.push(chip('Work style', job.workArrangement));
  if (job.experience && chips.length < 5) chips.push(chip('Experience', job.experience));
  if (job.visa && chips.length < 6) chips.push(chip('Visa', 'Sponsorship offered'));

  return h(
    'div',
    { width: '100%', height: '100%', backgroundColor: BLUE, padding: 44, fontFamily: SANS },
    h(
      'div',
      { flexDirection: 'column', width: '100%', height: '100%', backgroundColor: 'white', borderRadius: 28, padding: '44px 52px' },
      // company row
      h(
        'div',
        { alignItems: 'center' },
        logo
          ? img(logo, { width: 76, height: 76, borderRadius: 16, objectFit: 'contain', border: '2px solid #E2E8F0', backgroundColor: 'white', marginRight: 22 })
          : h('div', { width: 76, height: 76, borderRadius: 16, backgroundColor: BLUE, color: 'white', fontSize: 40, fontWeight: 700, alignItems: 'center', justifyContent: 'center', marginRight: 22 }, job.company.slice(0, 1).toUpperCase()),
        h('div', { flexDirection: 'column' },
          h('div', { fontSize: 30, fontWeight: 700, color: '#0F172A' }, job.company),
          h('div', { fontSize: 22, fontWeight: 600, color: '#64748B', marginTop: 2 }, 'is hiring')
        ),
        brand ? img(brand, { width: 223, height: 46, marginLeft: 'auto' }) : null
      ),
      // title
      h('div', { fontSize: title.length > 55 ? 52 : 62, fontWeight: 700, fontFamily: SLAB, color: '#0F172A', lineHeight: 1.12, letterSpacing: -1, marginTop: 30, marginBottom: 26 }, title),
      // facts
      h('div', { flexWrap: 'wrap' }, ...chips),
      // footer
      h(
        'div',
        { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #F1F5F9', paddingTop: 20 },
        h('div', { flexDirection: 'column' },
          h('div', { fontSize: 22, fontWeight: 600, color: '#0F172A' }, postedLabel(job.postedAt) ?? 'Now hiring'),
          h('div', { fontSize: 20, color: '#64748B', marginTop: 2 }, 'madevisa.com')
        ),
        // Same look as the site's Apply button: rounded pill, bold label, ↗ arrow
        h(
          'div',
          { alignItems: 'center', backgroundColor: BLUE, color: 'white', borderRadius: 999, padding: '18px 38px', fontSize: 28, fontWeight: 700 },
          'Apply',
          {
            type: 'svg',
            props: {
              width: 26,
              height: 26,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'white',
              strokeWidth: 2.6,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              style: { marginLeft: 12 },
              children: [
                { type: 'path', props: { d: 'M7 17L17 7' } },
                { type: 'path', props: { d: 'M7 7h10v10' } },
              ],
            },
          }
        )
      )
    )
  );
}

export default async function handler(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id')?.toLowerCase() ?? '';
  const valid = /^[0-9a-f]{8}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
  const origin = new URL(req.url).origin;
  const job = valid ? await fetchShareJob(id).catch(() => null) : null;
  // Characters drawn with each font, so the downloaded font subsets are tiny.
  const text = job
    ? [job.company, 'is hiring', job.title, job.salary, job.location, job.type, job.workArrangement, job.experience, 'Sponsorship offered',
       'Salary Location Type Work style Experience Visa', postedLabel(job.postedAt), 'Now hiring madevisa.com Apply…'].filter(Boolean).join(' ')
    : 'MadeVisa Jobs, programs, study and visas — in one place';
  const [logo, brand, ...fonts] = await Promise.all([
    job ? logoDataUrl(job.logo) : Promise.resolve(null),
    brandLogo(origin),
    googleFont('Inter', 400, text),
    googleFont('Inter', 600, text),
    googleFont('Inter', 700, text),
    googleFont('Roboto Slab', 700, text),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(render(job, logo, brand) as any, {
    width: 1200,
    height: 630,
    fonts: fonts.filter((f): f is Font => f !== null),
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
