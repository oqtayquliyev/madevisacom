// GET /api/og/page?p=home|jobs|programs|study|companies|destinations|network|feedback
// → 1200×630 share image for a top-level page, with live numbers where useful.

import { PAGES, type PageKey } from '../_pages';
import { brandLogo, chip, countJobs, fmt, footer, frame, h, img, liveFilter, rpc, shareImage, type El } from '../_og';

export const config = { runtime: 'edge' };

async function stats(key: PageKey): Promise<[string, string, boolean?][]> {
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const live = () => countJobs(liveFilter());
  const today = () => countJobs(liveFilter(`created_at=gt.${since24h}`));
  const visa = () => countJobs(liveFilter('visa_sponsorship=eq.true'));
  const n = (v: number | null, fallback: string) => (v == null ? fallback : fmt(v));
  switch (key) {
    case 'home': {
      const [a, b] = await Promise.all([live(), today()]);
      return [['Live jobs', n(a, 'Thousands'), true], ['New in 24 hours', n(b, 'Daily')], ['Straight from', 'Career pages']];
    }
    case 'jobs': {
      const [a, b, c] = await Promise.all([live(), today(), visa()]);
      return [['Live jobs', n(a, 'Thousands'), true], ['New in 24 hours', n(b, 'Daily')], ['Visa sponsorship', n(c, 'Filterable')]];
    }
    case 'companies': {
      const a = await live();
      return [['Open jobs tracked', n(a, 'Thousands'), true], ['Reply rates', 'From applicants'], ['Updated', 'Every day']];
    }
    case 'destinations': {
      const c = await visa();
      return [['Countries', '21', true], ['Visa-sponsored jobs', n(c, 'Live')], ['Eligibility', 'Personal']];
    }
    case 'network': {
      const counts = await rpc<{ people: number; hiring: number }>('network_counts');
      return [['People', counts ? fmt(counts.people) : 'Growing', true], ['Hiring now', counts ? fmt(counts.hiring) : 'Open'], ['Contact details', 'Never shown']];
    }
    case 'feedback':
      return [['Takes', '20 seconds', true], ['Your report', 'Private'], ['Shows', 'Who replies']];
    case 'programs':
      return [['Sources', 'Official only', true], ['Every listing', 'Checked'], ['Status', 'Coming soon']];
    case 'study':
      return [['Sources', 'Official only', true], ['Covers', 'Degrees & scholarships'], ['Status', 'Coming soon']];
  }
}

function render(key: PageKey, brand: string | null, facts: [string, string, boolean?][]): El {
  const m = PAGES[key];
  return frame(
    h(
      'div',
      { alignItems: 'center', justifyContent: 'space-between' },
      brand ? img(brand, { width: 223, height: 46 }) : h('div', { fontSize: 36, fontWeight: 700, color: '#0F172A' }, 'madevisa'),
      m.label ? h('div', { fontSize: 22, fontWeight: 700, color: '#1D4ED8', backgroundColor: '#EFF6FF', border: '2px solid #BFDBFE', borderRadius: 999, padding: '8px 20px' }, m.label) : null
    ),
    h('div', { fontSize: m.headline.length > 34 ? 60 : 70, fontWeight: 700, color: '#0F172A', lineHeight: 1.06, letterSpacing: -2.5, marginTop: 34 }, m.headline),
    h('div', { fontSize: 28, color: '#475569', lineHeight: 1.35, marginTop: 16, marginBottom: 26, maxWidth: 980 }, m.sub),
    h('div', { flexWrap: 'wrap' }, ...facts.map(([label, value, strong]) => chip(label, value, strong))),
    footer(`madevisa.com${m.path === '/' ? '' : m.path}`, 'Jobs · Company scores · Visas', m.cta)
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = (url.searchParams.get('p') ?? 'home') as PageKey;
  const key: PageKey = p in PAGES ? p : 'home';
  const [brand, facts] = await Promise.all([brandLogo(url.origin), stats(key)]);
  const m = PAGES[key];
  const text = [m.label, m.headline, m.sub, m.cta, 'madevisa.com', m.path, 'Jobs · Company scores · Visas', ...facts.flat().filter((x) => typeof x === 'string')].join(' ');
  return shareImage(render(key, brand, facts), text, { maxAge: 7200 });
}
