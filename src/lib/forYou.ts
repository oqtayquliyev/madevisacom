// "Jobs for you" emails (migration 20261214090000).
// Registered people get the new jobs that fit their CV, profile, alerts and
// recent searches — daily (default) or weekly, never the same job twice.
// The site records searches on /jobs for signed-in people, so the email can
// follow what they actually look for.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export type ForYouFrequency = 'daily' | 'weekly' | 'off';
export type ForYouState = {
  frequency: ForYouFrequency;
  last_sent_at: string | null;
  terms: { titles: string[]; skills: string[]; countries: string[]; from: string[] };
};

/** Remember a search on /jobs (signed-in only; quietly does nothing before the migration). */
export async function rememberJobSearch(q: string, country: string | null, category: string | null): Promise<void> {
  const text = q.trim().slice(0, 120);
  if (text.length < 2 && !country && !category) return;
  await supabase.rpc('note_job_search', { p_q: text, p_country: country ?? '', p_category: category ?? '' }).then(
    () => undefined,
    () => undefined
  );
}

/** The signed-in person's setting. `undefined` while loading, `null` when unavailable (signed out, migration not run). */
export function useForYou(): { state: ForYouState | null | undefined; save: (f: ForYouFrequency) => Promise<string | null> } {
  const { session } = useAuth();
  const [state, setState] = useState<ForYouState | null | undefined>(undefined);
  useEffect(() => {
    if (!session) return setState(null);
    let alive = true;
    supabase.rpc('my_for_you').then(({ data, error }) => {
      if (alive) setState(error || !data ? null : (data as ForYouState));
    });
    return () => {
      alive = false;
    };
  }, [session]);
  const save = useCallback(async (f: ForYouFrequency) => {
    const { error } = await supabase.rpc('set_for_you', { p_frequency: f });
    if (error) return /set_for_you|schema cache/i.test(error.message) ? 'These emails are being switched on — try again soon.' : error.message;
    setState((s) => (s ? { ...s, frequency: f } : s));
    return null;
  }, []);
  return { state, save };
}
