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
  /** Detector results saved by the job-facts function (see src/lib/jobFactsClient.ts). */
  facts?: import('@/lib/jobFactsClient').StoredJobFacts | null;
  /** Last time a sync saw this job still listed on the source. */
  last_seen_at?: string | null;
  /** Set when the job was closed (gone from the careers page). Visitors see it greyed out for 24 hours. */
  closed_at?: string | null;
  /** created_at = when the company joined MadeVisa ("New on MadeVisa" for 24 h). */
  publisher?: { id: string; name: string; org_type: OrgType; logo_url: string | null; owner_id: string | null; created_at?: string | null };
  country?: { id: string; name: string; iso_code: string };
};

const columns =
  'id, publisher_id, title, description, category, employment_type, job_function, remote, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, benefits, requirements, spots_available, image_url, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, official_url, application_url, contact_email, status, admin_notes, source_verified, needs_info_message, created_at, approved_at, expires_at, source_posted_at, additional_locations, origin, publisher:program_publishers(id, name, org_type, logo_url, owner_id, created_at), country:countries(id, name, iso_code)';

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
  'id, publisher_id, title, category, employment_type, job_function, remote, country_id, city, compensation_text, salary_status, salary_min, salary_max, salary_currency, salary_period, visa_sponsorship, experience_level, education_level, languages, application_deadline, spots_available, image_url, citizenship_any, citizenship_allowed, citizenship_excluded, min_age, max_age, official_url, application_url, contact_email, status, created_at, approved_at, expires_at, source_posted_at, additional_locations, origin, publisher:program_publishers(id, name, org_type, logo_url, owner_id, created_at), country:countries(id, name, iso_code)';

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

/** How long a closed job stays visible (greyed out) before it's removed. */
export const CLOSED_VISIBLE_MS = 24 * 60 * 60 * 1000;
export const isClosedJob = (j: Pick<SponsoredJob, 'status'>) => j.status === 'expired';

// Closed jobs need the closed_at column (migration 20261011090000). Until
// it exists, list and detail queries fall back to live jobs only.
let closedColumnMissing = false;
const LIST_COLUMNS_WITH_CLOSED = LIST_COLUMNS.replace(', publisher:', ', closed_at, publisher:');
/** Live jobs, plus jobs closed in the last 24 hours. */
const liveOrRecentlyClosed = (asOf: string) =>
  `and(status.eq.published,or(expires_at.is.null,expires_at.gt.${asOf})),and(status.eq.expired,closed_at.gt.${new Date(Date.parse(asOf) - CLOSED_VISIBLE_MS).toISOString()})`;

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

// fetchedAt = when the FULL list was last downloaded. releaseAt = the
// published_at of the release the copy is up to date with (moved forward
// by small "what's new since" updates — see fetchReleaseDelta).
type JobsCopy = { data: SponsoredJob[]; fetchedAt: number; release: number | null; releaseAt?: string | null };
let publishedJobsCache: JobsCopy | null = null;
const PUBLISHED_JOBS_CACHE_TTL_MS = 60_000; // only when releases aren't available
const PERSISTED_MAX_AGE_MS = 6 * 60 * 60 * 1000; // copies without a matching release
const PERSISTED_RELEASE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // copies of the current release
// Auto-publish releases a few jobs every 3–4 minutes. A saved copy is kept
// current with tiny "new since" requests; the full list is re-downloaded
// at most every 48 h (picks up edits and deleted jobs).
const DELTA_FULL_REFRESH_MS = 48 * 60 * 60 * 1000;
const DELTA_OVERLAP_MS = 5 * 60 * 1000; // re-ask a few minutes back; merging by id drops repeats
const DELTA_MAX_ROWS = 3000; // more changed than this → a full download is simpler

// --- Releases -----------------------------------------------------------------
// Imported jobs go public in batches when an admin presses "Publish update"
// (migration 20261029090000). Each release has an id: while it doesn't
// change, the saved copy of the jobs is still exactly right — no download.

export type JobRelease = { id: number; published_at: string; new_today: number; jobs_released: number };
const RELEASE_KEY = 'mv:jobRelease';
const RELEASE_TTL_MS = 60_000;
let releaseCache: { value: JobRelease | null; at: number } | null = null;
let releaseInflight: Promise<JobRelease | null> | null = null;

/** The last release this browser saw — instant, for first paint. */
export function peekJobRelease(): JobRelease | null {
  try {
    return JSON.parse(localStorage.getItem(RELEASE_KEY) ?? 'null') as JobRelease | null;
  } catch {
    return null;
  }
}

/** The current release (checked at most once a minute). Null if releases aren't set up. */
export async function fetchCurrentRelease(force = false): Promise<JobRelease | null> {
  if (!force && releaseCache && Date.now() - releaseCache.at < RELEASE_TTL_MS) return releaseCache.value;
  if (!releaseInflight) {
    releaseInflight = (async () => {
      const { data, error } = await supabase.rpc('current_job_release');
      const value = error || !data ? null : (data as JobRelease);
      releaseCache = { value, at: Date.now() };
      try {
        if (value) localStorage.setItem(RELEASE_KEY, JSON.stringify(value));
      } catch {
        /* private mode */
      }
      return value;
    })().finally(() => (releaseInflight = null));
  }
  return releaseInflight;
}
const IDB_NAME = 'madevisa-cache';
const IDB_STORE = 'kv';
const IDB_KEY = 'publishedJobs:v3'; // v1 copies could be missing jobs (see fetchPublishedFromNetwork)

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

async function readPersistedJobs(): Promise<(Omit<JobsCopy, 'release'> & { release?: number | null }) | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const v = req.result as (Omit<JobsCopy, 'release'> & { release?: number | null }) | undefined;
        resolve(v && Array.isArray(v.data) && Date.now() - v.fetchedAt < PERSISTED_RELEASE_MAX_AGE_MS ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writePersistedJobs(copy: JobsCopy) {
  // Deferred so saving never competes with the first render.
  const save = async () => {
    const db = await openCacheDb();
    if (!db) return;
    try {
      db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(copy, IDB_KEY);
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
  const closedSince = new Date(Date.now() - CLOSED_VISIBLE_MS).toISOString();
  return rows.filter((r) => (isClosedJob(r) ? Boolean(r.closed_at && r.closed_at > closedSince) : !r.expires_at || r.expires_at > now));
}

/**
 * True when this device already has a recent copy of the full job list
 * (then showing everything costs only a small "what's new" request).
 */
export async function hasSavedJobList(): Promise<boolean> {
  if (publishedJobsCache) return true;
  const saved = await readPersistedJobs().catch(() => null);
  return Boolean(saved && saved.data.length && Date.now() - saved.fetchedAt < DELTA_FULL_REFRESH_MS);
}

/**
 * What changed since a release: jobs that went live after it, and jobs
 * closed after it. Two small indexed requests (released_at / closed_at) —
 * usually a handful of rows. null = couldn't (or too much changed); the
 * caller then downloads the full list as before.
 */
async function fetchReleaseDelta(sinceIso: string): Promise<{ added: SponsoredJob[]; closed: SponsoredJob[] } | null> {
  const since = new Date(Date.parse(sinceIso) - DELTA_OVERLAP_MS).toISOString();
  const cols = closedColumnMissing ? LIST_COLUMNS : LIST_COLUMNS_WITH_CLOSED;
  try {
    const [added, closed] = await Promise.all([
      supabase.from('sponsored_jobs').select(cols).eq('status', 'published').gte('released_at', since).order('released_at', { ascending: false }).limit(DELTA_MAX_ROWS + 1),
      closedColumnMissing
        ? Promise.resolve({ data: [] as unknown[], error: null })
        : supabase.from('sponsored_jobs').select(cols).eq('status', 'expired').gte('closed_at', since).limit(DELTA_MAX_ROWS + 1),
    ]);
    if (added.error || closed.error) return null;
    const a = (added.data ?? []) as unknown as SponsoredJob[];
    const c = (closed.data ?? []) as unknown as SponsoredJob[];
    if (a.length > DELTA_MAX_ROWS || c.length > DELTA_MAX_ROWS) return null;
    return { added: a, closed: c };
  } catch {
    return null;
  }
}

/** A copy of the list with the delta merged in (new jobs first, closed ones updated in place). */
function mergeDelta(rows: SponsoredJob[], delta: { added: SponsoredJob[]; closed: SponsoredJob[] }): SponsoredJob[] {
  const changed = new Map<string, SponsoredJob>();
  for (const j of delta.added) changed.set(j.id, j);
  for (const j of delta.closed) changed.set(j.id, j);
  if (!changed.size) return rows;
  const known = new Set(rows.map((r) => r.id));
  const fresh = [...changed.values()].filter((j) => !known.has(j.id)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return stillLive([...fresh, ...rows.map((r) => changed.get(r.id) ?? r)]);
}

/**
 * Brings a saved copy up to the current release with a small delta, when
 * the copy is recent enough. null = not possible → full download.
 */
async function catchUpCopy(copy: { data: SponsoredJob[]; fetchedAt: number; releaseAt?: string | null }, release: JobRelease): Promise<JobsCopy | null> {
  if (!copy.releaseAt || Date.now() - copy.fetchedAt > DELTA_FULL_REFRESH_MS) return null;
  const delta = await fetchReleaseDelta(copy.releaseAt);
  if (!delta) return null;
  return { data: mergeDelta(copy.data, delta), fetchedAt: copy.fetchedAt, release: release.id, releaseAt: release.published_at };
}

/**
 * Every live job, loaded one day at a time (jobs live at most 30 days, so
 * 31 day-windows cover them all). Each request is small and uses the
 * created_at index — no slow "count everything" query and no deep page
 * offsets, which timed out for signed-out visitors (their database time
 * limit is shorter) and left them with only the first 1,000 jobs.
 */
async function fetchPublishedFromNetwork(onPartial: (rows: SponsoredJob[]) => void): Promise<{ rows: SponsoredJob[]; complete: boolean } | null> {
  const asOf = nowIso();
  const end = Date.parse(asOf) + 60_000;
  const DAY = 86_400_000;
  const windows: [string, string][] = [];
  for (let k = 0; k < 31; k++) windows.push([new Date(end - (k + 1) * DAY).toISOString(), new Date(end - k * DAY).toISOString()]);

  const query = (from: string, to: string) => {
    const q = supabase.from('sponsored_jobs').select(closedColumnMissing ? LIST_COLUMNS : LIST_COLUMNS_WITH_CLOSED);
    return (closedColumnMissing ? q.eq('status', 'published').or(`expires_at.is.null,expires_at.gt.${asOf}`) : q.or(liveOrRecentlyClosed(asOf)))
      .gte('created_at', from)
      .lt('created_at', to)
      // `id` breaks ties so pages never overlap or skip rows.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
  };

  /** One day-window, page by page (retried). null = gave up. */
  const loadWindow = async ([from, to]: [string, string]): Promise<SponsoredJob[] | null> => {
    const out: SponsoredJob[] = [];
    for (let offset = 0; ; ) {
      let r = await query(from, to).range(offset, offset + SUPABASE_MAX_ROWS_PER_REQUEST - 1);
      if (r.error && !closedColumnMissing && /closed_at|column|schema cache/i.test(r.error.message)) {
        closedColumnMissing = true;
        r = await query(from, to).range(offset, offset + SUPABASE_MAX_ROWS_PER_REQUEST - 1);
      }
      for (let attempt = 1; r.error && attempt < 3; attempt++) {
        await new Promise((res) => setTimeout(res, 500 * attempt));
        r = await query(from, to).range(offset, offset + SUPABASE_MAX_ROWS_PER_REQUEST - 1);
      }
      if (r.error) {
        console.error('fetchPublishedSponsoredJobs window failed', r.error);
        return null;
      }
      const rows = (r.data ?? []) as unknown as SponsoredJob[];
      // Safety: a page that repeats what we already have means the end.
      if (rows.length && out.some((x) => x.id === rows[0].id)) break;
      out.push(...rows);
      if (out.length > 50_000) break;
      // The server may return fewer rows per request than asked (its max-rows
      // setting); a page as big as the biggest seen so far may have more after it.
      SERVER_PAGE.size = Math.max(SERVER_PAGE.size, rows.length);
      if (rows.length === 0 || rows.length < Math.min(SUPABASE_MAX_ROWS_PER_REQUEST, SERVER_PAGE.size)) break;
      offset += rows.length;
    }
    return out;
  };

  const results: (SponsoredJob[] | null)[] = new Array(windows.length);
  // Newest day first, shown as soon as it arrives.
  results[0] = await loadWindow(windows[0]);
  // Nothing works — let the caller fall back to its cached copy.
  if (results[0] === null) return null;
  if (results[0]?.length) onPartial(results[0]);
  let next = 1;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < windows.length) {
        const i = next++;
        results[i] = await loadWindow(windows[i]);
      }
    })
  );
  const seen = new Set<string>();
  const rows = results
    .filter((x): x is SponsoredJob[] => Boolean(x))
    .flat()
    .filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  return { rows, complete: results.every(Boolean) };
}

/** Rows the server actually returns per request (its max-rows setting), learned on the fly. */
const SERVER_PAGE = { size: 0 };

/**
 * Every published, unexpired job (list columns only). `onPartial` is
 * called with something to show before the full list is ready — the
 * previous visit's cached copy and/or the newest page — so pages can
 * render immediately; the promise resolves with the complete, fresh list.
 */
/**
 * When a job was posted: the company's own posting date when the source
 * gave one, otherwise when it went live on MadeVisa — whichever is
 * earlier (same as job_posted_at() in the database). Sorting, the
 * "Date posted" filter, the age badge and the 30-day limit all use this.
 */
export function jobPostedAt(job: Pick<SponsoredJob, 'source_posted_at' | 'created_at'>): string {
  const created = Date.parse(job.created_at);
  const source = job.source_posted_at ? Date.parse(job.source_posted_at) : NaN;
  if (Number.isFinite(source) && (!Number.isFinite(created) || source < created)) return new Date(source).toISOString();
  return job.created_at;
}

/**
 * The newest published, unexpired jobs — one small request that uses the
 * (status, created_at) index. For the landing page and for guests on
 * /jobs, who only see the first page; much lighter than the full list.
 */
export async function fetchNewestPublishedJobs(limit = 60): Promise<SponsoredJob[]> {
  const asOf = nowIso();
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .or(`expires_at.is.null,expires_at.gt.${asOf}`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('fetchNewestPublishedJobs failed', error);
    return [];
  }
  return (data ?? []) as unknown as SponsoredJob[];
}

/**
 * Landing page: the newest job of 5 different companies (companies with a
 * logo first) — landing_job_ids, migration 20261028090000. Cached for 10
 * minutes in the browser, so new jobs show up quickly. Falls back to the
 * newest jobs if the function is missing.
 */
export async function fetchLandingJobs(n = 5): Promise<SponsoredJob[]> {
  const KEY = 'mv:landingJobs:v3'; // v3: newest per company, 10-minute cache
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { at: number; rows: SponsoredJob[] };
      if (Date.now() - saved.at < 10 * 60_000 && saved.rows?.length) return stillLive(saved.rows);
    }
  } catch {
    /* ignore */
  }
  const { data: ids, error } = await supabase.rpc('landing_job_ids', { n });
  if (error || !Array.isArray(ids) || !ids.length) return fetchNewestPublishedJobs(80);
  const { data, error: e2 } = await supabase.from('sponsored_jobs').select(LIST_COLUMNS).in('id', ids as string[]);
  if (e2 || !data?.length) return fetchNewestPublishedJobs(80);
  const order = new Map((ids as string[]).map((id, i) => [id, i]));
  const rows = (data as unknown as SponsoredJob[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rows }));
  } catch {
    /* ignore */
  }
  return rows;
}

/**
 * Newest jobs for signed-out visitors on /jobs, spread across companies:
 * each company's newest job before anyone's second (newest_diverse_job_ids,
 * migration 20261027090000), so one bulk import can't fill the first page.
 * Falls back to the plain newest list if the function isn't there yet.
 */
export async function fetchNewestDiverseJobs(limit = 36, perCompany = 3): Promise<SponsoredJob[]> {
  const { data: ids, error } = await supabase.rpc('newest_diverse_job_ids', { n: limit, per_company: perCompany });
  if (error || !Array.isArray(ids) || !ids.length) return fetchNewestPublishedJobs(limit);
  const { data, error: e2 } = await supabase.from('sponsored_jobs').select(LIST_COLUMNS).in('id', ids as string[]);
  if (e2 || !data?.length) return fetchNewestPublishedJobs(limit);
  const order = new Map((ids as string[]).map((id, i) => [id, i]));
  return (data as unknown as SponsoredJob[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** How many jobs went live on MadeVisa between `fromIso` and `toIso` (indexed count). */
export async function countJobsPublishedSince(fromIso: string, toIso?: string): Promise<number | null> {
  let q = supabase.from('sponsored_jobs').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('created_at', fromIso);
  if (toIso) q = q.lt('created_at', toIso);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

export async function fetchPublishedSponsoredJobs(opts: { onPartial?: (rows: SponsoredJob[]) => void } = {}): Promise<SponsoredJob[]> {
  // In memory: reuse while the release hasn't changed (or 60 s without releases).
  if (publishedJobsCache) {
    const rel = await fetchCurrentRelease();
    const sameRelease = rel && publishedJobsCache.release === rel.id;
    if (sameRelease || (!rel && Date.now() - publishedJobsCache.fetchedAt < PUBLISHED_JOBS_CACHE_TTL_MS)) return publishedJobsCache.data;
    // A newer release (auto-publish adds a few jobs every few minutes):
    // fetch just what changed instead of the whole list.
    if (rel && !inflight) {
      const caught = await catchUpCopy(publishedJobsCache, rel);
      if (caught) {
        publishedJobsCache = caught;
        writePersistedJobs(caught);
        return caught.data;
      }
    }
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
      const releaseP = fetchCurrentRelease();
      const persisted = publishedJobsCache ? null : await readPersistedJobs();
      const release = await releaseP;

      // 1. Saved copy of the current release: exactly right — no download at all.
      if (persisted && release && persisted.release === release.id) {
        const rows = stillLive(persisted.data);
        publishedJobsCache = { data: rows, fetchedAt: persisted.fetchedAt, release: release.id, releaseAt: persisted.releaseAt ?? release.published_at };
        emit(rows);
        return rows;
      }
      // 1b. Saved copy of an earlier release: show it at once, then add only
      //     what was published / closed since (a few small rows).
      if (persisted && release && persisted.releaseAt) {
        const shown = stillLive(persisted.data);
        shownCount = shown.length;
        emit(shown);
        const caught = await catchUpCopy(persisted, release);
        if (caught) {
          publishedJobsCache = caught;
          emit(caught.data);
          writePersistedJobs(caught);
          return caught.data;
        }
      }
      // 2. An older saved copy: show it at once, refresh behind it.
      if (shownCount > 0) {
        // Already showing the saved copy (1b) — refresh behind it.
      } else if (persisted && Date.now() - persisted.fetchedAt < PERSISTED_MAX_AGE_MS) {
        const rows = stillLive(persisted.data);
        shownCount = rows.length;
        emit(rows);
      } else {
        // 3. First visit: the newest jobs across companies in one small request,
        //    so nobody waits for the full list.
        fetchNewestDiverseJobs(36, 2)
          .then((quick) => {
            if (shownCount === 0 && quick.length) {
              shownCount = quick.length;
              emit(quick);
            }
          })
          .catch(() => undefined);
      }
      const fresh = await fetchPublishedFromNetwork((firstPage) => {
        // Don't replace a fuller list with just the first page.
        if (firstPage.length > shownCount) {
          shownCount = firstPage.length;
          emit(firstPage);
        }
      });
      const fallback = publishedJobsCache?.data ?? (persisted ? stillLive(persisted.data) : null);
      if (!fresh) return fallback ?? [];
      // An incomplete load (a page kept failing) is shown if there's
      // nothing better, but never saved as the reference copy.
      if (!fresh.complete) return fallback && fallback.length > fresh.rows.length ? fallback : fresh.rows;
      publishedJobsCache = { data: fresh.rows, fetchedAt: Date.now(), release: release?.id ?? null, releaseAt: release?.published_at ?? null };
      writePersistedJobs(publishedJobsCache);
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
  const run = (cols: string) => supabase.from('sponsored_jobs').select(cols).eq('publisher_id', publisherId).order('created_at', { ascending: false });
  // Detail columns include work arrangement / visa status for the company
  // form; fall back if an older database doesn't have them yet.
  let { data, error } = await run(detailColumns);
  if (error && /column|schema cache/i.test(error.message)) ({ data, error } = await run(columns));

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
const detailFullColumns = detailColumns.replace(', publisher:', ', facts, closed_at, publisher:');

type DetailQuery = (cols: string) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
// Plus the stored detector results (20261007090000 migration).
const detailWithFactsColumns = detailColumns.replace(', publisher:', ', facts, publisher:');
const isMissingColumn = (e: { message: string; code?: string }) => /column|schema cache/i.test(e.message) || e.code === '42703';
async function withDetailColumns(run: DetailQuery, runLiveOnly?: DetailQuery) {
  // Newest: facts + closed_at, and recently closed jobs too.
  if (!closedColumnMissing) {
    const full = await run(detailFullColumns);
    if (!full.error || !isMissingColumn(full.error)) return full;
    closedColumnMissing = true;
  }
  run = runLiveOnly ?? run;
  const withFacts = await run(detailWithFactsColumns);
  if (!withFacts.error || !isMissingColumn(withFacts.error)) return withFacts;
  const first = await run(detailColumns);
  if (!first.error) return first;
  if (isMissingColumn(first.error)) return run(columns);
  return first;
}

/** Fetches one published sponsored job by id — for the public job detail page. */
export async function fetchSponsoredJobById(id: string): Promise<SponsoredJob | null> {
  const { data, error } = await withDetailColumns(
    (cols) => supabase.from('sponsored_jobs').select(cols).eq('id', id).or(liveOrRecentlyClosed(nowIso())).maybeSingle(),
    (cols) => supabase.from('sponsored_jobs').select(cols).eq('id', id).eq('status', 'published').maybeSingle()
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
  const byPrefix = (cols: string) =>
    supabase
      .from('sponsored_jobs')
      .select(cols)
      .gte('id', `${prefix}-0000-0000-0000-000000000000`)
      .lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`)
      .limit(10);
  const { data, error } = await withDetailColumns(
    (cols) => byPrefix(cols).or(liveOrRecentlyClosed(nowIso())),
    (cols) => byPrefix(cols).eq('status', 'published')
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

/**
 * Company name from the job's own link, for when the company record can't
 * be read (e.g. not verified): boards.greenhouse.io/okta → "Okta",
 * eaton.eightfold.ai → "Eaton", careers.bosch.com → "Bosch".
 */
export function companyNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
  let name: string | null = null;
  if (/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|recruitee\.com|teamtailor\.com|breezy\.hr|jobvite\.com)$/.test(host)) name = seg;
  else if (/\.(myworkdayjobs|myworkdaysite|eightfold|wd\d+|icims|taleo|successfactors|personio|bamboohr|jobs\.personio)\b/.test(host) || /\.(eightfold\.ai|icims\.com|bamboohr\.com)$/.test(host)) name = host.split('.')[0];
  else {
    const parts = host.split('.').filter((p) => !/^(careers?|jobs?|job-boards|boards|apply|recruiting|talent|join|work|en|www\d?)$/.test(p));
    name = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? null;
  }
  if (!name || name.length < 2 || /^\d+$/.test(name)) return null;
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sponsoredJobToBoardJob(job: SponsoredJob): import('@/data/jobs').Job {
  const companyName = job.publisher?.name ?? companyNameFromUrl(job.official_url ?? job.application_url) ?? 'Company';
  return {
    id: `sponsored-${job.id}`,
    publisherId: job.publisher_id ?? null,
    title: job.title,
    company: companyName,
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
    source: companyName,
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
    // A job without its own image shows the company's logo.
    imageUrl: job.image_url || job.publisher?.logo_url || null,
    postedDate: jobPostedAt(job),
    sourcePostedAt: job.source_posted_at ?? null,
    sharedAt: job.approved_at ?? job.created_at,
    experienceLevel: job.experience_level,
    workArrangement: job.work_arrangement ?? null,
    visaStatus: job.visa_status ?? null,
    lastSeenAt: job.last_seen_at ?? null,
    closedAt: isClosedJob(job) ? job.closed_at ?? null : null,
    closed: isClosedJob(job),
    sourceType: isDirectListing(job) ? 'company_submitted' : 'company_careers',
    companyAddedAt: job.publisher?.created_at ?? null,
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

// ---------------------------------------------------------------------------
// Showcase jobs (sign-in / register ticker)
// ---------------------------------------------------------------------------

export type ShowcaseJob = {
  id: string;
  title: string;
  company: string;
  logoUrl: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  remote: boolean;
};

let showcaseCache: Promise<ShowcaseJob[]> | null = null;

/**
 * A small random sample of recent jobs for decoration on the auth pages —
 * one request for ~200 short rows (no descriptions), one job per company,
 * shuffled, never the whole catalog. Shared per tab, so switching between sign-in and register
 * doesn't refetch.
 */
export function fetchShowcaseJobs(count = 24): Promise<ShowcaseJob[]> {
  if (!showcaseCache) {
    showcaseCache = (async () => {
      const { data, error } = await supabase
        .from('sponsored_jobs')
        .select('id, title, city, remote, image_url, publisher:program_publishers(name, logo_url), country:countries(name, iso_code)')
        .eq('status', 'published')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error || !data) {
        showcaseCache = null;
        return [];
      }
      type Row = {
        id: string;
        title: string;
        city: string | null;
        remote: boolean;
        image_url: string | null;
        publisher: { name: string; logo_url: string | null } | null;
        country: { name: string; iso_code: string } | null;
      };
      const rows = (data as unknown as Row[]).map(
        (r): ShowcaseJob => ({
          id: r.id,
          title: r.title,
          company: r.publisher?.name ?? '',
          logoUrl: r.image_url ?? r.publisher?.logo_url ?? null,
          city: r.city && !/^(?:all|any|various|remote)$/i.test(r.city.trim()) ? r.city : null,
          country: r.country?.name ?? null,
          countryCode: r.country?.iso_code ?? null,
          remote: r.remote,
        })
      );
      // Shuffle, then keep exactly one job per company.
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      const seen = new Set<string>();
      return rows.filter((r) => r.company && (seen.has(r.company) ? false : (seen.add(r.company), true))).slice(0, count);
    })();
  }
  return showcaseCache;
}
