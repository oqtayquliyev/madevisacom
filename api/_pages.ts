// One place for each top-level page's share text. Used by the page share
// image (api/og/page.ts) and by middleware.ts for link-preview tags.

export type PageKey = 'home' | 'jobs' | 'programs' | 'study' | 'companies' | 'destinations' | 'network' | 'feedback';

export type PageMeta = {
  path: string;
  /** <title> and og:title */
  title: string;
  description: string;
  /** Short label shown as a pill on the image (null on the home page). */
  label: string | null;
  /** Big headline on the image. */
  headline: string;
  /** One line under the headline. */
  sub: string;
  cta: string;
};

export const PAGES: Record<PageKey, PageMeta> = {
  home: {
    path: '/',
    title: 'MadeVisa — Jobs straight from company career pages',
    description: 'Skip the reposts. Live jobs from company career pages, which companies actually reply, and visa routes by country — in one place.',
    label: null,
    headline: 'Find your path with MadeVisa.',
    sub: "Live jobs straight from company career pages — with insights on who's hiring and who replies.",
    cta: 'Explore jobs',
  },
  jobs: {
    path: '/jobs',
    title: 'Live jobs from company career pages, updated daily | MadeVisa',
    description: 'Thousands of new jobs every day, straight from company career pages. Filter by country, visa sponsorship, salary and remote work.',
    label: 'Jobs',
    headline: 'Jobs straight from company career pages',
    sub: 'Filter by country, visa sponsorship, salary and remote work.',
    cta: 'Browse jobs',
  },
  programs: {
    path: '/programs',
    title: 'Programs from official sources | MadeVisa',
    description: 'Government, university and exchange programs from official sources — checked before they are listed.',
    label: 'Programs',
    headline: 'Programs from official sources',
    sub: 'Government, university and exchange programs — checked before they’re listed.',
    cta: 'See programs',
  },
  study: {
    path: '/study',
    title: 'Study abroad, from official sources | MadeVisa',
    description: 'Degrees, scholarships and study visas from official sources, in one place.',
    label: 'Study',
    headline: 'Study abroad, from official sources',
    sub: 'Degrees, scholarships and study visas — in one place.',
    cta: 'Explore study',
  },
  companies: {
    path: '/companies',
    title: 'Insights — which companies reply, who is hiring and who sponsors visas | MadeVisa',
    description: 'Reply rates from real applicants, hiring activity and visa sponsorship for every company — check before you apply.',
    label: 'Insights',
    headline: "Who's hiring — and who actually replies",
    sub: 'Hiring activity and reply rates from real applicants, for every company.',
    cta: 'See company scores',
  },
  destinations: {
    path: '/destinations',
    title: 'Where can your passport take you? Visa routes by country | MadeVisa',
    description: 'Check which visa routes you qualify for in 21 countries, with live visa-sponsored jobs and the companies hiring there.',
    label: 'Destinations',
    headline: 'Where can you go?',
    sub: 'Visa routes, sponsorship rates and companies hiring — country by country.',
    cta: 'Check your routes',
  },
  network: {
    path: '/network',
    title: 'Recruiters — hiring managers and recruiters who hire across borders | MadeVisa',
    description: 'Hiring managers, recruiters and visa experts who hire internationally, and the employers that sponsor visas. Contact details are never shown.',
    label: 'Recruiters',
    headline: 'Recruiters on MadeVisa',
    sub: 'Hiring managers, recruiters and visa experts who hire across borders.',
    cta: 'List yourself as a recruiter',
  },
  feedback: {
    path: '/feedback',
    title: 'How did your application really go? | MadeVisa',
    description: 'Share how your job application went — no reply, rejection, interview or offer. Private, and it shows which companies really reply.',
    label: 'Hiring Feedback',
    headline: 'How did your application go?',
    sub: 'Share it in 20 seconds, privately — and see which companies really reply.',
    cta: 'Share feedback',
  },
};

export function pageKeyForPath(pathname: string): PageKey | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  for (const [key, meta] of Object.entries(PAGES) as [PageKey, PageMeta][]) if (meta.path === p) return key;
  if (p === '/experts') return 'network';
  return null;
}
