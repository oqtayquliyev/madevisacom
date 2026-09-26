// Import sources + one-click sync.
//
// Every Greenhouse board / careers URL an admin imports from is saved as
// an `import_sources` row. "Sync" re-fetches that source IN FULL and then:
//   - adds jobs that are new on the source,
//   - refreshes jobs still live there (last_seen_at, keeps published ones
//     from expiring, optionally re-pulls title/description),
//   - removes jobs the source no longer lists (delete, or mark expired),
//   - cleans up duplicates left by older re-imports.
//
// Safety rules — a sync never removes anything unless:
//   - the fetch finished completely (no error, not stopped midway), and
//   - the source returned at least one job, and
//   - (by default) it wouldn't remove more than MAX_REMOVAL_SHARE of the
//     company's jobs in one go, which almost always means the source broke
//     rather than the company closing most of its roles overnight.

import { supabase } from '@/lib/supabase';
import { fetchGreenhouseJobs, fetchJobsFromCareersUrl, isJunkJob, sanitizeJobHtml, type FetchedJob } from '@/lib/atsImport';
import {
  fetchAllRows,
  importJobsAsPending,
  normalizeJobUrl,
  type ImportCountryLookup,
  type ImportJobInput,
} from '@/lib/admin';

export type ImportSourceKind = 'greenhouse' | 'careers_url';

export type SyncSummary = {
  fetched: number;
  added: number;
  refreshed: number;
  removed: number;
  duplicatesRemoved: number;
  adopted: number;
  removalMode?: 'delete' | 'expire' | 'close';
  error?: string;
  blockedRemovals?: number;
};

export type ImportSource = {
  id: string;
  publisher_id: string;
  kind: ImportSourceKind;
  source_url: string;
  resolved_url: string | null;
  strategy: string | null;
  detected_platform: string | null;
  auto_publish: boolean;
  last_synced_at: string | null;
  last_sync_status: 'ok' | 'partial' | 'error' | null;
  last_sync_summary: SyncSummary | null;
  created_at: string;
  /** Scheduled sync every N hours (null/0 = manual only). Added by the 20260926090000 migration. */
  sync_interval_hours?: number | null;
  publisher?: { id: string; name: string; logo_url: string | null } | null;
};

const SOURCE_COLUMNS = '*, publisher:program_publishers(id, name, logo_url)';

export async function fetchImportSources(): Promise<ImportSource[]> {
  // '*' so newer optional columns (sync_interval_hours) come through when present without breaking before the migration runs.
  const { data, error } = await supabase.from('import_sources').select(SOURCE_COLUMNS).order('created_at', { ascending: false });
  if (error) {
    console.error('fetchImportSources failed', error);
    return [];
  }
  return (data ?? []) as unknown as ImportSource[];
}

/** Saves (or refreshes) the source an import came from and returns its id. */
export async function registerImportSource(input: {
  publisherId: string;
  kind: ImportSourceKind;
  sourceUrl: string;
  resolvedUrl?: string | null;
  strategy?: string | null;
  platform?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sourceUrl = input.kind === 'greenhouse' ? input.sourceUrl.trim().toLowerCase() : input.sourceUrl.trim();
  const row: Record<string, unknown> = { publisher_id: input.publisherId, kind: input.kind, source_url: sourceUrl };
  if (input.resolvedUrl !== undefined) row.resolved_url = input.resolvedUrl;
  if (input.strategy !== undefined) row.strategy = input.strategy;
  if (input.platform !== undefined) row.detected_platform = input.platform;
  const { data, error } = await supabase.from('import_sources').upsert(row, { onConflict: 'publisher_id,kind,source_url' }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not save the import source.' };
  return { ok: true, id: data.id };
}

export async function updateImportSource(
  id: string,
  patch: Partial<Pick<ImportSource, 'auto_publish' | 'source_url' | 'resolved_url' | 'strategy' | 'sync_interval_hours'>>
) {
  const { error } = await supabase.from('import_sources').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Removes the saved source. Its jobs stay (they just stop syncing) unless `deleteJobs` is set. */
export async function deleteImportSource(id: string, deleteJobs: boolean): Promise<{ ok: boolean; error?: string }> {
  if (deleteJobs) {
    const { error } = await supabase.from('sponsored_jobs').delete().eq('import_source_id', id);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase.from('import_sources').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export function fetchedJobToImportInput(j: FetchedJob | (Omit<FetchedJob, 'updatedAt'> & { updatedAt?: string })): ImportJobInput {
  return {
    externalId: j.externalId,
    title: j.title,
    description: sanitizeJobHtml(j.descriptionHtml),
    officialUrl: j.url,
    additionalLocations: j.offices,
    locationText: j.locationText,
    category: j.category,
    employmentTypeRaw: j.employmentTypeRaw,
    postedAt: j.postedAt,
    remote: j.remote,
    salaryText: j.salaryText,
    workArrangement: j.workArrangement ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fetch a whole source
// ---------------------------------------------------------------------------

type FetchAllResult =
  | { ok: true; jobs: ImportJobInput[]; resolvedUrl?: string | null; strategy?: string | null; platform?: string | null }
  | { ok: false; error: string; aborted?: boolean };

const MAX_CAREERS_BATCHES = 400;
/** One source may take at most this long; then the update moves on. */
const SOURCE_TIME_BUDGET_MS = 12 * 60_000;
/** One Edge Function call that never answers is given up after this. */
const REQUEST_TIMEOUT_MS = 170_000;

async function withTimeout<T extends { ok: boolean }>(p: Promise<T>, ms: number): Promise<T | { ok: false; error: string }> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; error: string }>((resolve) => {
    t = setTimeout(() => resolve({ ok: false, error: `The source didn't answer within ${Math.round(ms / 1000)} s.` }), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export async function fetchWholeSource(
  source: Pick<ImportSource, 'kind' | 'source_url' | 'resolved_url' | 'strategy'>,
  onProgress?: (fetched: number, total: number | null) => void,
  shouldStop?: () => boolean
): Promise<FetchAllResult> {
  if (source.kind === 'greenhouse') {
    const res = await fetchGreenhouseJobs(source.source_url);
    if (!res.ok) return { ok: false, error: res.error ?? 'Greenhouse fetch failed.' };
    onProgress?.(res.jobs.length, res.jobs.length);
    return { ok: true, jobs: res.jobs.filter((j) => !isJunkJob(j.title, j.descriptionHtml)).map(fetchedJobToImportInput), platform: 'Greenhouse' };
  }

  const all: ImportJobInput[] = [];
  const seen = new Set<string>();
  let from = 0;
  let total: number | null = null;
  // Reuse the strategy detected last time so we skip re-crawling. If it
  // fails (site changed), retry once from scratch with fresh detection.
  let cont: { resolvedUrl?: string | null; strategy?: string | null } | undefined =
    source.strategy ? { resolvedUrl: source.resolved_url, strategy: source.strategy } : undefined;
  let retriedFresh = !cont;
  let platform: string | null = null;

  const deadline = Date.now() + SOURCE_TIME_BUDGET_MS;
  let emptyBatches = 0;
  for (let batch = 0; batch < MAX_CAREERS_BATCHES; batch++) {
    if (shouldStop?.()) return { ok: false, error: 'Stopped before the source was fully fetched — nothing was removed.', aborted: true };
    if (Date.now() > deadline) {
      // Too slow to finish — keep what we have out of removals and move on to the next company.
      return { ok: false, error: `Took longer than ${Math.round(SOURCE_TIME_BUDGET_MS / 60_000)} min — skipped (nothing was removed). Check the source link.` };
    }
    const res = await withTimeout(fetchJobsFromCareersUrl(source.source_url, from, cont), REQUEST_TIMEOUT_MS);
    if (!res.ok) {
      if (!retriedFresh && batch === 0) {
        retriedFresh = true;
        cont = undefined;
        batch = -1;
        continue;
      }
      return { ok: false, error: res.error };
    }
    if (res.strategy) cont = { resolvedUrl: res.resolvedUrl, strategy: res.strategy };
    if (res.source) platform = res.source;
    if (res.totalHits != null) total = res.totalHits;
    let fresh = 0;
    for (const j of res.jobs) {
      if (isJunkJob(j.title, j.descriptionHtml)) continue;
      const key = j.externalId || normalizeJobUrl(j.url);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(fetchedJobToImportInput(j));
      fresh++;
    }
    onProgress?.(all.length, total);
    const done = { ok: true as const, jobs: all, resolvedUrl: cont?.resolvedUrl ?? null, strategy: cont?.strategy ?? null, platform };
    if (!res.nextFrom) return done;
    // Some sites ignore the page number and return page 1 again. Two
    // batches in a row with nothing new = we already have everything.
    emptyBatches = fresh === 0 ? emptyBatches + 1 : 0;
    if (emptyBatches >= 2 || res.nextFrom <= from) return done;
    from = res.nextFrom;
  }
  return { ok: false, error: `Stopped after ${MAX_CAREERS_BATCHES} batches without reaching the end — nothing was removed.` };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncOptions = {
  countries: ImportCountryLookup[];
  /** Jobs gone from the source: delete now, mark expired (kept), or close — shown greyed for 24 h, then deleted by cleanup with their stats kept. */
  removal: 'delete' | 'expire' | 'close';
  refreshContent: boolean;
  /** Allow removing more than MAX_REMOVAL_SHARE of a company's jobs in one sync. */
  allowLargeRemoval?: boolean;
  onProgress?: (message: string) => void;
  /** 0..1 progress of this one source's sync. */
  onPercent?: (fraction: number) => void;
  shouldStop?: () => boolean;
};

export const MAX_REMOVAL_SHARE = 0.6;
const CHUNK = 50;
const DAY_MS = 86_400_000;

type ExistingRow = {
  id: string;
  title: string;
  status: string;
  external_id: string | null;
  official_url: string | null;
  import_source_id: string | null;
  created_at: string;
  work_arrangement?: string | null;
  closed_reason?: string | null;
};

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  for (let i = 0; i < items.length; i += size) {
    const { error } = await fn(items.slice(i, i + size));
    if (error) return error.message;
  }
  return null;
}

async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await fn(items[cursor++]);
    })
  );
}

export async function syncImportSource(source: ImportSource, opts: SyncOptions): Promise<{ ok: boolean; summary: SyncSummary }> {
  const say = opts.onProgress ?? (() => {});
  const pct = opts.onPercent ?? (() => {});
  pct(0.02);
  const summary: SyncSummary = { fetched: 0, added: 0, refreshed: 0, removed: 0, duplicatesRemoved: 0, adopted: 0, removalMode: opts.removal };
  const name = source.publisher?.name ?? 'company';

  const finish = async (status: 'ok' | 'partial' | 'error', extra: Record<string, unknown> = {}) => {
    await supabase
      .from('import_sources')
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: status, last_sync_summary: summary, ...extra })
      .eq('id', source.id);
    return { ok: status !== 'error', summary };
  };

  // 1. Fetch everything from the source.
  say(`${name}: fetching from source…`);
  const fetched = await fetchWholeSource(
    source,
    (n, total) => {
      say(`${name}: fetched ${n}${total ? ` of ~${total}` : ''}…`);
      pct(total ? 0.05 + 0.55 * Math.min(1, n / total) : 0.3);
    },
    opts.shouldStop
  );
  pct(0.6);
  if (!fetched.ok) {
    summary.error = fetched.error;
    return finish('error');
  }
  summary.fetched = fetched.jobs.length;
  if (fetched.jobs.length === 0) {
    summary.error = 'The source returned 0 jobs — skipped removals in case the source is temporarily broken.';
    return finish('error');
  }

  // 2. Load what MadeVisa already has for this source, plus older
  //    imports of the same company that predate saved sources.
  say(`${name}: comparing with MadeVisa…`);
  const { count: sourceCount } = await supabase.from('import_sources').select('id', { count: 'exact', head: true }).eq('publisher_id', source.publisher_id);
  const onlySourceForCompany = (sourceCount ?? 1) <= 1;

  let existing: ExistingRow[];
  // work_arrangement arrived in a later migration — fall back cleanly if it isn't there yet.
  let hasWorkArrangement = true;
  const loadExisting = (cols: string) =>
    fetchAllRows<ExistingRow>(() =>
      supabase
        .from('sponsored_jobs')
        .select(cols, { count: 'exact' })
        .eq('publisher_id', source.publisher_id)
        .eq('origin', 'imported')
        .order('created_at', { ascending: true }) as unknown as {
        range: (from: number, to: number) => PromiseLike<{ data: ExistingRow[] | null; error: { message: string } | null; count?: number | null }>;
      }
    );
  try {
    try {
      existing = await loadExisting('id, title, status, external_id, official_url, import_source_id, created_at, work_arrangement, closed_reason');
    } catch {
      try {
        existing = await loadExisting('id, title, status, external_id, official_url, import_source_id, created_at, work_arrangement');
      } catch {
        hasWorkArrangement = false;
        existing = await loadExisting('id, title, status, external_id, official_url, import_source_id, created_at');
      }
    }
  } catch (e) {
    summary.error = e instanceof Error ? e.message : 'Could not load existing jobs.';
    return finish('error');
  }
  // Only this source's jobs, plus unlinked legacy imports of this company.
  existing = existing.filter((r) => r.import_source_id === source.id || r.import_source_id === null);

  // 3. Match.
  const byExt = new Map<string, ImportJobInput>();
  const byUrl = new Map<string, ImportJobInput>();
  for (const j of fetched.jobs) {
    if (j.externalId) byExt.set(String(j.externalId), j);
    const u = normalizeJobUrl(j.officialUrl);
    if (u) byUrl.set(u, j);
  }

  const claimed = new Set<ImportJobInput>();
  const stillLive: { row: ExistingRow; job: ImportJobInput }[] = [];
  const gone: ExistingRow[] = [];
  const duplicates: ExistingRow[] = [];

  for (const row of existing) {
    const job = (row.external_id && byExt.get(row.external_id)) || byUrl.get(normalizeJobUrl(row.official_url));
    if (job) {
      if (claimed.has(job)) duplicates.push(row); // older re-imports created copies
      else {
        claimed.add(job);
        stillLive.push({ row, job });
      }
    } else if (row.import_source_id === source.id || onlySourceForCompany) {
      gone.push(row);
    }
  }
  const newJobs = fetched.jobs.filter((j) => !claimed.has(j));

  // 4. Safety check before removing anything.
  const removalCount = gone.length + duplicates.length;
  if (!opts.allowLargeRemoval && existing.length >= 10 && gone.length / existing.length > MAX_REMOVAL_SHARE) {
    summary.blockedRemovals = gone.length;
    summary.error = `Would remove ${gone.length} of ${existing.length} jobs (${Math.round((gone.length / existing.length) * 100)}%) — held back in case the source is broken. Re-run with "allow large removals" if this is real.`;
    gone.length = 0;
  }

  // 5. Refresh live jobs.
  if (opts.shouldStop?.()) {
    summary.error = 'Stopped before changes were written.';
    return finish('error');
  }
  const now = new Date().toISOString();
  const extendTo = new Date(Date.now() + 30 * DAY_MS).toISOString();
  say(`${name}: refreshing ${stillLive.length} live jobs…`);
  pct(0.65);

  // Rows that need per-row writes: legacy rows being linked to this source,
  // rows missing an external id, and all rows when refreshing content.
  const needsOwnWrite = stillLive.filter(
    ({ row, job }) =>
      opts.refreshContent ||
      row.import_source_id !== source.id ||
      (!row.external_id && job.externalId) ||
      (hasWorkArrangement && !row.work_arrangement && job.workArrangement)
  );
  const ownWriteSet = new Set(needsOwnWrite);
  const bulk = stillLive.filter((x) => !ownWriteSet.has(x));

  let err = await inChunks(bulk.filter((x) => x.row.status === 'published').map((x) => x.row.id), CHUNK, (ids) =>
    supabase.from('sponsored_jobs').update({ last_seen_at: now, expires_at: extendTo }).in('id', ids)
  );
  err = err ?? (await inChunks(bulk.filter((x) => x.row.status !== 'published').map((x) => x.row.id), CHUNK, (ids) =>
    supabase.from('sponsored_jobs').update({ last_seen_at: now }).in('id', ids)
  ));
  if (err) {
    summary.error = err;
    return finish('error');
  }

  await withConcurrency(needsOwnWrite, 8, async ({ row, job }) => {
    const patch: Record<string, unknown> = { last_seen_at: now, import_source_id: source.id };
    if (job.externalId) patch.external_id = String(job.externalId);
    if (row.status === 'published') patch.expires_at = extendTo;
    if (hasWorkArrangement && !row.work_arrangement && job.workArrangement) patch.work_arrangement = job.workArrangement;
    if (opts.refreshContent) {
      patch.title = job.title;
      if (job.description) patch.description = job.description;
      if (job.officialUrl) patch.official_url = job.officialUrl;
      const posted = job.postedAt ? new Date(job.postedAt) : null;
      if (posted && !Number.isNaN(posted.getTime())) patch.source_posted_at = posted.toISOString();
    }
    const { error } = await supabase.from('sponsored_jobs').update(patch).eq('id', row.id);
    if (error) summary.error = error.message;
    else if (row.import_source_id !== source.id) summary.adopted++;
  });
  // Closed by an earlier sync but back on the careers page: reopen.
  const reopen = stillLive.filter(({ row }) => row.status === 'expired' && row.closed_reason === 'source').map(({ row }) => row.id);
  if (reopen.length) {
    const e = await inChunks(reopen, CHUNK, (ids) => supabase.from('sponsored_jobs').update({ status: 'published', expires_at: extendTo }).in('id', ids));
    if (e) summary.error = e;
  }
  summary.refreshed = stillLive.length;
  pct(0.8);

  // 6. Add new jobs.
  if (newJobs.length) {
    say(`${name}: adding ${newJobs.length} new jobs…`);
    const res = await importJobsAsPending(source.publisher_id, opts.countries, newJobs, {
      importSourceId: source.id,
      status: source.auto_publish ? 'published' : 'pending',
      skipExisting: false, // already de-duplicated above
    });
    summary.added = res.imported;
    if (!res.ok) summary.error = res.error;
  }

  pct(0.9);
  // 7. Remove what the source no longer lists (+ duplicate copies).
  const toRemove = [...gone, ...duplicates];
  if (toRemove.length) {
    say(`${name}: removing ${removalCount - (summary.blockedRemovals ?? 0)} jobs no longer on the source…`);
    const ids = toRemove.map((r) => r.id);
    // Duplicates are always deleted; removed-from-source follows the chosen mode.
    const dupIds = new Set(duplicates.map((d) => d.id));
    const goneIds = ids.filter((id) => !dupIds.has(id));
    const e1 = await inChunks([...dupIds], CHUNK, (chunk) => supabase.from('sponsored_jobs').delete().in('id', chunk));
    let removedN = goneIds.length;
    let e2: string | null;
    if (opts.removal === 'close') {
      // Live jobs → closed (greyed for 24 h, then cleanup deletes them and keeps their stats).
      // Pending ones were never public → deleted. Already closed/expired → left alone.
      const statusOf = new Map(toRemove.map((r) => [r.id, r.status]));
      const toClose = goneIds.filter((id) => statusOf.get(id) === 'published');
      const toDelete = goneIds.filter((id) => statusOf.get(id) !== 'published' && statusOf.get(id) !== 'expired');
      removedN = toClose.length + toDelete.length;
      e2 =
        (await inChunks(toClose, CHUNK, (chunk) => supabase.from('sponsored_jobs').update({ status: 'expired', closed_reason: 'source' }).in('id', chunk))) ??
        (await inChunks(toDelete, CHUNK, (chunk) => supabase.from('sponsored_jobs').delete().in('id', chunk)));
    } else {
      e2 =
        opts.removal === 'delete'
          ? await inChunks(goneIds, CHUNK, (chunk) => supabase.from('sponsored_jobs').delete().in('id', chunk))
          : await inChunks(goneIds, CHUNK, (chunk) => supabase.from('sponsored_jobs').update({ status: 'expired' }).in('id', chunk));
    }
    if (e1 || e2) summary.error = e1 ?? e2 ?? undefined;
    else {
      summary.removed = removedN;
      summary.duplicatesRemoved = dupIds.size;
    }
  }

  const status = summary.error ? 'partial' : 'ok';
  say(`${name}: done.`);
  pct(1);
  return finish(status, {
    ...(fetched.resolvedUrl !== undefined ? { resolved_url: fetched.resolvedUrl } : {}),
    ...(fetched.strategy !== undefined ? { strategy: fetched.strategy } : {}),
    ...(fetched.platform ? { detected_platform: fetched.platform } : {}),
  });
}

export function describeSyncSummary(s: SyncSummary | null | undefined): string {
  if (!s) return 'Never synced';
  const parts = [`${s.fetched} on source`];
  if (s.added) parts.push(`+${s.added} new`);
  if (s.removed) parts.push(`−${s.removed} ${s.removalMode === 'expire' ? 'expired' : s.removalMode === 'close' ? 'closed' : 'removed'}`);
  if (s.duplicatesRemoved) parts.push(`${s.duplicatesRemoved} duplicates cleaned`);
  if (s.adopted) parts.push(`${s.adopted} linked`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Scheduling, linking older jobs, adding many sources at once
// ---------------------------------------------------------------------------

/** True when a scheduled source is due for its next sync. */
export function isSourceDue(src: ImportSource, now = Date.now()): boolean {
  const h = src.sync_interval_hours ?? 0;
  if (!h) return false;
  if (!src.last_synced_at) return true;
  return now - new Date(src.last_synced_at).getTime() >= h * 3_600_000;
}

export function nextSyncAt(src: ImportSource): Date | null {
  const h = src.sync_interval_hours ?? 0;
  if (!h) return null;
  if (!src.last_synced_at) return new Date();
  return new Date(new Date(src.last_synced_at).getTime() + h * 3_600_000);
}

/**
 * Links jobs imported before sources existed to their company's source,
 * one quick UPDATE per company (only for companies with exactly one
 * source, so nothing gets attached to the wrong one).
 */
export async function linkOlderJobs(
  sources: ImportSource[],
  onPercent?: (fraction: number) => void
): Promise<{ linked: number; companies: number; error?: string }> {
  const byPublisher = new Map<string, ImportSource[]>();
  for (const s of sources) byPublisher.set(s.publisher_id, [...(byPublisher.get(s.publisher_id) ?? []), s]);
  const single = [...byPublisher.values()].filter((l) => l.length === 1).map((l) => l[0]);
  let linked = 0;
  let companies = 0;
  let error: string | undefined;
  for (let i = 0; i < single.length; i++) {
    const src = single[i];
    const { count, error: e } = await supabase
      .from('sponsored_jobs')
      .update({ import_source_id: src.id }, { count: 'exact' })
      .eq('publisher_id', src.publisher_id)
      .eq('origin', 'imported')
      .is('import_source_id', null);
    if (e) error = error ?? e.message;
    else if (count) {
      linked += count;
      companies++;
    }
    onPercent?.((i + 1) / single.length);
  }
  return { linked, companies, error };
}

export type ParsedSourceLine = { company: string; url: string; kind: ImportSourceKind; token: string };

/**
 * Parses a pasted list, one company per line:
 *   Netflix, Inc. | https://jobs.netflix.com/
 *   Stripe, stripe                      (Greenhouse token)
 *   Figma <tab> https://boards.greenhouse.io/figma
 */
export function parseSourceList(text: string): { ok: ParsedSourceLine[]; bad: string[] } {
  const ok: ParsedSourceLine[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*(?:\||\t|,\s*(?=https?:\/\/|[a-z0-9_-]+$)|\s+(?=https?:\/\/))\s*(\S+)\s*$/i);
    if (!m) {
      bad.push(line);
      continue;
    }
    const company = m[1].trim().replace(/[|,]\s*$/, '');
    const target = m[2].trim();
    if (/^https?:\/\//i.test(target)) {
      let u: URL;
      try {
        u = new URL(target);
      } catch {
        bad.push(line);
        continue;
      }
      if (/(^|\.)greenhouse\.io$/i.test(u.hostname)) {
        const token = u.searchParams.get('for') ?? u.pathname.split('/').filter(Boolean).find((x) => x !== 'embed' && x !== 'job_board') ?? '';
        if (token) {
          ok.push({ company, url: target, kind: 'greenhouse', token: token.toLowerCase() });
          continue;
        }
      }
      ok.push({ company, url: target, kind: 'careers_url', token: '' });
    } else if (/^[a-z0-9_-]{2,60}$/i.test(target)) {
      ok.push({ company, url: `https://boards.greenhouse.io/${target.toLowerCase()}`, kind: 'greenhouse', token: target.toLowerCase() });
    } else bad.push(line);
  }
  return { ok, bad };
}

/** Public link for a source, for showing/clicking in the admin table. */
export function sourcePublicUrl(src: Pick<ImportSource, 'kind' | 'source_url'>): string {
  return src.kind === 'greenhouse' ? `https://boards.greenhouse.io/${src.source_url}` : src.source_url;
}
