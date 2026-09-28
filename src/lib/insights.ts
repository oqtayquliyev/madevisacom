// Live job-market numbers (/job-market). One row, refreshed hourly on the
// server (insights_snapshot, migration 20261102090000) — every visitor
// reads the same small snapshot instead of counting jobs.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type InsightsSnapshot = {
  live_jobs: number;
  companies: number;
  countries: number;
  new_7d: number;
  new_24h: number;
  visa_share: number;
  salary_share: number;
  work: { remote: number; hybrid: number; onsite: number; known: number };
  by_country: { iso: string; name: string; jobs: number; new_7d: number; visa: number; remote: number; companies: number }[];
  top_companies_7d: { id: string; name: string; logo: string | null; live: number; new_7d: number }[];
  functions: { name: string; jobs: number }[];
  experience: { name: string; jobs: number }[];
  employment: { name: string; jobs: number }[];
  daily_new: { day: string; jobs: number }[];
};

let memory: { data: InsightsSnapshot; at: string | null; fetched: number } | null = null;

export async function fetchInsights(): Promise<{ data: InsightsSnapshot; at: string | null } | null> {
  if (memory && Date.now() - memory.fetched < 10 * 60_000) return memory;
  const { data, error } = await supabase.from('insights_snapshot').select('data, computed_at').eq('id', true).maybeSingle();
  if (error || !data?.data || !Object.keys(data.data).length) return null;
  memory = { data: data.data as InsightsSnapshot, at: data.computed_at as string | null, fetched: Date.now() };
  return memory;
}

export function useInsights() {
  const [state, setState] = useState<{ data: InsightsSnapshot; at: string | null } | null>(memory);
  const [loading, setLoading] = useState(!memory);
  useEffect(() => {
    let alive = true;
    fetchInsights().then((r) => {
      if (!alive) return;
      setState(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { insights: state?.data ?? null, computedAt: state?.at ?? null, loading };
}
