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

function chip(label: string, value: string, strong = false): El {
  return h(
    'div',
    { flexDirection: 'column', padding: '14px 20px', borderRadius: 14, backgroundColor: strong ? '#EFF6FF' : '#F8FAFC', border: `2px solid ${strong ? '#BFDBFE' : '#E2E8F0'}`, marginRight: 14, marginBottom: 14 },
    h('div', { fontSize: 18, color: '#64748B', marginBottom: 4 }, label),
    h('div', { fontSize: strong ? 30 : 26, fontWeight: 700, color: '#0F172A' }, value)
  );
}

function render(job: ShareJob | null, logo: string | null): El {
  if (!job) {
    return h(
      'div',
      { width: '100%', height: '100%', backgroundColor: BLUE, color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' },
      h('div', { fontSize: 72, fontWeight: 700 }, 'MadeVisa'),
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
    { width: '100%', height: '100%', backgroundColor: BLUE, padding: 44, fontFamily: 'sans-serif' },
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
          h('div', { fontSize: 22, color: '#64748B', marginTop: 2 }, 'is hiring')
        )
      ),
      // title
      h('div', { fontSize: title.length > 55 ? 50 : 60, fontWeight: 700, color: '#0F172A', lineHeight: 1.12, marginTop: 30, marginBottom: 26 }, title),
      // facts
      h('div', { flexWrap: 'wrap' }, ...chips),
      // footer
      h(
        'div',
        { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #F1F5F9', paddingTop: 20 },
        h('div', { fontSize: 22, color: '#64748B' }, postedLabel(job.postedAt) ?? 'Apply on MadeVisa'),
        h('div', { alignItems: 'center' },
          h('div', { fontSize: 30, fontWeight: 700, color: '#0F172A' }, 'made'),
          h('div', { fontSize: 30, fontWeight: 700, color: BLUE }, 'visa'),
          h('div', { fontSize: 22, color: '#64748B', marginLeft: 12 }, 'madevisa.com')
        )
      )
    )
  );
}

export default async function handler(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id')?.toLowerCase() ?? '';
  const valid = /^[0-9a-f]{8}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
  const job = valid ? await fetchShareJob(id).catch(() => null) : null;
  const logo = job ? await logoDataUrl(job.logo) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(render(job, logo) as any, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
