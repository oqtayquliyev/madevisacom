// Talks to the `job-facts` Supabase function — MadeVisa's job description
// detector runs there, not in the browser, so its code isn't public.
// This file only holds the result types and the calls.

import { supabase } from '@/lib/supabase';

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote';
export type VisaStatus = 'offered' | 'not_offered';

export type DetectedFacts = {
  compensation: string | null;
  experience: string | null;
  workArrangement: WorkArrangement | null;
  employmentType: string | null;
  visa: VisaStatus | null;
  schedule: string | null;
  contractTerm: string | null;
  remoteDetail: string | null;
  department: string | null;
  location: string | null;
  postedAt: string | null;
};

export type JobContact = { email?: string; phone?: string; website?: string; name?: string };

/** What's stored in sponsored_jobs.facts and returned by the function. */
export type StoredJobFacts = { v: number; facts: DetectedFacts; html: string; contact: JobContact };

/** Must match FACTS_VERSION in supabase/functions/job-facts/index.ts. */
export const FACTS_VERSION = 1;

export const EMPTY_FACTS: DetectedFacts = {
  compensation: null,
  experience: null,
  workArrangement: null,
  employmentType: null,
  visa: null,
  schedule: null,
  contractTerm: null,
  remoteDetail: null,
  department: null,
  location: null,
  postedAt: null,
};

export const isCurrentFacts = (f: StoredJobFacts | null | undefined): f is StoredJobFacts => Boolean(f && f.v === FACTS_VERSION && f.facts);

/** Results for one published job — computed on the server the first time. */
export async function fetchJobFacts(jobId: string): Promise<StoredJobFacts | null> {
  const { data, error } = await supabase.functions.invoke('job-facts', { body: { ids: [jobId] } });
  if (error || !data?.ok) return null;
  return (data.results?.[jobId] as StoredJobFacts | undefined) ?? null;
}

/** Admin: (re)compute and store results for up to 200 jobs; returns them by id. */
export async function refreshJobFacts(ids: string[], force = true): Promise<{ ok: boolean; results: Record<string, StoredJobFacts>; error?: string }> {
  const { data, error } = await supabase.functions.invoke('job-facts', { body: { ids, force } });
  if (error || !data?.ok) return { ok: false, results: {}, error: data?.error ?? error?.message ?? 'job-facts function failed' };
  return { ok: true, results: data.results ?? {} };
}

/** Admin: facts for descriptions that aren't saved yet (importer). */
export async function detectFactsForItems(items: { title: string; description: string | null }[]): Promise<{ ok: boolean; facts: DetectedFacts[]; error?: string }> {
  const out: DetectedFacts[] = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const { data, error } = await supabase.functions.invoke('job-facts', { body: { items: chunk } });
    if (error || !data?.ok) return { ok: false, facts: [], error: data?.error ?? error?.message ?? 'job-facts function failed' };
    out.push(...(data.facts as DetectedFacts[]));
  }
  return { ok: true, facts: out };
}
