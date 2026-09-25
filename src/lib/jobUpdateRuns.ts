// History of Admin → "Update all jobs" runs (job_update_runs table,
// migration 20261008090000). Everything here fails soft: before the
// migration runs, the update still works — it just isn't recorded.

import { supabase } from '@/lib/supabase';

export type JobUpdateRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'done' | 'stopped' | 'failed';
  sources_total: number;
  sources_ok: number;
  sources_failed: number;
  jobs_fetched: number;
  jobs_added: number;
  jobs_removed: number;
  details_checked: number;
  details_filled: number;
  live_before: number | null;
  live_after: number | null;
  error: string | null;
};

export async function fetchRecentRuns(limit = 6): Promise<JobUpdateRun[] | null> {
  const { data, error } = await supabase.from('job_update_runs').select('*').order('started_at', { ascending: false }).limit(limit);
  if (error) return null; // table not created yet
  return (data ?? []) as JobUpdateRun[];
}

export async function startRun(fields: Partial<JobUpdateRun>): Promise<string | null> {
  const { data, error } = await supabase.from('job_update_runs').insert(fields).select('id').single();
  return error ? null : (data as { id: string }).id;
}

export async function saveRun(id: string | null, fields: Partial<JobUpdateRun>): Promise<void> {
  if (!id) return;
  await supabase.from('job_update_runs').update(fields).eq('id', id);
}

/** Published jobs right now. */
export async function countLiveJobs(): Promise<number | null> {
  const { count, error } = await supabase.from('sponsored_jobs').select('id', { count: 'exact', head: true }).eq('status', 'published');
  return error ? null : count ?? null;
}
