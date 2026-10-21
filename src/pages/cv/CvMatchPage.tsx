import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Briefcase, Lock, MapPin, Plane, RefreshCw, Search } from 'lucide-react';
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
  const items = result?.items ?? [];
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
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => saveWantedTitle(title)}
                    onKeyDown={(e) => e.key === 'Enter' && applyTitle()}
                    placeholder="e.g. Hotel receptionist, Software engineer"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-ink-400"
                  />
                </div>

                <p className="mt-4 text-[14px] font-bold text-ink-950">Upload your CV — we match it automatically</p>
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
                  </span>
                )}
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
                <p className="text-[15px] text-ink-700">None of today’s jobs is a close match for this CV{title ? ` and “${title}”` : ''}. Try another job title, or browse every job.</p>
              </div>
            )}
            <p className="mt-6 text-center">
              <button onClick={() => nav(title ? `/jobs?q=${encodeURIComponent(title)}` : '/jobs')} className="inline-flex items-center gap-2 text-[14px] font-bold text-brand-700 hover:underline">
                {title ? `All ${title} jobs` : 'Browse all jobs'} <ArrowRight className="h-4 w-4" />
              </button>
            </p>
          </section>
        )}

        {step === 1 && !searching && cvReady && !cv && title.trim().length > 1 && (
          <p className="text-center text-[14px] text-ink-600">
            No CV at hand?{' '}
            <button onClick={() => nav(`/jobs?q=${encodeURIComponent(title.trim())}`)} className="font-semibold text-brand-700 hover:underline">
              See {title.trim()} jobs
            </button>
          </p>
        )}
      </main>

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
