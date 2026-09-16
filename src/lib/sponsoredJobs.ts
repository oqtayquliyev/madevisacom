import { supabase } from '@/lib/supabase';
import { PUBLISHING_CONTACT_EMAIL, type OrgType } from '@/lib/programs';
import type { EligibilityCriteria } from '@/lib/personalization';

export type SponsoredJob = {
  id: string;
  publisher_id: string;
  title: string;
  description: string | null;
  category: string;
  employment_type: string;
  remote: boolean;
  country_id: string | null;
  compensation_text: string | null;
  requirements: string | null;
  spots_available: number | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  citizenship_excluded: string[] | null;
  min_age: number | null;
  max_age: number | null;
  official_url: string | null;
  contact_email: string;
  status: 'pending' | 'published' | 'rejected';
  publisher?: { id: string; name: string; org_type: OrgType; logo_url: string | null };
  country?: { id: string; name: string; iso_code: string };
};

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
    .select(
      'id, publisher_id, title, description, category, employment_type, remote, country_id, compensation_text, requirements, spots_available, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, official_url, contact_email, status, publisher:program_publishers(id, name, org_type, logo_url), country:countries(id, name, iso_code)'
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchPublishedSponsoredJobs failed', error);
    return [];
  }
  return (data ?? []) as unknown as SponsoredJob[];
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
    salary: job.compensation_text ?? undefined,
    type: job.employment_type,
    remote: job.remote,
    category: job.category,
    source: 'Sponsored',
    published: 'Sponsored listing',
    url: job.official_url ?? '#',
    verified: true,
    eligibility: toEligibilityCriteria(job),
    publisherOrgType: job.publisher?.org_type,
    requirements: job.requirements,
    spotsAvailable: job.spots_available,
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
  compensationText?: string;
  requirements?: string;
  spotsAvailable?: number;
  citizenshipAny: boolean;
  citizenshipAllowed?: string[];
  minAge?: number;
  maxAge?: number;
  officialUrl?: string;
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
    compensation_text: input.compensationText || null,
    requirements: input.requirements || null,
    spots_available: input.spotsAvailable ?? null,
    citizenship_any: input.citizenshipAny,
    citizenship_allowed: input.citizenshipAny ? null : input.citizenshipAllowed ?? [],
    min_age: input.minAge ?? null,
    max_age: input.maxAge ?? null,
    official_url: input.officialUrl || null,
    contact_email: PUBLISHING_CONTACT_EMAIL,
    status: 'pending',
  });

  if (error) {
    console.error('submitSponsoredJob failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
