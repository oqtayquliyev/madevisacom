// The outcome loop: every tracked application ends in an answer — did the employer reply?
// Those answers are what make reply rates, reply odds and GhostGood real, and they are the
// proof the paywall shows ("N employer replies tracked by members this month").

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ApplicationStatus } from '@/lib/companies';

export type CheckIn = { id: string; title: string; company: string; appliedAt: string; status: ApplicationStatus };

/** Your applications that are waiting for an answer: 5+ days old, no final status, not snoozed. */
export async function fetchCheckIns(): Promise<CheckIn[]> {
  const fiveDays = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('application_reports')
    .select('id, listing_title, applied_at, status, remind_at, publisher:program_publishers(name)')
    .in('status', ['clicked', 'applied', 'viewed', 'no_response_week'])
    .lte('applied_at', fiveDays)
    .or(`remind_at.is.null,remind_at.lte.${now}`)
    .order('applied_at', { ascending: false })
    .limit(5);
  if (error || !data) return [];
  return (data as unknown as { id: string; listing_title: string | null; applied_at: string; status: ApplicationStatus; publisher: { name: string } | null }[]).map((r) => ({
    id: r.id,
    title: r.listing_title ?? 'the job',
    company: r.publisher?.name ?? 'the company',
    appliedAt: r.applied_at,
    status: r.status,
  }));
}

export type CheckInAnswer = 'responded' | 'interview' | 'offer' | 'rejected' | 'waiting' | 'no_response' | 'not_applied';

/** Saves an answer. "waiting" asks again in a week; "not_applied" removes it from the numbers. */
export async function answerCheckIn(id: string, answer: CheckInAnswer): Promise<boolean> {
  const patch =
    answer === 'waiting'
      ? { status: 'applied' as const, remind_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }
      : answer === 'not_applied'
        ? { status: 'withdrawn' as const }
        : { status: answer };
  const { error } = await supabase.from('application_reports').update(patch).eq('id', id);
  return !error;
}

export type PublicOutcomes = { days: number; applications: number; replies: number; interviews: number; offers: number; people_replied: number };

let memo: Promise<PublicOutcomes | null> | null = null;
/** Members' real outcomes, last 30 days (public_outcome_stats, migration 20261231130000). */
export function usePublicOutcomes(): PublicOutcomes | null {
  const [v, setV] = useState<PublicOutcomes | null>(null);
  useEffect(() => {
    memo ??= Promise.resolve(supabase.rpc('public_outcome_stats'))
      .then(({ data, error }) => (error || !data ? null : (data as PublicOutcomes)))
      .catch(() => null);
    let alive = true;
    memo.then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}

/** Shown only when the numbers are big enough to mean something. */
export const PROOF_MIN_REPLIES = 10;
