import { supabase } from '@/lib/supabase';
import { PUBLISHING_CONTACT_EMAIL, type OrgType } from '@/lib/programs';
import type { EligibilityCriteria } from '@/lib/personalization';
import { formatSalary, type ListingStatus, type SalaryStatus, type SalaryPeriod } from '@/lib/listingCategories';

export type SponsoredJob = {
  id: string;
  publisher_id: string;
  title: string;
  description: string | null;
  category: string;
  employment_type: string;
  remote: boolean;
  country_id: string | null;
  city: string | null;
  compensation_text: string | null;
  salary_status: SalaryStatus;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: SalaryPeriod;
  visa_sponsorship: boolean;
  experience_level: string | null;
  education_level: string | null;
  languages: string[] | null;
  application_deadline: string | null;
  benefits: string | null;
  requirements: string | null;
  spots_available: number | null;
  image_url: string | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  citizenship_excluded: string[] | null;
  min_age: number | null;
  max_age: number | null;
  official_url: string | null;
  application_url: string | null;
  contact_email: string;
  status: ListingStatus;
  // Admin-only — never surfaced in public UI.
  admin_notes: string | null;
  source_verified: boolean;
  needs_info_message: string | null;
  created_at: string;
  approved_at: string | null;
  expires_at: string | null;
  source_posted_at: string | null;
  additional_locations: string[] | null;
  publisher?: { id: string; name: string; org_type: OrgType; logo_url: string | null };
  country?: { id: string; name: string; iso_code: string };
};

const columns =
  'id, publisher_id, title, description, category, employment_type, remote, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, benefits, requirements, spots_available, image_url, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, official_url, application_url, contact_email, status, admin_notes, source_verified, needs_info_message, created_at, approved_at, expires_at, source_posted_at, additional_locations, publisher:program_publishers(id, name, org_type, logo_url), country:countries(id, name, iso_code)';

export function toEligibilityCriteria(job: SponsoredJob): EligibilityCriteria {
  return {
    citizenship: job.citizenship_any ? 'any' : job.citizenship_allowed ?? [],
    excludedCitizenship: job.citizenship_excluded ?? undefined,
    minAge: job.min_age ?? undefined,
    maxAge: job.max_age ?? undefined,
    currentLocation: 'any',
  };
}

/** Fetches published sponsored jobs — meant to be merged into the main Jobs board. */
export async function fetchPublishedSponsoredJobs(): Promise<SponsoredJob[]> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(columns)
    .eq('status', 'published')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchPublishedSponsoredJobs failed', error);
    return [];
  }
  return (data ?? []) as unknown as SponsoredJob[];
}

export async function fetchMySponsoredJobs(publisherId: string): Promise<SponsoredJob[]> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(columns)
    .eq('publisher_id', publisherId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchMySponsoredJobs failed', error);
    return [];
  }
  return (data ?? []) as unknown as SponsoredJob[];
}

export async function updateMySponsoredJob(
  id: string,
  patch: Partial<Pick<SponsoredJob, 'title' | 'description' | 'compensation_text' | 'requirements' | 'official_url'>>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('sponsored_jobs').update(patch).eq('id', id);
  if (error) {
    console.error('updateMySponsoredJob failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Fetches one published sponsored job by id — for the public job detail page. */
export async function fetchSponsoredJobById(id: string): Promise<SponsoredJob | null> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(columns)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('fetchSponsoredJobById failed', error);
    return null;
  }
  return data as unknown as SponsoredJob | null;
}

/**
 * Normalizes a published sponsored job into the same `Job` shape the
 * Jobs board already renders (curated + Arbeitnow-live jobs) — see
 * src/data/jobs.ts. Keeps JobsPage.tsx from needing to know about
 * sponsored jobs' own shape at all.
 */
export function sponsoredJobToBoardJob(job: SponsoredJob): import('@/data/jobs').Job {
  return {
    id: `sponsored-${job.id}`,
    title: job.title,
    company: job.publisher?.name ?? 'Verified sponsor',
    country: job.country?.name ?? 'Various',
    countryCode: job.country?.iso_code ?? '',
    city: job.remote ? 'Remote' : (job.country?.name ?? ''),
    salary: formatSalary(job) ?? undefined,
    type: job.employment_type,
    remote: job.remote,
    category: job.category,
    source: 'Sponsored',
    published: 'Sponsored listing',
    url: job.official_url ?? '#',
    verified: true,
    eligibility: toEligibilityCriteria(job),
    publisherOrgType: job.publisher?.org_type,
    description: job.description,
    requirements: job.requirements,
    benefits: job.benefits,
    visaSponsorship: job.visa_sponsorship,
    additionalLocations: job.additional_locations,
    spotsAvailable: job.spots_available,
    imageUrl: job.image_url,
    postedDate: job.source_posted_at,
  };
}

export type SubmitSponsoredJobInput = {
  publisherId: string;
  title: string;
  description?: string;
  category: string;
  employmentType: string;
  remote: boolean;
  countryId?: string;
  city?: string;
  compensationText?: string;
  requirements?: string;
  spotsAvailable?: number;
  imageUrl?: string;
  citizenshipAny: boolean;
  citizenshipAllowed?: string[];
  minAge?: number;
  maxAge?: number;
  officialUrl?: string;
  /** The publisher's own contact email — shown to admins on review. */
  contactEmail?: string;
};

/** Submits a sponsored job for review. Lands as `status = 'pending'` until an admin publishes it. */
export async function submitSponsoredJob(input: SubmitSponsoredJobInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('sponsored_jobs').insert({
    publisher_id: input.publisherId,
    title: input.title,
    description: input.description || null,
    category: input.category,
    employment_type: input.employmentType,
    remote: input.remote,
    country_id: input.countryId || null,
    city: input.city || null,
    compensation_text: input.compensationText || null,
    requirements: input.requirements || null,
    spots_available: input.spotsAvailable ?? null,
    image_url: input.imageUrl || null,
    citizenship_any: input.citizenshipAny,
    citizenship_allowed: input.citizenshipAny ? null : input.citizenshipAllowed ?? [],
    min_age: input.minAge ?? null,
    max_age: input.maxAge ?? null,
    official_url: input.officialUrl || null,
    contact_email: input.contactEmail || PUBLISHING_CONTACT_EMAIL,
    status: 'pending',
  });

  if (error) {
    console.error('submitSponsoredJob failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
