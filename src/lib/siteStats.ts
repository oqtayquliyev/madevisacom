// "X opportunities" headline numbers, read from the hourly snapshot the
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
const MEMORY_TTL_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000; // snapshot job not running → fall back

let memory: { stats: SiteStats; at: number } | null = null;
let inflight: Promise<SiteStats | null> | null = null;

function readLocal(): SiteStats | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const v = raw ? (JSON.parse(raw) as SiteStats) : null;
    return v && typeof v.publishedJobs === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(stats: SiteStats) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stats));
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
