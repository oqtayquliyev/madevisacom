// Counted on the server every 5 minutes (pg_cron, migration 20261011090000);
// each visitor's browser also remembers the last number for 5 minutes, so
// opening pages doesn't ask the database again and again.
//
// "X opportunities" headline numbers, read from the snapshot the
// database keeps in `site_stats` (see migration 20260927090000). One tiny
// row instead of counting thousands of jobs in the browser, so the landing
// page and /jobs show the same, steady number on every device.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SiteStats = {
  publishedJobs: number;
  newJobs24h: number;
  computedAt: string;
};

const LOCAL_KEY = 'madevisa:siteStats';
const MEMORY_TTL_MS = 5 * 60 * 1000; // same device: reuse the number for 5 minutes
const STALE_AFTER_MS = 30 * 60 * 1000; // snapshot not refreshed for 30 min (schedule off) → count directly

let memory: { stats: SiteStats; at: number } | null = null;
let inflight: Promise<SiteStats | null> | null = null;

function readLocal(): (SiteStats & { savedAt?: number }) | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const v = raw ? (JSON.parse(raw) as SiteStats & { savedAt?: number }) : null;
    return v && typeof v.publishedJobs === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(stats: SiteStats) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...stats, savedAt: Date.now() }));
  } catch {
    /* optional */
  }
}

/** Only used if the snapshot table isn't set up yet or stopped updating: a count-only query (no rows downloaded). */
async function countDirectly(): Promise<SiteStats | null> {
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const base = () =>
    supabase
      .from('sponsored_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .or(`expires_at.is.null,expires_at.gt.${now}`);
  const [all, recent] = await Promise.all([base(), base().gte('created_at', since)]);
  if (all.error || all.count == null) return null;
  return { publishedJobs: all.count, newJobs24h: recent.count ?? 0, computedAt: now };
}

export async function fetchSiteStats(): Promise<SiteStats | null> {
  if (memory && Date.now() - memory.at < MEMORY_TTL_MS) return memory.stats;
  // Counted on this device in the last 5 minutes (e.g. previous page): reuse it.
  const local = readLocal();
  if (local?.savedAt && Date.now() - local.savedAt < MEMORY_TTL_MS) {
    const { savedAt, ...stats } = local;
    memory = { stats, at: savedAt };
    return stats;
  }
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.from('site_stats').select('key, value, computed_at');
      let stats: SiteStats | null = null;
      if (!error && data?.length) {
        const byKey = new Map(data.map((r) => [r.key as string, r]));
        const jobs = byKey.get('published_jobs');
        if (jobs && Date.now() - new Date(jobs.computed_at as string).getTime() < STALE_AFTER_MS) {
          stats = {
            publishedJobs: Number(jobs.value),
            newJobs24h: Number(byKey.get('new_jobs_24h')?.value ?? 0),
            computedAt: jobs.computed_at as string,
          };
        }
      }
      stats = stats ?? (await countDirectly());
      if (stats) {
        memory = { stats, at: Date.now() };
        writeLocal(stats);
      }
      return stats;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Admin "Update now": recounts live jobs on the server and saves the numbers
 * every visitor reads. Falls back to a direct count if the migration
 * (20261010090000_refresh_site_stats.sql) hasn't been run yet.
 */
export async function refreshSiteStats(): Promise<{ stats: SiteStats | null; saved: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_refresh_site_stats');
  let stats: SiteStats | null = null;
  let saved = false;
  const d = data as { published_jobs?: number; new_jobs_24h?: number; computed_at?: string } | null;
  if (!error && d && typeof d.published_jobs === 'number' && d.computed_at) {
    stats = { publishedJobs: d.published_jobs, newJobs24h: Number(d.new_jobs_24h ?? 0), computedAt: d.computed_at };
    saved = true;
  } else {
    stats = await countDirectly();
  }
  if (stats) {
    memory = { stats, at: Date.now() };
    writeLocal(stats);
  }
  const missing = error && /admin_refresh_site_stats|schema cache|does not exist/i.test(error.message);
  return { stats, saved, error: error ? (missing ? 'Run the site-stats SQL file first — until then visitors see a count that can be a few hours old.' : error.message) : undefined };
}

/** What visitors currently see (the saved snapshot), for the admin panel. */
export async function readSavedSiteStats(): Promise<SiteStats | null> {
  const { data, error } = await supabase.from('site_stats').select('key, value, computed_at');
  if (error || !data?.length) return null;
  const byKey = new Map(data.map((r) => [r.key as string, r]));
  const jobs = byKey.get('published_jobs');
  if (!jobs) return null;
  return { publishedJobs: Number(jobs.value), newJobs24h: Number(byKey.get('new_jobs_24h')?.value ?? 0), computedAt: jobs.computed_at as string };
}

/** Last known stats right away (from this device), then the current snapshot. */
export function useSiteStats(): SiteStats | null {
  const [stats, setStats] = useState<SiteStats | null>(() => memory?.stats ?? readLocal());
  useEffect(() => {
    let cancelled = false;
    fetchSiteStats().then((s) => {
      if (!cancelled && s) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
