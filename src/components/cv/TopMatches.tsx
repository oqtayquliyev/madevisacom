import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { NEW_TAB } from '@/lib/navLink';
import { ArrowRight, Check, ChevronRight, FileSignature, Lock, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { countryName, nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { usePersonalization } from '@/lib/personalization';
import { useMyPlan } from '@/lib/plans';
import { useTopMatches, type TopMatch, type TopResult, type TopState } from '@/lib/cv/topMatches';
import { CircleFlag } from '@/components/common/CircleFlag';
import { MatchRing } from '@/components/cv/MatchBits';
import { CvAvatar } from '@/components/cv/CvInsights';
import type { StoredCv } from '@/lib/cv/store';

// The pieces that show "the jobs you match most":
//   SearchProgress     while the search runs (with a few true, encouraging lines)
//   OtherMatchesPopup  on a job page: "you match these jobs too"
//   RecommendedJobs    on a job page: "Recommended for you"
//   TopMatchesStrip    on /jobs: the best three, one line
// All of them read the same search (src/lib/cv/topMatches.ts).

type OnAuth = (page: 'login' | 'register') => void;

/** Guests see this many matches; the rest wait behind a free account. */
export const GUEST_VISIBLE = 2;
const hrefOf = (m: Pick<TopMatch, 'id' | 'title' | 'company'>) => `${jobPath({ id: `sponsored-${m.id}`, title: m.title, company: m.company })}#cv-match`;
const go = (href: string) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  nav(href);
};
const where = (m: TopMatch) => [m.remote && !m.city ? 'Remote' : m.city, m.country].filter(Boolean).join(', ');

const STAGES: NonNullable<TopState['stage']>[] = ['jobs', 'reading', 'translating', 'scoring'];
const STAGE_TEXT: Record<NonNullable<TopState['stage']>, [doing: string, done: string]> = {
  jobs: ['Finding jobs with titles like yours', 'Jobs with titles like yours found'],
  reading: ['Reading the job ads', 'Job ads read'],
  translating: ['Translating ads in other languages', 'Ads translated'],
  scoring: ['Comparing each one with your CV', 'Compared with your CV'],
};

/** A number that counts up to its target (4, 5, 6…) instead of jumping. */
function useCountUp(target: number, ms = 700): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const from = shown;
    if (from === target) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return setShown(target);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the target moves
  }, [target, ms]);
  return shown;
}

/** How many of the found roles appear in the feed so far: one every few hundred ms. */
function useFeed(total: number, everyMs: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= total) return;
    const t = window.setTimeout(() => setN((x) => Math.min(total, x + 1)), n === 0 ? 250 : everyMs);
    return () => window.clearTimeout(t);
  }, [n, total, everyMs]);
  return n;
}

function Counter({ value, label, tone }: { value: number; label: string; tone: string }) {
  const shown = useCountUp(value);
  return (
    <div className="rounded-xl bg-ink-50 px-2 py-2.5 text-center">
      <p className={`text-[24px] font-extrabold leading-none tabular-nums tracking-tight ${tone}`}>{shown}</p>
      <p className="mt-1 text-[11px] font-semibold leading-tight text-ink-500">{label}</p>
    </div>
  );
}

/**
 * The search, as it happens: real counts that tick up (jobs found, ads read, sponsorship documents),
 * and the roles found for this person one by one, each with its sponsorship document from their
 * country to the job's. Every number and role here comes from the search itself.
 */
export function SearchProgress({ state, cv, name }: { state: Pick<TopState, 'stage' | 'progress' | 'live'>; cv?: StoredCv | null; name?: string | null }) {
  const stage = state.stage ?? 'jobs';
  const at = STAGES.indexOf(stage);
  const live = state.live ?? null;
  const visitor = useVisitor();
  const from = (visitor.currentLocation ?? visitor.citizenship ?? '').toUpperCase() || null;
  const picks = live?.picks ?? [];
  const shownN = useFeed(picks.length, Math.max(260, Math.min(520, Math.round(4200 / Math.max(1, picks.length)))));
  const shown = picks.slice(0, shownN);
  const abroad = (cc: string | null) => Boolean(cc) && cc!.toUpperCase() !== from;
  const docs = shown.filter((p) => abroad(p.cc)).length;
  const finished = stage === 'scoring' && state.progress >= 1;
  const readFrac = stage === 'jobs' ? 0 : stage === 'reading' ? Math.max(0, Math.min(1, (state.progress - 0.2) / 0.5)) : 1;
  const read = Math.round((live?.reading ?? 0) * readFrac);
  const pct = Math.round(Math.max(0.05, Math.min(1, state.progress)) * 100);
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const nowText = finished || (shownN >= picks.length && picks.length > 0 && stage === 'scoring') ? 'Putting your best matches first…' : STAGE_TEXT[stage][0] + '…';

  return (
    <section aria-live="polite" aria-busy="true" className="mx-auto max-w-lg rounded-3xl bg-white px-5 py-7 shadow-soft ring-1 ring-ink-200 sm:px-8">
      <div className="flex items-center gap-3.5">
        {cv && (
          <span className="relative shrink-0">
            <span className="absolute -inset-1 animate-ping rounded-full bg-brand-200/60 motion-reduce:animate-none" aria-hidden />
            <span className="relative block">
              <CvAvatar cv={cv} name={name} size={52} />
            </span>
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold leading-tight tracking-tight text-ink-950">{first ? `Finding your jobs, ${first}` : 'Finding the jobs you match most'}</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">{nowText}</p>
        </div>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Counter value={live?.found ?? 0} label="jobs found" tone="text-brand-700" />
        <Counter value={read} label="ads read for you" tone="text-ink-950" />
        <Counter value={docs} label="sponsorship docs ready" tone="text-emerald-700" />
      </div>

      {shown.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {shown
            .slice(-3)
            .reverse()
            .map((p) => (
              <li key={`${p.role}|${p.cc}`} className="animate-fade-up rounded-xl px-3 py-2 ring-1 ring-ink-100 motion-reduce:animate-none">
                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink-900">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden />
                  <span>Found {/^[aeio]/i.test(p.role) ? 'an' : 'a'} {p.role} role for you{p.country ? ' in' : ''}</span>
                  {p.cc && <CircleFlag countryCode={p.cc} size={15} label={p.country ?? p.cc} />}
                  {p.country && <span>{p.country}</span>}
                </p>
                {abroad(p.cc) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-[22px] text-[12.5px] font-medium text-emerald-800">
                    <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Sponsorship document prepared</span>
                    {from && <CircleFlag countryCode={from} size={13} label={countryName(from) ?? from} />}
                    {from && <span aria-hidden>→</span>}
                    <CircleFlag countryCode={p.cc!} size={13} label={p.country ?? p.cc!} />
                  </p>
                )}
              </li>
            ))}
        </ul>
      ) : (
        <ul className="mt-4 space-y-2.5">
          <li className="flex items-center gap-2.5 text-[14px] text-ink-600">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} /> CV read{cv?.profile.titles[0] ? ` — ${cv.profile.titles[0]}` : ''}
          </li>
          <li className="flex items-center gap-2.5 text-[14px] font-semibold text-ink-950">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" aria-hidden />
            {STAGE_TEXT[STAGES[Math.max(0, at)]][0]}
          </li>
        </ul>
      )}
    </section>
  );
}

// --- Where a job is, for this visitor --------------------------------------------

type Visitor = { citizenship: string | null; currentLocation: string | null };
/** Passport and country: the visitor's own choices, or the country the site detected for them. */
function useVisitor(): Visitor {
  const { profile } = usePersonalization();
  const citizenship = profile.citizenship ?? null;
  const currentLocation = profile.currentLocation ?? null;
  return useMemo(() => ({ citizenship, currentLocation }), [citizenship, currentLocation]);
}

/** How many matches are strong (80+), good (65+) and weaker. */
function tiers(items: TopMatch[]) {
  const strong = items.filter((m) => m.score >= 80).length;
  const good = items.filter((m) => m.score >= 65 && m.score < 80).length;
  return { strong, good, partial: items.length - strong - good, best: items[0]?.score ?? 0 };
}

const POP_KEY = 'mv:topPop';
function popSeen(): { jobs: string[]; closed: number } {
  try {
    return JSON.parse(window.sessionStorage.getItem(POP_KEY) ?? 'null') ?? { jobs: [], closed: 0 };
  } catch {
    return { jobs: [], closed: 0 };
  }
}
function popSave(v: { jobs: string[]; closed: number }) {
  try {
    window.sessionStorage.setItem(POP_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** What this visitor may see of the list, without the job they are on. */
function othersFor(result: TopResult | null, currentId: string | null, guest: boolean): { list: TopMatch[]; total: number } {
  if (!result) return { list: [], total: 0 };
  const visible = guest ? result.items.slice(0, GUEST_VISIBLE) : result.items;
  return { list: visible.filter((m) => m.id !== currentId), total: result.items.filter((m) => m.id !== currentId).length };
}

/**
 * A small card in the corner of a job page that is one of your matches:
 * "You match these jobs too". Once per job per visit; closing it twice
 * stops it for the visit.
 */
export function OtherMatchesPopup({ currentId, onAuth }: { currentId: string | null; onAuth?: OnAuth }) {
  const { session } = useAuth();
  const { isPaid } = useMyPlan();
  const { result } = useTopMatches();
  const [open, setOpen] = useState(false);
  const guest = !session;
  const mine = Boolean(currentId && result?.items.some((m) => m.id === currentId));
  const { list, total } = othersFor(result, currentId, guest);

  useEffect(() => {
    setOpen(false);
    if (!currentId || !mine || total < 1) return;
    const seen = popSeen();
    if (seen.closed >= 2 || seen.jobs.includes(currentId)) return;
    const t = window.setTimeout(() => {
      setOpen(true);
      popSave({ ...seen, jobs: [...seen.jobs, currentId].slice(-50) });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [currentId, mine, total]);

  // CV match is part of Starter and Pro.
  if (!open || total < 1 || !isPaid) return null;
  const close = () => {
    setOpen(false);
    const seen = popSeen();
    popSave({ ...seen, closed: seen.closed + 1 });
  };
  const top = list.slice(0, 3);
  return (
    <aside role="dialog" aria-label="Other jobs you match" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-sm animate-fade-in rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-ink-200 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 sm:w-[360px]">
      <button onClick={close} aria-label="Close" className="absolute right-2 top-2 rounded-full p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
        <X className="h-4 w-4" />
      </button>
      <p className="flex items-center gap-1.5 pr-6 text-[15px] font-bold leading-snug text-ink-950">
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" /> You match {total} other {total === 1 ? 'job' : 'jobs'} too
      </p>
      <p className="mt-0.5 text-[12.5px] text-ink-600">From the same search with your CV.</p>
      {top.length > 0 && (
        <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-xl ring-1 ring-ink-200">
          {top.map((m) => {
            const href = hrefOf(m);
            return (
              <li key={m.id}>
                <a href={href} {...NEW_TAB} className="flex items-center gap-3 px-3 py-2.5 hover:bg-brand-50/60">
                  <MatchRing score={m.score} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-950">{m.title}</span>
                    <span className="block truncate text-[12px] text-ink-500">{m.company}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {guest && total > list.length ? (
        <button
          onClick={() => {
            rememberAuthIntent({ reason: 'match', next: '/cv-match' });
            onAuth?.('register');
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-700"
        >
          <Lock className="h-3.5 w-3.5" /> See all {total} with a free account
        </button>
      ) : (
        <button onClick={() => nav('/cv-match')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-700">
          See all your matches <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </aside>
  );
}

/** "Recommended for you" on a job page: the other jobs this CV matches best. */
export function RecommendedJobs({ currentId, onAuth, className = '' }: { currentId: string | null; onAuth?: OnAuth; className?: string }) {
  const { session } = useAuth();
  // Looks for matches by itself a moment after the page has loaded (only the light, server-side way).
  const { isPaid } = useMyPlan();
  const { result, status, cv } = useTopMatches({ auto: true, autoDelayMs: 2500, light: true });
  const guest = !session;
  if (!cv || !isPaid) return null;
  const { list, total } = othersFor(result, currentId, guest);

  if (!result) {
    if (status !== 'running') return null;
    return (
      <section aria-label="Recommended for you" className={`rounded-2xl border border-ink-200 bg-white p-5 sm:p-6 ${className}`}>
        <p className="text-[16px] font-bold text-ink-950">Recommended for you</p>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Looking for other jobs your CV matches…
        </p>
      </section>
    );
  }
  if (total < 1) return null;
  const top = list.slice(0, 4);
  return (
    <section aria-labelledby="rec-title" className={`rounded-2xl border border-ink-200 bg-white p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rec-title" className="text-[18px] font-bold text-ink-950">
          Recommended for you
        </h2>
        <a href="/cv-match" onClick={go('/cv-match')} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
          All {total} {total === 1 ? 'match' : 'matches'} <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="mt-0.5 text-[13px] text-ink-500">Other jobs your CV matches best.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {top.map((m) => {
          const href = hrefOf(m);
          return (
            <li key={m.id}>
              <a href={href} {...NEW_TAB} className="flex h-full items-center gap-3 rounded-xl p-3 ring-1 ring-ink-200 transition hover:bg-brand-50/50 hover:ring-brand-200">
                <MatchRing score={m.score} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink-950">{m.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-500">
                    {m.cc && <CircleFlag countryCode={m.cc} label={m.country ?? undefined} size={12} />}
                    <span className="truncate">
                      {m.company}
                      {where(m) ? ` · ${where(m)}` : ''}
                    </span>
                  </span>
                </span>
              </a>
            </li>
          );
        })}
        {guest && total > list.length && (
          <li className={top.length % 2 === 0 ? 'sm:col-span-2' : ''}>
            <button
              onClick={() => {
                rememberAuthIntent({ reason: 'match', next: '/cv-match' });
                onAuth?.('register');
              }}
              className="flex h-full w-full items-center gap-3 rounded-xl bg-brand-50 p-3 text-left ring-1 ring-brand-200 hover:bg-brand-100/70"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-brand-700">
                <Lock className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-ink-950">
                  {total - list.length} more {total - list.length === 1 ? 'match' : 'matches'}
                </span>
                <span className="block text-[12px] text-ink-600">Free account to see them all</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand-700" />
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** One line for pages that list jobs: the best three matches. */
export function TopMatchesStrip({ className = '' }: { className?: string }) {
  const { session } = useAuth();
  // A CV added on this page (the strip above) is searched for a moment later, the light way.
  const { isPaid } = useMyPlan();
  const { result } = useTopMatches({ auto: true, autoDelayMs: 1500, light: true });
  if (!result?.items.length || !isPaid) return null;
  const guest = !session;
  const list = (guest ? result.items.slice(0, GUEST_VISIBLE) : result.items).slice(0, 3);
  const t = tiers(result.items);
  return (
    <aside aria-label="Your best matches" className={`rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[15px] font-bold text-ink-950">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          {t.strong > 0 ? `You match ${t.strong} ${t.strong === 1 ? 'job' : 'jobs'} at 80% or more` : `Your ${result.items.length} closest ${result.items.length === 1 ? 'job' : 'jobs'}`}
        </p>
        <a href="/cv-match" onClick={go('/cv-match')} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
          See all {result.items.length} <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-3">
        {list.map((m) => {
          const href = hrefOf(m);
          return (
            <li key={m.id}>
              <a href={href} {...NEW_TAB} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-200 hover:ring-brand-300">
                <MatchRing score={m.score} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink-950">{m.title}</span>
                  <span className="block truncate text-[12px] text-ink-500">{m.company}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
