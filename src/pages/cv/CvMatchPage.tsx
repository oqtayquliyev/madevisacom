import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Briefcase, Globe2, Loader2, Lock, MapPin, Plane, RefreshCw, Search } from 'lucide-react';
import type { Job } from '@/data/jobs';
import { fetchPublishedSponsoredJobs, isClosedJob, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import type { View } from '@/types';
import { noteMilestone } from '@/lib/emailAttribution';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { WRAP, nav } from '@/lib/pageLayout';
import { readWantedTitle, saveWantedTitle, useTopMatches, type TopMatch } from '@/lib/cv/topMatches';
import { rememberSearch } from '@/lib/lastSearch';
import { jobPath } from '@/lib/jobUrl';
import { NEW_TAB } from '@/lib/navLink';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/plans';
import { CvUpload } from '@/components/cv/CvUpload';
import { SearchProgress } from '@/components/cv/TopMatches';
import { toneFor } from '@/components/cv/MatchBits';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { Paywall } from '@/components/pro/Paywall';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

/** "Remote jobs only", remembered on this device. */
const REMOTE_KEY = 'mv:cvRemoteOnly';
const readRemote = () => {
  try {
    return localStorage.getItem(REMOTE_KEY) === '1';
  } catch {
    return false;
  }
};
const isRemote = (j: { remote: boolean; workArrangement?: string | null; arrangement?: string | null }) => j.remote || j.workArrangement === 'remote' || j.arrangement === 'remote';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

/** The search is quick; the waiting screen stays this long so the roles it found can be read one by one. */
const MIN_WAIT_MS = 4200;

/**
 * /cv-match — two steps, nothing else:
 *   1. What job are you looking for? + upload your CV (the match starts by itself).
 *   2. The jobs that match you, best first. Picking one opens it — or, for someone
 *      who isn't a member yet, the membership card (straight on to Gumroad).
 */
export function CvMatchPage({ go, onAuth }: Props) {
  const top = useTopMatches({ auto: true });
  const { cv, cvReady, status, result } = top;
  const { session, profile } = useAuth();
  const { member, ready: memberReady } = useMembership();
  const [title, setTitle] = useState(readWantedTitle);
  const [editing, setEditing] = useState(false);
  const [locked, setLocked] = useState<TopMatch | null>(null);
  const [lockedJob, setLockedJob] = useState<Job | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(readRemote);
  const toggleRemote = () =>
    setRemoteOnly((v) => {
      try {
        localStorage.setItem(REMOTE_KEY, v ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !v;
    });

  // Typing a job title: every live job that fits, as you type (the list loads once, on focus or the first key).
  const [allJobs, setAllJobs] = useState<Job[] | null>(null);
  const loading = useRef(false);
  const loadJobs = () => {
    if (loading.current) return;
    loading.current = true;
    const show = (rows: Awaited<ReturnType<typeof fetchPublishedSponsoredJobs>>) => rows.length && setAllJobs(rows.filter((j) => !isClosedJob(j)).map(sponsoredJobToBoardJob));
    void fetchPublishedSponsoredJobs({ onPartial: show }).then(show);
  };
  useEffect(() => {
    if (title.trim().length >= 2) loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const q = title.trim().toLowerCase();
  const live = useMemo(() => {
    if (q.length < 2 || !allJobs) return null;
    const words = q.split(/\s+/).filter(Boolean);
    const when = (j: Job) => new Date(j.sourcePostedAt ?? j.sharedAt ?? j.postedDate ?? j.published).getTime() || 0;
    return allJobs
      .filter((j) => (!remoteOnly || isRemote(j)) && words.every((w) => `${j.title} ${j.company} ${j.category} ${j.country} ${j.city}`.toLowerCase().includes(w)))
      .sort((a, b) => when(b) - when(a));
  }, [allJobs, q, remoteOnly]);
  // The membership card's headline: "1,240 more hotel jobs".
  useEffect(() => {
    if (!live || !q) return;
    const t = window.setTimeout(() => rememberSearch(title, live.length), 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.length, q]);
  const jobsLink = (extra = '') => {
    const p = new URLSearchParams();
    if (title.trim()) p.set('q', title.trim());
    if (remoteOnly) p.set('remote', '1');
    const s = p.toString();
    return `/jobs${s ? `?${s}` : ''}${extra}`;
  };

  useSeo({
    title: SEO_META.cvMatch.title,
    description: 'Tell us the job you want and upload your CV: MadeVisa shows the live jobs you match best, highest score first. Part of the MadeVisa Membership.',
    path: '/cv-match',
  });

  // Keep the waiting screen up for a moment even when the search is instant.
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (status === 'running') setUntil(Date.now() + MIN_WAIT_MS);
  }, [status]);
  useEffect(() => {
    const left = until - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => tick((n) => n + 1), left + 30);
    return () => window.clearTimeout(t);
  }, [until]);
  const searching = Boolean(cv) && (status === 'running' || (status === 'done' && Date.now() < until));
  const done = Boolean(cv && result && !searching && status !== 'error');

  useEffect(() => {
    if (!done || !result) return;
    if (session) noteMilestone('cv_match_viewed');
    // The paywall's headline: "N more <title> jobs".
    if (title.trim() && result.pool > 0) rememberSearch(title, result.pool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // A new title for the same CV: search again.
  const applyTitle = () => {
    const t = title.replace(/\s+/g, ' ').trim();
    setTitle(t);
    const changed = t !== readWantedTitle();
    saveWantedTitle(t);
    setEditing(false);
    if (changed && cv) top.start();
  };

  const step: 1 | 2 = done && !editing ? 2 : 1;
  const items = (result?.items ?? []).filter((m) => !remoteOnly || isRemote(m));
  const first = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={'cv-match' as View} />

      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} py-9 sm:py-12`}>
          <div className="mx-auto max-w-xl">
            <p className="text-center text-[12px] font-bold uppercase tracking-[0.12em] text-white/70">Step {step} of 2</p>
            <h1 className="mt-2 text-center text-[28px] font-bold leading-[1.12] tracking-tight sm:text-[40px]">
              {step === 1 ? 'Find the jobs you match' : items.length ? `${items.length} job${items.length === 1 ? '' : 's'} match you${first ? `, ${first}` : ''}` : 'No close matches yet'}
            </h1>

            {step === 1 ? (
              <div className="mt-6 rounded-2xl bg-white p-4 text-ink-900 shadow-soft sm:p-5">
                <label htmlFor="want-title" className="block text-[14px] font-bold text-ink-950">
                  What job are you looking for?
                </label>
                <div className="mt-2 flex h-12 items-center gap-2.5 rounded-xl border border-ink-300 px-3.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  <input
                    id="want-title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      loadJobs();
                    }}
                    onFocus={loadJobs}
                    onBlur={() => saveWantedTitle(title)}
                    onKeyDown={(e) => e.key === 'Enter' && applyTitle()}
                    placeholder="e.g. Hotel receptionist, Software engineer"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-ink-400"
                  />
                </div>

                <button type="button" role="switch" aria-checked={remoteOnly} onClick={toggleRemote} className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5 text-left">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                    <Globe2 className="h-4 w-4 text-brand-600" aria-hidden /> Remote jobs only
                  </span>
                  <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${remoteOnly ? 'bg-brand-600' : 'bg-ink-300'}`} aria-hidden>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${remoteOnly ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </button>

                {q.length >= 2 && !cv && (
                  <div className="mt-3" aria-live="polite">
                    {!live ? (
                      <p className="flex items-center gap-2 text-[13px] text-ink-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching the latest jobs…
                      </p>
                    ) : (
                      <>
                        <p className="text-[13px] text-ink-600">
                          <strong className="text-ink-950">{live.length.toLocaleString('en-US')}</strong> live {remoteOnly ? 'remote ' : ''}job{live.length === 1 ? '' : 's'} for “{title.trim()}”, newest first
                        </p>
                        {live.length > 0 && (
                          <ul className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-xl ring-1 ring-ink-200">
                            {live.slice(0, 5).map((j) => (
                              <LiveRow key={j.id} j={j} onLocked={memberReady && !member ? setLockedJob : undefined} />
                            ))}
                          </ul>
                        )}
                        <button type="button" onClick={() => nav(jobsLink())} className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-brand-700 hover:underline">
                          {live.length > 5 ? `See all ${live.length.toLocaleString('en-US')} jobs` : 'Browse all jobs'} <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="my-5 flex items-center gap-3" role="separator" aria-label="or">
                  <span className="h-px flex-1 bg-ink-200" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-400">or</span>
                  <span className="h-px flex-1 bg-ink-200" />
                </div>

                <p className="text-[14px] font-bold text-ink-950">Upload your CV — we match it automatically</p>
                <div className="mt-2">
                  <CvUpload
                    allowRemove
                    onDone={() => {
                      saveWantedTitle(title);
                      setEditing(false);
                    }}
                  />
                </div>
                {cv && editing && (
                  <button type="button" onClick={applyTitle} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-bold text-white hover:bg-brand-700">
                    Show my matches <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                <p className="mt-2 text-[12px] text-ink-500">Read on your device; sent to an employer only when you ask.</p>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-white/85">
                {title && (
                  <span>
                    For <strong className="text-white">{title}</strong>
                    {remoteOnly && ' · remote only'}
                  </span>
                )}
                <button type="button" onClick={toggleRemote} className="inline-flex items-center gap-1 font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">
                  <Globe2 className="h-3.5 w-3.5" aria-hidden /> {remoteOnly ? 'Show all jobs' : 'Remote only'}
                </button>
                <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Change job title or CV
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <main className={`${WRAP} py-8 sm:py-10`}>
        {!cvReady && <div className="h-40" />}

        {searching && <SearchProgress state={status === 'running' ? top : { stage: 'scoring', progress: 1, live: top.live }} cv={cv} name={profile?.full_name} />}

        {cv && !searching && status === 'error' && (
          <section className="mx-auto max-w-xl rounded-2xl bg-white px-6 py-8 text-center ring-1 ring-ink-200">
            <h2 className="text-[18px] font-bold text-ink-950">The search didn’t finish</h2>
            <p className="mt-1 text-[14px] text-ink-600">{top.error ?? 'Something went wrong.'} Your CV is still here.</p>
            <button onClick={top.start} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
              Try again
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="mx-auto max-w-3xl" aria-label="Jobs that match you">
            {items.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((m) => (
                  <MatchCard key={m.id} m={m} lockedOpen={memberReady && !member ? setLocked : undefined} />
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-ink-200">
                <p className="text-[15px] text-ink-700">None of today’s {remoteOnly ? 'remote ' : ''}jobs is a close match for this CV{title ? ` and “${title}”` : ''}. Try another job title, or browse every job.</p>
              </div>
            )}
            <p className="mt-6 text-center">
              <button onClick={() => nav(jobsLink())} className="inline-flex items-center gap-2 text-[14px] font-bold text-brand-700 hover:underline">
                {title ? `All ${title} jobs` : 'Browse all jobs'} <ArrowRight className="h-4 w-4" />
              </button>
            </p>
          </section>
        )}

      </main>

      {lockedJob && <Paywall job={{ title: lockedJob.title, company: lockedJob.company }} onClose={() => setLockedJob(null)} source="cv_match" />}
      {locked && <Paywall job={{ title: locked.title, company: locked.company }} onClose={() => setLocked(null)} source="cv_match" />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

/** One matched job: score, title, company and place. Members open it; everyone else gets the membership card. */
function MatchCard({ m, lockedOpen }: { m: TopMatch; lockedOpen?: (m: TopMatch) => void }) {
  const href = useMemo(() => jobPath({ id: `sponsored-${m.id}`, title: m.title, company: m.company }), [m]);
  const tone = toneFor(m.score);
  const place = [m.city, m.country].filter(Boolean).join(', ') || (m.remote ? 'Remote' : '');
  return (
    <li>
      <a
        href={href}
        {...NEW_TAB}
        onClick={(e) => {
          if (!lockedOpen) return;
          e.preventDefault();
          lockedOpen(m);
        }}
        className="flex h-full items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-200 transition hover:-translate-y-0.5 hover:ring-brand-300"
      >
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-extrabold tabular-nums ${tone.bg} ${tone.text}`} aria-label={`${m.score}% match`}>
          {m.score}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500">
            {m.logo ? <img src={m.logo} alt="" className="h-4 w-4 rounded object-contain" loading="lazy" /> : <CompanyLogo name={m.company} size={16} />}
            <span className="truncate">{m.company}</span>
          </span>
          <span className="mt-0.5 block break-words font-title text-[16px] font-bold leading-snug text-ink-950">{m.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
            {place && (
              <span className="inline-flex items-center gap-1">
                {m.cc ? <CircleFlag countryCode={m.cc} size={13} label={m.country ?? m.cc} /> : <MapPin className="h-3 w-3" />}
                {place}
              </span>
            )}
            {m.role && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> {m.role}
              </span>
            )}
            {m.visa === 'offered' && (
              <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                <Plane className="h-3 w-3" /> Visa sponsorship
              </span>
            )}
          </span>
        </span>
        {lockedOpen && <Lock className="mt-1 h-4 w-4 shrink-0 text-ink-300" aria-label="Members only" />}
      </a>
    </li>
  );
}

/** A live job while typing: logo, title, company and place. Non-members get the membership card. */
function LiveRow({ j, onLocked }: { j: Job; onLocked?: (j: Job) => void }) {
  const href = jobPath({ id: j.id, title: j.title, company: j.company });
  const place = [j.city, j.country].filter(Boolean).join(', ');
  return (
    <li>
      <a
        href={href}
        {...NEW_TAB}
        onClick={(e) => {
          if (!onLocked) return;
          e.preventDefault();
          onLocked(j);
        }}
        className="flex items-center gap-3 bg-white px-3 py-2.5 transition hover:bg-brand-50/60"
      >
        {j.imageUrl ? <img src={j.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-ink-100 object-contain p-0.5" loading="lazy" /> : <CompanyLogo name={j.company} size={32} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-ink-950">{j.title}</span>
          <span className="flex items-center gap-1.5 truncate text-[12px] text-ink-500">
            <span className="truncate">{j.company}</span>
            {place && (
              <>
                · {j.countryCode && <CircleFlag countryCode={j.countryCode} size={12} label={j.country} />}
                <span className="truncate">{place}</span>
              </>
            )}
            {isRemote(j) && <span className="shrink-0 rounded bg-ink-50 px-1.5 text-[11px] font-medium text-ink-600">Remote</span>}
          </span>
        </span>
        {onLocked ? <Lock className="h-4 w-4 shrink-0 text-ink-300" aria-label="Members only" /> : <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" />}
      </a>
    </li>
  );
}
