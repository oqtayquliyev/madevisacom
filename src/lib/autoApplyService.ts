// Auto Apply (Pro, one month) — migration 20261215090000_emails_and_auto_apply_service.sql.
//
// The person turns it on from /cv-match, agrees that MadeVisa may apply for
// them, and answers the questions application forms usually ask. Their best
// CV matches go into a queue (auto_apply_sync, every time their matches load).
// The MadeVisa team works through the queue from Admin → Auto Apply; each job
// marked "applied" there emails the person and shows here as Applied.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export type AutoApplyStatus = 'active' | 'paused' | 'stopped' | 'ended';
export type AutoApplyItemStatus = 'queued' | 'applying' | 'applied' | 'skipped';

export type AutoApplyAnswers = {
  phone?: string;
  linkedin?: string;
  sponsorship?: 'yes' | 'no' | '';
  workRights?: string;
  relocate?: 'yes' | 'no' | 'depends' | '';
  remote?: 'onsite' | 'hybrid' | 'remote' | 'any' | '';
  notice?: string;
  salary?: string;
  startDate?: string;
  languages?: string;
  note?: string;
};

export type AutoApplyRequest = {
  id: string;
  status: AutoApplyStatus;
  started_at: string;
  ends_at: string;
  per_day: number;
  min_score: number;
  roles: string[];
  countries: string[];
  answers: AutoApplyAnswers;
  contact_email: string | null;
  consent_at: string;
};

export type AutoApplyItem = {
  id: string;
  job_id: string | null;
  title: string;
  company: string;
  location: string | null;
  score: number | null;
  status: AutoApplyItemStatus;
  note: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  logo: string | null;
};

export type AutoApplyState = {
  signed_in: boolean;
  pro: boolean;
  email?: string | null;
  request: AutoApplyRequest | null;
  items: AutoApplyItem[];
  stats: { applied: number; queued: number; applying: number; applied_today: number; last_applied_at: string | null } | null;
};

export type StartInput = {
  roles: string[];
  countries: string[];
  per_day: number;
  min_score: number;
  contact_email: string | null;
  answers: AutoApplyAnswers;
  consent_text: string;
};

/** The exact words the person agrees to (stored with the request). */
export const CONSENT_TEXT =
  'I authorise MadeVisa to apply to jobs on my behalf for one month, using my CV, my profile details and the answers I give here. I confirm this information is accurate. I can pause or stop Auto Apply at any time.';

const listeners = new Set<() => void>();
const refreshAll = () => listeners.forEach((f) => f());

const friendly = (msg: string) =>
  /auto_apply_|schema cache|does not exist/i.test(msg) ? 'Auto Apply is being switched on — try again in a few minutes.' : msg.replace(/^.*?ERROR:\s*/, '');

/** The signed-in person's Auto Apply. `undefined` while loading, `null` when unavailable (migration not run). */
export function useAutoApplyService(): { state: AutoApplyState | null | undefined; reload: () => void } {
  const { session } = useAuth();
  const [state, setState] = useState<AutoApplyState | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);
  useEffect(() => {
    if (!session) {
      setState({ signed_in: false, pro: false, request: null, items: [], stats: null });
      return;
    }
    let alive = true;
    supabase.rpc('auto_apply_me').then(({ data, error }) => {
      if (alive) setState(error || !data ? null : (data as AutoApplyState));
    });
    return () => {
      alive = false;
    };
  }, [session, tick]);
  // While it runs, the page keeps itself up to date (the team marks applications through the day).
  useEffect(() => {
    if (state?.request?.status !== 'active') return;
    const t = window.setInterval(reload, 60_000);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [state?.request?.status, reload]);
  return { state, reload };
}

export async function startAutoApply(input: StartInput): Promise<string | null> {
  const { error } = await supabase.rpc('auto_apply_start', { p: { ...input, consent: true } });
  if (error) return friendly(error.message);
  refreshAll();
  return null;
}

export async function setAutoApplyStatus(status: 'active' | 'paused' | 'stopped'): Promise<string | null> {
  const { error } = await supabase.rpc('auto_apply_set', { p_status: status });
  if (error) return friendly(error.message);
  refreshAll();
  return null;
}

/** Put the current CV matches in the queue (only does something while Auto Apply runs). */
export async function syncAutoApply(jobs: { id: string; score: number }[]): Promise<number> {
  if (!jobs.length) return 0;
  const { data, error } = await supabase.rpc('auto_apply_sync', { p_jobs: jobs.slice(0, 100) });
  if (error) return 0;
  const n = Number(data ?? 0);
  if (n > 0) refreshAll();
  return n;
}

export function daysLeft(endsAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000));
}
