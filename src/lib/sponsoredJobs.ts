import { supabase } from '@/lib/supabase';
import { slugify } from '@/lib/jobUrl';
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
  /** Real job function/department (Design, Engineering, ...) — separate from category/employment_type above, which mean employment type in this app. See the matching comment in src/lib/admin.ts. */
  job_function: string | null;
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
  /** 'direct' = posted on MadeVisa by the company itself; 'imported' = pulled from its careers page; 'admin' = added by MadeVisa staff. */
  origin?: 'direct' | 'imported' | 'admin';
  /** 'onsite' | 'hybrid' | 'remote' — 20260925090000 migration; absent before it runs. */
  work_arrangement?: 'onsite' | 'hybrid' | 'remote' | null;
  /** 'offered' | 'not_offered' | null (source doesn't say). */
  visa_status?: 'offered' | 'not_offered' | null;
  /** Last time a sync saw this job still listed on the source. */
  last_seen_at?: string | null;
  publisher?: { id: string; name: string; org_type: OrgType; logo_url: string | null; owner_id: string | null };
  country?: { id: string; name: string; iso_code: string };
};

const columns =
  'id, publisher_id, title, description, category, employment_type, job_function, remote, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, benefits, requirements, spots_available, image_url, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, official_url, application_url, contact_email, status, admin_notes, source_verified, needs_info_message, created_at, approved_at, expires_at, source_posted_at, additional_locations, origin, publisher:program_publishers(id, name, org_type, logo_url, owner_id), country:countries(id, name, iso_code)';

// Same as `columns` above minus description/benefits/requirements (each
// can be 5-20KB of HTML per job — real imported listings routinely are)
// and the admin-only fields, none of which any board/list card actually
// renders (confirmed against sponsoredJobToBoardJob's consumers — the
// job detail page is the only place that needs the full text, and it
// still fetches with the complete `columns` above via
// fetchSponsoredJobById). For a catalog of hundreds to thousands of
// jobs, this is the difference between transferring and JSON-parsing a
// few hundred KB total vs. tens of MB just to render a list of titles.
const LIST_COLUMNS =
  'id, publisher_id, title, category, employment_type, job_function, remote, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, spots_available, image_url, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, official_url, application_url, contact_email, status, created_at, approved_at, expires_at, source_posted_at, additional_locations, origin, publisher:program_publishers(id, name, org_type, logo_url, owner_id), country:countries(id, name, iso_code)';

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
// Supabase/PostgREST caps any single request at 1000 rows by default —
// with more published jobs than that (increasingly likely as more
// companies get imported), a single .select() silently truncates and
// the site shows a stale, too-low "X opportunities" count. Paginating
// with .range() in 1000-row pages until a page comes back short is the
// standard way to pull every row past that default cap.
const SUPABASE_MAX_ROWS_PER_REQUEST = 1000;

// ---------------------------------------------------------------------------
// Caching strategy (fastest first):
//   1. in-memory, shared by every caller in the tab (landing page and
//      /jobs both use this), fresh for 60s;
//   2. an IndexedDB copy from the previous visit — shown instantly while
//      the network request refreshes it in the background
//      (stale-while-revalidate), so a repeat visit renders immediately;
//   3. the network: the newest 1,000 rows are handed over as soon as they
//      arrive, the remaining pages follow in parallel.
// Concurrent callers share one in-flight request instead of each
// downloading the whole catalog.
// ---------------------------------------------------------------------------

let publishedJobsCache: { data: SponsoredJob[]; fetchedAt: number } | null = null;
const PUBLISHED_JOBS_CACHE_TTL_MS = 60_000;
const PERSISTED_MAX_AGE_MS = 6 * 60 * 60 * 1000; // older copies are ignored
const IDB_NAME = 'madevisa-cache';
const IDB_STORE = 'kv';
const IDB_KEY = 'publishedJobs:v2'; // v1 copies could be missing jobs (see fetchPublishedFromNetwork)

let inflight: Promise<SponsoredJob[]> | null = null;
const partialListeners = new Set<(rows: SponsoredJob[]) => void>();
let lastPartial: SponsoredJob[] | null = null;

function openCacheDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readPersistedJobs(): Promise<{ data: SponsoredJob[]; fetchedAt: number } | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const v = req.result as { data: SponsoredJob[]; fetchedAt: number } | undefined;
        resolve(v && Array.isArray(v.data) && Date.now() - v.fetchedAt < PERSISTED_MAX_AGE_MS ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writePersistedJobs(data: SponsoredJob[]) {
  // Deferred so saving never competes with the first render.
  const save = async () => {
    const db = await openCacheDb();
    if (!db) return;
    try {
      db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put({ data, fetchedAt: Date.now() }, IDB_KEY);
    } catch {
      /* quota / private mode — caching is optional */
    }
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => void save());
  else setTimeout(() => void save(), 1500);
}

const nowIso = () => new Date().toISOString();

/** Drops rows that expired since they were cached. */
function stillLive(rows: SponsoredJob[]): SponsoredJob[] {
  const now = nowIso();
  return rows.filter((r) => !r.expires_at || r.expires_at > now);
}

async function fetchPublishedFromNetwork(onPartial: (rows: SponsoredJob[]) => void): Promise<{ rows: SponsoredJob[]; complete: boolean } | null> {
  // One timestamp for every page, so all pages see the same set of
  // unexpired jobs.
  const asOf = nowIso();
  const baseQuery = (withCount: boolean) =>
    supabase
      .from('sponsored_jobs')
      .select(LIST_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('status', 'published')
      .or(`expires_at.is.null,expires_at.gt.${asOf}`)
      // `id` breaks ties: bulk imports give hundreds of jobs the same
      // created_at, and without a unique tiebreaker the database may
      // order them differently for each page request — so some jobs
      // appeared on two pages and others on none, and the total came out
      // a few hundred short (and different on every device / reload).
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

  const first = await baseQuery(true).range(0, SUPABASE_MAX_ROWS_PER_REQUEST - 1);
  if (first.error) {
    console.error('fetchPublishedSponsoredJobs failed', first.error);
    return null;
  }

  const firstPage = (first.data ?? []) as unknown as SponsoredJob[];
  const total = first.count ?? firstPage.length;
  if (firstPage.length >= total) return { rows: firstPage, complete: true };

  // The project's max-rows setting may be lower than we asked for — page
  // by what the server actually returns so no gap opens between pages.
  const pageSize = Math.max(1, Math.min(SUPABASE_MAX_ROWS_PER_REQUEST, firstPage.length));

  // Show the newest page right away; the rest follow.
  onPartial(firstPage);
  const pageStarts: number[] = [];
  for (let from = pageSize; from < total; from += pageSize) pageStarts.push(from);

  // A few at a time (phones on slow networks time out when ~20 large
  // requests start at once), each retried before giving up.
  const pages: SponsoredJob[][] = new Array(pageStarts.length);
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, pageStarts.length) }, async () => {
      while (next < pageStarts.length) {
        const i = next++;
        const from = pageStarts[i];
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await baseQuery(false).range(from, from + pageSize - 1);
          if (!r.error) {
            pages[i] = (r.data ?? []) as unknown as SponsoredJob[];
            break;
          }
          if (attempt === 2) {
            console.error('fetchPublishedSponsoredJobs page failed', r.error);
            failed++;
          } else await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
        }
      }
    })
  );
  const seen = new Set<string>();
  const rows = [firstPage, ...pages.filter(Boolean)].flat().filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  return { rows, complete: failed === 0 && rows.length >= total };
}

/**
 * Every published, unexpired job (list columns only). `onPartial` is
 * called with something to show before the full list is ready — the
 * previous visit's cached copy and/or the newest page — so pages can
 * render immediately; the promise resolves with the complete, fresh list.
 */
export async function fetchPublishedSponsoredJobs(opts: { onPartial?: (rows: SponsoredJob[]) => void } = {}): Promise<SponsoredJob[]> {
  if (publishedJobsCache && Date.now() - publishedJobsCache.fetchedAt < PUBLISHED_JOBS_CACHE_TTL_MS) {
    return publishedJobsCache.data;
  }
  if (opts.onPartial) {
    partialListeners.add(opts.onPartial);
    // Joining a request that already has something to show.
    if (inflight && lastPartial) opts.onPartial(lastPartial);
  }
  const emit = (rows: SponsoredJob[]) => {
    lastPartial = rows;
    partialListeners.forEach((fn) => fn(rows));
  };

  if (!inflight) {
    inflight = (async () => {
      let shownCount = 0;
      // Instant paint from the last visit, while the network catches up.
      const persisted = publishedJobsCache ? null : await readPersistedJobs();
      if (persisted) {
        const rows = stillLive(persisted.data);
        shownCount = rows.length;
        emit(rows);
      }
      const fresh = await fetchPublishedFromNetwork((firstPage) => {
        // Don't replace a fuller cached list with just the first page.
        if (firstPage.length > shownCount) emit(firstPage);
      });
      const fallback = publishedJobsCache?.data ?? (persisted ? stillLive(persisted.data) : null);
      if (!fresh) return fallback ?? [];
      // An incomplete load (a page kept failing) is shown if there's
      // nothing better, but never saved as the reference copy — otherwise
      // the count would stay low until the next full load.
      if (!fresh.complete) return fallback && fallback.length > fresh.rows.length ? fallback : fresh.rows;
      publishedJobsCache = { data: fresh.rows, fetchedAt: Date.now() };
      writePersistedJobs(fresh.rows);
      return fresh.rows;
    })().finally(() => {
      inflight = null;
      lastPartial = null;
      partialListeners.clear();
    });
  }
  return inflight;
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

// Detail-page extras. Selected separately with a fallback so the job page
// keeps working even if the newest migration hasn't been run yet — a
// missing column must never make jobs disappear again.
const detailColumns = `${columns.replace(', publisher:', ', last_seen_at, work_arrangement, visa_status, publisher:')}`;

type DetailQuery = (cols: string) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
async function withDetailColumns(run: DetailQuery) {
  const first = await run(detailColumns);
  if (!first.error) return first;
  if (/column|schema cache/i.test(first.error.message) || first.error.code === '42703') return run(columns);
  return first;
}

/** Fetches one published sponsored job by id — for the public job detail page. */
export async function fetchSponsoredJobById(id: string): Promise<SponsoredJob | null> {
  const { data, error } = await withDetailColumns((cols) =>
    supabase.from('sponsored_jobs').select(cols).eq('id', id).eq('status', 'published').maybeSingle()
  );

  if (error) {
    console.error('fetchSponsoredJobById failed', error);
    return null;
  }
  return data as unknown as SponsoredJob | null;
}

/**
 * Finds a published sponsored job from the short id in its public URL
 * (/jobs/<company>/<title>-<shortId>, see src/lib/jobUrl.ts). The short
 * id is the UUID's first 8 hex characters, so this is a UUID range query.
 * In the rare case two jobs share a prefix, the title slug picks the
 * right one.
 */
export async function fetchSponsoredJobByShortId(shortId: string, titleSlug?: string): Promise<SponsoredJob | null> {
  if (!/^[0-9a-f]{8}$/i.test(shortId)) return null;
  const prefix = shortId.toLowerCase();
  const { data, error } = await withDetailColumns((cols) =>
    supabase
      .from('sponsored_jobs')
      .select(cols)
      .eq('status', 'published')
      .gte('id', `${prefix}-0000-0000-0000-000000000000`)
      .lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`)
      .limit(10)
  );

  if (error) {
    console.error('fetchSponsoredJobByShortId failed', error);
    return null;
  }
  const rows = (data ?? []) as unknown as SponsoredJob[];
  if (rows.length <= 1 || !titleSlug) return rows[0] ?? null;
  return rows.find((r) => slugify(r.title) === titleSlug) ?? rows[0];
}

/**
 * Normalizes a published sponsored job into the same `Job` shape the
 * Jobs board already renders (curated + Arbeitnow-live jobs) — see
 * src/data/jobs.ts. Keeps JobsPage.tsx from needing to know about
 * sponsored jobs' own shape at all.
 */
/** Posted on MadeVisa by the company itself (not imported / not added by staff). Falls back to the old owner_id signal for rows fetched before the origin column existed. */
export function isDirectListing(job: Pick<SponsoredJob, 'origin' | 'publisher'>): boolean {
  if (job.origin) return job.origin === 'direct';
  return Boolean(job.publisher?.owner_id);
}

export function sponsoredJobToBoardJob(job: SponsoredJob): import('@/data/jobs').Job {
  return {
    id: `sponsored-${job.id}`,
    title: job.title,
    company: job.publisher?.name ?? 'Verified sponsor',
    country: job.country?.name ?? 'Various',
    countryCode: job.country?.iso_code ?? '',
    // Was falling back to the country name for every non-remote job,
    // which meant the city shown was never actually a city — this app's
    // own `city` field on the row was just never read. Falls back to
    // the country name only when there's genuinely no city on file, so
    // "somewhere in Germany" still reads better than a blank string.
    city: job.remote ? 'Remote' : job.city ?? job.country?.name ?? '',
    salary: formatSalary(job) ?? undefined,
    type: job.employment_type,
    remote: job.remote,
    // Public-facing `category` means job function (Design, Engineering,
    // ...) — job_function when the source gave us one, otherwise left
    // blank (matches "All categories" only) rather than falling back to
    // the employment-type value, which would just reintroduce the same
    // mix-up this was built to fix.
    category: job.job_function ?? '',
    // A publisher with a real owner_id is a verified company account
    // that posted this itself; owner_id: null is exactly how
    // findOrCreateImportedPublisher (the admin ATS-import path) creates
    // publishers (see src/lib/admin.ts) — so this is a real signal, not
    // a guess, for which of the two the job actually is.
    source: job.publisher?.name ?? 'Verified sponsor',
    published: isDirectListing(job) ? 'Posted by company' : 'Added by MadeVisa',
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
    experienceLevel: job.experience_level,
    workArrangement: job.work_arrangement ?? null,
    visaStatus: job.visa_status ?? null,
    lastSeenAt: job.last_seen_at ?? null,
    sourceType: isDirectListing(job) ? 'company_submitted' : 'company_careers',
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

/** All published jobs of one company (for its public company page). */
export async function fetchPublishedJobsByPublisher(publisherId: string, limit = 500): Promise<SponsoredJob[]> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(LIST_COLUMNS)
    .eq('publisher_id', publisherId)
    .eq('status', 'published')
    .order('approved_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('fetchPublishedJobsByPublisher failed', error);
    return [];
  }
  return (data ?? []) as unknown as SponsoredJob[];
}
