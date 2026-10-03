import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ArrowRight, BadgeCheck, ChevronRight, Download, FileSignature, Languages, Lock, MapPin, PencilLine, Plane, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { countryName, nav } from '@/lib/pageLayout';
import { jobPath } from '@/lib/jobUrl';
import { briefEligibility, briefPath, fetchMyBriefs, newOfferPath } from '@/lib/briefs';
import { isLocalJobFor } from '@/lib/visaFit';
import { usePersonalization } from '@/lib/personalization';
import { useMyPlan } from '@/lib/plans';
import { PRO_MONTHLY_DOCS, usePrices } from '@/lib/pricing';
import { useOutcomes } from '@/lib/cv/outcomes';
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

/** What the document strip says and does for this visitor. */
type DocAction = {
  /** Pro: the document is drafted on opening, so the strip says it is ready to review. */
  pro: boolean;
  /** Label for people without the plan. */
  planLabel: string;
  /** Documents this person already made, by job id → share id. */
  made: Map<string, string>;
  go: (m: TopMatch) => void;
};

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

/** The strip under a job abroad: the visa, and the document that goes to the company. */
function DocStrip({ m, doc, lead }: { m: TopMatch; doc: DocAction; lead: boolean }) {
  const have = doc.made.has(m.id);
  const label = have ? 'Open your PDF' : doc.pro ? 'Review & download PDF' : doc.planLabel;
  return (
    <div className={`flex border-t border-ink-100 bg-brand-50/50 px-4 sm:px-5 ${lead ? 'flex-col gap-3 py-3.5 sm:flex-row sm:items-center' : 'flex-wrap items-center gap-x-3 gap-y-2 py-2.5'}`}>
      <p className={`min-w-0 flex-1 text-[13px] leading-5 text-ink-700 ${lead ? '' : 'basis-52'}`}>
        <FileSignature className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-brand-700" />
        {have ? (
          <>
            <strong className="text-ink-950">Your document for {m.company} is saved.</strong>
            {lead ? ' Download the PDF and send it with your CV.' : ''}
          </>
        ) : doc.pro ? (
          <>
            <strong className="text-ink-950">Your sponsorship document for {m.company} is ready to review.</strong>
            {lead ? ` It is filled in with the visa route${m.country ? ` for ${m.country}` : ''}, their steps and who pays what. Check it, download the PDF, and send it with your CV.` : ''}
          </>
        ) : lead ? (
          <>
            <strong className="text-ink-950">You’d need a work visa here.</strong> Send {m.company} your sponsorship document with your CV: the visa route, their few steps, and who pays what.
          </>
        ) : (
          <>
            <strong className="text-ink-950">Visa needed.</strong> Your sponsorship document for {m.company}
          </>
        )}
      </p>
      <button
        onClick={() => doc.go(m)}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold ${
          lead || (doc.pro && !have) ? 'bg-brand-600 px-4 py-2 text-white hover:bg-brand-700' : 'px-3 py-1.5 text-brand-700 ring-1 ring-brand-200 hover:bg-white'
        }`}
      >
        {(doc.pro || have) && <Download className="h-3.5 w-3.5" />}
        {label}
        {!doc.pro && !have && <ArrowRight className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
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
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.bg} ${tone.text}`}>{m.label}</span>
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

      {place.doc && <DocStrip m={m} doc={doc} lead={lead} />}
    </article>
  );
}

/** Matches a guest can't read yet: their real scores, with shapes where the titles would be (no titles in the page). */
function LockedRows({ scores, onAuth, next }: { scores: number[]; onAuth?: OnAuth; next: string }) {
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
    ['66%', '41%'],
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
      <div className="relative grid place-items-center bg-white/55 px-4 py-7 sm:py-9">
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

/**
 * Under this best score the page leads with how to raise it. 70% sits in the
 * lower half of "Good match" (65–79): the job is worth applying to, but the CV
 * is leaving points on the table — usually skills it doesn't name.
 */
export const WEAK_BELOW = 70;
/** How many missing skills are named without the plan. */
const FREE_MISSING = 3;

/** Skills the matched ads ask for that the CV doesn't mention, most asked-for first. */
function missingAcross(items: TopMatch[]): { name: string; jobs: number }[] {
  const n = new Map<string, number>();
  for (const m of items) for (const s of m.missing ?? []) n.set(s, (n.get(s) ?? 0) + 1);
  return [...n].map(([name, jobs]) => ({ name, jobs })).sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
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

/**
 * Shown when the best match is under WEAK_BELOW: what the CV doesn't say yet,
 * and the score the best job would get if it did. The reachable score is the
 * same engine run again with the ad's skills present — a score, not a promise.
 */
function ImproveBlock({ lead, missing, tips, isPro, planLabel }: { lead: TopMatch; missing: { name: string; jobs: number }[]; tips: string[]; isPro: boolean; planLabel: string }) {
  const gain = lead.potential - lead.score;
  const open = isPro ? missing.slice(0, 12) : missing.slice(0, FREE_MISSING);
  const locked = missing.length - open.length;
  const leadMissing = lead.missing?.length ?? 0;
  const href = hrefOf(lead);
  return (
    <section aria-labelledby="improve-title" className="mt-6 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
      <div className="px-4 pt-5 sm:px-6">
        <h3 id="improve-title" className="text-[19px] font-bold leading-snug tracking-tight text-ink-950">
          {gain >= 5 ? `Your CV can score higher than ${lead.score}%` : 'Make your CV say more of what these ads ask for'}
        </h3>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-6 text-ink-600">
          The score compares the words in your CV with the words in each ad. Most of the gap is usually something you have done but haven’t written down.
        </p>
      </div>

      {gain >= 5 && (
        <div className="mx-4 mt-4 rounded-xl bg-ink-50 px-4 py-3.5 sm:mx-6">
          <div className="flex flex-col gap-2 text-ink-950 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <p className="min-w-0 text-[13px] leading-5 text-ink-700">
              <span className="block font-semibold text-ink-950">{lead.title}</span>
              {lead.company}
            </p>
            <p className="shrink-0 whitespace-nowrap tabular-nums sm:text-right">
              <span className="text-[15px] font-semibold text-ink-600">{lead.score}% now</span>
              <span className="mx-1.5 text-ink-400" aria-hidden>
                →
              </span>
              <span className="text-[22px] font-bold leading-none">up to {lead.potential}%</span>
            </p>
          </div>
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-ink-200" role="img" aria-label={`${lead.score}% now, up to ${lead.potential}% if your CV mentions the skills the ad names`}>
            <span className="h-full bg-ink-700" style={{ width: `${lead.score}%` }} />
            <span className="h-full border-l-2 border-white bg-brand-500" style={{ width: `${gain}%` }} />
          </div>
          <p className="mt-2 text-[12px] leading-5 text-ink-600">
            {leadMissing === 1 ? 'The ad names 1 skill' : `The ad names ${leadMissing} skills`} your CV doesn’t mention. With {leadMissing === 1 ? 'it' : 'them'} in your CV, this job scores {lead.potential}%. Add only what is true for you.
          </p>
        </div>
      )}

      <div className="grid gap-x-8 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-6">
        {missing.length > 0 && (
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink-950">Skills these ads ask for that your CV doesn’t mention</p>
            <ul className="mt-2.5 space-y-1.5">
              {open.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="min-w-0 break-words font-semibold text-ink-900">{s.name}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-500">
                    {s.jobs} {s.jobs === 1 ? 'job' : 'jobs'}
                  </span>
                </li>
              ))}
              {locked > 0 && (
                <li className="flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-2 text-[12.5px] leading-4 text-ink-700">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                  {locked} more {locked === 1 ? 'skill is' : 'skills are'} named in the full report
                </li>
              )}
            </ul>
          </div>
        )}
        {tips.length > 0 && (
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink-950">Fixes to the CV itself</p>
            <ul className="mt-2.5 space-y-2">
              {tips.slice(0, 4).map((t) => (
                <li key={t} className="flex gap-2 text-[13px] leading-5 text-ink-700">
                  <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50/60 px-4 py-3.5 sm:flex-row sm:items-center sm:px-6">
        <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink-700">
          {isPro
            ? 'Your full report lists every missing skill and the exact lines to change, job by job. Upload the new CV here and every job is scored again.'
            : 'The full report names every missing skill and the exact lines to change, job by job. Upload the improved CV and every job is scored again.'}
        </p>
        <button onClick={() => nav(isPro ? href : '/pricing#pro')} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink-950 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-ink-800">
          {isPro ? 'Open the full report' : `Full report · ${planLabel}`} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

type Filter = 'all' | 'here' | 'sponsor';

export function TopMatchesList({ result, onAuth, onAgain }: { result: TopResult; onAuth?: OnAuth; onAgain?: () => void }) {
  const { session } = useAuth();
  const { isPro } = useMyPlan();
  const prices = usePrices();
  const visitor = useVisitor();
  const made = useMadeDocs(Boolean(session));
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
      missing: missingAcross(items),
    };
  }, [items, visitor]);

  const planLabel = `${prices.pro.monthly.label} a month`;
  const doc: DocAction = {
    pro: isPro,
    planLabel: `In Pro · ${planLabel}`,
    made,
    go: (m) => {
      const share = made.get(m.id);
      if (share) return nav(briefPath(share));
      nav(isPro ? `${newOfferPath(m.id)}${m.cc ? `&country=${m.cc}` : ''}` : '/pricing#pro');
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

  const pool = filter === 'here' ? items.filter((m) => ['here', 'free'].includes(facts.places.get(m.id)!.kind)) : filter === 'sponsor' ? items.filter((m) => m.visa === 'offered') : items;
  const rest = pool.filter((m) => m.id !== lead.id || filter !== 'all');
  // Guests see the starting job and one more; the count behind the lock is the real one.
  const visible = guest ? rest.slice(0, GUEST_VISIBLE - 1) : all ? rest : rest.slice(0, 11);
  const hiddenRows = rest.slice(visible.length);
  const hidden = hiddenRows.length;
  const place = visitor.currentLocation ? countryName(visitor.currentLocation) : null;
  const tips = result.tips ?? [];
  const weak = t.best < WEAK_BELOW && (facts.missing.length > 0 || tips.length > 0);

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
        <h2 id="top-title" className="mt-3 text-balance text-[26px] font-bold leading-tight tracking-tight text-ink-950 [word-spacing:0.08em] sm:text-[32px]">
          {t.strong > 0 ? (
            <>
              You match{' '}
              <span className="whitespace-nowrap text-emerald-700">
                {t.strong}&nbsp;{t.strong === 1 ? 'job' : 'jobs'}
              </span>{' '}
              at 80% or more
            </>
          ) : t.good > 0 ? (
            <>
              You match{' '}
              <span className="whitespace-nowrap text-brand-700">
                {t.good}&nbsp;{t.good === 1 ? 'job' : 'jobs'}
              </span>{' '}
              at 65% or more
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
        <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-bold text-brand-700">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" /> Start with this one
          </span>
          <span className="font-normal text-ink-500">
            {[
              lead.score === t.best ? 'your best match' : `${lead.score}% match`,
              daysOld(lead) <= 14 ? 'posted recently' : null,
              leadPlace.kind === 'here' ? 'in your country' : leadPlace.kind === 'free' ? 'no visa needed' : null,
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        </p>
        <MatchCard m={lead} place={leadPlace} doc={doc} lead />
      </div>

      {weak && <ImproveBlock lead={lead} missing={facts.missing} tips={tips} isPro={isPro} planLabel={planLabel} />}

      {/* The rest */}
      {items.length > 1 && (
        <>
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
                    <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-full px-3 py-1 ${filter === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
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
            {guest && hidden > 0 && <LockedRows scores={hiddenRows.map((m) => m.score)} onAuth={onAuth} next="/cv-match" />}
          </div>
        </>
      )}

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

      {!isPro && <PlanPitch total={items.length} abroad={facts.abroad} lowestPay={facts.lowestPay} lead={lead} toAdd={facts.missing.length + tips.length} />}
    </section>
  );
}

/**
 * The plan as a receipt: what one month's price covers for THIS visitor,
 * line by line, with the amount to pay today at the bottom. Quantities are
 * counted from their matches. The "results so far" line appears only when
 * MadeVisa's own records hold enough documents to give real shares.
 */
function PlanPitch({ total, abroad, lowestPay, lead, toAdd }: { total: number; abroad: number; lowestPay: TopMatch | null; lead: TopMatch; toAdd: number }) {
  const prices = usePrices();
  const outcomes = useOutcomes();
  const pro = prices.pro;
  const monthPay = lowestPay?.payUsdYear ? lowestPay.payUsdYear / 12 : null;
  const pct = monthPay ? (100 * pro.monthly.usd) / monthPay : null;
  const share = (n: number) => Math.round((100 * n) / (outcomes?.made || 1));

  const lines: { qty: string; name: string; text: string }[] = [
    {
      qty: String(total),
      name: total === 1 ? 'full match report' : 'full match reports',
      text: 'One for every job you match: where each point of the score comes from, and the lines to change in your CV before you apply.',
    },
    abroad > 0
      ? {
          qty: String(abroad),
          name: abroad === 1 ? 'sponsorship document' : 'sponsorship documents',
          text: `One for each match that needs a work visa, as a PDF to send with your CV: the visa route, the employer’s steps and who pays what. The plan allows ${PRO_MONTHLY_DOCS} a month.`,
        }
      : {
          qty: String(PRO_MONTHLY_DOCS),
          name: 'sponsorship documents a month',
          text: 'For any job abroad you apply to, as a PDF to send with your CV: the visa route, the employer’s steps and who pays what.',
        },
    ...(toAdd > 0
      ? [
          {
            qty: String(toAdd),
            name: toAdd === 1 ? 'thing to add to your CV, named' : 'things to add to your CV, named',
            text: 'Every skill these ads ask for that your CV doesn’t mention, and the fixes to the CV itself. Upload the new version and each job is scored again.',
          },
        ]
      : []),
    {
      qty: 'No limit',
      name: 'on missing-skills checks',
      text: 'On any job on MadeVisa. Without the plan it is 3 jobs a day.',
    },
  ];

  return (
    <aside aria-labelledby="pitch-title" className="mt-10 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="px-5 pt-6 sm:px-8 sm:pt-8">
        <p className="text-[13px] font-bold text-brand-700">MadeVisa Pro</p>
        <h3 id="pitch-title" className="mt-1 text-balance text-[24px] font-bold leading-tight tracking-tight text-ink-950 sm:text-[28px]">
          What {pro.monthly.label} covers this month
        </h3>
        <p className="mt-1.5 max-w-xl text-[14px] leading-6 text-ink-600">
          Start today with <strong className="font-semibold text-ink-950">{lead.title}</strong> at {lead.company}, your {lead.score}% match.
        </p>
      </div>

      <dl className="mt-5 px-5 sm:px-8">
        {lines.map((l) => (
          <div key={l.name} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-t border-dashed border-ink-200 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-5">
            <dt className={`font-bold leading-none tracking-tight tabular-nums text-ink-950 ${/^\d+$/.test(l.qty) ? 'text-[30px] sm:text-[34px]' : 'pt-1 text-[15px] leading-5 sm:text-[17px]'}`}>{l.qty}</dt>
            <dd className="min-w-0">
              <p className="text-[15px] font-bold leading-snug text-ink-950">{l.name}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-ink-600">{l.text}</p>
            </dd>
          </div>
        ))}
      </dl>

      {outcomes && (
        <div className="mx-5 mb-5 rounded-xl bg-ink-50 px-4 py-3.5 sm:mx-8">
          <p className="text-[13px] font-bold text-ink-950">How sponsorship documents have done so far</p>
          <dl className="mt-2 flex flex-wrap gap-x-7 gap-y-2">
            <div>
              <dd className="text-[20px] font-bold leading-none tabular-nums text-ink-950">{share(outcomes.opened)}%</dd>
              <dt className="mt-1 text-[12px] text-ink-600">opened by the employer</dt>
            </div>
            <div>
              <dd className="text-[20px] font-bold leading-none tabular-nums text-ink-950">{share(outcomes.replied)}%</dd>
              <dt className="mt-1 text-[12px] text-ink-600">got a reply</dt>
            </div>
            {outcomes.interview > 0 && (
              <div>
                <dd className="text-[20px] font-bold leading-none tabular-nums text-ink-950">{outcomes.interview}</dd>
                <dt className="mt-1 text-[12px] text-ink-600">led to an interview</dt>
              </div>
            )}
          </dl>
          <p className="mt-2 text-[11.5px] leading-4 text-ink-500">
            Counted from all {outcomes.made.toLocaleString('en')} documents made on MadeVisa at least a week ago. Past results, not a promise about yours.
          </p>
        </div>
      )}

      <div className="bg-ink-950 px-5 py-5 text-white sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div>
            <p className="text-[13px] text-white/70">To pay today</p>
            <p className="mt-0.5 text-[36px] font-bold leading-none tracking-tight tabular-nums">{pro.monthly.label}</p>
            <p className="mt-1.5 text-[13px] text-white/70">for one month</p>
          </div>
          <button onClick={() => nav('/pricing#pro')} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-bold text-ink-950 hover:bg-brand-50 sm:w-auto">
            Get Pro <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <ul className="mt-4 space-y-1 border-t border-white/15 pt-3.5 text-[12.5px] leading-5 text-white/75">
          <li>Cancel any time; it stops at the end of the month.</li>
          <li>Full refund within 14 days if you haven’t used a sponsorship document.</li>
          <li>Or {pro.yearlyPerMonth.label} a month when billed yearly.</li>
          {lowestPay && pct != null && (
            <li>
              For scale: the lowest pay shown among your matches is {lowestPay.salary} ({lowestPay.company}). One month of Pro is {pct < 1 ? 'less than 1%' : `about ${Math.round(pct)}%`} of one month of that pay.
            </li>
          )}
        </ul>
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
