// GET /api/og/job?id=<first 8 chars of the job id | full uuid>
// → 1200×630 PNG share image for that job, rendered at the edge with @vercel/og.
// Linked from the job page's og:image (and served to link-preview bots by middleware.ts).

import { ImageResponse } from '@vercel/og';
import { fetchShareJob, postedLabel, type ShareJob } from '../_jobShare';
import { BLUE, brandLogo, googleFont, h, img, logoDataUrl, type El, type Font } from '../_og';

export const config = { runtime: 'edge' };

const SLAB = "'Fraunces', serif";
const SANS = "'Inter', sans-serif";

function chip(label: string, value: string, strong = false): El {
  return h(
    'div',
    { flexDirection: 'column', padding: '14px 20px', borderRadius: 14, backgroundColor: strong ? '#EFF6FF' : '#F8FAFC', border: `2px solid ${strong ? '#BFDBFE' : '#E2E8F0'}`, marginRight: 14, marginBottom: 14 },
    h('div', { fontSize: 18, fontWeight: 600, color: '#64748B', marginBottom: 4, fontFamily: SANS }, label),
    h('div', { fontSize: strong ? 30 : 26, fontWeight: 700, color: '#0F172A', fontFamily: SANS }, value)
  );
}

function render(job: ShareJob | null, logo: string | null, brand: string | null): El {
  if (!job) {
    return h(
      'div',
      { width: '100%', height: '100%', backgroundColor: BLUE, color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' },
      brand ? img(brand, { width: 596, height: 122 }) : h('div', { fontSize: 72, fontWeight: 700, fontFamily: SANS }, 'MadeVisa'),
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
    googleFont('Fraunces', 700, text),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(render(job, logo, brand) as any, {
    width: 1200,
    height: 630,
    fonts: fonts.filter((f): f is Font => f !== null),
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
