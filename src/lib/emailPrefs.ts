// Email settings for the signed-in person (migration 20261215090000).
// "Jobs that match your skills": daily / weekly / off. Job alerts, application
// updates, news: on / off. "Unsubscribe from all" switches everything off.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export type EmailPrefs = {
  email: string | null;
  for_you: 'daily' | 'weekly' | 'off';
  job_alerts: boolean;
  applications: boolean;
  news: boolean;
  all_off: boolean;
  alerts_count: number;
};

/** `undefined` while loading, `null` when unavailable (signed out, migration not run). */
export function useEmailPrefs(): { prefs: EmailPrefs | null | undefined; save: (p: Partial<Omit<EmailPrefs, 'email' | 'alerts_count'>>) => Promise<string | null> } {
  const { session } = useAuth();
  const [prefs, setPrefs] = useState<EmailPrefs | null | undefined>(undefined);
  useEffect(() => {
    if (!session) return setPrefs(null);
    let alive = true;
    supabase.rpc('my_email_prefs').then(({ data, error }) => {
      if (alive) setPrefs(error || !data ? null : (data as EmailPrefs));
    });
    return () => {
      alive = false;
    };
  }, [session]);
  const save = useCallback(async (p: Partial<Omit<EmailPrefs, 'email' | 'alerts_count'>>) => {
    const { data, error } = await supabase.rpc('set_email_prefs', { p });
    if (error) return /set_email_prefs|schema cache/i.test(error.message) ? 'Email settings are being switched on — try again soon.' : error.message;
    if (data) setPrefs(data as EmailPrefs);
    return null;
  }, []);
  return { prefs, save };
}
