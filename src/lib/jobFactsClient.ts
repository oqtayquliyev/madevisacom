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
export const FACTS_VERSION = 3;

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

/**
 * Admin: (re)compute and store results; returns them by id. Sent in small
 * batches (25 per request, 3 at a time) so no single request runs into the
 * Edge Function CPU limit, and a failed batch is retried once in halves.
 */
export async function refreshJobFacts(ids: string[], force = true): Promise<{ ok: boolean; results: Record<string, StoredJobFacts>; error?: string }> {
  const results: Record<string, StoredJobFacts> = {};
  const call = async (chunk: string[]): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke('job-facts', { body: { ids: chunk, force } });
    if (error || !data?.ok) return data?.error ?? error?.message ?? 'job-facts function failed';
    Object.assign(results, data.results ?? {});
    return null;
  };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));
  let firstError: string | null = null;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        let err = await call(chunk);
        if (err && chunk.length > 1) {
          const half = Math.ceil(chunk.length / 2);
          err = (await call(chunk.slice(0, half))) ?? (await call(chunk.slice(half)));
        }
        if (err) firstError ??= err;
      }
    })
  );
  if (firstError && !Object.keys(results).length) return { ok: false, results, error: firstError };
  return { ok: true, results, error: firstError ?? undefined };
}

/** Admin: facts for descriptions that aren't saved yet (importer). */
export async function detectFactsForItems(items: { title: string; description: string | null }[]): Promise<{ ok: boolean; facts: DetectedFacts[]; error?: string }> {
  const out: DetectedFacts[] = [];
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const { data, error } = await supabase.functions.invoke('job-facts', { body: { items: chunk } });
    if (error || !data?.ok) return { ok: false, facts: [], error: data?.error ?? error?.message ?? 'job-facts function failed' };
    out.push(...(data.facts as DetectedFacts[]));
  }
  return { ok: true, facts: out };
}
