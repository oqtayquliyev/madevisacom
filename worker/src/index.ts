// The MadeVisa application worker.
//
// A long-running process with a real (headless) Chromium. Every few seconds:
//   1. check in (apply_worker_beat) — the site only tells people "you can
//      leave this page" while a worker has checked in recently;
//   2. claim ready applications from running batches (apply_worker_claim);
//   3. submit each one (run.ts) and report the result (apply_worker_report).
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   required
//   WORKER_ID          a name for this worker (default: host name)
//   CHROMIUM_PATH      a Chromium binary, when not using the Playwright image
//   POLL_SECONDS       how often to look for work when idle (default 5)
//   HOST_GAP_SECONDS   least time between two applications on the same site (default 20)
//   ONCE=1             process what is ready now, then exit (for a scheduled runner)
//   WORKER_EVERY_MINUTES  with ONCE: how often the scheduled runner starts (GitHub Actions: 60)

import { hostname } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Browser } from 'playwright-core';
import { autoApply } from './auto';
import { processJob, type Job, type Report } from './run';

const VERSION = '1.0.0';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const WORKER = (process.env.WORKER_ID || hostname()).slice(0, 60);
const POLL = Math.max(2, Number(process.env.POLL_SECONDS) || 5) * 1000;
const HOST_GAP = Math.max(0, Number(process.env.HOST_GAP_SECONDS) || 20) * 1000;
const ONCE = process.env.ONCE === '1';
/** Set when the worker runs on a schedule (GitHub Actions): how often it runs, so the site knows when it will be back. */
const EVERY = Number(process.env.WORKER_EVERY_MINUTES) || 0;

const db = createClient(url, key, { auth: { persistSession: false } });
const log = (...a: unknown[]) => console.log(new Date().toISOString(), WORKER, ...a);

let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return browser;
}

const lastOnHost = new Map<string, number>();
const hostOf = (u: string | null) => {
  try {
    return u ? new URL(u).hostname : '';
  } catch {
    return '';
  }
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    log('rpc', name, error.message);
    return null;
  }
  return data as T;
}

async function handle(job: Job): Promise<void> {
  const started = Date.now();
  const host = hostOf(job.url);
  const wait = (lastOnHost.get(host) ?? 0) + HOST_GAP - Date.now();
  if (host && wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOnHost.set(host, Date.now());
  log('start', job.id, job.platform, job.company, '—', job.title);

  let report: Report;
  try {
    report = await processJob(job, {
      browser: getBrowser,
      originalCv: async () => {
        const o = await rpc<{ use: boolean; path: string | null; name: string | null } | null>('apply_worker_original_cv', { p_user: job.userId });
        if (!o?.use || !o.path) return null;
        const { data, error } = await db.storage.from('cvs').download(o.path);
        if (error || !data) return null;
        const ext = o.path.split('.').pop()?.toLowerCase() ?? 'pdf';
        const type = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf', txt: 'text/plain' }[ext] ?? 'application/octet-stream';
        const base = (o.name ?? 'CV').replace(/\.[a-z0-9]{2,4}$/i, '');
        return { bytes: new Uint8Array(await data.arrayBuffer()), fileName: `${base}.${ext}`, type };
      },
      progress: async (stage) => void (await rpc('apply_worker_progress', { p_id: job.id, p_worker: WORKER, p_stage: stage })),
      upload: async (name, bytes, type) => {
        const path = `${job.userId}/${job.id}/${name}`;
        const { error } = await db.storage.from('application-files').upload(path, bytes, { contentType: type, upsert: true });
        if (error) {
          log('upload', name, error.message);
          return null;
        }
        return path;
      },
      fetch,
      log: (...a) => log(job.id, ...a),
    });
  } catch (e) {
    log('crash', job.id, String(e));
    report = { to: 'ready', detail: { code: 'worker_error', reason: 'Something went wrong in MadeVisa’s application service.', retryInSeconds: 900 } };
  }
  const r = await rpc<{ ok: boolean; code?: string }>('apply_worker_report', { p_id: job.id, p_worker: WORKER, p_to: report.to, p_detail: report.detail });
  log('done', job.id, report.to, report.detail.code ?? '', `${Math.round((Date.now() - started) / 1000)}s`, r?.ok ? '' : `(report: ${r?.code})`);
}

let stopping = false;
process.on('SIGTERM', () => (stopping = true));
process.on('SIGINT', () => (stopping = true));

async function main() {
  log('starting', VERSION);
  let settings = { enabled: true, autoSubmit: true, concurrency: 2 };
  let beatAt = 0;
  let autoAt = 0;
  while (!stopping) {
    // Pro members with auto-apply on: new matching jobs become ready applications (at most every 10 minutes).
    if (settings.enabled && Date.now() - autoAt > 10 * 60_000) {
      autoAt = Date.now();
      const n = await autoApply(rpc, fetch, log).catch((e) => (log('auto', String(e)), 0));
      if (n) log('auto: prepared', n);
    }
    if (Date.now() - beatAt > 30_000) {
      settings = (await rpc<typeof settings>('apply_worker_beat', { p_worker: WORKER, p_version: VERSION, p_info: { host: hostname(), node: process.version, ...(EVERY ? { mode: 'scheduled', everyMinutes: EVERY } : {}) } })) ?? settings;
      beatAt = Date.now();
    }
    const jobs = settings.enabled ? ((await rpc<Job[]>('apply_worker_claim', { p_worker: WORKER, p_limit: settings.concurrency })) ?? []) : [];
    if (jobs.length) {
      await Promise.all(jobs.map(handle));
      continue;
    }
    if (ONCE) break;
    await new Promise((r) => setTimeout(r, POLL));
  }
  await browser?.close().catch(() => {});
  log('stopped');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
