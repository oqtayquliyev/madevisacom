import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { NEW_TAB } from '@/lib/navLink';
import { ArrowRight, BadgeCheck, Check, ChevronRight, Download, FileSignature, Languages, Lock, MapPin, PencilLine, Plane, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { countryName, nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { briefEligibility, briefPath, fetchMyBriefs, newOfferPath } from '@/lib/briefs';
import { isLocalJobFor } from '@/lib/visaFit';
import { usePersonalization } from '@/lib/personalization';
import { priceLabel, useMyPlan } from '@/lib/plans';
import { checkoutHref } from '@/lib/billing';
import { useOutcomes } from '@/lib/cv/outcomes';
import { MIN_SCORE, useTopMatches, type TopMatch, type TopResult, type TopState } from '@/lib/cv/topMatches';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { JobAgeBadge } from '@/components/common/JobAgeBadge';
import { MatchRing, toneFor } from '@/components/cv/MatchBits';
import { CvAvatar } from '@/components/cv/CvInsights';
import { ExampleJourney } from '@/components/cv/ExampleJourney';
import type { StoredCv } from '@/lib/cv/store';
import { DocReadyTitle, SendWithCvNote, useFromCountry, VisaRouteLine } from '@/components/cv/DocReady';
import { FREE_DAILY_CHECKS } from '@/lib/pricing';

// The pieces that show "the jobs you match most":
//   SearchProgress     while the search runs (with a few true, encouraging lines)
//   TopMatchesList     the result — everything for accounts, 2 jobs for guests
//   OtherMatchesPopup  on a job page: "you match these jobs too"
//   RecommendedJobs    on a job page: "Recommended for you"
//   TopMatchesStrip    on /jobs: the best three, one line
// All of them read the same search (src/lib/cv/topMatches.ts).

type OnAuth = (page: 'login' | 'register') => void;

/** Guests see this many matches; the rest wait behind a free account. */
export const GUEST_VISIBLE = 2;
/** A free account sees this many matches; the rest are in Pro. */
export const FREE_VISIBLE = 10;
/** A free account sees the missing skills on this many of them (the best ones). */
export const FREE_MISSING = FREE_DAILY_CHECKS;

/** What this visitor may see: how many matches, and on how many of them the missing skills. */
export type Access = { guest: boolean; pro: boolean; jobs: number; missing: number };
export const accessFor = (guest: boolean, pro: boolean): Access =>
  guest ? { guest, pro, jobs: GUEST_VISIBLE, missing: 0 } : pro ? { guest, pro, jobs: Infinity, missing: Infinity } : { guest, pro, jobs: FREE_VISIBLE, missing: FREE_MISSING };

const hrefOf = (m: Pick<TopMatch, 'id' | 'title' | 'company'>) => `${jobPath({ id: `sponsored-${m.id}`, title: m.title, company: m.company })}#cv-match`;
const go = (href: string) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  nav(href);
};
const where = (m: TopMatch) => [m.remote && !m.city ? 'Remote' : m.city, m.country].filter(Boolean).join(', ');

/** True, plain things worth hearing while waiting — and when a score isn't 100. */
export const ENCOURAGEMENT = [
  'Almost nobody matches a job ad 100%. An ad is a wish list, not a person.',
  'A strong match is 80%, not 100%. People who get hired rarely tick every box.',
  'A missing skill isn’t a no. It’s what to address in your application — or learn next.',
  'If you match most of an ad, apply. Waiting for a perfect match means never applying.',
];

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

      {/* One example for the whole wait — it stays put so it can be read. */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <ExampleJourney />
      </div>
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

type Place = {
  /** here = the visitor's own country · free = abroad, but no visa needed · abroad = a visa is needed · unknown */
  kind: 'here' | 'free' | 'abroad' | 'unknown';
  /** A sponsorship document makes sense for this job. */
  doc: boolean;
};
function placeOf(m: TopMatch, v: Visitor): Place {
  const cc = (m.cc ?? '').toUpperCase();
  if (!cc || (!v.citizenship && !v.currentLocation)) return { kind: 'unknown', doc: false };
  if (v.currentLocation?.toUpperCase() === cc) return { kind: 'here', doc: false };
  if (isLocalJobFor(cc, v)) return { kind: 'free', doc: false };
  // An ad that says "no sponsorship" is taken at its word: no document is offered for it.
  const doc = m.visa !== 'not_offered' && briefEligibility({ countryCode: cc, visa: m.visa }).ok;
  return { kind: 'abroad', doc };
}

const DAY = 86_400_000;
const daysOld = (m: TopMatch) => (m.postedAt ? (Date.now() - Date.parse(m.postedAt)) / DAY : Infinity);

function Logo({ m, size = 52 }: { m: TopMatch; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-white" style={{ width: size, height: size }}>
      {m.logo && !failed ? <img src={m.logo} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" /> : <CompanyLogo name={m.company} size={size - 6} />}
    </span>
  );
}

/** Where the document button goes, and what it is called for this visitor. */
type DocAction = {
  /** Pro members read the whole document; everyone else sees a preview until they download. */
  pro: boolean;
  /** Documents this person already made, by job id → share id. */
  made: Map<string, string>;
  go: (m: TopMatch) => void;
};
const docLabel = (m: TopMatch, doc: DocAction) => (doc.made.has(m.id) ? 'Open your PDF' : doc.pro ? 'Review & download' : 'Preview & download');

/** Sponsorship documents this account already made (job id → share id). */
function useMadeDocs(enabled: boolean): Map<string, string> {
  const [made, setMade] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!enabled) return setMade(new Map());
    let alive = true;
    void fetchMyBriefs().then((list) => {
      if (!alive || !list) return;
      setMade(new Map(list.filter((b) => b.job_id && b.status !== 'withdrawn').map((b) => [b.job_id!, b.share_id])));
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return made;
}

function PlaceChip({ place, country }: { place: Place; country: string | null }) {
  if (place.kind === 'here') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-bold text-emerald-800">
        <MapPin className="h-3 w-3" /> In your country
      </span>
    );
  }
  if (place.kind === 'free') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-bold text-emerald-800">
        <BadgeCheck className="h-3 w-3" /> No visa needed
      </span>
    );
  }
  if (place.kind === 'abroad') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-700">
        <Plane className="h-3 w-3" /> Work visa{country ? `: ${country}` : ''}
      </span>
    );
  }
  return null;
}

/** Tags of one kind: core skills, the industry / other-field experience the ad wants, nice-to-haves. */
function TagRow({ label, items, tone }: { label: string; items: string[]; tone: 'skill' | 'experience' | 'nice' }) {
  if (!items.length) return null;
  const cls = tone === 'skill' ? 'bg-amber-50 text-amber-900 ring-amber-200' : tone === 'experience' ? 'bg-sky-50 text-sky-900 ring-sky-200' : 'bg-ink-50 text-ink-700 ring-ink-200';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[12px] font-semibold text-ink-500">{label}</span>
      {items.slice(0, 6).map((s) => (
        <span key={s} className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ring-1 ${cls}`}>
          {s}
        </span>
      ))}
      {items.length > 6 && <span className="px-1 text-[12.5px] text-ink-500">+{items.length - 6}</span>}
    </div>
  );
}

/** What the ad asks for that the CV doesn't show, as three kinds of tags — or locked for free accounts. */
function MissingLine({ m, open, guest, onAuth }: { m: TopMatch; open: boolean; guest: boolean; onAuth?: OnAuth }) {
  const missing = m.missing ?? [];
  const wanted = m.wanted ?? [];
  const nice = m.nice ?? [];
  const n = missing.length + wanted.length + nice.length;
  if (!n) {
    return (
      <p className="flex items-center gap-1.5 border-t border-ink-100 px-4 py-2.5 text-[13px] text-emerald-800 sm:px-5">
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> Your CV covers everything this ad asks for.
      </p>
    );
  }
  if (open) {
    return (
      <div className="space-y-1.5 border-t border-ink-100 px-4 py-2.5 sm:px-5">
        {missing.length === 0 && (
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-800">
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> Every core skill is on your CV
          </p>
        )}
        <TagRow label="Missing skills" items={missing} tone="skill" />
        <TagRow label="Experience wanted" items={wanted} tone="experience" />
        <TagRow label="Nice to have" items={nice} tone="nice" />
      </div>
    );
  }
  const label = missing.length ? `${missing.length} ${missing.length === 1 ? 'skill' : 'skills'} missing from your CV` : `${n} ${n === 1 ? 'thing' : 'things'} the ad also wants`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-ink-100 px-4 py-2.5 sm:px-5">
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold text-ink-700">
        <Lock className="h-3.5 w-3.5 shrink-0 text-ink-400" /> {label}
      </p>
      {guest ? (
        <button
          onClick={() => {
            rememberAuthIntent({ reason: 'match', next: '/cv-match' });
            onAuth?.('register');
          }}
          className="shrink-0 text-[12.5px] font-bold text-brand-700 hover:underline"
        >
          Sign up to see them
        </button>
      ) : (
        <a href={checkoutHref('starter', 'top_matches')} onClick={go(checkoutHref('starter', 'top_matches'))} className="shrink-0 text-[12.5px] font-bold text-brand-700 hover:underline">
          See them with Starter
        </a>
      )}
    </div>
  );
}

/** One match: logo, title, place, pay, score, the skills the CV is missing — and one line for the document when the job is abroad. */
function MatchCard({ m, place, doc, missingOpen, guest, onAuth }: { m: TopMatch; place: Place; doc: DocAction; missingOpen: boolean; guest: boolean; onAuth?: OnAuth }) {
  const from = useFromCountry();
  const href = hrefOf(m);
  const tone = toneFor(m.score);
  return (
    <article className="group overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200 transition hover:shadow-soft-lg hover:ring-brand-300">
      <a href={href} {...NEW_TAB} className="block p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <Logo m={m} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink-500">{m.company}</p>
            <h3 className="mt-0.5 break-words font-title text-[17px] font-bold leading-snug text-ink-950 [overflow-wrap:anywhere] group-hover:text-brand-700 sm:text-lg">{m.title}</h3>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-600">
              <span className="flex items-center gap-1.5">
                {m.cc && <CircleFlag countryCode={m.cc} label={m.country ?? undefined} size={15} />}
                {where(m) || 'Location on the ad'}
              </span>
              {m.remote && <span className="font-semibold text-emerald-700">Remote</span>}
              {m.salary && <span className="font-slab font-bold text-ink-950">{m.salary}</span>}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <PlaceChip place={place} country={m.country} />
              {m.visa === 'offered' && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-bold text-brand-800">Sponsors visas</span>}
              {m.visa === 'not_offered' && place.kind === 'abroad' && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-600">No sponsorship</span>}
              <JobAgeBadge iso={m.postedAt} />
              {m.translated && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-400" title="Compared in its English translation">
                  <Languages className="h-3 w-3" /> translated
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <MatchRing score={m.score} size={60} />
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.bg} ${tone.text}`}>{m.label}</span>
          </div>
        </div>
      </a>

      <MissingLine m={m} open={missingOpen} guest={guest} onAuth={onAuth} />

      {place.doc && (
        <div className="border-t border-ink-100 bg-brand-50/50 px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex min-w-0 flex-1 basis-44 items-start gap-1.5 text-[13px] font-semibold leading-5 text-ink-900">
              <FileSignature className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
              <DocReadyTitle from={from} to={m.cc ? m.cc.toUpperCase() : null} />
            </p>
            <button onClick={() => doc.go(m)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-white">
              <Download className="h-3.5 w-3.5" /> {docLabel(m, doc)}
            </button>
          </div>
          <div className="mt-1 pl-5">
            <VisaRouteLine dest={m.cc} source="top_matches_visa_route" />
            <SendWithCvNote company={m.company} className="mt-0.5" />
          </div>
        </div>
      )}
    </article>
  );
}

/** Matches a guest can't read yet: their real scores, with shapes where the titles would be (no titles in the page). */
function LockedRows({ scores, onAuth, next, pro = false }: { scores: number[]; onAuth?: OnAuth; next: string; pro?: boolean }) {
  const count = scores.length;
  const signUp = (page: 'login' | 'register') => {
    rememberAuthIntent({ reason: 'match', next });
    onAuth?.(page);
  };
  const widths = [
    ['62%', '44%'],
    ['48%', '56%'],
    ['70%', '38%'],
    ['54%', '47%'],
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
      {/* Behind: the shapes fill whatever height the card in front needs. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[5px]">
        {widths.map(([a, b], i) => (
          <div key={i} className="flex items-center gap-4 border-t border-ink-100 px-4 py-3.5 first:border-t-0 sm:px-5">
            <MatchRing score={scores[i % count]} size={52} />
            <span className="min-w-0 flex-1">
              <span className="block h-4 rounded bg-ink-300" style={{ width: a }} />
              <span className="mt-2 block h-3 rounded bg-ink-200" style={{ width: b }} />
            </span>
          </div>
        ))}
      </div>
      {/* In front, in the normal flow: the box is always as tall as this card plus its padding, so nothing is cut. */}
      <div className="relative grid place-items-center bg-white/55 px-4 py-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-lg ring-1 ring-ink-200">
          <p className="flex items-center justify-center gap-2 text-[16px] font-bold leading-snug text-ink-950">
            <Lock className="h-4 w-4 text-brand-700" />
            {count} more {count === 1 ? 'job fits' : 'jobs fit'} you
          </p>
          {pro ? (
            <>
              <p className="mt-1 text-[13px] leading-5 text-ink-600">Every match, with the skills your CV is missing on each one, is in MadeVisa Starter ({priceLabel('starter')}).</p>
              <a href={checkoutHref('starter', 'top_matches')} onClick={go(checkoutHref('starter', 'top_matches'))} className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
                See them all with Starter <ArrowRight className="h-4 w-4" />
              </a>
            </>
          ) : (
            <>
              <p className="mt-1 text-[13px] leading-5 text-ink-600">A free account shows {FREE_VISIBLE} matches, and the skills you’re missing on {FREE_MISSING} of them.</p>
              <button onClick={() => signUp('register')} className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
                Create free account <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => signUp('login')} className="mt-2 text-[13px] font-semibold text-brand-700 hover:underline">
                I already have one
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The headline numbers: how many at 80%+, how many at 65–79%. */
export function tiers(items: TopMatch[]) {
  const strong = items.filter((m) => m.score >= 80).length;
  const good = items.filter((m) => m.score >= 65 && m.score < 80).length;
  return { strong, good, partial: items.length - strong - good, best: items[0]?.score ?? 0 };
}

/** Under this best score the page also lists the fixes to the CV itself. */
export const WEAK_BELOW = 70;
/** A reachable score is only worth a headline when it is this many points above today's. */
const WORTH_SAYING = 5;

/**
 * Counts 0 → n, one step every `gap` ms, so a new result builds up in front of
 * the visitor instead of landing as a wall. A saved result (or a visitor who
 * asked for less motion) gets everything at once.
 */
function useReveal(n: number, fresh: boolean, gap = 450): number {
  const still = !fresh || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // The first step is there from the start, so the card is never an empty frame.
  const [step, setStep] = useState(still ? n : 1);
  useEffect(() => {
    if (still) return setStep(n);
    setStep(1);
    const t = window.setInterval(() => setStep((s) => (s >= n ? s : s + 1)), gap);
    return () => window.clearInterval(t);
  }, [n, still, gap]);
  return step;
}
const shown = (on: boolean) => `transition duration-500 ease-out motion-reduce:transition-none ${on ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`;

/** A number that counts up to its value once `run` turns true. */
function useCount(to: number, run: boolean, from = 0, ms = 650): number {
  const [v, setV] = useState(run ? to : from);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(from + (to - from) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, from, ms]);
  return v;
}

/**
 * The best job as three steps: where the CV stands, what to add, and what to
 * send. Step 2's number is the same score engine run again with the ad's
 * skills in the CV — a match score, never a chance of being hired.
 */
function Roadmap({ lead, place, doc, from, step, fresh, missingOpen, onAuth }: { lead: TopMatch; place: Place; doc: DocAction; from: string | null; step: number; fresh: boolean; missingOpen: boolean; onAuth?: OnAuth }) {
  const outcomes = useOutcomes();
  const href = hrefOf(lead);
  const gain = lead.potential - lead.score;
  const missing = lead.missing ?? [];
  const now = useCount(lead.score, step >= 1, fresh ? 0 : lead.score);
  const reach = useCount(lead.potential, step >= 2, fresh ? lead.score : lead.potential);
  const fromName = from ? countryName(from) : null;
  const n = (i: number) => (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-950 text-[12px] font-bold tabular-nums text-white" aria-hidden>
      {i}
    </span>
  );
  return (
    <div id="best-match" className="mt-6 scroll-mt-24 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <a href={href} {...NEW_TAB} className="group flex items-center gap-3.5 px-4 pt-4 sm:px-6 sm:pt-5">
        <Logo m={lead} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-ink-500">{lead.company}</span>
          <span className="block break-words font-title text-[17px] font-bold leading-snug text-ink-950 [overflow-wrap:anywhere] group-hover:text-brand-700 sm:text-lg">{lead.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[13px] text-ink-600">
            <span className="flex items-center gap-1.5">
              {lead.cc && <CircleFlag countryCode={lead.cc} label={lead.country ?? undefined} size={15} />}
              {where(lead) || 'Location on the ad'}
            </span>
            {lead.salary && <span className="font-slab font-bold text-ink-950">{lead.salary}</span>}
          </span>
        </span>
      </a>

      {/* One track: today's score, then how far the CV's wording can take it. */}
      <div className="mx-4 mt-4 flex h-2 overflow-hidden rounded-full bg-ink-100 sm:mx-6" role="img" aria-label={gain >= WORTH_SAYING ? `${lead.score}% today, up to ${lead.potential}%` : `${lead.score}% match`}>
        <span className="h-full bg-ink-800 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${step >= 1 ? lead.score : 0}%` }} />
        {gain > 0 && <span className="h-full border-l-2 border-white bg-brand-500 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${step >= 2 ? gain : 0}%` }} />}
      </div>

      <ol className="mt-1 grid gap-px bg-ink-100 sm:grid-cols-3">
        <li className="bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className={shown(step >= 1)}>
          <p className="flex items-center gap-2 text-[13px] font-bold text-ink-950">{n(1)} Today</p>
          <p className="mt-2.5 text-[34px] font-bold leading-none tracking-tight tabular-nums text-ink-950">{now}%</p>
          <p className="mt-1 text-[13px] text-ink-600">your match with this job</p>
          </div>
        </li>

        <li className="bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className={shown(step >= 2)}>
          <p className="flex items-center gap-2 text-[13px] font-bold text-ink-950">{n(2)} Add to your CV</p>
          {gain >= WORTH_SAYING && missing.length > 0 ? (
            <>
              <p className="mt-2.5 text-[34px] font-bold leading-none tracking-tight tabular-nums text-brand-700">
                <span className="text-[15px] font-semibold text-ink-600">up to </span>
                {reach}%
              </p>
              {missingOpen ? (
                <>
                  <ul className="mt-2.5 list-disc space-y-1 pl-5 text-[14px] font-semibold leading-5 text-ink-900 marker:text-brand-500">
                    {missing.slice(0, 4).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  {missing.length > 4 && <p className="mt-1 pl-5 text-[12.5px] text-ink-500">and {missing.length - 4} more</p>}
                  <p className="mt-2 text-[12px] leading-4 text-ink-500">Only the ones you really have.</p>
                </>
              ) : (
                <div className="mt-2.5">
                  <ul aria-hidden className="pointer-events-none select-none space-y-1.5 blur-[5px]">
                    {missing.slice(0, 3).map((s, i) => (
                      <li key={i} className="h-3.5 rounded bg-ink-300" style={{ width: `${55 + ((s.length * 7) % 35)}%` }} />
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      rememberAuthIntent({ reason: 'match', next: '/cv-match' });
                      onAuth?.('register');
                    }}
                    className="mt-2.5 inline-flex items-start gap-1.5 text-left text-[13px] font-bold text-brand-700 hover:underline"
                  >
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {missing.length} {missing.length === 1 ? 'skill' : 'skills'} to add — free account
                  </button>
                </div>
              )}
              {missingOpen && !doc.pro && (
                <a href={checkoutHref('starter', 'top_matches')} onClick={go(checkoutHref('starter', 'top_matches'))} className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-700 hover:underline">
                  Every requirement, line by line, with Starter <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
            </>
          ) : (
            <p className="mt-2.5 flex items-start gap-1.5 text-[14px] leading-5 text-ink-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} /> Your CV already names what this ad asks for.
            </p>
          )}
          </div>
        </li>

        <li className="bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className={shown(step >= 3)}>
          {place.doc ? (
            <>
              <p className="flex items-center gap-2 text-[13px] font-bold text-ink-950">{n(3)} Do you have a sponsorship document?</p>
              <p className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-800">
                {from && from !== lead.cc && (
                  <>
                    <CircleFlag countryCode={from} label={fromName ?? from} size={24} />
                    <ArrowRight className="h-4 w-4 text-ink-400" aria-label="to" />
                  </>
                )}
                {lead.cc && <CircleFlag countryCode={lead.cc} label={lead.country ?? undefined} size={24} />}
                <span className="min-w-0 truncate">{lead.country}</span>
              </p>
              <p className="mt-2 text-[13px] leading-5 text-ink-700">
                {doc.made.has(lead.id) ? (
                  <>Yours for {lead.company} is saved.</>
                ) : (
                  <>
                    If not, yours for <strong className="font-semibold text-ink-950">{lead.company}</strong> is ready to download.
                  </>
                )}
              </p>
              <button onClick={() => doc.go(lead)} className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-700">
                <Download className="h-4 w-4" /> {docLabel(lead, doc)}
              </button>
              {outcomes && (
                <p className="mt-2 text-[12px] leading-4 text-ink-600">
                  <strong className="text-[15px] font-bold tabular-nums text-emerald-700">{Math.round((100 * outcomes.opened) / outcomes.made)}%</strong> of the {outcomes.made.toLocaleString('en')} documents made on MadeVisa were opened by the employer.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13px] font-bold text-ink-950">{n(3)} Apply</p>
              <p className="mt-2.5 flex items-center gap-2 text-[14px] font-semibold text-ink-800">
                {lead.cc && <CircleFlag countryCode={lead.cc} label={lead.country ?? undefined} size={24} />}
                {place.kind === 'here' ? 'In your country' : place.kind === 'free' ? 'No visa needed' : lead.country}
              </p>
              <a href={href} {...NEW_TAB} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-700">
                Open the job <ArrowRight className="h-4 w-4" />
              </a>
            </>
          )}
          </div>
        </li>
      </ol>
    </div>
  );
}

/** "Few numbers. Add results you can count (…)." → the tag "Few numbers", and the advice behind it. */
function tagOf(tip: string): { tag: string; more: string } {
  const cut = tip.search(/\.\s|\s—\s/);
  const tag = (cut > 0 ? tip.slice(0, cut) : tip).replace(/\s+found.*$/i, '').replace(/\.$/, '').trim();
  return { tag, more: tip };
}

/** Fixes to the CV itself, as tags: tap one to read what to do. */
function CvFixes({ tips, className = '' }: { tips: string[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className={`mt-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-ink-200 sm:px-6 ${className}`}>
      <p className="flex items-center gap-2 text-[14px] font-bold text-ink-950">
        <PencilLine className="h-4 w-4 text-ink-500" /> {tips.length} {tips.length === 1 ? 'fix' : 'fixes'} to your CV
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {tips.map((t, i) => (
          <li key={t}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 transition ${open === i ? 'bg-ink-950 text-white ring-ink-950' : 'bg-amber-50 text-amber-900 ring-amber-200 hover:ring-amber-400'}`}
            >
              {tagOf(t).tag}
            </button>
          </li>
        ))}
      </ul>
      {open != null && tips[open] && <p className="mt-2.5 text-[13px] leading-5 text-ink-700">{tagOf(tips[open]).more}</p>}
    </div>
  );
}

type Filter = 'all' | 'here' | 'sponsor';

export function TopMatchesList({ result, onAuth, onAgain }: { result: TopResult; onAuth?: OnAuth; onAgain?: () => void }) {
  const { session } = useAuth();
  const my = useMyPlan();
  // Every match and the full report: Starter and Pro.
  const full = my.has('cv_full_report');
  const visitor = useVisitor();
  const made = useMadeDocs(Boolean(session));
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const items = result.items;
  const t = tiers(items);
  const guest = !session;
  // Guests: 2 matches, no missing skills. Free: 10 matches, missing skills on the best 3. Starter and Pro: everything.
  const access = accessFor(guest, full);
  // A result that has just been worked out builds up step by step; a saved one is simply there.
  const fresh = useMemo(() => Date.now() - result.at < 20_000, [result.at]);
  const step = useReveal(9, fresh);

  const facts = useMemo(() => {
    const places = new Map(items.map((m) => [m.id, placeOf(m, visitor)]));
    return {
      places,
      here: items.filter((m) => ['here', 'free'].includes(places.get(m.id)!.kind)).length,
      sponsor: items.filter((m) => m.visa === 'offered').length,
      countries: new Set(items.map((m) => m.cc).filter(Boolean)).size,
    };
  }, [items, visitor]);

  // The document page is open to everyone: it shows the document, and asks for the plan at download.
  const doc: DocAction = {
    pro: my.has('sponsorship_documents'),
    made,
    go: (m) => {
      const share = made.get(m.id);
      nav(share ? briefPath(share) : `${newOfferPath(m.id)}${m.cc ? `&country=${m.cc}` : ''}`);
    },
  };

  if (!items.length) {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl bg-white px-6 py-10 text-center ring-1 ring-ink-200 sm:px-10">
        <h2 className="text-[20px] font-bold tracking-tight text-ink-950">No close matches right now</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-ink-600">
          {result.read
            ? `We read the ${result.read} ads closest to your CV and none reached ${MIN_SCORE}%. That says something about the ads open today, not about you — new jobs arrive every day.`
            : 'We couldn’t find job titles or skills in your CV to search with. Put each job title on its own line above its dates, add a Skills section, and upload it again.'}
        </p>
        {result.cvForeign && <p className="mx-auto mt-3 max-w-md rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">Your CV isn’t in English. With a free account it is translated for matching, which usually finds more.</p>}
        {(result.tips ?? []).length > 0 && (
          <ul className="mx-auto mt-4 max-w-md space-y-1.5 text-left">
            {result.tips.slice(0, 4).map((x) => (
              <li key={x} className="flex gap-2 text-[13px] leading-5 text-ink-700">
                <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" /> {x}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={() => nav('/jobs')} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
            Browse all jobs <ArrowRight className="h-4 w-4" />
          </button>
          {onAgain && (
            <button onClick={onAgain} className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
              <RefreshCw className="h-4 w-4" /> Search again
            </button>
          )}
        </div>
      </section>
    );
  }

  // Where to start: a strong match that was posted recently, in your own country if there is one.
  const lead = [...items]
    .filter((m) => m.score >= Math.max(65, t.best - 6))
    .sort((a, b) => {
      const rank = (m: TopMatch) => m.score + (daysOld(m) <= 14 ? 3 : 0) + (facts.places.get(m.id)!.kind === 'here' ? 2 : 0);
      return rank(b) - rank(a);
    })[0] ?? items[0];
  const leadPlace = facts.places.get(lead.id)!;
  const canReach = lead.potential - lead.score >= WORTH_SAYING && (lead.missing ?? []).length > 0;

  const pool = filter === 'here' ? items.filter((m) => ['here', 'free'].includes(facts.places.get(m.id)!.kind)) : filter === 'sponsor' ? items.filter((m) => m.visa === 'offered') : items;
  const rest = pool.filter((m) => m.id !== lead.id || filter !== 'all');
  // Guests see the starting job and one more, a free account 10 in all; the count behind the lock is the real one.
  const cap = Number.isFinite(access.jobs) ? access.jobs - (filter === 'all' ? 1 : 0) : Infinity;
  const allowed = rest.slice(0, cap);
  const visible = access.pro && !all ? allowed.slice(0, 11) : allowed;
  const lockedRows = rest.slice(allowed.length);
  const hidden = allowed.length - visible.length;
  // The best jobs get their missing skills first: the starting job, then the list in order.
  const missingOpen = (i: number) => i + (filter === 'all' ? 1 : 0) < access.missing;
  const tips = t.best < WEAK_BELOW ? result.tips ?? [] : [];

  return (
    <section aria-labelledby="top-title" className="mx-auto max-w-3xl">
      <div className={`text-center ${shown(step >= 0)}`}>
        <h2 id="top-title" className="scroll-mt-24 text-balance text-[26px] font-bold leading-tight tracking-tight text-ink-950 [word-spacing:0.08em] sm:text-[34px]">
          {canReach ? (
            <>
              You’re at {lead.score}%. Your CV can reach <span className="whitespace-nowrap text-brand-700">{lead.potential}%</span>.
            </>
          ) : t.strong > 0 ? (
            <>
              You match{' '}
              <span className="whitespace-nowrap text-emerald-700">
                {t.strong}&nbsp;{t.strong === 1 ? 'job' : 'jobs'}
              </span>{' '}
              at 80% or more
            </>
          ) : (
            <>Your best match is {t.best}%</>
          )}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-[14px] leading-6 text-ink-600">
          {items.length} {items.length === 1 ? 'job fits' : 'jobs fit'} your CV
          {facts.countries > 1 ? `, in ${facts.countries} countries` : ''}. Start with this one — and add the skills it asks for that your CV doesn’t show yet.
        </p>
      </div>

      {result.cvForeign && (
        <p className="mx-auto mt-4 max-w-xl rounded-lg bg-amber-50 px-3 py-2 text-center text-[13px] leading-5 text-amber-900">Your CV isn’t in English, so it was compared as it is. A free account translates it for a closer match.</p>
      )}

      <Roadmap lead={lead} place={leadPlace} doc={doc} from={visitor.currentLocation} step={step} fresh={fresh} missingOpen={access.missing > 0} onAuth={onAuth} />

      {tips.length > 0 && <CvFixes tips={tips} className={shown(step >= 4)} />}

      {items.length > 1 && (
        <>
          <div className={`mt-8 flex flex-wrap items-center justify-between gap-2 ${shown(step >= 4)}`}>
            <h3 className="text-[16px] font-bold text-ink-950">
              {filter === 'all' ? `${items.length - 1} more ${items.length - 1 === 1 ? 'match' : 'matches'}` : `${pool.length} ${pool.length === 1 ? 'match' : 'matches'}`}
            </h3>
            {!guest && (facts.here > 0 || facts.sponsor > 0) && (
              <div className="flex flex-wrap gap-1 rounded-full bg-ink-100 p-1 text-[12.5px] font-semibold" role="tablist" aria-label="Show">
                {(
                  [
                    ['all', 'All', items.length],
                    ['here', 'No visa needed', facts.here],
                    ['sponsor', 'Sponsors visas', facts.sponsor],
                  ] as [Filter, string, number][]
                )
                  .filter(([k, , n]) => k === 'all' || n > 0)
                  .map(([k, label, n]) => (
                    <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-full px-3 py-1 ${filter === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
                      {label} <span className="tabular-nums text-ink-400">{n}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="mt-3 space-y-3">
            {visible.map((m, i) => (
              <div key={m.id} className={shown(step >= 5 + Math.min(i, 3))}>
                <MatchCard m={m} place={facts.places.get(m.id)!} doc={doc} missingOpen={missingOpen(i)} guest={guest} onAuth={onAuth} />
              </div>
            ))}
            {lockedRows.length > 0 && (
              <div className={shown(step >= 6)}>
                <LockedRows scores={lockedRows.map((m) => m.score)} onAuth={onAuth} next="/cv-match" pro={!guest} />
              </div>
            )}
          </div>
        </>
      )}

      {hidden > 0 && (
        <div className="mt-3 text-center">
          <button onClick={() => setAll(true)} className="rounded-full px-4 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
            Show all {allowed.length}
          </button>
        </div>
      )}

      <p className={`mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[12px] text-ink-500 ${shown(step >= 6)}`}>
        <span>From the {result.read} ads closest to your CV.</span>
        {onAgain && !guest && (
          <button onClick={onAgain} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            <RefreshCw className="h-3 w-3" /> Search again
          </button>
        )}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// On a job page
// ---------------------------------------------------------------------------

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
