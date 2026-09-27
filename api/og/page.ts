// GET /api/og/page?p=home|jobs|programs|study|companies|destinations|network|feedback
// → 1200×630 share image for a top-level page. Each page has its own concept
// (so a feed of MadeVisa links never looks templated), sharing the brand:
// the logo, MadeVisa blue, Inter, Fraunces for job titles, and the visa-stamp motif.
//
// Layout rule: every block has flexShrink 0 and a known height budget, so
// nothing is squeezed into overlapping text.

import { PAGES, type PageKey } from '../_pages';
import {
  BLUE,
  brandLogo,
  clip,
  countJobs,
  ctaPill,
  fmt,
  h,
  icon,
  img,
  liveFilter,
  logoDataUrl,
  logoTile,
  rpc,
  shareImage,
  stamp,
  tag,
  words,
  type El,
  type IconName,
} from '../_og';
import { latestHiring, type HiringNow } from '../_supa';

export const config = { runtime: 'edge' };

const INK = '#0F172A';
const SLATE = '#475569';
const PAPER = '#F4F7FD';
const NAVY = '#0B1633';

const brandMark = (brand: string | null, onDark = false): El =>
  brand ? img(brand, { width: 223, height: 46, flexShrink: 0 }) : h('div', { fontSize: 36, fontWeight: 800, color: onDark ? 'white' : INK }, 'madevisa');

const root = (bg: string, ...children: (El | null)[]): El =>
  h('div', { width: 1200, height: 630, backgroundColor: bg, fontFamily: "'Inter', sans-serif", position: 'relative', overflow: 'hidden' }, ...children);

// --- Home: "Jobs straight from the source." + a live stack of today's jobs ----

function jobCard(j: HiringNow | null, logo: string | null, rotate: number, shift: number): El {
  return h(
    'div',
    {
      width: 404,
      backgroundColor: 'white',
      borderRadius: 22,
      padding: '18px 22px',
      alignItems: 'center',
      marginLeft: shift,
      marginBottom: 18,
      transform: `rotate(${rotate}deg)`,
      boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
      flexShrink: 0,
    },
    logoTile(logo, j?.company ?? 'M', 56, 14),
    h(
      'div',
      { flexDirection: 'column', marginLeft: 16, width: 286 },
      h('div', { fontSize: 17, fontWeight: 600, color: '#64748B', height: 22 }, clip(j?.company ?? 'Company career pages', 30)),
      h('div', { fontSize: 22, fontWeight: 700, color: INK, fontFamily: "'Fraunces', serif", lineHeight: 1.18, marginTop: 2, maxHeight: 54, overflow: 'hidden' }, clip(j?.title ?? 'Your next role', 46))
    )
  );
}

function renderHome(brand: string | null, live: number | null, jobs: HiringNow[], logos: (string | null)[]): El {
  const liveText = live != null ? fmt(live) : null;
  return root(
    PAPER,
    h(
      'div',
      { flexDirection: 'column', width: 640, height: 630, padding: '56px 0 56px 64px', flexShrink: 0 },
      brandMark(brand),
      h('div', { marginTop: 42 }, words('Jobs from\nthe source.', ['the', 'source.'], { size: 82, width: 560, weight: 800, color: INK, hiColor: BLUE, hiBg: '#DBEAFE', tracking: -3, lineHeight: 1.08 })),
      h(
        'div',
        { marginTop: 22 },
        words(`${liveText ? `${liveText} live jobs` : 'Live jobs'} from company career pages — and who actually replies.`, liveText ? [liveText, 'live', 'jobs'] : [], {
          size: 26,
          width: 540,
          weight: 400,
          color: SLATE,
          hiColor: INK,
          hiWeight: 800,
          lineHeight: 1.35,
        })
      ),
      h('div', { marginTop: 'auto' }, ctaPill('Explore jobs'))
    ),
    h(
      'div',
      { flexDirection: 'column', width: 504, height: 574, margin: '28px 28px 28px 28px', backgroundColor: BLUE, borderRadius: 36, padding: '34px 30px', flexShrink: 0 },
      h(
        'div',
        { alignItems: 'center', marginBottom: 26 },
        h('div', { width: 14, height: 14, borderRadius: 999, backgroundColor: '#4ADE80', marginRight: 10 }),
        h('div', { fontSize: 22, fontWeight: 700, color: 'white' }, 'Live now on MadeVisa')
      ),
      jobCard(jobs[0] ?? null, logos[0] ?? null, -3, 0),
      jobCard(jobs[1] ?? null, logos[1] ?? null, 2.5, 26),
      jobCard(jobs[2] ?? null, logos[2] ?? null, -1.5, 6)
    )
  );
}

// --- Jobs: one huge number on navy, real logos hiring now ----------------------

function renderJobs(brand: string | null, live: number | null, today: number | null, logos: string[]): El {
  return root(
    NAVY,
    h(
      'div',
      { flexDirection: 'column', width: 1200, height: 630, padding: '56px 64px' },
      h(
        'div',
        { alignItems: 'center', justifyContent: 'space-between' },
        brandMark(brand, true),
        tag('Updated every day', { bg: 'rgba(255,255,255,0.08)', color: '#CBD5E1', border: 'rgba(255,255,255,0.16)', icon: 'refresh', size: 20 })
      ),
      h('div', { fontSize: 150, fontWeight: 800, color: 'white', letterSpacing: -7, lineHeight: 1, marginTop: 36, flexShrink: 0 }, live != null ? fmt(live) : 'Thousands'),
      h('div', { marginTop: 10 }, words('live jobs, straight from company career pages.', ['company', 'career', 'pages.'], { size: 40, width: 1060, weight: 700, color: '#94A3B8', hiColor: 'white', hiBg: 'rgba(96,165,250,0.22)', tracking: -1 })),
      today != null && today > 0
        ? h('div', { marginTop: 22 }, tag(`+${fmt(today)} added in the last 24 hours`, { bg: 'rgba(34,197,94,0.14)', color: '#4ADE80', icon: 'up', size: 22 }))
        : null,
      h(
        'div',
        { marginTop: 'auto', alignItems: 'center', justifyContent: 'space-between' },
        logos.length
          ? h(
              'div',
              { alignItems: 'center' },
              h('div', { fontSize: 20, fontWeight: 700, color: '#94A3B8', marginRight: 18, letterSpacing: 1 }, 'HIRING NOW'),
              ...logos.map((l, i) => img(l, { width: 62, height: 62, borderRadius: 999, objectFit: 'contain', backgroundColor: 'white', padding: 8, border: `4px solid ${NAVY}`, marginLeft: i === 0 ? 0 : -14, flexShrink: 0 }))
            )
          : h('div', { fontSize: 22, fontWeight: 600, color: '#94A3B8' }, 'madevisa.com/jobs'),
        ctaPill('Browse jobs', true)
      )
    )
  );
}

// --- Company Scores: "Ghosted again?" ----------------------------------------

export function renderCompanies(brand: string | null): El {
  const seg = (color: string, label: string) =>
    h('div', { flexDirection: 'column', width: 170, marginRight: 10 }, h('div', { height: 14, borderRadius: 999, backgroundColor: color }), h('div', { fontSize: 18, fontWeight: 700, color: SLATE, marginTop: 8 }, label));
  return root(
    'white',
    h(
      'div',
      { flexDirection: 'column', width: 700, height: 630, padding: '56px 0 56px 64px', flexShrink: 0 },
      brandMark(brand),
      h('div', { marginTop: 32 }, words('Ghosted\nagain?', [], { size: 96, width: 620, weight: 800, color: INK, tracking: -4.5, lineHeight: 0.98 })),
      h('div', { marginTop: 18 }, words('See which companies actually reply to applicants — before you apply.', ['actually', 'reply'], { size: 30, width: 600, weight: 400, color: SLATE, hiColor: INK, hiWeight: 800, hiBg: '#FEF3C7', lineHeight: 1.3 })),
      h('div', { marginTop: 24 }, seg('#22C55E', 'Replies often'), seg('#F59E0B', 'Sometimes'), seg('#F43F5E', 'Rarely')),
      h('div', { marginTop: 'auto' }, ctaPill('Check a company'))
    ),
    h(
      'div',
      { width: 500, height: 630, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
      h('div', { width: 380, height: 380, borderRadius: 999, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }, icon('ghost', 210, BLUE, 1.6)),
      h('div', { position: 'absolute', top: 92, right: 56, transform: 'rotate(6deg)' }, tag('Applied 3 weeks ago…', { bg: 'white', color: SLATE, border: '#E2E8F0', icon: 'message', size: 20 }))
    )
  );
}

// --- Split pages (programs, study, network, feedback, destinations) ------------

type Split = { tag: { text: string; icon: IconName }; headline: string; hi: string[]; sub: string; art: () => El };

function renderSplit(brand: string | null, key: PageKey, s: Split): El {
  return root(
    PAPER,
    h(
      'div',
      { flexDirection: 'column', width: 660, height: 630, padding: '56px 0 56px 64px', flexShrink: 0 },
      h('div', { alignItems: 'center', justifyContent: 'space-between', width: 580 }, brandMark(brand), tag(s.tag.text, { bg: 'white', color: '#1D4ED8', border: '#BFDBFE', icon: s.tag.icon, size: 18 })),
      h('div', { marginTop: 40 }, words(s.headline, s.hi, { size: 62, width: 580, weight: 800, color: INK, hiColor: BLUE, hiBg: '#DBEAFE', tracking: -2.4, lineHeight: 1.08 })),
      h('div', { marginTop: 18, width: 560, fontSize: 25, color: SLATE, lineHeight: 1.35, flexShrink: 0 }, s.sub),
      h('div', { marginTop: 'auto' }, ctaPill(PAGES[key].cta))
    ),
    h('div', { width: 540, height: 630, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }, s.art())
  );
}

const bigIcon = (name: IconName) =>
  h('div', { width: 360, height: 360, borderRadius: 999, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }, icon(name, 190, BLUE, 1.5));

const floating = (el: El, top: number, left: number, rotate: number) => h('div', { position: 'absolute', top, left, transform: `rotate(${rotate}deg)` }, el);

const artBox = (...kids: El[]) => h('div', { position: 'relative', width: 540, height: 630, alignItems: 'center', justifyContent: 'center' }, ...kids);

const SPLITS: Partial<Record<PageKey, (people: number | null) => Split>> = {
  programs: () => ({
    tag: { text: 'Coming soon', icon: 'landmark' },
    headline: 'Programs from official sources only.',
    hi: ['official', 'sources'],
    sub: 'Government, university and exchange programs — checked before they’re listed.',
    art: () => artBox(bigIcon('landmark'), floating(tag('Official source', { bg: 'white', color: '#047857', border: '#A7F3D0', icon: 'check', size: 20 }), 120, 260, 5)),
  }),
  study: () => ({
    tag: { text: 'Coming soon', icon: 'cap' },
    headline: 'Study abroad, straight from the source.',
    hi: ['the', 'source.'],
    sub: 'Degrees, scholarships and study visas from official sources — in one place.',
    art: () => artBox(bigIcon('cap'), floating(tag('Scholarships', { bg: 'white', color: '#1D4ED8', border: '#BFDBFE', icon: 'check', size: 20 }), 120, 40, -6)),
  }),
  network: (people) => ({
    tag: { text: people ? `${fmt(people)} people` : 'The Network', icon: 'users' },
    headline: 'Meet people who hire across borders.',
    hi: ['across', 'borders.'],
    sub: 'Hiring managers, recruiters and people ready to move. Contact details are never shown.',
    art: () =>
      artBox(
        bigIcon('users'),
        floating(tag("I'm hiring", { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', size: 24 }), 110, 60, -7),
        floating(tag('Open to work', { bg: 'white', color: '#1D4ED8', border: '#BFDBFE', size: 24 }), 470, 250, 5)
      ),
  }),
  feedback: () => ({
    tag: { text: 'Takes 20 seconds', icon: 'message' },
    headline: 'How did your application really go?',
    hi: ['really'],
    sub: 'Share it privately — and see which companies actually reply.',
    art: () =>
      h(
        'div',
        { flexDirection: 'column', alignItems: 'flex-start' },
        h('div', { transform: 'rotate(-3deg)', marginBottom: 20 }, tag('No reply', { bg: 'white', color: '#475569', border: '#CBD5E1', icon: 'ghost', size: 34 })),
        h('div', { transform: 'rotate(2deg)', marginBottom: 20, marginLeft: 60 }, tag('Rejected', { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3', icon: 'x', size: 34 })),
        h('div', { transform: 'rotate(-1.5deg)', marginBottom: 20, marginLeft: 20 }, tag('Interview', { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', icon: 'message', size: 34 })),
        h('div', { transform: 'rotate(3deg)', marginLeft: 80 }, tag('Offer', { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', icon: 'check', size: 34 }))
      ),
  }),
  destinations: () => ({
    tag: { text: '21 countries', icon: 'globe' },
    headline: 'Where can your passport take you?',
    hi: ['your', 'passport'],
    sub: 'Visa routes you qualify for, sponsored jobs and companies hiring — country by country.',
    art: () =>
      h(
        'div',
        { position: 'relative', width: 540, height: 630 },
        floating(stamp(['GERMANY'], { color: '#1D4ED8', size: 190, rotate: -12, sub: 'VISA · DE' }), 70, 40, 0),
        floating(stamp(['CANADA'], { color: '#BE123C', size: 170, rotate: 10, sub: 'ENTRY · CA' }), 60, 290, 0),
        floating(stamp(['PORTUGAL'], { color: '#047857', size: 180, rotate: 6, sub: 'VISA · PT' }), 300, 60, 0),
        floating(stamp(['NETHERLANDS'], { color: '#7C3AED', size: 190, rotate: -8, sub: 'ENTRY · NL' }), 320, 300, 0)
      ),
  }),
};

// --- Handler -------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = (url.searchParams.get('p') ?? 'home') as PageKey;
  const key: PageKey = p in PAGES ? p : 'home';
  const brand = await brandLogo(url.origin);
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  if (key === 'home') {
    const [live, jobs] = await Promise.all([countJobs(liveFilter()), latestHiring(3)]);
    const logos = await Promise.all(jobs.map((j) => logoDataUrl(j.logo)));
    return shareImage(renderHome(brand, live, jobs, logos), { titleFont: true, maxAge: 3600 });
  }
  if (key === 'jobs') {
    const [live, today, hiring] = await Promise.all([countJobs(liveFilter()), countJobs(liveFilter(`created_at=gt.${since24h}`)), latestHiring(14)]);
    const logos = (await Promise.all(hiring.map((j) => logoDataUrl(j.logo)))).filter((l): l is string => Boolean(l)).slice(0, 7);
    return shareImage(renderJobs(brand, live, today, logos), { maxAge: 3600 });
  }
  if (key === 'companies') return shareImage(renderCompanies(brand), { maxAge: 86400 });

  const people = key === 'network' ? (await rpc<{ people: number }>('network_counts'))?.people ?? null : null;
  const split = SPLITS[key]!(people);
  return shareImage(renderSplit(brand, key, split), { maxAge: 21600 });
}
