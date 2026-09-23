import { supabase } from '@/lib/supabase';
import type { OrgType } from '@/lib/programs';
import type { ListingStatus, SalaryStatus, SalaryPeriod, CostStatus } from '@/lib/listingCategories';
import { JOB_CATEGORIES, type JobCategory } from '@/lib/listingCategories';
import { matchCountriesFromOfficeNames } from '@/lib/officeLocations';
import { classifyJobFunctionFromTitle } from '@/lib/jobCategories';

export type PendingPublisher = {
  id: string;
  org_type: OrgType;
  name: string;
  website: string | null;
  contact_email: string;
  verification_status: string;
  created_at: string;
  country?: { name: string; iso_code: string } | null;
};

export type PendingProgram = {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

export type PendingSponsoredJob = {
  id: string;
  title: string;
  category: string;
  employment_type: string;
  status: string;
  created_at: string;
  publisher?: { id: string; name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

export type PendingAgency = {
  id: string;
  name: string;
  email: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  verification_status: string;
  created_at: string;
};

const publisherColumns =
  'id, org_type, name, website, contact_email, verification_status, created_at, country:countries(name, iso_code)';
const programColumns =
  'id, title, category, status, created_at, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const sponsoredJobColumns =
  'id, title, category, employment_type, status, created_at, publisher:program_publishers(id, name, org_type), country:countries(name, iso_code)';
const agencyColumns = 'id, name, email, country, city, website, verification_status, created_at';

// PostgREST (what Supabase's data API runs on) caps a single response at
// 1000 rows by default, silently — a query that matches more rows just
// comes back truncated, with no error. That's invisible for most of this
// admin panel's tables, but a single ATS import (see src/lib/atsImport.ts)
// can land 1000+ pending jobs for one company in one go, so anything that
// lists "all pending jobs" or "all jobs" has to page through in batches
// of 1000 and concatenate, or it'll quietly under-report — e.g. showing
// "Roche (1000)" when there are actually 1290.
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return rows;
}

export async function fetchPendingPublishers(): Promise<PendingPublisher[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select(publisherColumns)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingPublishers failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingPublisher[];
}

export async function fetchVerifiedPublishers(): Promise<PendingPublisher[]> {
  const { data, error } = await supabase
    .from('program_publishers')
    .select(publisherColumns)
    .eq('verification_status', 'verified')
    .order('name', { ascending: true });
  if (error) {
    console.error('fetchVerifiedPublishers failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingPublisher[];
}

export async function fetchPendingPrograms(): Promise<PendingProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select(programColumns)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingPrograms failed', error);
    return [];
  }
  return (data ?? []) as unknown as PendingProgram[];
}

export async function fetchPendingSponsoredJobs(): Promise<PendingSponsoredJob[]> {
  try {
    return await fetchAllRows<PendingSponsoredJob>((from, to) =>
      supabase
        .from('sponsored_jobs')
        .select(sponsoredJobColumns)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: PendingSponsoredJob[] | null; error: { message: string } | null }>
    );
  } catch (error) {
    console.error('fetchPendingSponsoredJobs failed', error);
    return [];
  }
}

export async function fetchPendingAgencies(): Promise<PendingAgency[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select(agencyColumns)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingAgencies failed', error);
    return [];
  }
  return data ?? [];
}

export async function fetchVerifiedAgencies(): Promise<PendingAgency[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select(agencyColumns)
    .eq('verification_status', 'verified')
    .order('name', { ascending: true });
  if (error) {
    console.error('fetchVerifiedAgencies failed', error);
    return [];
  }
  return data ?? [];
}

export type AdminProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

export type AdminProgram = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: ListingStatus;
  created_at: string;
  approved_at: string | null;
  expires_at: string | null;
  country_id: string | null;
  city: string | null;
  duration_text: string | null;
  eligibility_notes: string | null;
  benefits: string | null;
  funding_text: string | null;
  cost_status: CostStatus;
  cost_amount_min: number | null;
  cost_amount_max: number | null;
  cost_currency: string;
  requirements: string | null;
  official_url: string | null;
  application_url: string | null;
  image_url: string | null;
  spots_available: number | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  min_age: number | null;
  max_age: number | null;
  applications_open_at: string | null;
  applications_close_at: string | null;
  admin_notes: string | null;
  source_verified: boolean;
  needs_info_message: string | null;
  contact_email: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

export type AdminSponsoredJob = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  employment_type: string;
  /** The job's actual function/department (Design, Engineering, Legal &
   * Public Affairs, ...) — separate from `category`/`employment_type`
   * above, which have always meant employment type in this app (see
   * JOB_CATEGORIES). Free text, not constrained to a fixed list, since
   * source sites phrase this a hundred different ways; null when the
   * source didn't expose one. */
  job_function: string | null;
  remote: boolean;
  status: ListingStatus;
  created_at: string;
  approved_at: string | null;
  expires_at: string | null;
  /** Original posting date on the source career site (e.g. Roche's own
   * listing date), distinct from created_at (when MadeVisa imported it).
   * Null when the source didn't expose one, or for jobs not from an ATS
   * import. */
  source_posted_at: string | null;
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
  official_url: string | null;
  application_url: string | null;
  image_url: string | null;
  citizenship_any: boolean;
  citizenship_allowed: string[] | null;
  min_age: number | null;
  max_age: number | null;
  admin_notes: string | null;
  source_verified: boolean;
  needs_info_message: string | null;
  contact_email: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

const adminProgramColumns =
  'id, title, description, category, status, created_at, approved_at, expires_at, country_id, city, duration_text, eligibility_notes, benefits, funding_text, cost_status, cost_amount_min, cost_amount_max, cost_currency, requirements, official_url, application_url, image_url, spots_available, citizenship_any, citizenship_allowed, min_age, max_age, applications_open_at, applications_close_at, admin_notes, source_verified, needs_info_message, contact_email, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const adminSponsoredJobColumns =
  'id, title, description, category, employment_type, job_function, remote, status, created_at, approved_at, expires_at, source_posted_at, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, benefits, requirements, official_url, application_url, image_url, citizenship_any, citizenship_allowed, min_age, max_age, admin_notes, source_verified, needs_info_message, contact_email, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';

export async function fetchAllPrograms(): Promise<AdminProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select(adminProgramColumns)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchAllPrograms failed', error);
    return [];
  }
  return (data ?? []) as unknown as AdminProgram[];
}

export async function fetchAllSponsoredJobs(): Promise<AdminSponsoredJob[]> {
  try {
    return await fetchAllRows<AdminSponsoredJob>((from, to) =>
      supabase
        .from('sponsored_jobs')
        .select(adminSponsoredJobColumns)
        .order('created_at', { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: AdminSponsoredJob[] | null; error: { message: string } | null }>
    );
  } catch (error) {
    console.error('fetchAllSponsoredJobs failed', error);
    return [];
  }
}

/** One job, any status — for the full-page admin editor (src/pages/admin/AdminJobEditorPage.tsx), which needs to open a draft/pending/rejected job just as well as a published one. */
export async function fetchSponsoredJobByIdAsAdmin(id: string): Promise<AdminSponsoredJob | null> {
  const { data, error } = await supabase.from('sponsored_jobs').select(adminSponsoredJobColumns).eq('id', id).maybeSingle();
  if (error) {
    console.error('fetchSponsoredJobByIdAsAdmin failed', error);
    return null;
  }
  return data as unknown as AdminSponsoredJob | null;
}

export async function updateProgramAsAdmin(id: string, patch: Partial<AdminProgram>) {
  const { error } = await supabase.from('programs').update(patch).eq('id', id);
  if (error) console.error('updateProgramAsAdmin failed', error);
  return !error;
}

export async function updateSponsoredJobAsAdmin(id: string, patch: Partial<AdminSponsoredJob>) {
  const { error } = await supabase.from('sponsored_jobs').update(patch).eq('id', id);
  if (error) console.error('updateSponsoredJobAsAdmin failed', error);
  return !error;
}

export async function deleteProgram(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('programs').delete().eq('id', id);
  if (error) {
    console.error('deleteProgram failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteSponsoredJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('sponsored_jobs').delete().eq('id', id);
  if (error) {
    console.error('deleteSponsoredJob failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// `.in('id', ids)` embeds every id directly in the request URL's query
// string (unlike a plain insert, which puts rows in the request body),
// so a big batch here risks a URL-length limit somewhere in the stack
// (Supabase/PostgREST/CDN) long before it risks any row-count limit —
// a large batch (Roche-sized: 1000+) reliably fails with a bare "Bad
// Request" and no useful detail. 50 ids per chunk keeps every request
// comfortably under any realistic limit. Every bulk id-list operation
// below runs through this helper rather than a single `.in()` call.
const IN_CLAUSE_CHUNK_SIZE = 50;

async function runChunkedInClause(
  ids: string[],
  runChunk: (chunk: string[]) => Promise<{ error: { message: string } | null }>
): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < ids.length; i += IN_CLAUSE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CLAUSE_CHUNK_SIZE);
    const { error } = await runChunk(chunk);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function bulkDeleteJobs(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  return runChunkedInClause(ids, (chunk) => supabase.from('sponsored_jobs').delete().in('id', chunk));
}

export async function bulkDeletePrograms(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  return runChunkedInClause(ids, (chunk) => supabase.from('programs').delete().in('id', chunk));
}

export async function bulkSetProgramStatus(ids: string[], status: ListingStatus): Promise<{ ok: boolean; error?: string }> {
  return runChunkedInClause(ids, (chunk) => supabase.from('programs').update({ status }).in('id', chunk));
}

export async function fetchAdmins(): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .order('full_name', { ascending: true });
  if (error) {
    console.error('fetchAdmins failed', error);
    return [];
  }
  return data ?? [];
}

export async function grantAdminByEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('grant_admin_by_email', { target_email: email.trim().toLowerCase() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeAdminByEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('revoke_admin_by_email', { target_email: email.trim().toLowerCase() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setPublisherStatus(id: string, status: 'verified' | 'rejected' | 'suspended' | 'pending'): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('program_publishers').update({ verification_status: status }).eq('id', id);
  if (error) { console.error('setPublisherStatus failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function updatePublisherName(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('program_publishers').update({ name }).eq('id', id);
  if (error) { console.error('updatePublisherName failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function updatePublisherContactEmail(id: string, contactEmail: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('program_publishers').update({ contact_email: contactEmail }).eq('id', id);
  if (error) { console.error('updatePublisherContactEmail failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function setProgramStatus(id: string, status: ListingStatus): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('programs').update({ status }).eq('id', id);
  if (error) { console.error('setProgramStatus failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function setSponsoredJobStatus(id: string, status: ListingStatus): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('sponsored_jobs').update({ status }).eq('id', id);
  if (error) { console.error('setSponsoredJobStatus failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function setAgencyStatus(id: string, status: 'verified' | 'rejected' | 'pending'): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('agencies').update({ verification_status: status }).eq('id', id);
  if (error) { console.error('setAgencyStatus failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function updateAgencyName(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('agencies').update({ name }).eq('id', id);
  if (error) { console.error('updateAgencyName failed', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function findOrCreateImportedPublisher(companyName: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const name = companyName.trim();
  if (!name) return { ok: false, error: 'Company name is required.' };

  const existing = await supabase
    .from('program_publishers')
    .select('id')
    .ilike('name', name)
    .maybeSingle();

  if (existing.data) return { ok: true, id: existing.data.id };

  const created = await supabase
    .from('program_publishers')
    .insert({
      owner_id: null,
      org_type: 'company',
      name,
      verification_status: 'verified',
      contact_email: 'hello@madevisa.com',
    })
    .select('id')
    .single();

  if (created.error || !created.data) {
    return { ok: false, error: created.error?.message ?? 'Could not create publisher.' };
  }
  return { ok: true, id: created.data.id };
}

/** A country this import can resolve locations against — just the two fields matchCountriesFromOfficeNames' output can be joined to. */
export type ImportCountryLookup = { id: string; iso_code: string };

/**
 * Turns a job's scraped office/location strings into a countries.id —
 * automatically, no admin pick required. Reuses the same name-matching
 * MultiCountryBadge already uses for its "hiring in multiple countries"
 * hint (src/lib/officeLocations.ts), so the two stay consistent.
 * Returns null — which the rest of the app already renders as "Various"
 * — when there's no confident single match: either nothing recognizable
 * was found, or the office list genuinely spans more than one country.
 * additionalLocations (stored separately) still carries the raw office
 * list either way, so nothing about the original data is lost.
 */
function resolveCountryId(offices: string[] | undefined, locationText: string | undefined, countries: ImportCountryLookup[]): string | null {
  const candidates = offices && offices.length ? offices : locationText ? [locationText] : [];
  if (candidates.length === 0) return null;
  const matches = matchCountriesFromOfficeNames(candidates);
  if (matches.length !== 1) return null;
  return countries.find((c) => c.iso_code === matches[0].code)?.id ?? null;
}

/** First comma-separated segment of a location string ("Blumenau, Santa Catarina, Brazil" → "Blumenau") — good enough for the free-text city field without needing per-site parsing rules. */
function deriveCity(locationText: string | undefined): string | null {
  const first = locationText?.split(',')[0]?.trim();
  return first || null;
}

/** Maps a scraped employment-type/category string onto the fixed JOB_CATEGORIES set this app actually uses (both the `category` and `employment_type` columns are always kept equal to one of these — see EditableJobRow) — sites phrase this a hundred different ways ("Full time", "FULL_TIME", "Vollzeit"...), so this matches on keywords rather than exact values, and falls back to 'Other' rather than guessing wrong. */
function normalizeJobCategory(raw: string | null | undefined): JobCategory {
  if (!raw) return 'Other';
  const s = raw.toLowerCase();
  if (s.includes('intern')) return 'Internship';
  if (s.includes('apprentice')) return 'Apprenticeship';
  if (s.includes('volunteer')) return 'Volunteer';
  if (s.includes('season')) return 'Seasonal work';
  if (s.includes('contract') || s.includes('freelance') || s.includes('temp')) return 'Contract / Freelance';
  if (s.includes('part')) return 'Part time';
  if (s.includes('full')) return 'Full time';
  return JOB_CATEGORIES.includes(raw as JobCategory) ? (raw as JobCategory) : 'Other';
}

/** Parses whatever date format a source site used (ISO, "08/27/2025", etc.) into a clean ISO string for storage, or null if it isn't a real date rather than letting `new Date(garbage)` produce "Invalid Date" downstream. */
function parseSourceDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function importJobsAsPending(
  publisherId: string,
  /** Every country this import can auto-match against — pass the full
   * fetchCountries() list from src/lib/programs.ts. Destination is now
   * resolved per job from its own scraped location (see resolveCountryId
   * above); there's nothing left for the admin to pick per batch. */
  countries: ImportCountryLookup[],
  jobs: {
    title: string;
    description: string;
    officialUrl: string;
    additionalLocations?: string[];
    locationText?: string;
    category?: string | null;
    employmentTypeRaw?: string | null;
    postedAt?: string | null;
    remote?: boolean | null;
    salaryText?: string | null;
  }[]
): Promise<{ ok: boolean; imported: number; error?: string }> {
  const rows = jobs.map((j) => {
    // Employment type comes ONLY from employmentTypeRaw now — j.category
    // is a job-function value (Design, Engineering, ...), not an
    // employment type, and feeding it into this normalizer is exactly
    // the bug that was silently turning every real department into
    // "Other". job_function stores the real value, untouched, below.
    const jobCategory = normalizeJobCategory(j.employmentTypeRaw);
    return {
      publisher_id: publisherId,
      title: j.title,
      description: j.description,
      category: jobCategory,
      employment_type: jobCategory,
      job_function: j.category ?? null,
      remote: j.remote ?? false,
      country_id: resolveCountryId(j.additionalLocations, j.locationText, countries),
      city: deriveCity(j.additionalLocations?.[0] ?? j.locationText),
      official_url: j.officialUrl,
      additional_locations: j.additionalLocations && j.additionalLocations.length > 1 ? j.additionalLocations : null,
      contact_email: 'hello@madevisa.com',
      status: 'pending',
      source_posted_at: parseSourceDate(j.postedAt),
      ...(j.salaryText ? { compensation_text: j.salaryText, salary_status: 'disclosed' as const } : {}),
    };
  });

  // Insert in chunks rather than one giant request — an ATS batch (e.g.
  // Roche's 1000+ listings) as a single insert risks the request body/
  // statement-timeout limits some Postgres/PostgREST setups impose.
  // Chunking also means a failure partway through still leaves the jobs
  // that already landed intact, instead of losing the whole batch.
  const INSERT_CHUNK_SIZE = 250;
  let imported = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const { error } = await supabase.from('sponsored_jobs').insert(chunk);
    if (error) {
      return {
        ok: imported > 0,
        imported,
        error: imported > 0
          ? `Imported ${imported} before failing: ${error.message}`
          : error.message,
      };
    }
    imported += chunk.length;
  }
  return { ok: true, imported };
}

export async function bulkSetJobStatus(ids: string[], status: ListingStatus): Promise<{ ok: boolean; error?: string }> {
  return runChunkedInClause(ids, (chunk) => supabase.from('sponsored_jobs').update({ status }).in('id', chunk));
}

export async function bulkSetJobImage(ids: string[], imageUrl: string): Promise<{ ok: boolean; error?: string }> {
  return runChunkedInClause(ids, (chunk) => supabase.from('sponsored_jobs').update({ image_url: imageUrl }).in('id', chunk));
}

/**
 * Sets one logo for an entire company at once — every job under that
 * publisher (any status: pending, published, rejected, all of them),
 * not just whichever ones happen to be selected in a list right now.
 * Also updates the publisher's own logo_url for consistency, in case
 * anything reads from there later.
 */
export async function setPublisherLogoForAllJobs(publisherId: string, imageUrl: string): Promise<{ ok: boolean; error?: string }> {
  const [jobsResult, publisherResult] = await Promise.all([
    supabase.from('sponsored_jobs').update({ image_url: imageUrl }).eq('publisher_id', publisherId),
    supabase.from('program_publishers').update({ logo_url: imageUrl }).eq('id', publisherId),
  ]);
  if (jobsResult.error) return { ok: false, error: jobsResult.error.message };
  if (publisherResult.error) return { ok: false, error: publisherResult.error.message };
  return { ok: true };
}

/**
 * One-time fixup for jobs that predate job_function existing at all
 * (imported before that column/extraction logic shipped — see the
 * comment on AdminSponsoredJob.job_function) — classifies each from its
 * title using the same keyword logic the public Jobs page filters use
 * (src/lib/jobCategories.ts), so a re-import isn't needed just to make
 * existing jobs show up under a category. Jobs whose title doesn't
 * match any known bucket are left alone (job_function stays null)
 * rather than being forced into a wrong one.
 *
 * Uses upsert rather than one request per row: PostgREST's upsert only
 * sets the columns actually present in each payload row — here just id
 * and job_function — so every other column on each row is left exactly
 * as it was, this just does it in large batches instead of one HTTP
 * request per job.
 */
export async function backfillJobFunctions(): Promise<{ ok: boolean; updated: number; skipped: number; error?: string }> {
  let rows: { id: string; title: string }[];
  try {
    rows = await fetchAllRows<{ id: string; title: string }>((from, to) =>
      supabase
        .from('sponsored_jobs')
        .select('id, title')
        .is('job_function', null)
        .range(from, to) as unknown as PromiseLike<{ data: { id: string; title: string }[] | null; error: { message: string } | null }>
    );
  } catch (error) {
    return { ok: false, updated: 0, skipped: 0, error: error instanceof Error ? error.message : 'Fetch failed.' };
  }

  const classified = rows
    .map((r) => ({ id: r.id, job_function: classifyJobFunctionFromTitle(r.title) }))
    .filter((r): r is { id: string; job_function: string } => r.job_function !== null);
  const skipped = rows.length - classified.length;

  const CHUNK_SIZE = 500;
  let updated = 0;
  for (let i = 0; i < classified.length; i += CHUNK_SIZE) {
    const chunk = classified.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('sponsored_jobs').upsert(chunk, { onConflict: 'id' });
    if (error) {
      return {
        ok: updated > 0,
        updated,
        skipped,
        error: updated > 0 ? `Updated ${updated} before failing: ${error.message}` : error.message,
      };
    }
    updated += chunk.length;
  }

  return { ok: true, updated, skipped };
}
