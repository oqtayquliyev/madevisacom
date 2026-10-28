// One place for every public page's <title> and meta description.
//
// Imported by BOTH the server-rendered HTML (api/seo.ts) and the React pages
// (useSeo), so Google sees the same title and description in the raw HTML and
// in the rendered page. Before this, the homepage alone had three different
// titles depending on where you looked, which weakens the brand signal.
//
// Pure data, no imports from the app, so the edge function can use it.
//
// Rules: say what the page really is; "MadeVisa" once (useSeo / api/seo add
// " | MadeVisa" when a title doesn't already contain it); aim for ≤ 60
// characters before the brand; descriptions 120–160 characters; never claim a
// company sponsors visas unless the data on the page says so.

export type StaticMeta = { title: string; description: string };

export const SEO_META = {
  home: {
    title: 'MadeVisa — Find Jobs Abroad with Visa Sponsorship',
    description:
      'Live jobs straight from company career pages, filterable by visa sponsorship, country and remote work. Upload your CV once and see your match on every job — free.',
  },
  jobs: {
    title: 'Jobs Abroad & Visa Sponsorship Jobs, Live from Employers',
    description:
      'Search live jobs taken straight from company career pages. Filter by country, visa sponsorship, remote or hybrid, salary and experience — updated every day.',
  },
  companies: {
    title: 'Company Scores: Who’s Hiring, Who Replies & Who Sponsors Visas',
    description:
      'Check a company before you apply: open jobs, hiring activity, how often it replies to applicants and whether it sponsors visas — from real data on MadeVisa.',
  },
  destinations: {
    title: 'Work Visas by Country: Routes, Sponsored Jobs & Companies Hiring',
    description:
      'Compare work, talent and job-search visa routes in 20+ countries, with years to permanent residence, live visa-sponsored jobs and the companies hiring there.',
  },
  offers: {
    title: 'Visa Plan — a Sponsorship Proposal for Your Job Application',
    description:
      'Job ad doesn’t mention a visa? Attach a Visa Plan: a one-page sponsorship proposal with the visa route, the employer’s steps and who pays what.',
  },
  cvMatch: {
    title: 'CV Match — See How Well Your CV Fits a Job Before You Apply',
    description:
      'Upload your CV once. On every job, MadeVisa shows a match score, the skills the ad asks for that your CV doesn’t show, and what to change. Part of the MadeVisa Membership.',
  },
  pricing: {
    title: 'MadeVisa Pricing — 3 Months for $2.99',
    description: '', // built from live prices (see api/seo.ts and PricingPage)
  },
  jobMarket: {
    title: 'Job Market Insights — Who’s Hiring, Where and How, Updated Hourly',
    description: '', // built from live numbers
  },
  network: {
    title: 'Company Hiring Contacts — Emails of Companies That Hire',
    description:
      'Companies and their hiring emails, with the ones that sponsor visas first, and how many jobs they have open on MadeVisa.',
  },
  feedback: {
    title: 'GhostGood — How Companies Really Respond to Applicants',
    description:
      'Share how your job application went — no reply, rejection, interview or offer. Private, reviewed, and it shows which companies really reply.',
  },
  officialSources: {
    title: 'Official Immigration & Government Sources by Country',
    description:
      'Official immigration, investment, education and research institutions from around the world — the public sources MadeVisa links to. Not partnerships.',
  },
  blog: {
    title: 'MadeVisa Blog — Hiring Reports, Visa Guides & Job-Search Advice',
    description: 'Weekly hiring reports from live jobs, visa guides by country and practical advice for applying — and hiring — across borders.',
  },
  programs: {
    title: 'Programs: Government, Work, Training & Relocation',
    description:
      'Official programs from governments, companies and organizations: work, training, relocation, volunteer and immigration programs, at home or abroad.',
  },
  study: {
    title: 'Study Abroad: Scholarships, Universities & Courses',
    description:
      'Scholarships, university programs, language courses and exchanges from official sources, with funding and application deadlines in one place.',
  },
} satisfies Record<string, StaticMeta>;

/**
 * Programs and Study are shown as "soon" in the menu and have no listings yet.
 * Until they do, they stay out of Google's index (an empty page indexed now
 * is a thin page Google remembers). Flip to false when they launch.
 */
export const COMING_SOON_NOINDEX = { programs: true, study: true } as const;

// ---------------------------------------------------------------------------
// Templates for pages built from data
// ---------------------------------------------------------------------------

/** "Software Engineer at Acme, Berlin, Germany (Visa Sponsorship)" — useSeo/api add " | MadeVisa". */
export function jobTitleMeta(j: { title: string; company: string; location?: string | null; visa?: boolean | null }): string {
  return `${j.title} at ${j.company}${j.location ? `, ${j.location}` : ''}${j.visa ? ' (Visa Sponsorship)' : ''}`;
}

/**
 * Company pages answer "is X hiring / do they reply". Visa sponsorship is only
 * named where the page has evidence for it (UK sponsor register) — see
 * companyDescriptionMeta — never in the generic title.
 */
export function companyTitleMeta(name: string): string {
  return `${name} Jobs, Hiring Activity & Applicant Reply Rate`;
}

export function companyDescriptionMeta(name: string, openJobs: number | null | undefined, ukSponsor = false): string {
  const jobs = openJobs ? `${openJobs.toLocaleString('en-US')} open ${openJobs === 1 ? 'job' : 'jobs'} at ${name}` : `Jobs at ${name}`;
  return ukSponsor
    ? `Does ${name} sponsor visas? It holds a UK sponsor licence (Home Office register). ${jobs}, hiring activity and how often it replies to applicants.`
    : `${jobs}, straight from its careers page — plus hiring activity and how often it replies to applicants, from real applicant data.`;
}

export function destinationTitleMeta(country: string): string {
  return `Work in ${country}: Visa Routes, Sponsored Jobs & Companies Hiring`;
}

export function destinationDescriptionMeta(country: string): string {
  return `Visa routes for working in ${country}, years to permanent residence and citizenship, plus live visa-sponsored jobs and the companies hiring there.`;
}

/**
 * Some imported jobs carry a street address in the city field
 * ("Rothschildplatz 4"). Fine on the page, wrong in a search title —
 * drop any location part that contains a digit.
 */
export function titleLocation(location: string | null | undefined): string {
  return (location ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/\d/.test(s))
    .join(', ');
}
