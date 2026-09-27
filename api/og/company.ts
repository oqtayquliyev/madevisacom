// GET /api/og/company?slug=<slug>-<8 hex> → 1200×630 company scorecard:
// the question applicants actually have ("Does X reply to applicants?") with
// the answer as a big score ring (reply rate, once enough applicants have
// reported — same rule as the site), plus open and visa-sponsored jobs.
// Unknown company → the Company Scores page image.

import { fetchShareCompany, type ShareCompany } from '../_supa';
import { BLUE, brandLogo, clip, fmt, h, icon, img, logoDataUrl, logoTile, shareImage, tag, words, type El, type IconName } from '../_og';
import { renderCompanies } from './page';

export const config = { runtime: 'edge' };

const INK = '#0F172A';

function ring(value: number | null, color: string, size: number): El {
  const r = 46;
  const len = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return {
    type: 'svg',
    props: {
      width: size,
      height: size,
      viewBox: '0 0 120 120',
      style: { position: 'absolute', top: 0, left: 0 },
      children: [
        { type: 'circle', props: { cx: 60, cy: 60, r, fill: 'none', stroke: '#E2E8F0', strokeWidth: 11 } },
        value == null
          ? { type: 'circle', props: { cx: 60, cy: 60, r, fill: 'none', stroke: '#CBD5E1', strokeWidth: 11, strokeDasharray: '4 7' } }
          : { type: 'circle', props: { cx: 60, cy: 60, r, fill: 'none', stroke: color, strokeWidth: 11, strokeLinecap: 'round', strokeDasharray: `${(len * pct).toFixed(1)} ${len.toFixed(1)}`, transform: 'rotate(-90 60 60)' } },
      ],
    },
  };
}

function fact(ic: IconName, value: string, label: string): El {
  return h(
    'div',
    { alignItems: 'center', backgroundColor: '#F8FAFC', border: '2px solid #E2E8F0', borderRadius: 16, padding: '12px 18px', marginRight: 12, flexShrink: 0 },
    icon(ic, 26, BLUE, 2.2),
    h('div', { flexDirection: 'column', marginLeft: 12 }, h('div', { fontSize: 26, fontWeight: 800, color: INK, lineHeight: 1.1 }, value), h('div', { fontSize: 16, fontWeight: 600, color: '#64748B' }, label))
  );
}

function render(c: ShareCompany, logo: string | null, brand: string | null): El {
  const rate = c.replyRate;
  const color = rate == null ? '#94A3B8' : rate >= 60 ? '#16A34A' : rate >= 30 ? '#D97706' : '#E11D48';
  const short = clip(c.name, 22);
  const question = rate != null ? `Does ${short} reply to applicants?` : `${short} is hiring. Do they reply?`;
  const facts: El[] = [];
  if (c.openJobs != null) facts.push(fact('briefcase', fmt(c.openJobs), c.openJobs === 1 ? 'open job' : 'open jobs'));
  if (c.visaJobs) facts.push(fact('plane', fmt(c.visaJobs), 'visa-sponsored'));
  if (c.tracked > 0) facts.push(fact('users', fmt(c.tracked), c.tracked === 1 ? 'applicant report' : 'applicant reports'));

  const size = 290;
  const gauge = h(
    'div',
    { width: size, height: size, position: 'relative', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    ring(rate, color, size),
    h(
      'div',
      { flexDirection: 'column', alignItems: 'center' },
      rate != null
        ? h('div', { fontSize: 80, fontWeight: 800, color, letterSpacing: -3, lineHeight: 1 }, `${rate}%`)
        : h('div', { fontSize: c.openJobs && c.openJobs > 999 ? 58 : 72, fontWeight: 800, color: INK, letterSpacing: -3, lineHeight: 1 }, c.openJobs != null ? fmt(c.openJobs) : '—'),
      h('div', { fontSize: 20, fontWeight: 700, color: '#64748B', marginTop: 6, letterSpacing: 1 }, rate != null ? 'REPLY RATE' : 'OPEN JOBS')
    )
  );

  return h(
    'div',
    { width: 1200, height: 630, backgroundColor: '#F4F7FD', padding: 40, fontFamily: "'Inter', sans-serif" },
    h(
      'div',
      { width: 1120, height: 550, backgroundColor: 'white', borderRadius: 30, padding: '40px 48px', flexShrink: 0 },
      h(
        'div',
        { flexDirection: 'column', width: 690, height: 470, flexShrink: 0 },
        h(
          'div',
          { alignItems: 'center' },
          logoTile(logo, c.name, 84, 18),
          h(
            'div',
            { flexDirection: 'column', marginLeft: 20 },
            h('div', { fontSize: 36, fontWeight: 800, color: INK, letterSpacing: -1 }, clip(c.name, 28)),
            h(
              'div',
              { alignItems: 'center', marginTop: 4 },
              c.country ? h('div', { fontSize: 20, color: '#64748B', marginRight: 12 }, c.country) : null,
              c.verified ? tag('Verified', { bg: '#EFF6FF', color: '#1D4ED8', icon: 'check', size: 15 }) : null
            )
          )
        ),
        h('div', { marginTop: 30 }, words(question, ['reply', 'reply?', 'hiring.'], { size: 50, width: 660, weight: 800, color: INK, hiColor: rate != null ? color : BLUE, hiBg: rate != null ? '#F1F5F9' : '#DBEAFE', tracking: -1.8, lineHeight: 1.1 })),
        facts.length ? h('div', { marginTop: 26 }, ...facts) : null,
        h(
          'div',
          { marginTop: 'auto', alignItems: 'center' },
          icon('message', 22, '#64748B', 2.2),
          h('div', { fontSize: 20, color: '#475569', marginLeft: 10 }, 'Applied here? Share how it went on '),
          h('div', { fontSize: 20, fontWeight: 700, color: INK, marginLeft: 6 }, 'madevisa.com')
        )
      ),
      h(
        'div',
        { flexDirection: 'column', width: 330, height: 470, alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
        brand ? img(brand, { width: 180, height: 37, alignSelf: 'flex-end' }) : h('div', {}, ''),
        gauge,
        rate == null ? tag('Reply rate: needs more reports', { bg: '#F1F5F9', color: '#475569', size: 16 }) : tag('From real applicant reports', { bg: '#F1F5F9', color: '#475569', size: 16 })
      )
    )
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Accept a bare slug, "/companies/<slug>" or a full company URL.
  const raw = decodeURIComponent(url.searchParams.get('slug') ?? '').trim();
  const slug = raw.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/?companies\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const c = slug ? await fetchShareCompany(slug).catch(() => null) : null;
  const brand = await brandLogo(url.origin);
  if (!c) return shareImage(renderCompanies(brand), { maxAge: 3600 });
  const logo = c.logo ? await logoDataUrl(c.logo) : null;
  return shareImage(render(c, logo, brand), { maxAge: 7200 });
}
