// GET /api/og/company?slug=<slug>-<8 hex> → 1200×630 share image for a company
// page: logo, name, open jobs, visa-sponsored jobs and the applicant reply rate
// (only once enough applicants have reported — same rule as the site).

import { fetchShareCompany, type ShareCompany } from '../_supa';
import { BLUE, brandLogo, chip, clip, fmt, footer, frame, h, img, logoDataUrl, shareImage, type El } from '../_og';

export const config = { runtime: 'edge' };

function headlineFor(c: ShareCompany): string {
  if (c.replyRate != null) return `Replies to ${c.replyRate}% of applicants`;
  if (c.openJobs) return `Hiring now — ${fmt(c.openJobs)} open ${c.openJobs === 1 ? 'job' : 'jobs'}`;
  return 'Company score on MadeVisa';
}

function render(c: ShareCompany | null, logo: string | null, brand: string | null): El {
  const top = (right: El | null) =>
    h('div', { alignItems: 'center', justifyContent: 'space-between' }, brand ? img(brand, { width: 223, height: 46 }) : h('div', { fontSize: 36, fontWeight: 700, color: '#0F172A' }, 'madevisa'), right);
  const pill = h('div', { fontSize: 22, fontWeight: 700, color: '#1D4ED8', backgroundColor: '#EFF6FF', border: '2px solid #BFDBFE', borderRadius: 999, padding: '8px 20px' }, 'Company Score');
  if (!c) return frame(top(pill), h('div', { fontSize: 64, fontWeight: 700, color: '#0F172A', marginTop: 60 }, "Who's hiring — and who replies"), footer('madevisa.com/companies', 'Company scores', 'See companies'));

  const facts: El[] = [];
  facts.push(chip('Open jobs', c.openJobs == null ? '—' : fmt(c.openJobs), true));
  if (c.visaJobs) facts.push(chip('Visa-sponsored', fmt(c.visaJobs)));
  facts.push(chip('Reply rate', c.replyRate == null ? 'Needs more reports' : `${c.replyRate}%`, c.replyRate != null));
  if (c.tracked > 0) facts.push(chip('Applications reported', fmt(c.tracked)));

  return frame(
    top(pill),
    h(
      'div',
      { alignItems: 'center', marginTop: 34 },
      logo
        ? img(logo, { width: 104, height: 104, borderRadius: 20, objectFit: 'contain', border: '2px solid #E2E8F0', backgroundColor: 'white', marginRight: 26 })
        : h('div', { width: 104, height: 104, borderRadius: 20, backgroundColor: BLUE, color: 'white', fontSize: 52, fontWeight: 700, alignItems: 'center', justifyContent: 'center', marginRight: 26 }, c.name.slice(0, 1).toUpperCase()),
      h(
        'div',
        { flexDirection: 'column' },
        h('div', { alignItems: 'center' }, h('div', { fontSize: 44, fontWeight: 700, color: '#0F172A', letterSpacing: -1 }, clip(c.name, 30)), c.verified ? h('div', { fontSize: 22, fontWeight: 700, color: '#1D4ED8', marginLeft: 14 }, 'Verified') : null),
        c.country ? h('div', { fontSize: 24, color: '#64748B', marginTop: 4 }, c.country) : null
      )
    ),
    h('div', { fontSize: 58, fontWeight: 700, color: '#0F172A', letterSpacing: -2, lineHeight: 1.08, marginTop: 30, marginBottom: 24 }, headlineFor(c)),
    h('div', { flexWrap: 'wrap' }, ...facts),
    footer('madevisa.com/companies', 'Hiring activity and reply rates from real applicants', 'See company score')
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';
  const c = slug ? await fetchShareCompany(slug).catch(() => null) : null;
  const [logo, brand] = await Promise.all([c?.logo ? logoDataUrl(c.logo) : Promise.resolve(null), brandLogo(url.origin)]);
  const text = [c?.name, c?.country, c ? headlineFor(c) : "Who's hiring — and who replies", 'Verified Company Score Open jobs Visa-sponsored Reply rate Needs more reports Applications reported —%0123456789,',
    'madevisa.com/companies Hiring activity and reply rates from real applicants See company score Company scores See companies', c?.name.slice(0, 1).toUpperCase()].filter(Boolean).join(' ');
  return shareImage(render(c, logo, brand), text, { maxAge: 7200 });
}
