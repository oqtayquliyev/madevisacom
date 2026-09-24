import { supabase } from '@/lib/supabase';
import { detectJobFacts, type WorkArrangement } from '@/lib/jobFacts';
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
  logo_url: string | null;
  country?: { name: string; iso_code: string } | null;
};

/** Where a listing came from — see the 20260924090000 migration. */
export type ListingOrigin = 'direct' | 'imported' | 'admin';

export type PendingProgram = {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  origin?: ListingOrigin;
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
  origin?: ListingOrigin;
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
  'id, org_type, name, website, contact_email, verification_status, created_at, logo_url, country:countries(name, iso_code)';
const programColumns =
  'id, title, category, status, created_at, origin, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const sponsoredJobColumns =
  'id, title, category, employment_type, status, created_at, origin, publisher:program_publishers(id, name, org_type), country:countries(name, iso_code)';
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

export async function fetchAllRows<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }> }
): Promise<T[]> {
  // First page also asks for the exact total row count, so every page
  // after it can be fired in parallel instead of one-at-a-time — with
  // thousands of rows (this admin panel now routinely has 5000+ pending
  // jobs alone), that's the difference between several sequential
  // round-trips and roughly one round-trip's worth of wait, however
  // many pages it actually takes. `buildQuery` is called fresh for each
  // page (not reused) since a Supabase query builder is single-use.
  const first = await buildQuery().range(0, SUPABASE_PAGE_SIZE - 1);
  if (first.error) throw new Error(first.error.message);
  const firstPage = first.data ?? [];
  const total = first.count ?? firstPage.length;

  if (total <= SUPABASE_PAGE_SIZE) return firstPage;

  const pageStarts: number[] = [];
  for (let from = SUPABASE_PAGE_SIZE; from < total; from += SUPABASE_PAGE_SIZE) pageStarts.push(from);

  const restResults = await Promise.all(pageStarts.map((from) => buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1)));
  const rest: T[] = [];
  for (const r of restResults) {
    if (r.error) throw new Error(r.error.message);
    rest.push(...(r.data ?? []));
  }
  return [...firstPage, ...rest];
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
    return await fetchAllRows<PendingSponsoredJob>(() =>
      supabase
        .from('sponsored_jobs')
        .select(sponsoredJobColumns, { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: true }) as unknown as {
        range: (from: number, to: number) => PromiseLike<{ data: PendingSponsoredJob[] | null; error: { message: string } | null; count?: number | null }>;
      }
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
  origin?: ListingOrigin;
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
  origin?: ListingOrigin;
  /** Set for jobs that came from a saved import source (see src/lib/importSync.ts). */
  import_source_id?: string | null;
  publisher_id?: string;
  publisher?: { name: string; org_type: OrgType } | null;
  country?: { name: string; iso_code: string } | null;
};

const adminProgramColumns =
  'id, title, description, category, status, created_at, approved_at, expires_at, country_id, city, duration_text, eligibility_notes, benefits, funding_text, cost_status, cost_amount_min, cost_amount_max, cost_currency, requirements, official_url, application_url, image_url, spots_available, citizenship_any, citizenship_allowed, min_age, max_age, applications_open_at, applications_close_at, admin_notes, source_verified, needs_info_message, contact_email, origin, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';
const adminSponsoredJobColumns =
  'id, title, description, category, employment_type, job_function, remote, status, created_at, approved_at, expires_at, source_posted_at, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, benefits, requirements, official_url, application_url, image_url, citizenship_any, citizenship_allowed, min_age, max_age, admin_notes, source_verified, needs_info_message, contact_email, origin, import_source_id, publisher_id, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';

// Same fields as adminSponsoredJobColumns minus description/benefits/
// requirements/admin_notes/needs_info_message — for the "All sponsored
// jobs" summary list, which shows title/company/status/date, not full
// job bodies. "Preview & edit" opens the editor in a new tab
// (window.open(`/admin/jobs/${id}`)), which does its own fresh
// full-column fetch by id — so nothing here relies on the list row
// already carrying the full text. Same reasoning, same fix as the
// public site's list vs. detail split in src/lib/sponsoredJobs.ts.
const adminSponsoredJobListColumns =
  'id, title, category, employment_type, job_function, remote, status, created_at, approved_at, expires_at, source_posted_at, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, official_url, application_url, image_url, citizenship_any, citizenship_allowed, min_age, max_age, contact_email, origin, import_source_id, publisher_id, publisher:program_publishers(name, org_type), country:countries(name, iso_code)';

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
    return await fetchAllRows<AdminSponsoredJob>(() =>
      supabase
        .from('sponsored_jobs')
        .select(adminSponsoredJobListColumns, { count: 'exact' })
        .order('created_at', { ascending: false }) as unknown as {
        range: (from: number, to: number) => PromiseLike<{ data: AdminSponsoredJob[] | null; error: { message: string } | null; count?: number | null }>;
      }
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

export type ImportJobInput = {
  /** The job's own id on the source site — what sync matches on. */
  externalId?: string;
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
  workArrangement?: WorkArrangement | null;
};

/** Lowercase host, no hash/trailing slash/utm_* — so the same posting matches however its URL was written. */
export function normalizeJobUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return raw.trim().replace(/\/+$/, '');
  }
}

export function importJobToRow(
  j: ImportJobInput,
  publisherId: string,
  countries: ImportCountryLookup[],
  options: { importSourceId?: string | null; status?: 'pending' | 'published' } = {}
) {
  // Employment type comes from employmentTypeRaw (or, failing that, what
  // the description says) — j.category is a job-function value (Design,
  // Engineering, ...), not an employment type.
  const facts = detectJobFacts(j.description, j.title);
  const jobCategory = normalizeJobCategory(j.employmentTypeRaw || facts.employmentType);
  const arrangement = j.workArrangement ?? facts.workArrangement;
  const salaryText = j.salaryText || facts.compensation;
  return {
    publisher_id: publisherId,
    title: j.title,
    description: j.description,
    category: jobCategory,
    employment_type: jobCategory,
    job_function: j.category ?? null,
    remote: j.remote ?? arrangement === 'remote',
    country_id: resolveCountryId(j.additionalLocations, j.locationText, countries),
    city: deriveCity(j.additionalLocations?.[0] ?? j.locationText),
    official_url: j.officialUrl,
    additional_locations: j.additionalLocations && j.additionalLocations.length > 1 ? j.additionalLocations : null,
    contact_email: 'hello@madevisa.com',
    status: options.status ?? 'pending',
    source_posted_at: parseSourceDate(j.postedAt),
    origin: 'imported' as const,
    import_source_id: options.importSourceId ?? null,
    external_id: j.externalId ? String(j.externalId) : null,
    last_seen_at: new Date().toISOString(),
    experience_level: facts.experience,
    visa_sponsorship: facts.visa === 'offered',
    // New columns (20260925090000 migration). insertJobRows() drops them
    // automatically if that migration hasn't been run yet.
    work_arrangement: arrangement,
    visa_status: facts.visa,
    ...(salaryText ? { compensation_text: salaryText, salary_status: 'disclosed' as const } : {}),
  };
}

const OPTIONAL_NEW_COLUMNS = ['work_arrangement', 'visa_status'];

/** True when PostgREST rejected a write because a column doesn't exist yet (migration not run). */
function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204' || error.code === '42703' || /column .* (does not exist|of '.*' in the schema cache)/i.test(error.message ?? '');
}

/** Inserts rows; if the optional new columns don't exist yet, retries without them instead of failing the import. */
async function insertJobRows(rows: Record<string, unknown>[]): Promise<{ error: { message: string } | null }> {
  const first = await supabase.from('sponsored_jobs').insert(rows);
  if (!isMissingColumnError(first.error)) return { error: first.error };
  const stripped = rows.map((r) => {
    const copy = { ...r };
    for (const c of OPTIONAL_NEW_COLUMNS) delete copy[c];
    return copy;
  });
  const second = await supabase.from('sponsored_jobs').insert(stripped);
  return { error: second.error };
}

/**
 * Inserts imported jobs. Skips jobs this company already has (same
 * source + external id, or same job URL) so re-running an import never
 * creates duplicates — it only adds what's genuinely new.
 */
export async function importJobsAsPending(
  publisherId: string,
  countries: ImportCountryLookup[],
  jobs: ImportJobInput[],
  options: { importSourceId?: string | null; status?: 'pending' | 'published'; skipExisting?: boolean } = {}
): Promise<{ ok: boolean; imported: number; skipped: number; error?: string }> {
  const skipExisting = options.skipExisting ?? true;
  const seenExternal = new Set<string>();
  const seenUrls = new Set<string>();

  if (skipExisting) {
    try {
      const existing = await fetchAllRows<{ external_id: string | null; official_url: string | null; import_source_id: string | null }>(() =>
        supabase
          .from('sponsored_jobs')
          .select('external_id, official_url, import_source_id', { count: 'exact' })
          .eq('publisher_id', publisherId) as unknown as {
          range: (from: number, to: number) => PromiseLike<{ data: { external_id: string | null; official_url: string | null; import_source_id: string | null }[] | null; error: { message: string } | null; count?: number | null }>;
        }
      );
      for (const row of existing) {
        if (row.external_id && (!options.importSourceId || row.import_source_id === options.importSourceId)) seenExternal.add(row.external_id);
        const u = normalizeJobUrl(row.official_url);
        if (u) seenUrls.add(u);
      }
    } catch (e) {
      return { ok: false, imported: 0, skipped: 0, error: e instanceof Error ? e.message : 'Could not check existing jobs.' };
    }
  }

  const rows: ReturnType<typeof importJobToRow>[] = [];
  let skipped = 0;
  for (const j of jobs) {
    const ext = j.externalId ? String(j.externalId) : '';
    const url = normalizeJobUrl(j.officialUrl);
    if ((ext && seenExternal.has(ext)) || (url && seenUrls.has(url))) {
      skipped++;
      continue;
    }
    if (ext) seenExternal.add(ext);
    if (url) seenUrls.add(url);
    rows.push(importJobToRow(j, publisherId, countries, options));
  }

  // Chunked: a failure partway through still keeps what already landed.
  const INSERT_CHUNK_SIZE = 250;
  let imported = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const { error } = await insertJobRows(chunk);
    if (error) {
      return {
        ok: imported > 0,
        imported,
        skipped,
        error: imported > 0 ? `Imported ${imported} before failing: ${error.message}` : error.message,
      };
    }
    imported += chunk.length;
  }
  return { ok: true, imported, skipped };
}

// ---------------------------------------------------------------------------
// Requests inbox — listings submitted directly by real users/companies
// ---------------------------------------------------------------------------

export type DirectRequest = {
  kind: 'job' | 'program';
  id: string;
  title: string;
  status: ListingStatus;
  created_at: string;
  updated_at: string | null;
  category: string;
  publisher: { id: string; name: string; logo_url: string | null; contact_email: string } | null;
  submitter: { email: string; full_name: string | null } | null;
  country: { name: string; iso_code: string } | null;
};

const REQUEST_STATUSES = ['pending', 'under_review', 'needs_information'];

export async function fetchDirectRequests(): Promise<{ jobs: DirectRequest[]; programs: DirectRequest[] }> {
  const common = 'id, title, status, created_at, updated_at, category, publisher:program_publishers(id, name, logo_url, contact_email), country:countries(name, iso_code)';
  const [jobs, programs] = await Promise.all([
    supabase
      .from('sponsored_jobs')
      .select(`${common}, submitter:profiles!sponsored_jobs_submitted_by_fkey(email, full_name)`)
      .eq('origin', 'direct')
      .in('status', REQUEST_STATUSES)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('programs')
      .select(`${common}, submitter:profiles!programs_submitted_by_fkey(email, full_name)`)
      .eq('origin', 'direct')
      .in('status', REQUEST_STATUSES)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  if (jobs.error) console.error('fetchDirectRequests (jobs) failed', jobs.error);
  if (programs.error) console.error('fetchDirectRequests (programs) failed', programs.error);
  const tag = (kind: 'job' | 'program', rows: unknown[] | null) => ((rows ?? []) as Omit<DirectRequest, 'kind'>[]).map((r) => ({ ...r, kind }));
  return { jobs: tag('job', jobs.data), programs: tag('program', programs.data) };
}

/** Cheap count query for the notification badge / polling. */
export async function countDirectRequests(): Promise<{ jobs: number; programs: number; latest: string | null }> {
  const [jobs, programs] = await Promise.all([
    supabase.from('sponsored_jobs').select('created_at', { count: 'exact' }).eq('origin', 'direct').in('status', REQUEST_STATUSES).order('created_at', { ascending: false }).limit(1),
    supabase.from('programs').select('created_at', { count: 'exact' }).eq('origin', 'direct').in('status', REQUEST_STATUSES).order('created_at', { ascending: false }).limit(1),
  ]);
  const latest = [jobs.data?.[0]?.created_at, programs.data?.[0]?.created_at].filter(Boolean).sort().pop() ?? null;
  return { jobs: jobs.count ?? 0, programs: programs.count ?? 0, latest };
}

// ---------------------------------------------------------------------------
// Company managers — emails that can manage one company's page & listings
// ---------------------------------------------------------------------------

export type PublisherMember = {
  id: string;
  publisher_id: string;
  email: string;
  can_publish: boolean;
  created_at: string;
  publisher?: { id: string; name: string; logo_url: string | null } | null;
  /** Filled client-side: whether an account with this email exists yet. */
  hasAccount?: boolean;
};

export async function fetchPublisherMembers(publisherId?: string): Promise<PublisherMember[]> {
  let q = supabase
    .from('publisher_members')
    .select('id, publisher_id, email, can_publish, created_at, publisher:program_publishers(id, name, logo_url)')
    .order('created_at', { ascending: false });
  if (publisherId) q = q.eq('publisher_id', publisherId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchPublisherMembers failed', error);
    return [];
  }
  const members = (data ?? []) as unknown as PublisherMember[];
  const emails = [...new Set(members.map((m) => m.email))];
  if (emails.length) {
    const { data: profs } = await supabase.from('profiles').select('email').in('email', emails);
    const known = new Set((profs ?? []).map((p: { email: string | null }) => (p.email ?? '').toLowerCase()));
    members.forEach((m) => (m.hasAccount = known.has(m.email)));
  }
  return members;
}

export async function addPublisherMember(publisherId: string, email: string, canPublish: boolean): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: 'Enter a valid email address.' };
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('publisher_members')
    .upsert({ publisher_id: publisherId, email: clean, can_publish: canPublish, invited_by: auth.user?.id ?? null }, { onConflict: 'publisher_id,email' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updatePublisherMember(id: string, patch: { can_publish?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('publisher_members').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removePublisherMember(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('publisher_members').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
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
    rows = await fetchAllRows<{ id: string; title: string }>(() =>
      supabase
        .from('sponsored_jobs')
        .select('id, title', { count: 'exact' })
        .is('job_function', null) as unknown as {
        range: (from: number, to: number) => PromiseLike<{ data: { id: string; title: string }[] | null; error: { message: string } | null; count?: number | null }>;
      }
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

// ---------------------------------------------------------------------------
// Detect job details (salary, experience, work type, employment type, visa)
// from descriptions — for jobs imported before the detectors existed.
// Only fills fields that are empty; never overwrites what's already set.
// ---------------------------------------------------------------------------

type FactRow = {
  id: string;
  title: string;
  description: string | null;
  compensation_text: string | null;
  salary_status: string | null;
  experience_level: string | null;
  employment_type: string | null;
  remote: boolean;
  visa_sponsorship: boolean;
  work_arrangement?: string | null;
  visa_status?: string | null;
};

export async function backfillJobFacts(
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: boolean; scanned: number; updated: number; counts: Record<string, number>; error?: string; migrationMissing?: boolean }> {
  const counts: Record<string, number> = { compensation: 0, experience: 0, employment: 0, workType: 0, visa: 0 };
  const baseCols = 'id, title, description, compensation_text, salary_status, experience_level, employment_type, remote, visa_sponsorship';
  let hasNewCols = true;
  let rows: FactRow[];
  const load = (cols: string) =>
    fetchAllRows<FactRow>(() =>
      supabase.from('sponsored_jobs').select(cols, { count: 'exact' }).not('description', 'is', null).order('created_at', { ascending: true }) as unknown as {
        range: (from: number, to: number) => PromiseLike<{ data: FactRow[] | null; error: { message: string; code?: string } | null; count?: number | null }>;
      }
    );
  try {
    rows = await load(`${baseCols}, work_arrangement, visa_status`);
  } catch {
    hasNewCols = false;
    try {
      rows = await load(baseCols);
    } catch (e) {
      return { ok: false, scanned: 0, updated: 0, counts, error: e instanceof Error ? e.message : 'Could not load jobs.' };
    }
  }

  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  for (const r of rows) {
    const f = detectJobFacts(r.description, r.title);
    const patch: Record<string, unknown> = {};
    const comp = (r.compensation_text ?? '').trim();
    if ((!comp || comp === '[object Object]') && f.compensation && r.salary_status !== 'volunteer') {
      patch.compensation_text = f.compensation;
      patch.salary_status = 'disclosed';
      counts.compensation++;
    }
    if (!r.experience_level && f.experience) {
      patch.experience_level = f.experience;
      counts.experience++;
    }
    if ((!r.employment_type || r.employment_type === 'Other') && f.employmentType) {
      patch.employment_type = f.employmentType;
      patch.category = f.employmentType;
      counts.employment++;
    }
    if (hasNewCols && !r.work_arrangement && f.workArrangement) {
      patch.work_arrangement = f.workArrangement;
      counts.workType++;
    }
    if (!r.remote && f.workArrangement === 'remote') patch.remote = true;
    if (hasNewCols && !r.visa_status && f.visa) {
      patch.visa_status = f.visa;
      counts.visa++;
    }
    if (!r.visa_sponsorship && f.visa === 'offered') patch.visa_sponsorship = true;
    if (Object.keys(patch).length) patches.push({ id: r.id, patch });
  }

  let updated = 0;
  let firstError: string | undefined;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < patches.length) {
        const { id, patch } = patches[cursor++];
        const { error } = await supabase.from('sponsored_jobs').update(patch).eq('id', id);
        if (error) firstError = firstError ?? error.message;
        else updated++;
        if (updated % 50 === 0) onProgress?.(updated, patches.length);
      }
    })
  );
  onProgress?.(updated, patches.length);
  return { ok: !firstError, scanned: rows.length, updated, counts, error: firstError, migrationMissing: !hasNewCols };
}
