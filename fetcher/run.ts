// The daily job cycle.
//
//   1. Reads every company board and job feed in fetcher/companies.json.
//   2. Keeps only jobs posted in the last `windowDays` days (7) — older ones are removed.
//   3. Adds the new ones to the D1 database (cleaned text + visa / remote / salary facts).
//   4. Removes jobs that left the company's page, and jobs older than the window.
//   5. Rebuilds the ready-made lists the website serves (all jobs, statistics, sitemap).
//
// Runs every hour on GitHub Actions (.github/workflows/daily-jobs.yml) — free, and without the
// 10 ms CPU limit Cloudflare's free plan puts on Workers. It writes through the website's
// /api/sync door using GitHub's own sign-in token, so no API key is needed anywhere.
// Start it by hand on GitHub: Actions → Daily jobs → Run workflow.
//
// Options: --local (the database copy used by `npm run dev`), --force (run even if a run
// finished in the last 18 hours), --fixtures=<folder> (test answers instead of the internet),
// --only=<source key> (one source, e.g. --only=greenhouse:stripe).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalD1, SyncD1, lit, type Database } from './d1.ts';
import { fetchSource, smartrecruitersDetail, sourcesFrom, useFixtures, type Source, type SourceJob } from './sources.ts';
import { analyse, companyCountryOf, isJunk, normalizeUrl } from './analyse.ts';
import { DAY_MS, jobPath, type BoardRow, type Stats } from '../shared/jobs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const args: string[] = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a: string) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const SITE = 'https://madevisa.com';
const BLOB_PART = 90_000;
const CONCURRENCY = 6;
const SR_DETAILS_PER_SOURCE = 250;

type Config = {
  settings?: { windowDays?: number; maxNewPerRun?: number; maxJobs?: number; arbeitnowPages?: number; minMinutesBetweenRuns?: number; everyHours?: Record<string, number> };
  [k: string]: unknown;
};

type Existing = { id: string; source: string; posted_at: string; url: string; dup: string };

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

export function jobId(sourceKey: string, externalId: string): string {
  const h = createHash('sha1').update(`${sourceKey}|${externalId}`).digest();
  return h.readBigUInt64BE(0).toString(36).padStart(13, '0').slice(-10);
}

const dupKey = (company: string, title: string) => `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}|${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

async function main() {
  const local = flag('local');
  const config = JSON.parse(readFileSync(join(here, 'companies.json'), 'utf8')) as Config;
  const windowDays = config.settings?.windowDays ?? 7;
  const maxNew = config.settings?.maxNewPerRun ?? 5000;
  const maxJobs = config.settings?.maxJobs ?? 15000;
  const arbeitnowPages = config.settings?.arbeitnowPages ?? 25;
  const syncUrl = process.env.SYNC_URL ?? 'https://madevisa.com/api/sync';
  const db: Database = local ? new LocalD1(join(here, '.out')) : new SyncD1(syncUrl, process.env.SYNC_KEY);

  const fixtures = opt('fixtures');
  if (fixtures) {
    const { fixtureFetcher } = await import('./test-fixtures.ts');
    useFixtures(fixtureFetcher(fixtures));
  }

  // A run started by hand right after the scheduled one has nothing new to find.
  const minGapMin = config.settings?.minMinutesBetweenRuns ?? 20;
  if (!flag('force')) {
    const last = (await db.query<{ finished_at: string }>("SELECT finished_at FROM runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1"))[0];
    if (last && Date.now() - Date.parse(last.finished_at) < minGapMin * 60_000) {
      log(`A run finished at ${last.finished_at} — less than ${minGapMin} minutes ago. Nothing to do (use --force to run anyway).`);
      return;
    }
  }

  // Some feeds ask to be read only a few times a day (see "everyHours" in companies.json).
  const everyHours = (config.settings?.everyHours ?? {}) as Record<string, number>;
  let lastFetched: Record<string, string> = {};
  try {
    const row = (await db.query<{ body: string }>("SELECT body FROM blobs WHERE key = 'source-state' AND part = 0"))[0];
    if (row) lastFetched = JSON.parse(row.body);
  } catch {
    lastFetched = {};
  }

  const startedAt = new Date().toISOString();
  const now = Date.now();
  const cutoff = now - windowDays * DAY_MS;
  let sources: Source[] = sourcesFrom(config);
  const only = opt('only');
  if (only) sources = sources.filter((s) => s.key === only);
  const due = (key: string) => {
    const h = everyHours[key];
    const at = lastFetched[key] ? Date.parse(lastFetched[key]) : 0;
    return !h || flag('force') || Date.now() - at >= h * 3600_000 - 5 * 60_000;
  };
  const resting = sources.filter((src) => !due(src.key)).map((src) => src.key);
  sources = sources.filter((src) => due(src.key));
  if (resting.length) log(`resting this run (read every few hours): ${resting.join(', ')}`);
  log(`${sources.length} sources, keeping jobs posted in the last ${windowDays} days`);

  // 1. Read every source.
  const fetched = new Map<string, SourceJob[]>();
  const failed: string[] = [];
  await pool(sources, CONCURRENCY, async (src) => {
    const res = await fetchSource(src, { arbeitnowPages });
    if (res.ok) {
      fetched.set(src.key, res.jobs.filter((j) => !isJunk(j)));
      lastFetched[src.key] = new Date().toISOString();
      log(`  ✓ ${src.key}: ${res.jobs.length} jobs`);
    } else {
      failed.push(`${src.key} (${res.error})`);
      log(`  ✗ ${src.key}: ${res.error}`);
    }
  });

  // 2. What's in the database now.
  const existing = await db.queryAll<Existing>(
    "SELECT id, source, posted_at, url, lower(company) || '|' || lower(title) AS dup FROM jobs"
  );
  const existingIds = new Set(existing.map((e) => e.id));
  const existingUrls = new Set(existing.map((e) => normalizeUrl(e.url)));
  const existingDup = new Set(existing.map((e) => dupKey(...(e.dup.split('|') as [string, string]))));
  log(`${existing.length} jobs in the database`);

  // 3. Closed jobs (gone from a source that answered) and jobs older than the window.
  const presentBySource = new Map<string, Set<string>>();
  for (const [key, jobs] of fetched) presentBySource.set(key, new Set(jobs.map((j) => jobId(key, j.externalId))));
  const toDelete = new Set<string>();
  const bySource = new Map<string, Existing[]>();
  for (const e of existing) {
    if (Date.parse(e.posted_at) < cutoff) toDelete.add(e.id); // older than the window → gone
    (bySource.get(e.source) ?? bySource.set(e.source, []).get(e.source)!).push(e);
  }
  for (const [key, rows] of bySource) {
    const present = presentBySource.get(key);
    if (!present) continue; // source failed or was removed from the list → its jobs age out with the window
    const gone = rows.filter((r) => !present.has(r.id));
    // Safety: a feed that suddenly lists far fewer jobs is more likely broken than emptied.
    if (rows.length >= 10 && gone.length / rows.length > 0.6) {
      log(`  ! ${key}: ${gone.length} of ${rows.length} jobs missing — keeping them this time`);
      continue;
    }
    for (const r of gone) toDelete.add(r.id);
  }
  // Sources taken out of companies.json: their jobs go.
  const configured = new Set([...sources.map((s) => s.key), ...resting]);
  if (!only) for (const e of existing) if (!configured.has(e.source)) toDelete.add(e.id);

  // 4. New jobs.
  type Candidate = { key: string; src: Source; job: SourceJob; id: string; posted: number; prefer: string | null };
  const candidates: Candidate[] = [];
  const seenUrl = new Set(existingUrls);
  const seenDup = new Set(existingDup);
  for (const src of sources) {
    const jobs = fetched.get(src.key);
    if (!jobs) continue;
    const prefer = companyCountryOf(jobs);
    for (const job of jobs) {
      const id = jobId(src.key, job.externalId);
      if (existingIds.has(id)) continue;
      const posted = job.postedAt ? Date.parse(job.postedAt) : now;
      if (!Number.isFinite(posted) || posted < cutoff || posted > now + DAY_MS) continue;
      const u = normalizeUrl(job.url);
      const d = dupKey(job.company, job.title);
      // The same ad on a company board and on a multi-company board: keep one.
      if (seenUrl.has(u) || (src.platform === 'arbeitnow' || src.platform === 'remotive' ? seenDup.has(d) : false)) continue;
      seenUrl.add(u);
      seenDup.add(d);
      candidates.push({ key: src.key, src, job, id, posted: Math.min(posted, now), prefer });
    }
  }
  const room = Math.max(0, maxJobs - (existing.length - toDelete.size));
  const take = Math.min(maxNew, room);
  // Visa-sponsored jobs first, then the newest.
  candidates.sort((a, b) => Number(Boolean(b.job.visaFlag)) - Number(Boolean(a.job.visaFlag)) || b.posted - a.posted);
  const chosen = candidates.slice(0, take);
  log(`${candidates.length} new jobs found, adding ${chosen.length} (room for ${room}); removing ${toDelete.size}`);

  // SmartRecruiters needs one call per job for the text.
  const srCount = new Map<string, number>();
  await pool(chosen.filter((c) => c.src.platform === 'smartrecruiters'), CONCURRENCY, async (c) => {
    const n = srCount.get(c.key) ?? 0;
    if (n >= SR_DETAILS_PER_SOURCE) return;
    srCount.set(c.key, n + 1);
    c.job.descriptionHtml = await smartrecruitersDetail(c.src.id, c.job.externalId).catch(() => '');
  });

  const firstSeen = new Date().toISOString();
  const inserts: string[] = [];
  for (const c of chosen) {
    if (c.src.platform === 'smartrecruiters' && !c.job.descriptionHtml) continue;
    const r = analyse(c.job, c.prefer);
    const cols = [c.id, c.key, r.title, r.company, r.country, r.city, r.location, r.remote, r.arrangement, r.visa, r.employment, r.experience, r.salary, r.department, r.url, new Date(c.posted).toISOString(), firstSeen, r.description];
    inserts.push(
      `INSERT OR IGNORE INTO jobs (id, source, title, company, country, city, location, remote, arrangement, visa, employment, experience, salary, department, url, posted_at, first_seen, description) VALUES (${cols.map(lit).join(', ')});`
    );
  }

  // 5. Write.
  const deletes = [...toDelete];
  const delStatements: string[] = [];
  for (let i = 0; i < deletes.length; i += 200) delStatements.push(`DELETE FROM jobs WHERE id IN (${deletes.slice(i, i + 200).map(lit).join(',')});`);
  await db.execMany(delStatements, 'delete');
  await db.execMany(inserts, 'insert');
  log(`wrote ${inserts.length} new, ${deletes.length} removed`);

  // 6. Ready-made lists for the website.
  type Live = { id: string; title: string; company: string; country: string | null; city: string | null; remote: number; visa: string | null; posted_at: string; arrangement: string | null; has_salary: number };
  const live = (await db.queryAll<Live>(
    'SELECT id, title, company, country, city, remote, visa, posted_at, arrangement, salary IS NOT NULL AS has_salary FROM jobs'
  )).sort((a, b) => b.posted_at.localeCompare(a.posted_at));
  const rows: BoardRow[] = live.map((j) => [
    j.id, j.title, j.company, j.country ?? '', j.city ?? '', j.remote ? 1 : 0,
    j.visa === 'offered' ? 1 : j.visa === 'not_offered' ? 2 : 0,
    Math.floor(Date.parse(j.posted_at) / 1000),
    (j.arrangement ?? '') as BoardRow[8], j.has_salary ? 1 : 0,
  ]);
  const updated = new Date().toISOString();
  const stats = buildStats(rows, updated, windowDays);
  const sitemap = live
    .map((j) => `<url><loc>${SITE}${jobPath(j).replace(/&/g, '&amp;')}</loc><lastmod>${j.posted_at.slice(0, 10)}</lastmod></url>`)
    .join('\n');

  const blobStatements: string[] = [];
  // Parts are written under "<key>.next" first and swapped in at the end, so the site never
  // serves a half-written list while the parts are on their way.
  const swaps: string[] = [];
  const putBlob = (key: string, body: string) => {
    const next = `${key}.next`;
    blobStatements.push(`DELETE FROM blobs WHERE key = ${lit(next)};`);
    chunks(body, BLOB_PART).forEach((part, i) =>
      blobStatements.push(`INSERT INTO blobs (key, part, body, updated_at) VALUES (${lit(next)}, ${i}, ${lit(part)}, ${lit(updated)});`)
    );
    swaps.push(`DELETE FROM blobs WHERE key = ${lit(key)};`, `UPDATE blobs SET key = ${lit(key)} WHERE key = ${lit(next)};`);
  };
  putBlob('jobs', JSON.stringify({ v: 1, updated, jobs: rows }));
  putBlob('stats', JSON.stringify(stats));
  putBlob('sitemap-jobs', sitemap);
  blobStatements.push(`DELETE FROM blobs WHERE key = 'source-state';`, `INSERT INTO blobs (key, part, body, updated_at) VALUES ('source-state', 0, ${lit(JSON.stringify(lastFetched))}, ${lit(updated)});`);
  blobStatements.push(
    `INSERT INTO runs (started_at, finished_at, added, removed, total, sources_ok, sources_failed, failed_list, note) VALUES (${[
      startedAt, new Date().toISOString(), inserts.length, deletes.length, rows.length, fetched.size, failed.length, failed.sort().join('\n') || null,
      candidates.length > chosen.length ? `${candidates.length - chosen.length} new jobs left for the next run (daily limit)` : null,
    ].map(lit).join(', ')});`,
    // Keep 30 days of run history.
    `DELETE FROM runs WHERE started_at < ${lit(new Date(now - 30 * DAY_MS).toISOString())};`
  );
  await db.execMany(blobStatements, 'blobs');
  await db.execMany(swaps, 'swap');

  log(`done: ${rows.length} live jobs (${stats.visa} with visa sponsorship), ${failed.length} feeds failed`);
  if (failed.length) log(`failed feeds:\n  ${failed.join('\n  ')}`);
}

export function buildStats(rows: BoardRow[], updated: string, windowDays: number): Stats {
  const now = Date.parse(updated);
  const byCountry = new Map<string, [number, number]>();
  const byCompany = new Map<string, [number, number]>();
  const perDay = new Map<string, number>();
  const arr = new Map<string, number>();
  let visa = 0, notVisa = 0, remote = 0, salary = 0, new24h = 0;
  for (const r of rows) {
    const [, , company, country, , isRemote, v, posted, arrangement, hasSalary] = r;
    if (v === 1) visa++;
    if (v === 2) notVisa++;
    if (isRemote) remote++;
    if (hasSalary) salary++;
    if (now - posted * 1000 < DAY_MS) new24h++;
    if (country) {
      const c = byCountry.get(country) ?? [0, 0];
      c[0]++;
      if (v === 1) c[1]++;
      byCountry.set(country, c);
    }
    const co = byCompany.get(company) ?? [0, 0];
    co[0]++;
    if (v === 1) co[1]++;
    byCompany.set(company, co);
    const day = new Date(posted * 1000).toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    const a = arrangement || (isRemote ? 'remote' : 'not stated');
    arr.set(a, (arr.get(a) ?? 0) + 1);
  }
  const days: [string, number][] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    days.push([d, perDay.get(d) ?? 0]);
  }
  return {
    updated,
    total: rows.length,
    visa,
    notVisa,
    remote,
    salary,
    new24h,
    companies: byCompany.size,
    windowDays,
    byCountry: [...byCountry.entries()].map(([c, [n, v]]) => [c, n, v] as [string, number, number]).sort((a, b) => b[1] - a[1]),
    topCompanies: [...byCompany.entries()].map(([c, [n, v]]) => [c, n, v] as [string, number, number]).sort((a, b) => b[1] - a[1]).slice(0, 25),
    topVisaCompanies: [...byCompany.entries()].filter(([, [, v]]) => v > 0).map(([c, [, v]]) => [c, v] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 15),
    perDay: days,
    byArrangement: [...arr.entries()].sort((a, b) => b[1] - a[1]),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
