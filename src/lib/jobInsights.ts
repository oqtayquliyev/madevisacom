// Numbers behind the three graphics at the end of a job page — things only
// MadeVisa can measure (migration 20261012090000, job_page_insights).
// Each graphic appears only when there is enough data AND the result is good.

import { supabase } from '@/lib/supabase';

export type JobPageInsights = {
  response: { rate: number; avg_days: number | null; tracked: number; people?: number; early?: boolean; low?: number | null; high?: number | null } | null;
  /** "Was the job as described?" answers (20261014090000). */
  accuracy?: { answers: number; ok: number } | null;
  international: { people: number; countries: number; top: { name: string; code: string; n: number }[]; other: number } | null;
  live: { open: number; imported_open: number; checked: number; weeks: number[]; avg_open_days: number | null } | null;
};

/** Thresholds for showing each graphic (positive numbers only). */
export const SHOW_RESPONSE_FROM = 30; // % of applications answered
export const SHOW_LIVE_FROM = 0.8; // share of open jobs checked live in 48 h

const cache = new Map<string, Promise<JobPageInsights | null>>();

export function fetchJobPageInsights(publisherId: string): Promise<JobPageInsights | null> {
  let p = cache.get(publisherId);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.rpc('job_page_insights', { pid: publisherId });
      if (error || !data) return null;
      return data as JobPageInsights;
    })();
    cache.set(publisherId, p);
  }
  return p;
}

/** Which graphics have something good to show. */
export function visibleInsights(d: JobPageInsights | null) {
  const response = d?.response && d.response.rate >= SHOW_RESPONSE_FROM ? d.response : null;
  const international = d?.international && d.international.people >= 3 ? d.international : null;
  const l = d?.live;
  const live =
    l && l.imported_open >= 5 && l.open > 0 && l.checked / l.open >= SHOW_LIVE_FROM && l.weeks.some((n) => n > 0) ? l : null;
  return { response, international, live, any: Boolean(response || international || live) };
}
