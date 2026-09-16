import type { EligibilityCriteria } from '@/lib/personalization';

export type OpportunityKind = 'job' | 'program';

export type Opportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  organization: string;
  country: string;
  countryCode: string;
  city?: string;
  category: string;
  /** e.g. "Full time", "Internship", "Scholarship", "Exchange", "Work & Travel" */
  type: string;
  remote?: boolean;
  /** salary for jobs, funding/stipend for programs */
  compensation?: string;
  duration?: string;
  published: string;
  source: string;
  url: string;
  verified: boolean;
  eligibility: EligibilityCriteria;
};

/* -------------------------------------------------------------------- */
/*  MOCK DATA                                                            */
/*  Replace/extend via the OpportunitySource adapters below once real   */
/*  API keys are wired up. See OPPORTUNITIES.md at the project root for */
/*  a step-by-step guide on adding new sources.                          */
/* -------------------------------------------------------------------- */

export const jobOpportunities: Opportunity[] = [
  {
    id: 'job-001',
    kind: 'job',
    title: 'Senior Product Designer',
    organization: 'Shopify',
    country: 'Canada',
    countryCode: 'CA',
    city: 'Toronto',
    category: 'Design',
    type: 'Full time',
    remote: true,
    compensation: 'CAD 100k – 130k',
    published: '2 hours ago',
    source: 'Adzuna',
    url: 'https://www.shopify.com/careers',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-002',
    kind: 'job',
    title: 'Software Engineer',
    organization: 'Tech Company',
    country: 'Canada',
    countryCode: 'CA',
    city: 'Vancouver',
    category: 'Technology',
    type: 'Full time',
    remote: false,
    compensation: 'CAD 90k – 120k',
    published: '4 hours ago',
    source: 'Adzuna',
    url: 'https://www.adzuna.ca/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'destination-country' },
  },
  {
    id: 'job-003',
    kind: 'job',
    title: 'UX Designer',
    organization: 'Digital Studio',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Berlin',
    category: 'Design',
    type: 'Full time',
    remote: true,
    compensation: '€55k – €75k',
    published: '5 hours ago',
    source: 'Jooble',
    url: 'https://de.jooble.org/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-004',
    kind: 'job',
    title: 'Frontend Developer',
    organization: 'Technology Group',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Munich',
    category: 'Technology',
    type: 'Full time',
    remote: false,
    compensation: '€60k – €85k',
    published: '7 hours ago',
    source: 'Adzuna',
    url: 'https://de.indeed.com/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-005',
    kind: 'job',
    title: 'Product Manager',
    organization: 'Fintech Company',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'London',
    category: 'Business',
    type: 'Full time',
    remote: true,
    compensation: '£70k – £95k',
    published: '1 day ago',
    source: 'Adzuna',
    url: 'https://www.adzuna.co.uk/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 21, currentLocation: 'any' },
  },
  {
    id: 'job-006',
    kind: 'job',
    title: 'Mechanical Engineer',
    organization: 'Engineering Group',
    country: 'Australia',
    countryCode: 'AU',
    city: 'Sydney',
    category: 'Engineering',
    type: 'Full time',
    remote: false,
    compensation: 'AUD 95k – 125k',
    published: '1 day ago',
    source: 'Jooble',
    url: 'https://au.jooble.org/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-007',
    kind: 'job',
    title: 'Data Analyst',
    organization: 'Analytics Company',
    country: 'Netherlands',
    countryCode: 'NL',
    city: 'Amsterdam',
    category: 'Technology',
    type: 'Full time',
    remote: true,
    compensation: '€50k – €70k',
    published: '1 day ago',
    source: 'Adzuna',
    url: 'https://www.adzuna.nl/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-008',
    kind: 'job',
    title: 'Healthcare Specialist',
    organization: 'Health Group',
    country: 'Ireland',
    countryCode: 'IE',
    city: 'Dublin',
    category: 'Healthcare',
    type: 'Full time',
    remote: false,
    compensation: '€45k – €60k',
    published: '2 days ago',
    source: 'Adzuna',
    url: 'https://www.adzuna.ie/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 21, currentLocation: 'any' },
  },
];

export const programOpportunities: Opportunity[] = [
  {
    id: 'prog-001',
    kind: 'program',
    title: 'Erasmus+ Exchange Semester',
    organization: 'European Commission',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Berlin',
    category: 'Exchange program',
    type: 'Exchange',
    compensation: 'Stipend €400–850 / month',
    duration: '3–6 months',
    published: '3 days ago',
    source: 'Erasmus+',
    url: 'https://erasmus-plus.ec.europa.eu/',
    verified: true,
    eligibility: {
      citizenship: 'any',
      minAge: 18,
      maxAge: 30,
      currentLocation: 'any',
    },
  },
  {
    id: 'prog-002',
    kind: 'program',
    title: 'Working Holiday Visa Program',
    organization: 'Government of Canada',
    country: 'Canada',
    countryCode: 'CA',
    category: 'Work & Travel',
    type: 'Work & Travel',
    compensation: 'Open work permit',
    duration: 'Up to 24 months',
    published: '5 days ago',
    source: 'IRCC',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/working-canada-permit/iec.html',
    verified: true,
    eligibility: {
      citizenship: ['AZ', 'TR', 'GB', 'BR'],
      minAge: 18,
      maxAge: 35,
      currentLocation: 'any',
    },
  },
  {
    id: 'prog-003',
    kind: 'program',
    title: 'Chevening Scholarship',
    organization: 'UK Government',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'London',
    category: 'Scholarship',
    type: 'Scholarship',
    compensation: 'Full tuition + stipend',
    duration: '1 year',
    published: '1 week ago',
    source: 'Chevening',
    url: 'https://www.chevening.org/',
    verified: true,
    eligibility: {
      citizenship: 'any',
      excludedCitizenship: ['GB', 'US'],
      minAge: 18,
      currentLocation: 'any',
    },
  },
  {
    id: 'prog-004',
    kind: 'program',
    title: 'Au Pair Cultural Exchange',
    organization: 'AuPairWorld Network',
    country: 'France',
    countryCode: 'FR',
    city: 'Paris',
    category: 'Cultural exchange',
    type: 'Cultural Exchange',
    compensation: 'Room, board + pocket money',
    duration: '6–12 months',
    published: '4 days ago',
    source: 'AuPairWorld',
    url: 'https://www.aupairworld.com/',
    verified: true,
    eligibility: {
      citizenship: 'any',
      minAge: 18,
      maxAge: 29,
      currentLocation: 'any',
    },
  },
  {
    id: 'prog-005',
    kind: 'program',
    title: 'Skilled Trades Apprenticeship',
    organization: 'Swiss Federal Office',
    country: 'Switzerland',
    countryCode: 'CH',
    city: 'Zurich',
    category: 'Apprenticeship',
    type: 'Apprenticeship',
    compensation: 'CHF 800–1,200 / month',
    duration: '2–4 years',
    published: '6 days ago',
    source: 'SEFRI',
    url: 'https://www.sbfi.admin.ch/',
    verified: true,
    eligibility: {
      citizenship: 'any',
      minAge: 16,
      maxAge: 28,
      currentLocation: 'destination-country',
    },
  },
  {
    id: 'prog-006',
    kind: 'program',
    title: 'Global Talent Investor Program',
    organization: 'UAE Ministry of Economy',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    city: 'Dubai',
    category: 'Investment / Golden Visa',
    type: 'Investor Program',
    compensation: 'From AED 2,000,000 investment',
    duration: '10-year residency',
    published: '2 weeks ago',
    source: 'UAE Government',
    url: 'https://u.ae/en/information-and-services/visa-and-emirates-id/residence-visas/golden-visa',
    verified: true,
    eligibility: {
      citizenship: 'any',
      minAge: 21,
      currentLocation: 'any',
    },
  },
];

export const allOpportunities: Opportunity[] = [...jobOpportunities, ...programOpportunities];

/* -------------------------------------------------------------------- */
/*  SOURCE ADAPTER PATTERN                                               */
/*                                                                        */
/*  Every external provider (job board API, program directory, manual   */
/*  CMS spreadsheet, partner scraper) implements this interface. The     */
/*  board pages don't care where data comes from — they just call       */
/*  `loadOpportunities()` which fans out to every registered source and  */
/*  normalizes the result into the `Opportunity` shape above.            */
/*                                                                        */
/*  To add a new source:                                                 */
/*    1. Create src/data/sources/<name>.ts implementing OpportunitySource*/
/*    2. Map that provider's fields onto `Opportunity`, and fill in a    */
/*       best-guess `eligibility` (defaulting to permissive if unknown). */
/*    3. Register it in `sources` below.                                 */
/*    4. If it needs an API key, add it as a Vite env var (VITE_*) and   */
/*       call it from a serverless function/edge route rather than the   */
/*       browser once you're ready for production, to avoid exposing the*/
/*       key client-side.                                                */
/* -------------------------------------------------------------------- */

export type OpportunitySource = {
  id: string;
  label: string;
  kind: OpportunityKind;
  /** Fetches and normalizes listings from this provider. */
  fetchOpportunities: () => Promise<Opportunity[]>;
};

const mockJobSource: OpportunitySource = {
  id: 'mock-jobs',
  label: 'MadeVisa sample jobs',
  kind: 'job',
  fetchOpportunities: async () => jobOpportunities,
};

const mockProgramSource: OpportunitySource = {
  id: 'mock-programs',
  label: 'MadeVisa sample programs',
  kind: 'program',
  fetchOpportunities: async () => programOpportunities,
};

/**
 * Registered sources. In production this list would also include things
 * like `adzunaSource`, `joobleSource`, `erasmusFeedSource`, or a
 * `cmsSource` reading from a Supabase table your team edits directly.
 */
export const sources: OpportunitySource[] = [mockJobSource, mockProgramSource];

/** Fans out to every registered source and merges the results. */
export async function loadOpportunities(kind?: OpportunityKind): Promise<Opportunity[]> {
  const active = kind ? sources.filter((source) => source.kind === kind) : sources;
  const results = await Promise.all(active.map((source) => source.fetchOpportunities()));
  return results.flat();
}
