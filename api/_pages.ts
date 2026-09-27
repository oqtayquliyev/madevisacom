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
    title: 'MadeVisa | Jobs from the Source + Hiring Insights',
    description: 'Live jobs straight from company career pages, plus hiring insights: company scores, reply rates and hiring trends. Programs, study and visas too.',
    label: null,
    headline: 'Find your path with MadeVisa.',
    sub: "Live jobs straight from company career pages — with insights on who's hiring and who replies.",
    cta: 'Explore jobs',
  },
  jobs: {
    path: '/jobs',
    title: 'Jobs straight from company career pages | MadeVisa',
    description: 'Fresh jobs from company career pages every day. Filter by country, visa sponsorship, salary and remote work.',
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
    title: "Company Scores — who's hiring and who replies | MadeVisa",
    description: "See which companies are hiring, where, and how often they actually reply to applicants — from real application reports.",
    label: 'Company Scores',
    headline: "Who's hiring — and who actually replies",
    sub: 'Hiring activity and reply rates from real applicants, for every company.',
    cta: 'See company scores',
  },
  destinations: {
    path: '/destinations',
    title: 'Destinations — visa routes and sponsored jobs by country | MadeVisa',
    description: 'Visa routes you qualify for, live visa-sponsored jobs and the companies hiring, country by country.',
    label: 'Destinations',
    headline: 'Where can you go?',
    sub: 'Visa routes, sponsorship rates and companies hiring — country by country.',
    cta: 'Check your routes',
  },
  network: {
    path: '/network',
    title: 'The MadeVisa Network',
    description: 'Hiring managers who hire across borders, people ready to move, and the employers that sponsor visas.',
    label: 'Network',
    headline: 'The MadeVisa Network',
    sub: 'Hiring managers, recruiters and people ready to move — in one place.',
    cta: 'Join the Network',
  },
  feedback: {
    path: '/feedback',
    title: 'Hiring Feedback — how did your application go? | MadeVisa',
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
