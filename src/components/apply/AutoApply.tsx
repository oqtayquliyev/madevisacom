import { useCallback, useEffect, useMemo, useState } from 'react';
import { rememberAuthIntent } from '@/lib/authIntent';
import { toUsd } from '@/lib/pricing';
import { useCv } from '@/lib/cv/store';
import type { TopResult } from '@/lib/cv/topMatches';
import { plan, twinsIn } from '@/lib/apply/decision';
import { factsOf } from '@/lib/apply/facts';
import { isPending } from '@/lib/apply/machine';
import { completeness, confidence } from '@/lib/apply/profile';
import { isHalting, loadServerFacts, logEvent, pause, resume, startBatch, stop, useAutoApply, type App } from '@/lib/apply/store';
import type { PlaceKind } from '@/lib/apply/types';
import { ApplicationPreferences } from '@/components/apply/ApplicationPreferences';
import { ApplicationDone, ApplicationProgress } from '@/components/apply/ApplicationProgress';
import { ApplicationReceipt } from '@/components/apply/ApplicationReceipt';
import { ApplicationConfirm, ApplicationReview } from '@/components/apply/ApplicationReview';
import { ApplicationSummary } from '@/components/apply/ApplicationSummary';
import { ApplicationTracker } from '@/components/apply/ApplicationTracker';

// Auto Apply on /cv-match.
//   AutoApply         under the headline: the summary and "Apply to N jobs", then the batch as it runs, then what came of it
//   AutoApplyTracker  further down: every application made through MadeVisa
// Both show nothing until the database part is installed (migration 20261204090000), so the page is unchanged before it.

type OnAuth = (page: 'login' | 'register') => void;
type Sheet = 'prefs' | 'prefs-first' | 'review' | 'confirm' | null;

const DISMISS_KEY = 'mv:applyDone';
const dismissed = () => {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};
const once = (key: string): boolean => {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* no storage: log it */
  }
  return true;
};
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

type Props = {
  result: TopResult;
  /** Where each matched job is for this visitor (here / no visa needed / abroad / unknown). */
  places: Map<string, PlaceKind>;
  onAuth?: OnAuth;
  /** Search again for fresh matches. */
  onAgain?: () => void;
  /** The page shows how the CV could score higher (the roadmap under this block). */
  canImprove: boolean;
};

export function AutoApply({ result, places, onAuth, onAgain, canImprove }: Props) {
  const { cv } = useCv();
  const auto = useAutoApply(cv);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(dismissed);

  const signedIn = Boolean(auto.status?.signedIn);
  const now = useMemo(() => Date.now(), [result.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobs = useMemo(() => result.items.map(factsOf), [result.items]);

  // What only the database knows: how each can be sent, and what was applied to already.
  const key = `${result.cvAt}:${result.at}:${auto.apps.length}`;
  useEffect(() => {
    if (signedIn && auto.available) void loadServerFacts(key, jobs.map((j) => j.id));
  }, [signedIn, auto.available, key, jobs]);

  const planned = useMemo(() => {
    const twins = twinsIn(jobs);
    const floor = auto.prefs.salaryMin ? toUsd(auto.prefs.salaryMin, auto.prefs.salaryCurrency) : null;
    const done = completeness(auto.profile);
    const sure = confidence(auto.profile);
    return plan(jobs, (job) => {
      const s = auto.server.get(job.id);
      return { place: places.get(job.id) ?? 'unknown', prefs: auto.prefs, now, server: s, duplicateListing: twins.has(job.id), salaryFloorUsd: floor, completeness: signedIn ? done : null, confidence: signedIn ? sure : null };
    });
  }, [jobs, places, auto.prefs, auto.profile, auto.server, now, signedIn]);

  // The recommended ones are ticked to begin with; the person's own ticks are kept until the list itself changes.
  const autoKey = planned.auto.map((p) => p.job.id).join(',');
  useEffect(() => {
    setPicked(new Set(planned.auto.map((p) => p.job.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  useEffect(() => {
    if (!auto.available || !result.items.length) return;
    if (once(`mv:applyEv:${result.cvAt}:${result.at}`)) {
      if (Date.now() - Date.parse(result.cvAt) < 120_000) logEvent('cv_uploaded');
      logEvent('matches_loaded', { matches: result.items.length, recommended: planned.auto.length, review: planned.review.length, skipped: planned.skip.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.available, result.at]);

  const selected = useMemo(() => planned.all.filter((p) => picked.has(p.job.id)).sort((a, b) => b.a.rank - a.a.rank), [planned, picked]);
  const batch = useMemo(() => (auto.queue ? auto.apps.filter((a) => a.queueId === auto.queue!.id) : []), [auto.apps, auto.queue]);
  const open = openId ? auto.apps.find((a) => a.id === openId) ?? null : null;

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeOpen = useCallback(() => setOpenId(null), []);

  if (auto.available !== true || !auto.status?.enabled || !cv || !result.items.length) return null;
  const status = auto.status;

  const active = auto.running || Boolean(auto.queue && ['running', 'paused'].includes(auto.queue.state) && batch.some((a) => isPending(a.status)));
  const recent = auto.queue ? Date.now() - Date.parse(auto.queue.createdAt) < 3 * 86_400_000 : false;
  const finished = !active && Boolean(auto.queue) && batch.length > 0 && recent && hidden !== auto.queue!.id;

  const begin = (next: 'confirm' | 'review') => {
    logEvent(next === 'review' ? 'auto_apply_review_opened' : 'auto_apply_opened', { recommended: planned.auto.length });
    if (!signedIn) {
      rememberAuthIntent({ reason: 'match', next: '/cv-match' });
      return onAuth?.('register');
    }
    // The first time: a look at the preferences, already filled in.
    setSheet(next === 'confirm' && !auto.prefsSaved ? 'prefs-first' : next);
  };
  const dismiss = () => {
    if (!auto.queue) return;
    try {
      window.localStorage.setItem(DISMISS_KEY, auto.queue.id);
    } catch {
      /* ignore */
    }
    setHidden(auto.queue.id);
  };
  const ready = batch.filter((a) => a.status === 'review_required');
  const nextReady = (after?: string) => ready.find((a) => a.id !== after) ?? null;

  return (
    <>
      {active && auto.queue ? (
        <ApplicationProgress
          apps={batch}
          queue={auto.queue}
          status={status}
          running={auto.running}
          halting={isHalting()}
          current={auto.current}
          pace={auto.pace}
          error={auto.error}
          onPause={pause}
          onResume={() => void resume(cv)}
          onStop={() => void stop()}
          onOpen={(a) => setOpenId(a.id)}
          onPrefs={() => setSheet('prefs')}
        />
      ) : finished ? (
        <ApplicationDone
          apps={batch}
          stopped={auto.queue!.state === 'stopped' && batch.some((a) => isPending(a.status))}
          onOpen={(a) => setOpenId(a.id)}
          onSendNext={() => setOpenId(nextReady()?.id ?? null)}
          onTracker={() => scrollTo('applications')}
          onMore={() => {
            dismiss();
            if (onAgain) onAgain();
            else scrollTo('top-title');
          }}
          onImprove={canImprove ? () => scrollTo('best-match') : null}
          onDismiss={dismiss}
        />
      ) : (
        <ApplicationSummary plan={planned} total={result.items.length} status={status} minScore={auto.prefs.minScore} onApply={() => begin('confirm')} onReview={() => begin('review')} onPrefs={() => (signedIn ? setSheet('prefs') : begin('confirm'))} />
      )}

      {(sheet === 'prefs' || sheet === 'prefs-first') && (
        <ApplicationPreferences
          prefs={auto.prefs}
          profile={auto.profile}
          status={status}
          roles={[...new Set(jobs.map((j) => j.role).filter((r): r is string => Boolean(r)))]}
          countries={[...new Set(jobs.map((j) => (j.cc ?? '').toUpperCase()).filter(Boolean))]}
          first={sheet === 'prefs-first'}
          onClose={closeSheet}
          onSaved={() => setSheet(sheet === 'prefs-first' ? 'confirm' : null)}
        />
      )}
      {sheet === 'review' && <ApplicationReview plan={planned} picked={picked} setPicked={setPicked} onClose={closeSheet} onApply={() => setSheet(auto.prefsSaved ? 'confirm' : 'prefs-first')} />}
      {sheet === 'confirm' && (
        <ApplicationConfirm
          selected={selected}
          status={status}
          profile={auto.profile}
          onClose={closeSheet}
          onReview={() => setSheet('review')}
          onStart={async () => {
            const r = await startBatch(selected, cv);
            if (r.ok) {
              setSheet(null);
              setHidden(null);
              window.setTimeout(() => scrollTo('top-title'), 50);
            }
            return r;
          }}
        />
      )}
      {open && (
        <ApplicationReceipt
          app={open}
          cv={cv}
          onClose={closeOpen}
          onNext={
            open.status === 'review_required'
              ? () => {
                  const next = nextReady(open.id);
                  setOpenId(next ? next.id : null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/** "Your applications" — the history and the funnel, lower on the page. */
export function AutoApplyTracker() {
  const { cv } = useCv();
  const auto = useAutoApply(cv);
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  if (auto.available !== true || !auto.status?.signedIn || !auto.apps.length) return null;
  const open: App | null = openId ? auto.apps.find((a) => a.id === openId) ?? null : null;
  return (
    <>
      <ApplicationTracker apps={auto.apps} onOpen={(a) => setOpenId(a.id)} refreshKey={`${auto.apps.filter((a) => a.status === 'submitted').length}:${openId ?? ''}`} />
      {open && <ApplicationReceipt app={open} cv={cv} onClose={close} />}
    </>
  );
}
