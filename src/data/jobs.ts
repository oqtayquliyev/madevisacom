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
  'Business',
  'Healthcare',
  'Marketing',
];

export const jobTypes = [
  'All types',
  'Full time',
  'Part time',
  'Contract',
];

