// One place for each top-level page's share text. Used by the page share
// image (api/og/page.ts) and by middleware.ts for link-preview tags.

import { SEO_META } from '../src/lib/seoMeta';

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
    title: SEO_META.home.title,
    description: SEO_META.home.description,
    label: null,
    headline: 'Find your path with MadeVisa.',
    sub: "Live jobs straight from company career pages — with insights on who's hiring and who replies.",
    cta: 'Explore jobs',
  },
  jobs: {
    path: '/jobs',
    title: SEO_META.jobs.title,
    description: SEO_META.jobs.description,
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
    title: SEO_META.companies.title,
    description: SEO_META.companies.description,
    label: 'Insights',
    headline: "Who's hiring — and who actually replies",
    sub: 'Hiring activity and reply rates from real applicants, for every company.',
    cta: 'See company scores',
  },
  destinations: {
    path: '/destinations',
    title: SEO_META.destinations.title,
    description: SEO_META.destinations.description,
    label: 'Destinations',
    headline: 'Where can you go?',
    sub: 'Visa routes, sponsorship rates and companies hiring — country by country.',
    cta: 'Check your routes',
  },
  network: {
    path: '/network',
    title: SEO_META.network.title,
    description: SEO_META.network.description,
    label: 'Recruiters',
    headline: 'Companies that sponsor visas',
    sub: 'Companies with live jobs that offer visa sponsorship, and how to contact them.',
    cta: 'See the companies',
  },
  feedback: {
    path: '/ghostgood',
    title: SEO_META.feedback.title,
    description: SEO_META.feedback.description,
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
