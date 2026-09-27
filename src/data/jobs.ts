import type { EligibilityCriteria } from '@/lib/personalization';

/**
 * Shared job-board data: types, curated (mock) listings, and filter
 * option lists. See src/data/sources/arbeitnow.ts for a real, live data
 * source that gets normalized into this same `Job` shape.
 */

export type Job = {
  id: string;
  title: string;
  company: string;
  country: string;
  countryCode: string;
  city: string;
  salary?: string;
  type: string;
  remote: boolean;
  category: string;
  source: string;
  published: string;
  url: string;
  verified: boolean;
  eligibility: EligibilityCriteria;
  /** Set for jobs posted by a verified sponsor (agency/company/government);
   *  drives the distinct icon + "Sponsored" badge on the job card. */
  publisherOrgType?: 'government' | 'company' | 'agency' | 'expert';
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  visaSponsorship?: boolean;
  additionalLocations?: string[] | null;
  spotsAvailable?: number | null;
  imageUrl?: string | null;
  /** Original posting date on the source career site (ISO string), when known — distinct from `published`. Null/undefined renders as "Not specified" rather than being silently hidden. */
  postedDate?: string | null;
  /** When the job went live on MadeVisa (approved_at, else created_at) — drives "newest" ordering. */
  sharedAt?: string | null;
  experienceLevel?: string | null;
  workArrangement?: 'onsite' | 'hybrid' | 'remote' | null;
  visaStatus?: 'offered' | 'not_offered' | null;
  /** Last time a sync confirmed the job is still on the company's careers page. */
  lastSeenAt?: string | null;
  /** The company took this job down; it stays visible, greyed out, for 24 hours. */
  closed?: boolean;
  closedAt?: string | null;
  /** Where this listing actually came from, for the "Added by MadeVisa" vs "Posted by company" distinction — never inferred/guessed, only set where the source is genuinely known:
   *  - 'company_submitted': a verified company account (a real owner_id on the publisher) posted this directly.
   *  - 'company_careers': imported by MadeVisa staff from a company's own public careers page (see supabase/functions/import-ats-jobs) — no publisher owner account behind it.
   *  - 'live_feed': pulled in real time from a public job-board API (Arbeitnow) — not a MadeVisa import of one specific company's page, and not company-submitted either. */
  sourceType?: 'company_submitted' | 'company_careers' | 'live_feed';
};

export const countries = [
  {
    name: 'Canada',
    code: 'CA',
  },
  {
    name: 'Germany',
    code: 'DE',
  },
  {
    name: 'United Kingdom',
    code: 'GB',
  },
  {
    name: 'Australia',
    code: 'AU',
  },
  {
    name: 'United States',
    code: 'US',
  },
  {
    name: 'Netherlands',
    code: 'NL',
  },
  {
    name: 'Ireland',
    code: 'IE',
  },
  {
    name: 'Switzerland',
    code: 'CH',
  },
];

export const jobs: Job[] = [
  // Real, verified sponsored jobs come from Supabase (see src/lib/sponsoredJobs.ts).
  // This curated placeholder list has been intentionally emptied out.
];

export const categories = [
  'All categories',
  'Technology',
  'Design',
  'Engineering',
  'Healthcare',
  'Finance',
  'Marketing',
  'Business',
  'Education',
];

export const jobTypes = [
  'All types',
  'Full time',
  'Part time',
  'Contract',
];

