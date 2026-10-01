// The conveyor: every 3–4 minutes, 1–3 companies (each from a different
// country), a few new jobs, published straight away.
//
// Per company it does what "Update all jobs" does for one source — close
// jobs that left the careers page, reopen ones that came back, mark the
// rest as still there — but it only ADDS the few newest new jobs this round
// needs. Whatever else is new stays on the company's careers page and is
// picked up on a later visit, so nothing piles up in a waiting list here.

import { notifyGoogle } from './indexing.ts';
import { logoCandidates, makeLogo } from '../company-finder/finder.ts';
import {
  jobUrl,
  allRows,
  analyse,
  companyCountryOf,
  countryIds,
  recheckCountry,
  fetchSource,
  isJunkJob,
  isTooOld,
  jobToRow,
  normalizeJobUrl,
  sanitizeJobHtml,
  type Service,
  type SourceJob,
} from './shared.ts';

type Source = {
  id: string;
  publisher_id: string;
  kind: string;
  source_url: string;
  resolved_url: string | null;
  strategy: string | null;
  auto_publish: boolean;
  publisher_name: string | null;
  country: string | null;
};

type Existing = {
  id: string;
  title: string;
  status: string;
  external_id: string | null;
  official_url: string | null;
  import_source_id: string | null;
  closed_reason: string | null;
  awaiting_release: boolean | null;
  country_id?: string | null;
  city?: string | null;
};

type Report = {
  name: string;
  country: string | null;
  fetched: number;
  added: number;
  removed: number;
  more: number;
  complete: boolean;
  error?: string;
};

const MAX_REMOVAL_SHARE = 0.6; // same safety rule as src/lib/importSync.ts
const CHUNK = 200;

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  for (let i = 0; i < items.length; i += size) {
    const { error } = await fn(items.slice(i, i + size));
    if (error) return error.message;
  }
  return null;
}

async function syncOne(
  service: Service,
  src: Source,
  take: number,
  cfg: { minChars: number; maxAgeDays: number },
  byIso: Map<string, string>,
  deadline: number
): Promise<{ report: Report; publishedIds: string[]; urls: string[] }> {
  const report: Report = { name: src.publisher_name ?? 'Company', country: src.country, fetched: 0, added: 0, removed: 0, more: 0, complete: false };
  const finish = async (status: 'ok' | 'partial' | 'error', extra: Record<string, unknown> = {}) => {
    await service
      .from('import_sources')
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: status,
        last_sync_summary: {
          fetched: report.fetched,
          added: report.added,
          refreshed: 0,
          removed: report.removed,
          duplicatesRemoved: 0,
          adopted: 0,
          removalMode: 'close',
          ...(report.error ? { error: report.error } : {}),
        },
        ...extra,
      })
      .eq('id', src.id);
  };

  // 1. Read the careers feed (capped: 12 batches / ~2.5 min).
  const fetched = await fetchSource(service, src, { maxBatches: 12, deadline: Math.min(deadline, Date.now() + 150_000) });
  if (!fetched.ok) {
    report.error = fetched.error;
    await finish('error');
    return { report, publishedIds: [], urls: [] };
  }
  report.fetched = fetched.jobs.length;
  report.complete = fetched.complete;
  const sourceMeta = {
    ...(fetched.resolvedUrl !== undefined ? { resolved_url: fetched.resolvedUrl } : {}),
    ...(fetched.strategy !== undefined ? { strategy: fetched.strategy } : {}),
    ...(fetched.platform ? { detected_platform: fetched.platform } : {}),
  };
  if (!fetched.jobs.length) {
    report.error = 'The source returned 0 jobs — nothing removed, in case it is temporarily broken.';
    await finish('error', sourceMeta);
    return { report, publishedIds: [], urls: [] };
  }

  // 2. What MadeVisa already has for this company.
  const { count: sourceCount } = await service.from('import_sources').select('id', { count: 'exact', head: true }).eq('publisher_id', src.publisher_id);
  const onlySource = (sourceCount ?? 1) <= 1;
  let existing: Existing[];
  try {
    existing = await allRows<Existing>((from, to) =>
      service
        .from('sponsored_jobs')
        .select('id, title, status, external_id, official_url, import_source_id, closed_reason, awaiting_release, country_id, city')
        .eq('publisher_id', src.publisher_id)
        .eq('origin', 'imported')
        .order('created_at', { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    report.error = e instanceof Error ? e.message : 'Could not load existing jobs.';
    await finish('error', sourceMeta);
    return { report, publishedIds: [], urls: [] };
  }
  existing = existing.filter((r) => r.import_source_id === src.id || r.import_source_id === null);

  // 3. Match by the source's own id, then by URL.
  const byExt = new Map<string, SourceJob>();
  const byUrl = new Map<string, SourceJob>();
  for (const j of fetched.jobs) {
    if (j.externalId) byExt.set(String(j.externalId), j);
    const u = normalizeJobUrl(j.url);
    if (u) byUrl.set(u, j);
  }
  const claimed = new Set<SourceJob>();
  const live: { row: Existing; job: SourceJob }[] = [];
  const gone: Existing[] = [];
  for (const row of existing) {
    const job = (row.external_id && byExt.get(row.external_id)) || byUrl.get(normalizeJobUrl(row.official_url));
    if (job) {
      if (!claimed.has(job)) {
        claimed.add(job);
        live.push({ row, job });
      }
    } else if (row.import_source_id === src.id || onlySource) {
      gone.push(row);
    }
  }

  // 4. Close what left the careers page — only after a complete read, and
  //    never most of a company's jobs at once (that means the source broke).
  const tooMany = existing.length >= 10 && gone.length / existing.length > MAX_REMOVAL_SHARE;
  if (fetched.complete && !tooMany && gone.length) {
    const toClose = gone.filter((r) => r.status === 'published' && !r.awaiting_release).map((r) => r.id);
    // Never public (waiting / pending) → just deleted.
    const toDelete = gone.filter((r) => (r.status === 'published' && r.awaiting_release) || (r.status !== 'published' && r.status !== 'expired')).map((r) => r.id);
    const err =
      (await inChunks(toClose, CHUNK, (ids) => service.from('sponsored_jobs').update({ status: 'expired', closed_reason: 'source' }).in('id', ids))) ??
      (await inChunks(toDelete, CHUNK, (ids) => service.from('sponsored_jobs').delete().in('id', ids)));
    if (err) report.error = err;
    else report.removed = toClose.length + toDelete.length;
  } else if (tooMany) {
    report.error = `Would remove ${gone.length} of ${existing.length} jobs — held back in case the source is broken.`;
  }

  // 5. Still there: reopen ones closed earlier, link older imports, mark as seen.
  const reopen = live.filter(({ row }) => row.status === 'expired' && row.closed_reason === 'source').map(({ row }) => row.id);
  if (reopen.length) {
    const extendTo = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await inChunks(reopen, CHUNK, (ids) => service.from('sponsored_jobs').update({ status: 'published', expires_at: extendTo }).in('id', ids));
  }
  for (const { row, job } of live.filter(({ row }) => row.import_source_id !== src.id).slice(0, 200)) {
    await service
      .from('sponsored_jobs')
      .update({ import_source_id: src.id, ...(job.externalId && !row.external_id ? { external_id: String(job.externalId) } : {}) })
      .eq('id', row.id);
  }
  // Location check on every pass: jobs saved in the wrong country by an
  // older import ("North Chicago, IL" as Israel) move to the right one.
  const companyCountry = companyCountryOf(fetched.jobs);
  const isoById = new Map([...byIso.entries()].map(([iso, id]) => [id, iso]));
  for (const { row, job } of live) {
    const storedIso = row.country_id ? isoById.get(row.country_id) : undefined;
    if (!storedIso) continue;
    const target = recheckCountry(storedIso, row.city ?? null, job, companyCountry);
    const id = target ? byIso.get(target) : undefined;
    if (id) await service.from('sponsored_jobs').update({ country_id: id }).eq('id', row.id);
  }

  const seen = live.filter(({ row }) => row.status === 'published').map(({ row }) => row.id);
  for (let i = 0; i < seen.length; i += 1000) await service.rpc('conveyor_mark_seen', { p_ids: seen.slice(i, i + 1000) });

  // 6. New on the source: only the few newest this round needs.
  const maxAgeMs = cfg.maxAgeDays * 86_400_000;
  const postedMs = (j: SourceJob) => (j.postedAt ? Date.parse(j.postedAt) : NaN);
  const candidates = fetched.jobs
    .filter((j) => !claimed.has(j))
    .filter((j) => !isTooOld(j.postedAt))
    .filter((j) => {
      const t = postedMs(j);
      return !Number.isFinite(t) || Date.now() - t <= maxAgeMs;
    })
    .sort((a, b) => (Number.isFinite(postedMs(b)) ? postedMs(b) : 0) - (Number.isFinite(postedMs(a)) ? postedMs(a) : 0));

  const rows: Record<string, unknown>[] = [];
  let used = 0;
  for (const j of candidates) {
    if (rows.length >= take) break;
    used++;
    const description = sanitizeJobHtml(j.descriptionHtml ?? '');
    // Too short to be a real job ad ("Read about our fees") → skip.
    if (description.length < cfg.minChars || isJunkJob(j.title, description, j.url)) continue;
    const payload = analyse(j.title, description);
    rows.push(jobToRow(j, description, payload, { publisherId: src.publisher_id, importSourceId: src.id, status: src.auto_publish ? 'published' : 'pending', countryIdByIso: byIso, companyCountry }));
  }
  report.more = Math.max(0, candidates.length - used);

  const publishedIds: string[] = [];
  const urls: string[] = [];
  if (rows.length) {
    let ins = await service.from('sponsored_jobs').insert(rows).select('id, status, title');
    if (ins.error && /work_arrangement|visa_status|column/i.test(ins.error.message)) {
      ins = await service
        .from('sponsored_jobs')
        .insert(rows.map(({ work_arrangement: _w, visa_status: _v, ...rest }) => rest))
        .select('id, status, title');
    }
    if (ins.error) report.error = ins.error.message;
    else {
      const got = (ins.data ?? []) as { id: string; status: string; title: string }[];
      report.added = got.length;
      for (const r of got.filter((r) => r.status === 'published')) {
        publishedIds.push(r.id);
        urls.push(jobUrl({ id: r.id, title: r.title, company: src.publisher_name ?? 'company' }));
      }
    }
  }

  await finish(report.error ? 'partial' : 'ok', sourceMeta);
  return { report, publishedIds, urls };
}

/**
 * A company without a logo gets one on its next visit: Wikipedia logo →
 * its careers page's own favicon → website icon → favicon services.
 * Capped at ~30 s so it never holds up the sync.
 */
async function ensureLogo(service: Service, src: Source): Promise<void> {
  const { data: pub } = await service.from('program_publishers').select('id, name, website, logo_url').eq('id', src.publisher_id).maybeSingle();
  if (!pub || pub.logo_url) return;
  const name = String(pub.name ?? src.publisher_name ?? '').trim();
  if (!name) return;
  const { data: sample } = await service
    .from('sponsored_jobs')
    .select('official_url')
    .eq('publisher_id', src.publisher_id)
    .not('official_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3);
  const pages = [
    src.resolved_url,
    /^https?:\/\//i.test(src.source_url) ? src.source_url : null,
    ...((sample ?? []) as { official_url: string | null }[]).map((r) => r.official_url),
  ];
  const work = (async () => {
    const icons = await logoCandidates({ name, website: pub.website ?? null, pages });
    const logo = icons.length ? await makeLogo(service, icons, name) : null;
    if (logo) await service.from('program_publishers').update({ logo_url: logo }).eq('id', pub.id).is('logo_url', null);
  })();
  await Promise.race([work.catch(() => undefined), new Promise((r) => setTimeout(r, 30_000))]);
}

export async function runConveyor(service: Service, want: number): Promise<void> {
  const deadline = Date.now() + 210_000; // well inside the Edge Function time limit
  const { data: claimed } = await service.rpc('pipeline_claim', { p_kind: 'sync', p_minutes: 6 });
  if (claimed !== true) return; // another run is still going

  try {
    const { data: cfgRow } = await service.from('auto_release_settings').select('min_description_chars, max_age_days, companies_per_run').eq('id', true).maybeSingle();
    const cfg = { minChars: cfgRow?.min_description_chars ?? 200, maxAgeDays: cfgRow?.max_age_days ?? 14 };
    const { data: sources, error } = await service.rpc('conveyor_next_sources', { p_count: cfgRow?.companies_per_run ?? 3 });
    if (error) throw new Error(error.message);
    const byIso = await countryIds(service);

    const ids: string[] = [];
    const urls: string[] = [];
    const reports: Report[] = [];
    for (const src of (sources ?? []) as Source[]) {
      if (Date.now() > deadline - 20_000) break;
      try {
        const r = await syncOne(service, src, Math.max(0, want - ids.length), cfg, byIso, deadline);
        ids.push(...r.publishedIds);
        urls.push(...r.urls);
        reports.push(r.report);
        if (Date.now() < deadline - 50_000) await ensureLogo(service, src).catch(() => undefined);
      } catch (e) {
        reports.push({ name: src.publisher_name ?? 'Company', country: src.country, fetched: 0, added: 0, removed: 0, more: 0, complete: false, error: e instanceof Error ? e.message : 'Failed' });
      }
    }

    const line = (r: Report) =>
      `${r.name}${r.country ? ` (${r.country})` : ''}: ` +
      (r.error && !r.fetched ? `failed — ${r.error}` : `${r.fetched} on page, +${r.added} new${r.removed ? `, −${r.removed} closed` : ''}${r.more ? `, ${r.more} more later` : ''}`);
    const text = reports.length ? reports.map(line).join(' · ') : 'No company due for a check';
    await service.rpc('conveyor_release', {
      p_ids: ids,
      p_topup: Math.max(0, want - ids.length),
      p_summary: { text, ok: reports.every((r) => !r.error), companies: reports },
    });
    // Optional: tell Google about the new job pages (does nothing without the secret).
    if (urls.length) await notifyGoogle(service, urls);
  } catch (e) {
    await service.rpc('pipeline_finished', { p_kind: 'sync', p_ok: false, p_summary: `Sync failed: ${e instanceof Error ? e.message : 'unknown error'}`, p_detail: null });
  }
}
