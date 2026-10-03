// "Check your match" on a job: what is free, and what each account has used.
//
//   • The score is always free, for guests too.
//   • Missing skills: 3 different jobs a day on a free account (a job stays
//     unlocked once opened). Guests are asked to create an account.
//   • The full report (every part of the score, what to change, CV checks)
//     is MadeVisa Pro.
//
// A score is remembered for 24 hours for the CV it was worked out with; after
// that, or with a new CV, it is worked out again. Ads and CVs in another
// language are compared in English when a translation is available
// (src/lib/cv/translate.ts).
//
// The limit is kept on the server (cv_check(), migration 20261126090000).
// Before that migration is run, the same rule is kept in this browser so
// the feature still works.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMyPlan } from '@/lib/plans';
import { FREE_DAILY_CHECKS } from '@/lib/pricing';
import { parseJob, type JobInput, type JobProfile } from '@/lib/cv/jobProfile';
import { matchCv, type MatchResult } from '@/lib/cv/match';
import { useCv, type StoredCv } from '@/lib/cv/store';
import { cvInEnglish, isEnglish, jobsInEnglish, type EnglishCv } from '@/lib/cv/translate';
import { stripHtml } from '@/lib/cv/text';
import { topScore } from '@/lib/cv/topMatches';

type Saved = { score: number; unlocked: boolean; day: string; /** When the score was worked out (ms). */ at?: number };
/** How long a score is kept before it is worked out again. */
export const SCORE_TTL_MS = 24 * 60 * 60 * 1000;
const fresh = (s: Saved | undefined | null): s is Saved => Boolean(s && Date.now() - (s.at ?? 0) < SCORE_TTL_MS);
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
  book.jobs[jobKey] = { score, unlocked, day: unlocked && !before?.unlocked ? today() : before?.day ?? today(), at: Date.now() };
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
  /** The ad and the CV as they are compared — in English when either was translated. */
  const [prep, setPrep] = useState<{ for: string; job: JobProfile; me: EnglishCv } | null>(null);
  const userId = user?.id ?? null;
  const prepKey = cv && jobKey && job ? `${cv.at}:${jobKey}:${userId ?? ''}:${job.description.length}` : null;

  // A result from the last 24 hours with the same CV is shown straight away.
  useEffect(() => {
    const saved = cv && jobKey ? readBook(cv.at).jobs[jobKey] : null;
    if (fresh(saved)) return setChecked(saved);
    // One of "the jobs you match most": its score is known already, so it is shown
    // without a press. Missing skills still open the usual way (3 jobs a day, free).
    const known = cv && jobKey ? topScore(cv, jobKey) : null;
    setChecked(known != null ? { score: known, unlocked: false, day: today(), at: Date.now() } : null);
  }, [cv, jobKey]);

  // Both already in English: nothing to wait for.
  const direct = useMemo(() => {
    if (!cv || !job?.description || !prepKey) return null;
    if (!isEnglish(cv.text) || !isEnglish(stripHtml(job.description))) return null;
    return { for: prepKey, job: parseJob(job), me: { text: cv.text, profile: cv.profile, state: 'same' } as EnglishCv };
  }, [cv, job, prepKey]);

  const prepare = useCallback(async () => {
    if (!cv || !job?.description || !jobKey || !prepKey) return null;
    if (direct) return direct;
    const [me, ads] = await Promise.all([cvInEnglish(cv, userId), jobsInEnglish([{ id: jobKey, title: job.title, description: job.description }])]);
    const ad = ads.get(jobKey);
    return { for: prepKey, job: parseJob(ad ? { ...job, title: ad.title, description: ad.description } : job), me };
  }, [cv, job, jobKey, prepKey, direct, userId]);

  // A saved result for an ad or CV in another language: fetch the translation it was scored with.
  useEffect(() => {
    if (!checked || direct || !prepKey || prep?.for === prepKey) return;
    let alive = true;
    void prepare().then((p) => alive && p && setPrep(p));
    return () => {
      alive = false;
    };
  }, [checked, direct, prepKey, prep, prepare]);

  const ready = direct ?? (prep && prep.for === prepKey ? prep : null);
  const result = useMemo(() => (checked && ready ? matchCv(ready.me.profile, ready.me.text, ready.job) : null), [checked, ready]);

  const check = useCallback(async () => {
    if (!cv || !jobKey || !job?.description || busy) return;
    setBusy(true);
    const p = ready ?? (await prepare().catch(() => null));
    if (!p) return setBusy(false);
    const r = matchCv(p.me.profile, p.me.text, p.job);
    // Long enough to see that something was read; the maths itself is instant.
    const [unlocked] = await Promise.all([recordCheck(jobKey, r.score, cv, userId), new Promise((res) => window.setTimeout(res, 900))]);
    setPrep(p);
    setChecked({ score: r.score, unlocked, day: today(), at: Date.now() });
    setBusy(false);
  }, [cv, jobKey, job, busy, ready, prepare, userId]);

  return {
    cv,
    cvLoading,
    result,
    unlocked: isPro || Boolean(checked?.unlocked && user),
    full: isPro,
    busy: busy || Boolean(checked && !ready),
    quota,
    check,
  };
}

/** Score worked out for a job with the current CV in the last 24 hours (for lists), or null. */
export function savedScore(cv: StoredCv | null, jobKey: string): number | null {
  if (!cv) return null;
  const saved = readBook(cv.at).jobs[jobKey];
  return fresh(saved) ? saved.score : null;
}
