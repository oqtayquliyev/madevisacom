import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ArrowRight, BadgeCheck, ChevronRight, FileSignature, Languages, Lock, MapPin, Plane, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { countryName, nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { briefEligibility, newOfferPath } from '@/lib/briefs';
import { isLocalJobFor } from '@/lib/visaFit';
import { usePersonalization } from '@/lib/personalization';
import { useMyPlan } from '@/lib/plans';
import { PRO_MONTHLY_DOCS, usePrices } from '@/lib/pricing';
import { MIN_SCORE, useTopMatches, type TopMatch, type TopResult, type TopState } from '@/lib/cv/topMatches';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { JobAgeBadge } from '@/components/common/JobAgeBadge';
import { MatchRing, toneFor } from '@/components/cv/MatchBits';

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

const STAGE_TEXT: Record<NonNullable<TopState['stage']>, string> = {
  jobs: 'Finding jobs with titles like yours…',
  reading: 'Reading the job ads…',
  translating: 'Translating ads written in other languages…',
  scoring: 'Comparing each one with your CV…',
};

export function SearchProgress({ state }: { state: Pick<TopState, 'stage' | 'progress'> }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLine((n) => (n + 1) % ENCOURAGEMENT.length), 3600);
    return () => window.clearInterval(t);
  }, []);
  const pct = Math.round(Math.max(0.05, Math.min(1, state.progress)) * 100);
  return (
    <section aria-live="polite" aria-busy="true" className="mx-auto max-w-2xl rounded-3xl bg-white px-6 py-10 text-center shadow-soft ring-1 ring-ink-200 sm:px-10 sm:py-12">
      <span className="mx-auto block h-14 w-14 animate-spin rounded-full border-[5px] border-brand-100 border-t-brand-600" aria-hidden />
      <h2 className="mt-5 text-[20px] font-bold tracking-tight text-ink-950">Looking for the jobs you match most</h2>
      <p className="mt-1 text-[14px] text-ink-600">{STAGE_TEXT[state.stage ?? 'jobs']}</p>
      <div className="mx-auto mt-5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p key={line} className="mx-auto mt-8 max-w-md animate-fade-in text-[15px] font-medium leading-6 text-ink-800">
        “{ENCOURAGEMENT[line]}”
      </p>
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

/** What the document button does for this visitor. */
type DocAction = { label: string; go: (m: TopMatch) => void };

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
        <BadgeCheck className="h-3 w-3" /> No visa needed for you
      </span>
    );
  }
  if (place.kind === 'abroad') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-700">
        <Plane className="h-3 w-3" /> Abroad{country ? `: a work visa for ${country}` : ' for you'}
      </span>
    );
  }
  return null;
}

/** One match, as a card: logo, title, place, pay, the score — and, for a job abroad, the document that goes with it. */
function MatchCard({ m, place, doc, lead = false }: { m: TopMatch; place: Place; doc: DocAction; lead?: boolean }) {
  const href = hrefOf(m);
  const tone = toneFor(m.score);
  const share = m.asked > 0 ? Math.round((100 * m.covered) / m.asked) : null;
  return (
    <article className={`group overflow-hidden rounded-2xl bg-white transition hover:shadow-soft-lg ${lead ? 'ring-2 ring-brand-600' : 'ring-1 ring-ink-200 hover:ring-brand-300'}`}>
      <a href={href} onClick={go(href)} className="block p-4 sm:p-5">
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
            </p>
            {m.salary && <p className="mt-1.5 font-slab text-[16px] font-bold leading-snug text-ink-950">{m.salary}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <MatchRing score={m.score} size={64} />
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.bg} ${tone.text}`}>{m.label}</span>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <PlaceChip place={place} country={m.country} />
          {m.visa === 'offered' && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-bold text-brand-800">The ad says it sponsors visas</span>}
          {m.visa === 'not_offered' && place.kind === 'abroad' && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-600">The ad says no visa sponsorship</span>}
          <JobAgeBadge iso={m.postedAt} />
          {share != null && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-600">
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                <span className="block h-full rounded-full bg-ink-700" style={{ width: `${share}%` }} />
              </span>
              {m.covered} of {m.asked} skills in your CV
            </span>
          )}
          {m.translated && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
              <Languages className="h-3 w-3" /> compared in English translation
            </span>
          )}
        </div>
      </a>

      {place.doc && (
        <div className={`flex items-center border-t border-ink-100 bg-brand-50/50 px-4 sm:px-5 ${lead ? 'flex-col gap-3 py-3 sm:flex-row' : 'flex-wrap gap-x-3 gap-y-2 py-2.5'}`}>
          <p className={`min-w-0 flex-1 text-[13px] leading-5 text-ink-700 ${lead ? '' : 'basis-52'}`}>
            <FileSignature className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-brand-700" />
            {lead ? (
              <>
                <strong className="text-ink-950">You’d need a work visa here.</strong> Send {m.company} your sponsorship document with your CV: the visa route, their few steps, and who pays what.
              </>
            ) : (
              <>
                <strong className="text-ink-950">Visa needed.</strong> Your sponsorship document for {m.company}
              </>
            )}
          </p>
          <button onClick={() => doc.go(m)} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold ${lead ? 'bg-brand-600 px-4 py-2 text-white hover:bg-brand-700' : 'px-3 py-1.5 text-brand-700 ring-1 ring-brand-200 hover:bg-white'}`}>
            {doc.label} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </article>
  );
}

/** Rows a guest can't read: shapes only (no real titles in the page), blurred. */
function LockedRows({ count, onAuth, next }: { count: number; onAuth?: OnAuth; next: string }) {
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
      <div aria-hidden className="pointer-events-none select-none blur-[5px]">
        {widths.slice(0, Math.max(2, Math.min(4, count))).map(([a, b], i) => (
          <div key={i} className="flex items-center gap-4 border-t border-ink-100 px-4 py-3.5 first:border-t-0 sm:px-5">
            <MatchRing score={[84, 81, 77, 72][i]} size={52} />
            <span className="min-w-0 flex-1">
              <span className="block h-4 rounded bg-ink-300" style={{ width: a }} />
              <span className="mt-2 block h-3 rounded bg-ink-200" style={{ width: b }} />
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 grid place-items-center bg-white/55 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-lg ring-1 ring-ink-200">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Lock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[16px] font-bold leading-snug text-ink-950">
            {count} more {count === 1 ? 'job matches' : 'jobs match'} your CV
          </p>
          <p className="mt-1 text-[13px] leading-5 text-ink-600">Create a free account to see all of them. Your CV is saved with it, so you won’t upload it again.</p>
          <button onClick={() => signUp('register')} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
            Create free account <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={() => signUp('login')} className="mt-2 text-[13px] font-semibold text-brand-700 hover:underline">
            I already have one
          </button>
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

/** A number with what it counts — text in ink, no colour doing the talking. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-ink-200">
      <dd className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-ink-950">{value}</dd>
      <dt className="mt-1.5 text-[12.5px] leading-4 text-ink-600">{label}</dt>
    </div>
  );
}

type Filter = 'all' | 'here' | 'sponsor';

export function TopMatchesList({ result, onAuth, onAgain }: { result: TopResult; onAuth?: OnAuth; onAgain?: () => void }) {
  const { session } = useAuth();
  const { isPro } = useMyPlan();
  const prices = usePrices();
  const visitor = useVisitor();
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const items = result.items;
  const t = tiers(items);
  const guest = !session;

  // Everything below is counted from the visitor's own matches — nothing is estimated.
  const facts = useMemo(() => {
    const places = new Map(items.map((m) => [m.id, placeOf(m, visitor)]));
    const good = items.filter((m) => m.score >= 65);
    const asked = good.reduce((n, m) => n + m.asked, 0);
    const covered = good.reduce((n, m) => n + m.covered, 0);
    const paid = good.filter((m) => m.payUsdYear).sort((a, b) => a.payUsdYear! - b.payUsdYear!);
    return {
      places,
      here: items.filter((m) => ['here', 'free'].includes(places.get(m.id)!.kind)).length,
      abroad: items.filter((m) => places.get(m.id)!.doc).length,
      sponsor: items.filter((m) => m.visa === 'offered').length,
      fresh: items.filter((m) => daysOld(m) <= 7).length,
      countries: new Set(items.map((m) => m.cc).filter(Boolean)).size,
      skills: asked >= 5 ? Math.round((100 * covered) / asked) : null,
      lowestPay: paid[0] ?? null,
    };
  }, [items, visitor]);

  const doc: DocAction = isPro
    ? { label: 'Prepare it', go: (m) => nav(`${newOfferPath(m.id)}${m.cc ? `&country=${m.cc}` : ''}`) }
    : { label: `In Pro · ${prices.pro.monthly.label} a month`, go: () => nav('/pricing#pro') };

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

  const pool = filter === 'here' ? items.filter((m) => ['here', 'free'].includes(facts.places.get(m.id)!.kind)) : filter === 'sponsor' ? items.filter((m) => m.visa === 'offered') : items;
  const rest = pool.filter((m) => m.id !== lead.id || filter !== 'all');
  // Guests see the starting job and one more; the count behind the lock is the real one.
  const visible = guest ? rest.slice(0, GUEST_VISIBLE - 1) : all ? rest : rest.slice(0, 11);
  const hidden = rest.length - visible.length;
  const place = visitor.currentLocation ? countryName(visitor.currentLocation) : null;

  const stats: [string, string][] = [];
  if (t.strong > 0) stats.push([String(t.strong), `${t.strong === 1 ? 'job' : 'jobs'} you match at 80% or more`]);
  else stats.push([`${t.best}%`, 'your best match']);
  if (facts.skills != null) stats.push([`${facts.skills}%`, 'of the skills these ads name are already in your CV']);
  if (facts.here > 0) stats.push([String(facts.here), `${facts.here === 1 ? 'is' : 'are'} ${place ? `in ${place} or` : ''} open to you without a visa`.replace(/\s+/g, ' ')]);
  else if (facts.countries > 1) stats.push([String(facts.countries), 'countries your matches are in']);
  if (facts.sponsor > 0) stats.push([String(facts.sponsor), `${facts.sponsor === 1 ? 'ad says' : 'ads say'} the company sponsors visas`]);
  else if (facts.fresh > 0) stats.push([String(facts.fresh), `${facts.fresh === 1 ? 'was' : 'were'} posted in the last 7 days`]);

  return (
    <section aria-labelledby="top-title" className="mx-auto max-w-3xl">
      <div className="text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-800">
          <Sparkles className="h-3.5 w-3.5" /> Your matches
        </p>
        <h2 id="top-title" className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[32px]">
          {t.strong > 0 ? (
            <>
              You match <span className="text-emerald-700">{t.strong} {t.strong === 1 ? 'job' : 'jobs'}</span> at 80% or more
            </>
          ) : t.good > 0 ? (
            <>
              You match <span className="text-brand-700">{t.good} {t.good === 1 ? 'job' : 'jobs'}</span> at 65% or more
            </>
          ) : (
            <>Your {items.length} closest {items.length === 1 ? 'job' : 'jobs'}</>
          )}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-[14px] leading-6 text-ink-600">
          {t.strong > 0 && t.good > 0 ? `and ${t.good} more at 65–79%. ` : ''}
          Best match: <strong className="text-ink-950">{t.best}%</strong>. {ENCOURAGEMENT[1]}
        </p>
      </div>

      <dl className={`mt-6 grid grid-cols-2 gap-3 ${stats.length >= 4 ? 'sm:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : ''}`}>
        {stats.map(([value, label]) => (
          <Stat key={label} value={value} label={label} />
        ))}
      </dl>

      {result.cvForeign && (
        <p className="mx-auto mt-4 max-w-xl rounded-lg bg-amber-50 px-3 py-2 text-center text-[13px] leading-5 text-amber-900">Your CV isn’t in English, so it was compared as it is. With a free account it is translated for matching, which is more accurate.</p>
      )}

      {/* Where to start */}
      <div className="mt-8">
        <p className="mb-2 flex flex-wrap items-center gap-x-2 text-[13px] font-bold text-brand-700">
          <Sparkles className="h-4 w-4" /> Start with this one
          <span className="font-normal text-ink-500">
            {[
              lead.score === t.best ? 'your best match' : `${lead.score}% match`,
              daysOld(lead) <= 14 ? 'posted recently' : null,
              leadPlace.kind === 'here' ? 'in your country' : leadPlace.kind === 'free' ? 'no visa needed' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
        <MatchCard m={lead} place={leadPlace} doc={doc} lead />
      </div>

      {/* The rest */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[16px] font-bold text-ink-950">
          {filter === 'all' ? `Your other ${items.length - 1} ${items.length - 1 === 1 ? 'match' : 'matches'}` : `${pool.length} ${pool.length === 1 ? 'match' : 'matches'}`}
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
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 ${filter === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
                  {label} <span className="tabular-nums text-ink-400">{n}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {visible.map((m) => (
          <MatchCard key={m.id} m={m} place={facts.places.get(m.id)!} doc={doc} />
        ))}
        {guest && hidden > 0 && <LockedRows count={hidden} onAuth={onAuth} next="/cv-match" />}
      </div>

      {!guest && hidden > 0 && (
        <div className="mt-3 text-center">
          <button onClick={() => setAll(true)} className="rounded-full px-4 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
            Show all {rest.length} matches
          </button>
        </div>
      )}

      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[12px] text-ink-500">
        <span>
          We read the {result.read} ads closest to your CV{result.pool > result.read ? `, out of ${result.pool} with titles like yours` : ''}. Kept for 24 hours.
        </span>
        {onAgain && !guest && (
          <button onClick={onAgain} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            <RefreshCw className="h-3 w-3" /> Search again
          </button>
        )}
      </p>

      {!isPro && <PlanPitch total={items.length} abroad={facts.abroad} lowestPay={facts.lowestPay} lead={lead} leadDoc={leadPlace.doc} />}
    </section>
  );
}

/**
 * The plan, said with the visitor's own numbers: how many matches the full
 * report covers, how many of them need a visa, and — when an ad shows pay —
 * what the monthly price is next to it. No promises about outcomes.
 */
function PlanPitch({ total, abroad, lowestPay, lead, leadDoc }: { total: number; abroad: number; lowestPay: TopMatch | null; lead: TopMatch; leadDoc: boolean }) {
  const prices = usePrices();
  const pro = prices.pro;
  const monthPay = lowestPay?.payUsdYear ? lowestPay.payUsdYear / 12 : null;
  const pct = monthPay ? (100 * pro.monthly.usd) / monthPay : null;
  const points: string[] = [
    leadDoc
      ? `Start today with ${lead.title} at ${lead.company}, your ${lead.score}% match: prepare your sponsorship document for it and send it with your CV.`
      : `Start today with ${lead.title} at ${lead.company}, your ${lead.score}% match: the report shows what to change in your CV before you send it.`,
    `The full report on all ${total} ${total === 1 ? 'match' : 'matches'}: where each point comes from, and what to change in your CV before you apply.`,
    abroad > 0
      ? `${abroad} of your matches ${abroad === 1 ? 'needs' : 'need'} a work visa. A sponsorship document for each one — up to ${PRO_MONTHLY_DOCS} a month — shows the employer the visa route, their steps and who pays what.`
      : `Up to ${PRO_MONTHLY_DOCS} sponsorship documents a month for jobs abroad: the visa route, the employer’s steps and who pays what.`,
    'The skills you are missing on every job, with no daily limit.',
  ];
  return (
    <aside aria-labelledby="pitch-title" className="mt-10 overflow-hidden rounded-3xl bg-ink-950 text-white">
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <h3 id="pitch-title" className="text-[22px] font-bold leading-tight tracking-tight">
            {pro.monthly.label} today covers a month of applying, with everything attached
          </h3>
          <ul className="mt-4 space-y-2.5">
            {points.map((x) => (
              <li key={x} className="flex gap-2.5 text-[14px] leading-6 text-white/85">
                <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-emerald-400" /> {x}
              </li>
            ))}
          </ul>
          {lowestPay && pct != null && (
            <p className="mt-4 rounded-xl bg-white/10 px-3.5 py-2.5 text-[13px] leading-5 text-white/85">
              For scale: the lowest pay shown among your matches is <strong className="text-white">{lowestPay.salary}</strong> ({lowestPay.company}). One month of Pro is {pct < 1 ? 'less than 1%' : `about ${Math.round(pct)}%`} of one month of that pay.
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-2xl bg-white p-5 text-center text-ink-950 md:w-64">
          <p className="text-[12px] font-bold uppercase tracking-wide text-brand-700">MadeVisa Pro</p>
          <p className="mt-1 text-[34px] font-bold leading-none tracking-tight">{pro.monthly.label}</p>
          <p className="mt-1 text-[13px] text-ink-600">a month · cancel any time</p>
          <button onClick={() => nav('/pricing#pro')} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-[14px] font-bold text-white hover:bg-brand-700">
            Get Pro <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-2 text-[11.5px] leading-4 text-ink-500">Or {pro.yearlyPerMonth.label} a month, billed yearly.</p>
        </div>
      </div>
    </aside>
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

  if (!open || total < 1) return null;
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
                <a href={href} onClick={go(href)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-brand-50/60">
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
  const { result, status, cv } = useTopMatches({ auto: true, autoDelayMs: 2500, light: true });
  const guest = !session;
  if (!cv) return null;
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
              <a href={href} onClick={go(href)} className="flex h-full items-center gap-3 rounded-xl p-3 ring-1 ring-ink-200 transition hover:bg-brand-50/50 hover:ring-brand-200">
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
  const { result } = useTopMatches({ auto: true, autoDelayMs: 1500, light: true });
  if (!result?.items.length) return null;
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
              <a href={href} onClick={go(href)} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-200 hover:ring-brand-300">
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
