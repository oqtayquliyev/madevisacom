// "Check your match" on a job: what is free, and what each account has used.
//
//   • The score is always free, for guests too.
//   • Missing skills: 3 different jobs a day on a free account (a job stays
//     unlocked once opened). Guests are asked to create an account.
//   • The full report (every part of the score, what to change, CV checks)
//     is MadeVisa Pro.
//
// The limit is kept on the server (cv_check(), migration 20261126090000).
// Before that migration is run, the same rule is kept in this browser so
// the feature still works.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMyPlan } from '@/lib/plans';
import { FREE_DAILY_CHECKS } from '@/lib/pricing';
import { parseJob, type JobInput } from '@/lib/cv/jobProfile';
import { matchCv, type MatchResult } from '@/lib/cv/match';
import { useCv, type StoredCv } from '@/lib/cv/store';

type Saved = { score: number; unlocked: boolean; day: string };
type Book = { cvAt: string; jobs: Record<string, Saved> };

const KEY = 'mv:cvChecks';
const today = () => new Date().toISOString().slice(0, 10);

function readBook(cvAt: string): Book {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Book | null;
    // A new CV makes every earlier result stale.
    if (v && v.cvAt === cvAt && v.jobs) return v;
  } catch {
    /* ignore */
  }
  return { cvAt, jobs: {} };
}
function writeBook(b: Book) {
  try {
    const entries = Object.entries(b.jobs).slice(-300);
    window.localStorage.setItem(KEY, JSON.stringify({ cvAt: b.cvAt, jobs: Object.fromEntries(entries) }));
  } catch {
    /* ignore */
  }
}

export type Quota = { used: number; limit: number; left: number; pro: boolean };

let quotaMemo: { userId: string; at: number; used: number } | null = null;
const quotaListeners = new Set<() => void>();
const pingQuota = () => quotaListeners.forEach((l) => l());

/** Free missing-skill checks left today for the signed-in person. */
export function useCheckQuota(): Quota | null {
  const { user } = useAuth();
  const { isPro } = useMyPlan();
  const [used, setUsed] = useState<number | null>(user && quotaMemo?.userId === user.id ? quotaMemo.used : null);
  useEffect(() => {
    if (!user) return setUsed(null);
    let alive = true;
    const load = (force: boolean) => {
      if (!force && quotaMemo?.userId === user.id && Date.now() - quotaMemo.at < 60_000) return setUsed(quotaMemo.used);
      supabase.rpc('cv_checks_today').then(({ data, error }) => {
        if (!alive) return;
        const n = error || !data ? localUsedToday() : Number((data as { used: number }).used) || 0;
        quotaMemo = { userId: user.id, at: Date.now(), used: n };
        setUsed(n);
      });
    };
    load(false);
    const onPing = () => {
      if (quotaMemo?.userId === user.id) setUsed(quotaMemo.used);
    };
    quotaListeners.add(onPing);
    return () => {
      alive = false;
      quotaListeners.delete(onPing);
    };
  }, [user]);
  if (!user || used == null) return null;
  return { used, limit: FREE_DAILY_CHECKS, left: Math.max(0, FREE_DAILY_CHECKS - used), pro: isPro };
}

function localUsedToday(): number {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Book | null;
    return v ? Object.values(v.jobs).filter((j) => j.unlocked && j.day === today()).length : 0;
  } catch {
    return 0;
  }
}

/** Record a check; returns whether this job's missing skills may be shown. */
async function recordCheck(jobKey: string, score: number, cv: StoredCv, userId: string | null): Promise<boolean> {
  const book = readBook(cv.at);
  const before = book.jobs[jobKey];
  let unlocked = false;
  if (userId) {
    const { data, error } = await supabase.rpc('cv_check', { p_job: jobKey, p_score: score });
    if (!error && data) {
      const d = data as { unlocked: boolean; used: number };
      unlocked = Boolean(d.unlocked);
      quotaMemo = { userId, at: Date.now(), used: Number(d.used) || 0 };
    } else {
      // Server rule not installed yet: same rule, kept in this browser.
      unlocked = Boolean(before?.unlocked) || localUsedToday() < FREE_DAILY_CHECKS;
      quotaMemo = { userId, at: Date.now(), used: localUsedToday() + (unlocked && !before?.unlocked ? 1 : 0) };
    }
  }
  book.jobs[jobKey] = { score, unlocked, day: unlocked && !before?.unlocked ? today() : before?.day ?? today() };
  writeBook(book);
  pingQuota();
  return unlocked;
}

export type JobMatch = {
  cv: StoredCv | null;
  cvLoading: boolean;
  /** Null until "Check your match" is pressed for this job (or was, earlier, with this CV). */
  result: MatchResult | null;
  /** Missing skills may be shown. */
  unlocked: boolean;
  /** The full report may be shown. */
  full: boolean;
  busy: boolean;
  quota: Quota | null;
  check: () => Promise<void>;
};

/**
 * Everything the job page needs for one job: the CV, the result once
 * checked, and what this person may see of it.
 */
export function useJobMatch(jobKey: string | null, job: JobInput | null): JobMatch {
  const { user } = useAuth();
  const { isPro } = useMyPlan();
  const { cv, loading: cvLoading } = useCv();
  const quota = useCheckQuota();
  const [checked, setChecked] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);

  // A result from an earlier visit with the same CV is shown straight away.
  useEffect(() => {
    setChecked(cv && jobKey ? readBook(cv.at).jobs[jobKey] ?? null : null);
  }, [cv, jobKey]);

  const jobProfile = useMemo(() => (job && job.description ? parseJob(job) : null), [job]);
  const result = useMemo(() => (checked && cv && jobProfile ? matchCv(cv.profile, cv.text, jobProfile) : null), [checked, cv, jobProfile]);

  const check = useCallback(async () => {
    if (!cv || !jobKey || !jobProfile || busy) return;
    setBusy(true);
    const r = matchCv(cv.profile, cv.text, jobProfile);
    // Long enough to see that something was read; the maths itself is instant.
    const [unlocked] = await Promise.all([recordCheck(jobKey, r.score, cv, user?.id ?? null), new Promise((res) => window.setTimeout(res, 900))]);
    setChecked({ score: r.score, unlocked, day: today() });
    setBusy(false);
  }, [cv, jobKey, jobProfile, busy, user]);

  return {
    cv,
    cvLoading,
    result,
    unlocked: isPro || Boolean(checked?.unlocked && user),
    full: isPro,
    busy,
    quota,
    check,
  };
}

/** Score remembered for a job with the current CV (for lists), or null. */
export function savedScore(cv: StoredCv | null, jobKey: string): number | null {
  if (!cv) return null;
  return readBook(cv.at).jobs[jobKey]?.score ?? null;
}
