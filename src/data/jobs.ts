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
  spotsAvailable?: number | null;
  imageUrl?: string | null;
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
  {
    id: 'job-001',
    title: 'Senior Product Designer',
    company: 'Shopify',
    country: 'Canada',
    countryCode: 'CA',
    city: 'Toronto',
    salary: 'CAD 100k to 130k',
    type: 'Full time',
    remote: true,
    category: 'Design',
    source: 'Adzuna',
    published: '2 hours ago',
    url: 'https://www.shopify.com/careers',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-002',
    title: 'Software Engineer',
    company: 'Tech Company',
    country: 'Canada',
    countryCode: 'CA',
    city: 'Vancouver',
    salary: 'CAD 90k to 120k',
    type: 'Full time',
    remote: false,
    category: 'Technology',
    source: 'Adzuna',
    published: '4 hours ago',
    url: 'https://www.adzuna.ca/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-003',
    title: 'UX Designer',
    company: 'Digital Studio',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Berlin',
    salary: '€55k to €75k',
    type: 'Full time',
    remote: true,
    category: 'Design',
    source: 'Jooble',
    published: '5 hours ago',
    url: 'https://de.jooble.org/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-004',
    title: 'Frontend Developer',
    company: 'Technology Group',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Munich',
    salary: '€60k to €85k',
    type: 'Full time',
    remote: false,
    category: 'Technology',
    source: 'Adzuna',
    published: '7 hours ago',
    url: 'https://de.indeed.com/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-005',
    title: 'Product Manager',
    company: 'Fintech Company',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'London',
    salary: '£70k to £95k',
    type: 'Full time',
    remote: true,
    category: 'Business',
    source: 'Adzuna',
    published: '1 day ago',
    url: 'https://www.adzuna.co.uk/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-006',
    title: 'Mechanical Engineer',
    company: 'Engineering Group',
    country: 'Australia',
    countryCode: 'AU',
    city: 'Sydney',
    salary: 'AUD 95k to 125k',
    type: 'Full time',
    remote: false,
    category: 'Engineering',
    source: 'Jooble',
    published: '1 day ago',
    url: 'https://au.jooble.org/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-007',
    title: 'Data Analyst',
    company: 'Analytics Company',
    country: 'Netherlands',
    countryCode: 'NL',
    city: 'Amsterdam',
    salary: '€50k to €70k',
    type: 'Full time',
    remote: true,
    category: 'Technology',
    source: 'Adzuna',
    published: '1 day ago',
    url: 'https://www.adzuna.nl/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-008',
    title: 'Healthcare Specialist',
    company: 'Health Group',
    country: 'Ireland',
    countryCode: 'IE',
    city: 'Dublin',
    salary: '€48k to €68k',
    type: 'Full time',
    remote: false,
    category: 'Healthcare',
    source: 'Jooble',
    published: '2 days ago',
    url: 'https://ie.jooble.org/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-009',
    title: 'Software Developer',
    company: 'Technology Company',
    country: 'Switzerland',
    countryCode: 'CH',
    city: 'Zurich',
    salary: 'CHF 90k to 120k',
    type: 'Full time',
    remote: true,
    category: 'Technology',
    source: 'Adzuna',
    published: '2 days ago',
    url: 'https://www.adzuna.ch/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
  {
    id: 'job-010',
    title: 'Marketing Manager',
    company: 'Consumer Brand',
    country: 'United States',
    countryCode: 'US',
    city: 'New York',
    salary: 'USD 80k to 110k',
    type: 'Full time',
    remote: true,
    category: 'Marketing',
    source: 'Adzuna',
    published: '2 days ago',
    url: 'https://www.adzuna.com/',
    verified: true,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  },
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

