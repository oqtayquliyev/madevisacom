// Free job-alert emails (migration 20261122090000).
// A guest who clicks "Email me these jobs" is asked to sign up; the alert
// they wanted is remembered and created right after sign-in.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

const PENDING = 'mv:pendingAlert';

export type AlertWish = { keywords: string; country: string | null };
export type MyAlert = { id: string; keywords: string; country_code: string | null; country_name: string | null; email: boolean };

/** Does this alert cover exactly these keywords + country (name or code; null = everywhere)? */
export function alertMatches(a: MyAlert, keywords: string, country: string | null): boolean {
  if (a.keywords.trim().toLowerCase() !== keywords.trim().toLowerCase()) return false;
  if (!country) return !a.country_code;
  const c = country.trim().toLowerCase();
  return (a.country_code ?? '').toLowerCase() === c || (a.country_name ?? '').toLowerCase() === c;
}

export async function createJobAlert(w: AlertWish): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('create_job_alert', { p_keywords: w.keywords.slice(0, 120), p_country: w.country ?? '' });
  if (!error) {
    window.dispatchEvent(new Event('mv:alerts-changed'));
    return { ok: true };
  }
  return { ok: false, error: /create_job_alert|schema cache/i.test(error.message) ? 'Job alerts are being switched on — try again soon.' : error.message };
}

export function rememberAlertWish(w: AlertWish): void {
  try {
    window.sessionStorage.setItem(PENDING, JSON.stringify(w));
  } catch {
    /* ignore */
  }
}

/** Mount once in App: creates the alert a guest asked for, after they sign in. */
export function useAlertWishAfterSignIn(): void {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    let wish: AlertWish | null = null;
    try {
      wish = JSON.parse(window.sessionStorage.getItem(PENDING) ?? 'null') as AlertWish | null;
      window.sessionStorage.removeItem(PENDING);
    } catch {
      return;
    }
    if (wish) void createJobAlert(wish);
  }, [session]);
}

export function useMyAlerts(): MyAlert[] | null {
  const { session } = useAuth();
  const [alerts, setAlerts] = useState<MyAlert[] | null>(null);
  useEffect(() => {
    if (!session) return setAlerts(null);
    let alive = true;
    const load = () =>
      supabase.rpc('my_job_alerts').then(({ data, error }) => {
        if (alive && !error) setAlerts((data as MyAlert[]) ?? []);
      });
    void load();
    window.addEventListener('mv:alerts-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('mv:alerts-changed', load);
    };
  }, [session]);
  return alerts;
}
