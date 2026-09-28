// Per-company numbers for job cards (company_card_signals, migration
// 20261105090000). Cards ask for their company; all asks made during one
// render are sent as ONE request, and answers are cached for 10 minutes.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CompanySignal = {
  id: string;
  /** Applications tracked by MadeVisa users. */
  tracked: number;
  /** % of applicants who got a reply — null until ≥5 applications from ≥3 people. */
  response_rate: number | null;
  /** Typical (median) days until a reply — null until enough timed replies. */
  median_days: number | null;
  /** Open roles on MadeVisa now. */
  live: number;
  /** Roles added in the last 30 days. */
  posted_30d: number;
  last_posted: string | null;
};

const cache = new Map<string, { value: CompanySignal | null; at: number }>();
const listeners = new Map<string, Set<(v: CompanySignal | null) => void>>();
const queue = new Set<string>();
let timer: number | null = null;
const TTL = 10 * 60_000;

async function flush() {
  timer = null;
  const ids = [...queue];
  queue.clear();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { data, error } = await supabase.rpc('company_card_signals', { pids: chunk });
    const rows = !error && Array.isArray(data) ? (data as CompanySignal[]) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of chunk) {
      const value = byId.get(id) ?? null;
      cache.set(id, { value, at: Date.now() });
      listeners.get(id)?.forEach((fn) => fn(value));
    }
  }
}

function request(id: string) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return;
  queue.add(id);
  if (timer === null) timer = window.setTimeout(() => void flush(), 30);
}

/** undefined = loading, null = unavailable. */
export function useCompanySignal(publisherId: string | null | undefined): CompanySignal | null | undefined {
  const [value, setValue] = useState<CompanySignal | null | undefined>(() => (publisherId ? cache.get(publisherId)?.value : null));
  useEffect(() => {
    if (!publisherId) {
      setValue(null);
      return;
    }
    const hit = cache.get(publisherId);
    if (hit) setValue(hit.value);
    const set = listeners.get(publisherId) ?? new Set();
    set.add(setValue);
    listeners.set(publisherId, set);
    request(publisherId);
    return () => {
      set.delete(setValue);
    };
  }, [publisherId]);
  return value;
}

/** "1 in 4" / "7 in 10" — easier to read than a percentage. */
export function replyRatio(rate: number): string {
  if (rate <= 0) return 'none';
  if (rate >= 95) return 'almost all';
  if (rate >= 45) return `${Math.round(rate / 10)} in 10`;
  return `1 in ${Math.max(2, Math.round(100 / rate))}`;
}

export function replyTime(days: number | null): string | null {
  if (days == null) return null;
  if (days < 1.5) return 'usually within a day';
  if (days <= 14) return `usually within ${Math.round(days)} days`;
  const weeks = Math.round(days / 7);
  return `usually within ${weeks} weeks`;
}
