import { JobAgeBadge } from '@/components/common/JobAgeBadge';
import { openJobModal, pickJob } from '@/lib/jobModal';
import { JobDetailPage } from '@/pages/jobs/JobDetailPage';
import { NEW_TAB } from '@/lib/navLink';
import { AlertSignup } from '@/components/jobs/AlertSignup';
import { Fragment, startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Globe2,
  LayoutGrid,
  GraduationCap,
  Check,
  History as HistoryIcon,
  Loader2,
  Lock,
  Plane,
  Search,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react';
import type { View } from '@/types';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { CvPrompt } from '@/components/cv/CvPrompt';
import { TopMatchesStrip } from '@/components/cv/TopMatches';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { Logo } from '@/components/layout/Logo';
import { jobTypes, type Job } from '@/data/jobs';
import { displayJobCategory, isMeaningfulJobType, isStudentOrInternJob } from '@/lib/jobCategories';
import { CATEGORIES_BY_GROUP, categoryGroup, categoryMatches, categorySearchTerms, categoryValueLabel, classifyJob, type JobCategory } from '@/lib/jobTaxonomy';
import { FilterCombo, type ComboOption } from '@/components/jobs/FilterCombo';
import { moveToBack, recentlyShownIds, rememberShown, visitShuffle } from '@/lib/feedRotation';
import { useAuth } from '@/lib/auth';
import { fetchArbeitnowJobs } from '@/data/sources/arbeitnow';
import { JobSignals } from '@/components/jobs/JobSignals';
import { useJobFacets } from '@/lib/jobFacets';
import { useNewJobsSince } from '@/lib/newJobsWatch';
import { fetchFilteredJobs, fetchJobsAddedSince, fetchNewestDiverseJobs, fetchPublishedSponsoredJobs, hasSavedJobList, searchPublishedJobs, sponsoredJobToBoardJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { allCountries } from '@/data/allCountries';
import { readRecent, rememberRecent, rememberSearch } from '@/lib/lastSearch';
import { isJobViewed, markJobViewed, viewedJobIds } from '@/lib/viewedJobs';
import { rememberJobPreview } from '@/lib/jobPreview';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { PersonalizationBar } from '@/components/opportunities/PersonalizationBar';
import { jobPath } from '@/lib/jobUrl';
import { experienceBucket } from '@/lib/jobText';
import { DirectListingBadge } from '@/components/common/DirectListingBadge';
import { NewCompanyBadge } from '@/components/common/NewCompanyBadge';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useMembership } from '@/lib/plans';
import { CareerOutlook } from '@/components/book/BookPromo';
import { Paywall } from '@/components/pro/Paywall';
import { DEFAULT_BOOK_PROMO } from '@/data/bookPromo';

type JobsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  /** Receives the job's public path (see jobPath in src/lib/jobUrl.ts). */
  /** No longer used: job cards open the job in a new tab. Kept so callers still compile. */
  goToJob?: (path: string) => void;
  /** Desktop: list on the left, the picked job on the right (LinkedIn-style). */
  split?: boolean;
  /** The job open in the right-hand pane (the part after /jobs/), when one was picked. */
  selectedJob?: string | null;
};

// Imported jobs are listed for 7 days after they're shared (JOB_WINDOW_DAYS, enforced by the
// database); jobs companies post here themselves last up to 30 days — so "Any time" = 30 days.
const MAX_AGE_DAYS = 30;
const DATE_POSTED_OPTIONS = ['Any time', 'Past 24 hours', 'Past 3 days', 'Past week'] as const;
type DatePostedOption = (typeof DATE_POSTED_OPTIONS)[number];
const WINDOW_DAYS: Record<DatePostedOption, number> = { 'Any time': MAX_AGE_DAYS, 'Past 24 hours': 1, 'Past 3 days': 3, 'Past week': 7 };
const asDateOption = (v: string | null): DatePostedOption => (DATE_POSTED_OPTIONS as readonly string[]).includes(v ?? '') ? (v as DatePostedOption) : 'Any time';

const ALL_CATEGORIES = 'All categories';
/** A category filter value from the URL, or "All categories" if it isn't one we know. */
function asCategoryValue(v: string | null): string {
  if (!v) return ALL_CATEGORIES;
  if (v.startsWith('group:')) return CATEGORIES_BY_GROUP.some((g) => g.group === v.slice(6)) ? v : ALL_CATEGORIES;
  return categoryGroup(v) ? v : ALL_CATEGORIES;
}

/**
 * Worked out once per job and kept (the list can be ~70k jobs, and phones type faster than
 * they can re-read every date and lowercase every title): the dates as numbers, the category,
 * and one lowercase line to search in.
 */
type JobMeta = { posted: number; shared: number; cat: JobCategory | null; hay: string };
const META = new WeakMap<Job, JobMeta>();
function meta(j: Job): JobMeta {
  let m = META.get(j);
  if (!m) {
    const cat = classifyJob(j.title, j.category);
    m = {
      posted: Date.parse(j.postedDate ?? j.sharedAt ?? '') || 0,
      shared: Date.parse(j.sharedAt ?? j.postedDate ?? '') || 0,
      cat,
      hay: `${j.title}\n${j.company}\n${j.category}\n${cat?.label ?? ''}\n${j.city}`.toLowerCase(),
    };
    META.set(j, m);
  }
  return m;
}
/** When the job was posted (company's date, else when it went live here). */
const postedMs = (j: Job) => meta(j).posted;
const sharedMs = (j: Job) => meta(j).shared;

/** Each downloaded row becomes a list job once (the full list arrives in parts, and comes back on each visit). */
const BOARD = new WeakMap<SponsoredJob, Job>();
const toBoard = (r: SponsoredJob): Job => {
  let j = BOARD.get(r);
  if (!j) {
    j = sponsoredJobToBoardJob(r);
    BOARD.set(r, j);
  }
  return j;
};
/**
 * Turns a big download into list jobs in small slices, letting the phone draw and react to
 * taps in between (one 60k-row pass would freeze the page for a second or two).
 */
async function toBoardInSlices(rows: SponsoredJob[], alive: () => boolean): Promise<Job[] | null> {
  const out: Job[] = new Array(rows.length);
  let i = 0;
  while (i < rows.length) {
    const until = performance.now() + 8;
    for (; i < rows.length && performance.now() < until; i++) {
      out[i] = toBoard(rows[i]);
      meta(out[i]);
    }
    if (i < rows.length) await new Promise((r) => window.setTimeout(r, 0));
    if (!alive()) return null;
  }
  return out;
}

/** The full list from this visit, so coming back from a job shows it at once. */
let lastFullJobs: Job[] | null = null;

/** Where the list was when a job was opened (phones open jobs in the same tab): restored on Back. */
const LIST_KEY = 'mv:jobsListPlace';
type ListPlace = { url: string; y: number; count: number; at: number };
function readListPlace(): ListPlace | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(LIST_KEY) ?? 'null') as ListPlace | null;
    return v && v.url === window.location.pathname + window.location.search && Date.now() - v.at < 30 * 60_000 ? v : null;
  } catch {
    return null;
  }
}
const DAY_MS = 86_400_000;

/** Posted in the last 24 hours — worth applying early. */
function isEarlyApplicantJob(j: Job): boolean {
  const t = postedMs(j);
  return !j.closed && t > 0 && Date.now() - t < DAY_MS;
}

/** Strictly newest first. Jobs posted at the very same moment (a bulk
 *  import) are spread across companies instead of one company's batch in a row. */
function sortNewestFirst(jobs: Job[]): Job[] {
  const sorted = [...jobs].sort((a, b) => postedMs(b) - postedMs(a) || sharedMs(b) - sharedMs(a));
  const out: Job[] = [];
  for (let i = 0; i < sorted.length; ) {
    let k = i + 1;
    while (k < sorted.length && postedMs(sorted[k]) === postedMs(sorted[i])) k++;
    out.push(...(k - i > 2 ? interleaveByCompany(sorted.slice(i, k)) : sorted.slice(i, k)));
    i = k;
  }
  return out;
}

type SortOption = 'newest' | 'relevant';

/** This device's copy of the newest jobs, kept 10 minutes: a repeat visit shows the list at once. */
const QUICK_KEY = 'mv:newestJobs';
// 30 minutes: on Supabase Free every full download of the list counts against 5 GB a month.
const QUICK_TTL_MS = 30 * 60_000;
function readQuickCopy(): Job[] | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(QUICK_KEY) ?? 'null') as { at: number; rows: SponsoredJob[] } | null;
    if (!v || !Array.isArray(v.rows) || !v.rows.length || Date.now() - v.at > QUICK_TTL_MS) return null;
    return v.rows.map(sponsoredJobToBoardJob);
  } catch {
    return null;
  }
}
function writeQuickCopy(rows: SponsoredJob[]): void {
  try {
    if (rows.length) window.localStorage.setItem(QUICK_KEY, JSON.stringify({ at: Date.now(), rows }));
  } catch {
    /* storage full or blocked: the list just loads next time */
  }
}

/** While the first jobs load: something to read instead of a frozen page. */
const LOADING_LINES = ['Loading the latest jobs for you…', 'Checking company career pages…', 'Picking fresh roles from the last 24 hours…', 'Almost there…'];

function LoadingLatest({ found }: { found?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => Math.min(n + 1, LOADING_LINES.length - 1)), 1400);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="mt-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
        <Zap className="h-4 w-4 fill-amber-300 text-amber-400" aria-hidden />
        {found ? `Searching… ${found.toLocaleString('en-US')} ${found === 1 ? 'job' : 'jobs'} found so far` : LOADING_LINES[i]}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full w-1/3 animate-[mvslide_1.2s_ease-in-out_infinite] rounded-full bg-brand-600" />
      </div>
    </div>
  );
}

/** Above the list: "Searching… 128 jobs found so far", then "128 jobs" — so it's clear whether it's still looking. */
function SearchStatus({ busy, found, more, filtered }: { busy: boolean; found: number; more: boolean; filtered: boolean }) {
  if (!filtered && !busy) return null;
  return (
    <p className="mb-2 mt-3 flex items-center gap-2 text-[13px] font-semibold text-ink-600" role="status" aria-live="polite">
      {busy ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" aria-hidden />
          Searching… {found.toLocaleString('en-US')} {found === 1 ? 'job' : 'jobs'} found so far
        </>
      ) : (
        <>
          <span className="text-ink-950">
            {found.toLocaleString('en-US')}
            {more ? '+' : ''} {found === 1 ? 'job' : 'jobs'}
          </span>
          <span className="font-normal text-ink-500">{more ? '· more load as you scroll' : '· every live job for this search'}</span>
        </>
      )}
    </p>
  );
}

const PAGE_SIZE = 12;
/** Jobs a signed-out visitor sees before the sign-up card. */
const GUEST_JOBS = 2;
/** Jobs per server page when a filter is on. */
const FILTER_PAGE = 300;

/** Round-robins a list across `company` so that, when hundreds of jobs
 *  come from a handful of companies (a big ATS import batch), scrolling
 *  through the list alternates between companies instead of running
 *  through one company's entire batch before the next company ever
 *  appears. Preserves each company's own relative order — this only
 *  reorders which company gets the next slot, not each company's
 *  internal ordering (already applied by the caller, e.g. newest-first). */
function interleaveByCompany(jobs: Job[]): Job[] {
  const byCompany = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = byCompany.get(job.company);
    if (list) list.push(job);
    else byCompany.set(job.company, [job]);
  }
  const queues = Array.from(byCompany.values());
  const result: Job[] = [];
  let round = 0;
  while (result.length < jobs.length) {
    for (const q of queues) {
      if (round < q.length) result.push(q[round]);
    }
    round++;
  }
  return result;
}


const PLACEHOLDER_PLACE = /^(?:all|any|various|multiple(?: locations)?|n\/?a|none|-)$/i;

/** "City, Country" — without importer placeholders like "All" / "Various". */
function cardLocation(job: Job): string {
  const city = job.city && !PLACEHOLDER_PLACE.test(job.city.trim()) ? job.city : '';
  const country = job.country && !PLACEHOLDER_PLACE.test(job.country.trim()) ? job.country : '';
  if (city && country && city !== country) return `${city}, ${country}`;
  return city || country || 'Location on source';
}

function JobLogo({ job, size = 48 }: { job: Job; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-white"
      style={{ width: size, height: size }}
    >
      {job.imageUrl && !failed ? (
        <img src={job.imageUrl} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" />
      ) : (
        <CompanyLogo name={job.company} size={size - 6} />
      )}
    </div>
  );
}

/** A small on/off switch for a quick filter. */
/** A filter that is on or off, as a pill in the jobs page's filter row. */
function TogglePill({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold transition ${
        on ? 'bg-brand-700 text-white hover:bg-brand-800' : 'bg-white text-ink-800 ring-1 ring-inset ring-ink-300 hover:ring-ink-500'
      }`}
    >
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
      {label}
    </button>
  );
}

function DateTag({ job }: { job: Job }) {
  return <JobAgeBadge iso={job.postedDate} />;
}

function SourceLabel({ job }: { job: Job }) {
  if (job.sourceType === 'company_submitted') {
    return <DirectListingBadge company={job.company} compact />;
  }
  if (job.sourceType === 'live_feed') {
    return <span className="text-[11px] text-ink-400">Source: {job.source} · live listing</span>;
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-ink-400">
      Source: {job.company} careers ·
      <Logo variant="header" style={{ height: '1em', width: 'auto' }} />
    </span>
  );
}

/** Jobs the company has closed (still shown for 24 h) go after every open job. */
function withClosedLast(jobs: Job[]): Job[] {
  if (!jobs.some((j) => j.closed)) return jobs;
  return [...jobs.filter((j) => !j.closed), ...jobs.filter((j) => j.closed)];
}

/**
 * Free users (no membership): some jobs are members-only — always the same ones (picked from the
 * job's id, ~15%), plus about half of the jobs that match what they search for or their profession.
 * The card is blurred; clicking it opens the membership popup, not the job. The first two jobs of
 * the list are never locked.
 */
type CardLock = 'job' | null;
const LOCK_ALWAYS_PCT = 15;
const LOCK_MATCH_PCT = 50;
function cardLock(job: Job, index: number, terms: string[]): CardLock {
  if (index < 2 || job.closed || job.sourceType === 'company_submitted') return null;
  let h = 2166136261;
  for (const c of String(job.id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const n = (h >>> 0) % 100;
  if (n < LOCK_ALWAYS_PCT) return 'job';
  const title = job.title.toLowerCase();
  return n < LOCK_MATCH_PCT && terms.some((t) => title.includes(t)) ? 'job' : null;
}
/** Words from the search box and the visitor's chosen profession (book promo) to lock matches on. */
function lockTerms(search: string): string[] {
  let prof: string[] = [];
  try {
    const v = localStorage.getItem('mv:bookProfession');
    if (v) prof = DEFAULT_BOOK_PROMO.insights.find((p) => p.id === v)?.keywords ?? categorySearchTerms(v, 12);
  } catch {
    /* private mode */
  }
  const words = search.toLowerCase().split(/[^a-z0-9à-ÿ+#]+/i).filter((w) => w.length >= 4);
  return [...new Set([...words, ...prof.map((k) => k.toLowerCase())])];
}

function JobCard({ job, onLocked, onOpen, onPick, active = false, fresh = false, lock = null, onMembersOnly }: { /** Free users: a members-only teaser (see cardLock). */ lock?: CardLock; /** Clicking a locked card: the membership popup. */ onMembersOnly?: (job: Job) => void; job: Job; /** Just went live (the "+N new jobs" notice). */ fresh?: boolean; /** Signed out: picking an outside listing asks for a free account first. */ onLocked?: (job: Job) => void; /** Opening it in this tab (phones). */ onOpen?: () => void; /** Desktop split view: show it in the right-hand pane. */ onPick?: (href: string) => void; /** The job showing in the pane. */ active?: boolean }) {
  const isExternal = job.sourceType === 'live_feed';
  const viewed = isJobViewed(job.id);
  const closed = Boolean(job.closed);

  const inner = (
    <>
      <div className="flex items-start gap-3.5">
        <JobLogo job={job} size={52} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-500">
            <span className="truncate">{job.company}</span>
            <NewCompanyBadge addedAt={job.companyAddedAt} />
            {fresh && <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">Just added</span>}
          </p>
          <h3 className="mt-0.5 break-words font-title text-lg font-bold leading-snug text-ink-950 [overflow-wrap:anywhere] group-hover:text-brand-700">{job.title}</h3>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-500">
        <span className="flex items-center gap-1.5">
          <CircleFlag countryCode={job.countryCode} label={job.country} size={15} />
          {cardLocation(job)}
        </span>
        {isMeaningfulJobType(job.type) && (
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-ink-400" />
            {job.type}
          </span>
        )}
        {displayJobCategory(job) && <span>{displayJobCategory(job)}</span>}
        {job.remote && <span className="font-semibold text-emerald-700">Remote</span>}
      </div>

      {job.salary && <p className={`mt-3 font-slab font-bold leading-snug text-ink-950 ${onPick ? 'text-base' : 'text-lg'}`}>{job.salary}</p>}

      {!isExternal && !closed && !onPick && (
        <JobSignals publisherId={job.publisherId} company={job.company} countryCode={job.countryCode} visaOffered={job.visaStatus === 'offered' || job.visaSponsorship} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
        {closed ? (
          <span className="rounded border border-ink-300 bg-ink-100 px-1.5 py-[3px] text-[10px] font-bold uppercase tracking-wide text-ink-600">Closed</span>
        ) : (
          <DateTag job={job} />
        )}
        {isEarlyApplicantJob(job) && (
          <span className="inline-flex items-center gap-1 rounded bg-brand-600 px-1.5 py-[3px] text-[10px] font-bold uppercase tracking-wide text-white">
            <Zap className="h-3 w-3 fill-current" />
            Be an early applicant
          </span>
        )}
        {viewed && !closed && (
          <span className="rounded border border-ink-200 bg-white px-1.5 py-[3px] text-[10px] font-bold uppercase tracking-wide text-ink-600">Viewed</span>
        )}
        <SourceLabel job={job} />
      </div>
    </>
  );
  const body =
    lock === 'job' ? (
      <>
        <div aria-hidden className="pointer-events-none select-none blur-[6px]">
          {inner}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/35 px-4 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-950 text-white shadow-md">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[14.5px] font-bold text-ink-950">Members-only job</span>
          <span className="rounded-full bg-[#FFD60A] px-3 py-1 text-[12px] font-bold text-ink-950">Unlock 500,000+ more jobs a month</span>
          <span className="sr-only">{job.title}</span>
        </div>
      </>
    ) : (
      inner
    );

  // Already-viewed jobs turn grey (muted background + softened content)
  // so it's easy to spot what you haven't opened yet.
  const cardClass = `min-w-0 max-w-full overflow-hidden group relative block rounded-lg border p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg ${onPick ? 'sm:p-5' : 'sm:p-6'} ${
    closed
      ? 'border-ink-200 bg-ink-50 opacity-60 grayscale hover:opacity-80'
      : viewed
        ? 'border-ink-200 bg-ink-100/70 opacity-75 grayscale-[40%] hover:opacity-100'
        : 'border-ink-900/15 bg-white'
  }`;

  if (lock === 'job') {
    return (
      <button type="button" onClick={() => onMembersOnly?.(job)} className={`${cardClass} w-full text-left`} aria-label={`Members-only job: ${job.title}. Unlock with the membership`}>
        {body}
      </button>
    );
  }

  if (isExternal) {
    return (
      <a
        href={onLocked ? '/pricing' : job.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!onLocked) return;
          e.preventDefault();
          onLocked(job);
        }}
        className={cardClass}
      >
        {body}
      </a>
    );
  }

  // A real <a href> (not a div) so search engines can discover and crawl
  // every job page from the list. Plain clicks still navigate in-app;
  // Ctrl/Cmd/middle-click open a new tab like any normal link.
  const href = jobPath(job);
  return (
    <a
      href={href}
      {...NEW_TAB}
      onClick={(e) => {
        markJobViewed(job.id, { id: job.id, title: job.title, organization: job.company, country: job.country, countryCode: job.countryCode, url: job.url });
        rememberJobPreview(job);
        // Ctrl/Cmd/middle-click: a new tab, like any link. A plain click: the job opens as a popup
        // over this list, with its own address in the URL bar; Back or × returns to this exact spot.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if (onPick) return onPick(href);
        onOpen?.();
        openJobModal(href);
      }}
      aria-current={active || undefined}
      className={`${cardClass} cursor-pointer ${active ? '!border-brand-600 !bg-white !opacity-100 ring-2 ring-brand-600 !grayscale-0' : ''}`}
    >
      {body}
    </a>
  );
}

function JobCardSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <div className="h-[52px] w-[52px] shrink-0 rounded-lg skeleton-shimmer" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3 w-1/3 rounded skeleton-shimmer" />
          <div className="h-4 w-2/3 rounded skeleton-shimmer" />
        </div>
      </div>
      <div className="mt-4 h-3 w-1/2 rounded skeleton-shimmer" />
      <div className="mt-5 h-3 w-1/3 rounded skeleton-shimmer" />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-ink-300 bg-white px-3 text-left text-sm font-medium text-ink-800 transition hover:border-brand-400"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label={`Close ${label}`} onClick={() => setOpen(false)} className="fixed inset-0 z-20 cursor-default" />
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-ink-300 bg-white p-1 shadow-xl">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="block w-full truncate rounded px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
      />
    </div>
  );
}

export function JobsPage({ go, onAuth, split = false, selectedJob = null }: JobsPageProps) {
  // Filtered views (/jobs?country=…) all point their canonical at /jobs.
  useSeo({ ...SEO_META.jobs, path: '/jobs', ogImage: 'https://madevisa.com/api/og/page?p=jobs' });

  const initial = useMemo(() => new URLSearchParams(window.location.search), []);

  const [search, setSearch] = useState(initial.get('q') ?? '');
  // The box shows every key at once; the list follows a moment later (the filtering waits for a pause in typing).
  const deferredSearch = useDeferredValue(search);
  const [country, setCountry] = useState(initial.get('country') ?? 'All countries');
  const [category, setCategory] = useState(() => asCategoryValue(initial.get('category')));
  const [jobType, setJobType] = useState(initial.get('type') ?? 'All types');
  const [remoteOnly, setRemoteOnly] = useState(initial.get('remote') === '1');
  // Quick switch: remote OR hybrid jobs.
  const [flexOnly, setFlexOnly] = useState(initial.get('flex') === '1');
  const [city, setCity] = useState(initial.get('city') ?? '');
  const [company, setCompany] = useState(initial.get('company') ?? '');
  const [salaryOnly, setSalaryOnly] = useState(initial.get('salary') === '1');
  const [experienceLevel, setExperienceLevel] = useState(initial.get('level') ?? 'All levels');
  const [datePosted, setDatePosted] = useState<DatePostedOption>(() => asDateOption(initial.get('posted')));
  const [sortBy, setSortBy] = useState<SortOption>((initial.get('sort') as SortOption) ?? 'newest');
  // "Direct from companies": only listings the company posted on MadeVisa itself.
  const [directOnly, setDirectOnly] = useState(initial.get('direct') === '1');
  // Quick filters: student / intern / apprentice roles, and roles offering visa sponsorship.
  const [studentOnly, setStudentOnly] = useState(initial.get('students') === '1');
  const [visaOnly, setVisaOnly] = useState(initial.get('visa') === '1');
  const [showFilters, setShowFilters] = useState(false);
  // Recent searches on this device, read once (they don't jump around while typing).
  const [recent] = useState(readRecent);
  // Back from a job (phones): the same number of jobs, then the same scroll position.
  const [place] = useState(readListPlace);
  const [visibleCount, setVisibleCount] = useState(() => Math.max(PAGE_SIZE, place?.count ?? 0));
  const [loadingMore, setLoadingMore] = useState(false);

  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);
  // The newest jobs: one small request (or this device's copy from the last few minutes), shown at once.
  const [quickJobs, setQuickJobs] = useState<Job[]>(() => readQuickCopy() ?? []);
  const [loadingQuick, setLoadingQuick] = useState(() => !readQuickCopy());
  // Every job: loaded when someone searches, filters, goes past the newest ones, or already has a copy.
  const [fullJobs, setFullJobs] = useState<Job[] | null>(lastFullJobs);
  const [loadingFull, setLoadingFull] = useState(false);
  const { session, loading: authLoading } = useAuth();

  useEffect(() => {
    let cancelled = false;
    fetchArbeitnowJobs(20).then((results) => {
      if (!cancelled) {
        setLiveJobs(results);
        setLoadingLive(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (quickJobs.length) return;
    let cancelled = false;
    fetchNewestDiverseJobs(PAGE_SIZE * 3).then((rows) => {
      if (cancelled) return;
      writeQuickCopy(rows);
      setQuickJobs(rows.map(toBoard));
      setLoadingQuick(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasQuery = Boolean(
    search.trim() || country !== 'All countries' || category !== 'All categories' || jobType !== 'All types' || remoteOnly || flexOnly || city || company || salaryOnly ||
      experienceLevel !== 'All levels' || datePosted !== 'Any time' || directOnly || studentOnly || visaOnly,
  );
  // The full list is ~70k jobs (megabytes, seconds of phone CPU), so it loads only when it's needed.
  // Once loaded it stays (clearing a search doesn't reload).
  const [wantFull, setWantFull] = useState(false);
  useEffect(() => {
    if (session || visibleCount > quickJobs.length) setWantFull(true);
  }, [session, visibleCount, quickJobs.length]);
  useEffect(() => {
    let alive = true;
    hasSavedJobList().then((saved) => alive && saved && setWantFull(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!wantFull) return;
    let cancelled = false;
    setLoadingFull(true);
    // Arriving jobs are worked in behind typing and scrolling (startTransition), never in front of them.
    let latest = 0;
    const show = async (rows: SponsoredJob[]) => {
      if (cancelled || !rows.length) return;
      const n = ++latest;
      const list = await toBoardInSlices(rows, () => !cancelled && n === latest);
      if (!list) return;
      lastFullJobs = list;
      startTransition(() => setFullJobs(list));
    };
    fetchPublishedSponsoredJobs({ onPartial: (rows) => void show(rows) }).then(async (rows) => {
      await show(rows);
      if (!cancelled) setLoadingFull(false);
    });
    return () => {
      cancelled = true;
    };
  }, [wantFull]);

  // The newest jobs stay where they are when the full list arrives (no jump), the rest follow.
  const quickIds = useMemo(() => new Set(quickJobs.map((j) => j.id)), [quickJobs]);
  const sponsoredJobs = useMemo(() => (fullJobs ? [...quickJobs, ...fullJobs.filter((j) => !quickIds.has(j.id))] : quickJobs), [quickJobs, fullJobs, quickIds]);
  const loadingSponsored = loadingQuick && !fullJobs;
  // A search is answered by the server at once (every live job matching it); the full list,
  // when it arrives, adds nothing new for that search but keeps every other filter instant.
  const searchKey = deferredSearch.trim().toLowerCase();
  const [serverHits, setServerHits] = useState<{ q: string; jobs: Job[] } | null>(null);
  useEffect(() => {
    if (searchKey.length < 2) return;
    let alive = true;
    void searchPublishedJobs(searchKey).then((rows) => alive && startTransition(() => setServerHits({ q: searchKey, jobs: rows.map(toBoard) })));
    return () => {
      alive = false;
    };
  }, [searchKey]);
  // A slow connection: after 12 s with nothing found, say so instead of showing placeholders for ever.
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  useEffect(() => {
    setGaveUpWaiting(false);
    const t = window.setTimeout(() => setGaveUpWaiting(true), 12_000);
    return () => window.clearTimeout(t);
  }, [searchKey, country, category, datePosted, visaOnly, flexOnly, remoteOnly, studentOnly]);
  const searchBusy = searchKey.length >= 2 && serverHits?.q !== searchKey && (!fullJobs || loadingFull);
  // Filters are answered by the server too: every live job in that country / category / window,
  // not just the ones this page had loaded.
  const filtersOn = country !== 'All countries' || category !== ALL_CATEGORIES || datePosted !== 'Any time' || visaOnly || flexOnly || remoteOnly || studentOnly;
  const filterKey = filtersOn ? JSON.stringify([country, category, datePosted, visaOnly, flexOnly, remoteOnly, studentOnly]) : '';
  const [serverFiltered, setServerFiltered] = useState<{ key: string; jobs: Job[]; more: boolean } | null>(null);
  const filterArgs = () => ({
    country: country !== 'All countries' ? country : null,
    categoryTerms: category !== ALL_CATEGORIES ? categorySearchTerms(category) : null,
    sinceDays: datePosted !== 'Any time' ? WINDOW_DAYS[datePosted] : null,
    visa: visaOnly,
    flex: flexOnly,
    remote: remoteOnly,
    students: studentOnly,
  });
  useEffect(() => {
    if (!filterKey) return;
    let alive = true;
    void fetchFilteredJobs(filterArgs(), FILTER_PAGE).then(
      (rows) => alive && startTransition(() => setServerFiltered({ key: filterKey, jobs: rows.map(toBoard), more: rows.length === FILTER_PAGE })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  // "Show more jobs" near the end of what the server sent: the next page of the same filters.
  const [loadingFilterPage, setLoadingFilterPage] = useState(false);
  const loadNextFilterPage = () => {
    const cur = serverFiltered;
    if (!cur || cur.key !== filterKey || !cur.more || loadingFilterPage) return;
    setLoadingFilterPage(true);
    void fetchFilteredJobs(filterArgs(), FILTER_PAGE, cur.jobs.length).then((rows) => {
      setLoadingFilterPage(false);
      setServerFiltered((now) => (now && now.key === cur.key ? { key: now.key, jobs: [...now.jobs, ...rows.map(toBoard)], more: rows.length === FILTER_PAGE } : now));
    });
  };
  const filterBusy = Boolean(filterKey) && serverFiltered?.key !== filterKey && !gaveUpWaiting;
  const baseJobs = useMemo(() => [...sponsoredJobs, ...liveJobs], [liveJobs, sponsoredJobs]);
  const baseIds = useMemo(() => new Set(sponsoredJobs.map((j) => j.id)), [sponsoredJobs]);
  const extraJobs = useMemo(() => {
    const extra: Job[] = [];
    const seen = new Set(baseIds);
    const add = (list: Job[]) => {
      for (const j of list) {
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        extra.push(j);
      }
    };
    if (serverHits && serverHits.q === searchKey) add(serverHits.jobs);
    if (serverFiltered && serverFiltered.key === filterKey) add(serverFiltered.jobs);
    return extra;
  }, [serverHits, searchKey, serverFiltered, filterKey, baseIds]);
  // Unchanged (same array) when the server found nothing the page didn't already have: no re-sorting.
  const allJobs = useMemo(() => (extraJobs.length ? [...sponsoredJobs, ...extraJobs, ...liveJobs] : baseJobs), [extraJobs, baseJobs, sponsoredJobs, liveJobs]);
  // OR, not AND: sponsored jobs and the live feed are two independent
  // fetches that resolve at different times (sponsored now paginates
  // past Supabase's 1000-row cap, so it can genuinely take longer than
  // the live feed). With AND, as soon as the faster one finished while
  // the other was still in flight, `loading` flipped to false too
  // early — showing "No jobs found" for a moment before the slower
  // fetch's results actually arrived. Staying "loading" until BOTH are
  // done (or something has already arrived to show) fixes that flash.
  // Wait for MadeVisa's own newest jobs, so the outside feed never shows first and then jumps down.
  const loading = loadingSponsored || (loadingLive && allJobs.length === 0);
  // "+12 new jobs added" while they're on the page (newest list only; a search has its own results).
  const newJobs = useNewJobsSince(!hasQuery && !loading);
  const [refreshing, setRefreshing] = useState(false);
  /** Jobs added by the "+N new jobs" notice, in the order they go at the top. */
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const freshSet = useMemo(() => new Set(freshIds), [freshIds]);
  const showNewJobs = () => {
    if (refreshing) return;
    setRefreshing(true);
    // Exactly the jobs the notice counted, newest first, at the top of the list.
    void fetchJobsAddedSince(newJobs.since, { limit: 100 }).then((rows) => {
      setRefreshing(false);
      if (rows.length) {
        const fresh = rows.map(toBoard);
        const ids = new Set(fresh.map((j) => j.id));
        setFreshIds((before) => [...fresh.map((j) => j.id), ...before.filter((id) => !ids.has(id))]);
        setQuickJobs((before) => [...fresh, ...before.filter((j) => !ids.has(j.id))]);
      }
      newJobs.reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const cityOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.city).filter(Boolean))).sort(), [allJobs]);
  const companyOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.company).filter(Boolean))).sort(), [allJobs]);
  // Unlike cityOptions/companyOptions above, this used to come from the
  // small hardcoded `countries` list (the same one behind the pill
  // row) rather than the actual job data — so as soon as jobs existed
  // in a country outside that curated set (India, Singapore, etc. —
  // already true today), there was no way to filter by them even
  // though their jobs were right there on the page. Deriving it from
  // allJobs, same as the other two, fixes that.
  const experienceLevelOptions = useMemo(
    () => Array.from(new Set(allJobs.map((j) => experienceBucket(j.experienceLevel)).filter((v): v is string => Boolean(v)))).sort(),
    [allJobs]
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (country !== 'All countries') params.set('country', country);
    if (category !== 'All categories') params.set('category', category);
    if (jobType !== 'All types') params.set('type', jobType);
    if (remoteOnly) params.set('remote', '1');
    if (flexOnly) params.set('flex', '1');
    if (city) params.set('city', city);
    if (company) params.set('company', company);
    if (salaryOnly) params.set('salary', '1');
    if (experienceLevel !== 'All levels') params.set('level', experienceLevel);
    if (datePosted !== 'Any time') params.set('posted', datePosted);
    if (sortBy !== 'newest') params.set('sort', sortBy);
    if (directOnly) params.set('direct', '1');
    if (studentOnly) params.set('students', '1');
    if (visaOnly) params.set('visa', '1');

    const query = params.toString();
    // A job popup is open over the list: its address stays in the URL bar.
    if (window.location.pathname !== '/jobs') return;
    window.history.replaceState({}, '', query ? `/jobs?${query}` : '/jobs');
  }, [search, country, category, jobType, remoteOnly, flexOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy, directOnly, studentOnly, visaOnly]);

  const firstFilterRun = useRef(true);
  useEffect(() => {
    // Not on arrival: a list restored after Back keeps its length.
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    setVisibleCount(PAGE_SIZE);
  }, [search, country, category, jobType, remoteOnly, flexOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy, directOnly, studentOnly, visaOnly]);

  const directJobs = useMemo(() => allJobs.filter((j) => j.sourceType === 'company_submitted'), [allJobs]);
  // Only employment types that actually have jobs (no empty "Contract / Freelance").
  const jobTypeOptions = useMemo(() => {
    const present = new Set(allJobs.map((j) => j.type).filter(isMeaningfulJobType));
    return ['All types', ...jobTypes.filter((t) => t !== 'All types' && present.has(t))];
  }, [allJobs]);
  // Viewed jobs as of this page load — so opening a job and coming back
  // doesn't reshuffle the list under the person's thumb.
  const viewedAtLoad = useMemo(() => {
    const seen = viewedJobIds();
    return new Set(allJobs.filter((j) => seen.has(j.id)).map((j) => j.id));
  }, [allJobs]);
  const shownBefore = useMemo(() => recentlyShownIds('jobs'), []);

  // Each job's category (from its title / department) — computed once per list.
  const catOf = useMemo(() => {
    const m = new Map<string, JobCategory | null>();
    for (const j of allJobs) m.set(j.id, meta(j).cat);
    return m;
  }, [allJobs]);
  // Newest first, worked out once per list: every search and filter keeps this order.
  const newestAll = useMemo(() => sortNewestFirst(allJobs), [allJobs]);

  // Every filter except the category — so the category list can show how
  // many jobs each category has with the other filters applied.
  const baseMatched = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    const normalizedCity = city.trim().toLowerCase();
    const normalizedCompany = company.trim().toLowerCase();

    const now = Date.now();
    const maxAge = WINDOW_DAYS[datePosted] * DAY_MS;
    return newestAll.filter((job) => {
      const m = meta(job);
      const matchesSearch = !normalizedSearch || m.hay.includes(normalizedSearch);
      const inWindow = m.posted ? now - m.posted <= maxAge : datePosted === 'Any time';

      return (
        inWindow &&
        (!directOnly || job.sourceType === 'company_submitted') &&
        (!studentOnly || isStudentOrInternJob(job)) &&
        (!visaOnly || Boolean(job.visaSponsorship)) &&
        matchesSearch &&
        (country === 'All countries' || job.country === country) &&
        (jobType === 'All types' || job.type === jobType) &&
        (!remoteOnly || job.remote) &&
        (!flexOnly || job.remote || job.workArrangement === 'remote' || job.workArrangement === 'hybrid') &&
        (!normalizedCity || job.city.toLowerCase().includes(normalizedCity)) &&
        (!normalizedCompany || job.company.toLowerCase().includes(normalizedCompany)) &&
        (!salaryOnly || Boolean(job.salary)) &&
        (experienceLevel === 'All levels' || experienceBucket(job.experienceLevel) === experienceLevel)
      );
    });
  }, [newestAll, deferredSearch, country, jobType, remoteOnly, flexOnly, city, company, salaryOnly, experienceLevel, datePosted, directOnly, studentOnly, visaOnly]);


  // A single category (e.g. Blockchain Developer) may have only a few jobs:
  // after them, the rest of its group (Software & IT) follows, newest first.
  const { filteredJobs, relatedStart, relatedGroup } = useMemo(() => {
    const main = buildMainList();
    if (category === ALL_CATEGORIES || category.startsWith('group:')) return { filteredJobs: main, relatedStart: -1, relatedGroup: '' };
    const group = categoryGroup(category) ?? '';
    const related = (baseMatched.filter((j) => {
      const c = catOf.get(j.id);
      return Boolean(c && c.group === group && c.label !== category) && !j.closed;
    }));
    return { filteredJobs: [...main, ...related], relatedStart: related.length ? main.length : -1, relatedGroup: group };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMatched, catOf, category, sortBy, shownBefore, viewedAtLoad, hasQuery, quickIds, freshIds]);

  function buildMainList(): Job[] {
    let matched = category === ALL_CATEGORIES ? baseMatched : baseMatched.filter((j) => categoryMatches(catOf.get(j.id) ?? null, category));
    // Nothing searched: the newest jobs shown first stay first when more jobs arrive (no jump).
    if (!hasQuery && quickIds.size) {
      // Jobs just added by the "+N new jobs" notice come first, newest first.
      const freshRank = new Map(freshIds.map((id, i) => [id, i]));
      const fresh = matched.filter((j) => freshRank.has(j.id)).sort((a, b) => freshRank.get(a.id)! - freshRank.get(b.id)!);
      if (fresh.length) matched = matched.filter((j) => !freshRank.has(j.id));
      const first = [...fresh, ...matched.filter((j) => quickIds.has(j.id))];
      const rest = matched.filter((j) => !quickIds.has(j.id));
      if (sortBy === 'newest') return withClosedLast([...first, ...rest]);
      if (fresh.length) return withClosedLast([...fresh, ...interleaveByCompany(visitShuffle(first.slice(fresh.length), 'relevant')), ...interleaveByCompany(visitShuffle(rest, 'relevant'))]);
      return withClosedLast([...interleaveByCompany(visitShuffle(first, 'relevant')), ...interleaveByCompany(visitShuffle(rest, 'relevant'))]);
    }
    if (sortBy === 'newest') return withClosedLast(matched);
    // "Most relevant": a different mix each visit — shuffled, jobs shown at
    // the top last time and jobs already opened go further down, spread
    // across companies.
    return withClosedLast(
      interleaveByCompany(
        moveToBack(
          moveToBack(visitShuffle(matched, 'relevant'), (j) => shownBefore.has(j.id)),
          (j) => viewedAtLoad.has(j.id)
        )
      )
    );
  }

  // Remember what led the list this visit, so next visit leads with other jobs.
  const unfiltered = !search && country === 'All countries' && category === 'All categories' && !studentOnly && !visaOnly && !directOnly;
  useEffect(() => {
    if (unfiltered && !loadingSponsored) rememberShown('jobs', filteredJobs.slice(0, PAGE_SIZE).map((j) => j.id));
  }, [unfiltered, loadingSponsored, filteredJobs]);

  const visibleJobs = filteredJobs.slice(0, visibleCount);

  // Phones open a job in this tab: remember the spot, and go back to it on return.
  const saveListPlace = () => {
    try {
      sessionStorage.setItem(LIST_KEY, JSON.stringify({ url: window.location.pathname + window.location.search, y: window.scrollY, count: visibleCount, at: Date.now() } satisfies ListPlace));
    } catch {
      /* fine */
    }
  };
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !place || loading || visibleJobs.length < Math.min(place.count, filteredJobs.length)) return;
    restored.current = true;
    window.scrollTo(0, place.y);
    try {
      sessionStorage.removeItem(LIST_KEY);
    } catch {
      /* fine */
    }
  });
  const hasMore = visibleCount < filteredJobs.length || (!fullJobs && !hasQuery) || Boolean(filterKey && serverFiltered?.key === filterKey && serverFiltered.more);

  // Free accounts are made right here, in a dialog (job alerts).
  const [authOpen, setAuthOpen] = useState<false | 'login' | 'register'>(false);
  // Sign up / sign in here, on the list: they stay where they were.
  const openAuth = (p: 'login' | 'register' = 'register') => setAuthOpen(p);
  // Desktop split view: the job in the right-hand pane — the one picked, else the first on the list.
  const pick = split ? pickJob : undefined;
  const firstSlug = useMemo(() => {
    const first = filteredJobs.find((j) => j.sourceType !== 'live_feed');
    return first ? slugOf(first) : null;
  }, [filteredJobs]);
  const activeSlug = split ? (selectedJob ?? firstSlug) : null;
  // Every job is open to everyone; an outside listing picked while signed out asks for a free account first.
  const onLocked = !authLoading && !session ? () => setAuthOpen('register') : undefined;
  // Signed out: the first jobs of any search, the rest after a free account.
  const guest = !authLoading && !session;
  // Free users (and guests): some jobs and companies in the list are blurred, members-only.
  const membership = useMembership();
  const free = membership.ready && !membership.member;
  const terms = useMemo(() => lockTerms(searchKey), [searchKey]);
  const [membersOnly, setMembersOnly] = useState<Job | null>(null);

  // Everyone sees every job: the next page, from the full list (loading it first when needed).
  // Placeholders only while something is really on its way: a search being answered, or (no search) the full list.
  const waitingForMore = visibleCount > filteredJobs.length && (loadingFilterPage || (deferredSearch.trim().length >= 2 ? searchBusy : loadingFull));
  const handleShowMore = () => {
    // Close to the end of the filtered jobs the server has sent: ask for the next page.
    if (visibleCount + PAGE_SIZE * 2 >= filteredJobs.length) loadNextFilterPage();
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 250);
  };

  // What was searched, and how many jobs matched: the membership card's headline ("1,240 more hotel jobs").
  useEffect(() => {
    const q = search.trim() || (category !== ALL_CATEGORIES && !category.startsWith('group:') ? category : '');
    if (!q || loadingFull) return;
    const t = window.setTimeout(() => rememberSearch(q, filteredJobs.length), 600);
    return () => window.clearTimeout(t);
  }, [search, category, filteredJobs.length, loadingFull]);
  // What they typed (once they stop typing and it found jobs): a "For you" chip next visit.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || loadingFull || !filteredJobs.length) return;
    const t = window.setTimeout(() => rememberRecent(q, country !== 'All countries' ? country : null), 1800);
    return () => window.clearTimeout(t);
  }, [search, country, filteredJobs.length, loadingFull]);

  // ---- Hero filters: Date posted · Country · Category ----
  // No counts on filters: every option is offered, and the server answers it.
  const dateOptions = useMemo<ComboOption[]>(() => DATE_POSTED_OPTIONS.filter((o) => o !== 'Any time').map((o) => ({ value: o, label: o })), []);

  const facets = useJobFacets();

  const countryComboOptions = useMemo<ComboOption[]>(() => {
    // Countries that have jobs (the daily list, busiest first) — no counts shown. Without it, every country A–Z.
    const opts: ComboOption[] = facets && facets.countries.length
      ? facets.countries.map((c) => ({ value: c.name, label: c.name, flag: c.iso || undefined }))
      : allCountries.map((c) => ({ value: c.name, label: c.name, flag: c.code })).sort((x, y) => x.label.localeCompare(y.label));
    if (country !== 'All countries' && !opts.some((o) => o.value === country)) opts.unshift({ value: country, label: country });
    return opts;
  }, [facets, country]);

  // Every category, no counts (the server is asked for the picked one).
  const categoryComboOptions = useMemo<ComboOption[]>(() => CATEGORIES_BY_GROUP.flatMap(({ group, labels }) => labels.map((l) => ({ value: l, label: l, group }))), []);


  const activeFilterCount =
    Number(country !== 'All countries') +
    Number(category !== 'All categories') +
    Number(jobType !== 'All types') +
    Number(remoteOnly) +
    Number(flexOnly) +
    Number(Boolean(city)) +
    Number(Boolean(company)) +
    Number(salaryOnly) +
    Number(experienceLevel !== 'All levels') +
    Number(datePosted !== 'Any time') +
    Number(directOnly) +
    Number(studentOnly) +
    Number(visaOnly);

  // Chip list for the "active filters" row under the category strip —
  // each one clears just that one filter, not everything (clearAllFilters below still does that for the "Clear all" button).
  const activeFilters: { key: string; label: string; onClear: () => void }[] = [
    country !== 'All countries' ? { key: 'country', label: country, onClear: () => setCountry('All countries') } : null,
    category !== ALL_CATEGORIES ? { key: 'category', label: categoryValueLabel(category), onClear: () => setCategory(ALL_CATEGORIES) } : null,
    jobType !== 'All types' ? { key: 'type', label: jobType, onClear: () => setJobType('All types') } : null,
    remoteOnly ? { key: 'remote', label: 'Remote only', onClear: () => setRemoteOnly(false) } : null,
    flexOnly ? { key: 'flex', label: 'Remote / hybrid', onClear: () => setFlexOnly(false) } : null,
    city ? { key: 'city', label: `City: ${city}`, onClear: () => setCity('') } : null,
    company ? { key: 'company', label: `Company: ${company}`, onClear: () => setCompany('') } : null,
    salaryOnly ? { key: 'salary', label: 'Salary listed', onClear: () => setSalaryOnly(false) } : null,
    experienceLevel !== 'All levels' ? { key: 'level', label: experienceLevel, onClear: () => setExperienceLevel('All levels') } : null,
    datePosted !== 'Any time' ? { key: 'posted', label: datePosted, onClear: () => setDatePosted('Any time') } : null,
    directOnly ? { key: 'direct', label: 'Direct from companies', onClear: () => setDirectOnly(false) } : null,
    studentOnly ? { key: 'students', label: 'Students & interns', onClear: () => setStudentOnly(false) } : null,
    visaOnly ? { key: 'visa', label: 'Visa sponsorship', onClear: () => setVisaOnly(false) } : null,
  ].filter((f): f is { key: string; label: string; onClear: () => void } => f !== null);

  const clearAllFilters = () => {
    setCountry('All countries');
    setCategory('All categories');
    setJobType('All types');
    setRemoteOnly(false);
    setFlexOnly(false);
    setCity('');
    setCompany('');
    setSalaryOnly(false);
    setExperienceLevel('All levels');
    setDatePosted('Any time');
    setDirectOnly(false);
    setStudentOnly(false);
    setVisaOnly(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader
        go={go}
        onAuth={onAuth}
        active="jobs"
        search={
          <div className="flex h-10 items-center gap-2.5 rounded-md bg-ink-100 px-3 ring-1 ring-inset ring-transparent transition focus-within:bg-white focus-within:ring-brand-500">
            <Search className="h-4 w-4 shrink-0 text-ink-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Job title, skill, company or city"
              aria-label="Search jobs"
              className="h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-ink-900 outline-none placeholder:text-ink-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="text-ink-400 hover:text-ink-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        }
      />

      {/* One slim row of filters (LinkedIn-style); everything else is under "All filters". */}
      <div className="border-b border-ink-200 bg-white">
        <div className={`mx-auto flex items-center gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-8 ${split ? 'max-w-[1360px]' : 'max-w-5xl'}`}>
          <FilterCombo tone="pill" label="Date posted" icon={CalendarClock} value={datePosted} allValue="Any time" allLabel="Any time" options={dateOptions} onChange={(v) => setDatePosted(asDateOption(v))} />
          <FilterCombo tone="pill" label="Country" icon={Globe2} value={country} allValue="All countries" allLabel="All countries" options={countryComboOptions} onChange={setCountry} searchable searchPlaceholder="Search countries" />
          <FilterCombo
            tone="pill"
            label="Category"
            icon={LayoutGrid}
            value={category}
            allValue={ALL_CATEGORIES}
            allLabel={ALL_CATEGORIES}
            options={categoryComboOptions}
            onChange={setCategory}
            searchable
            searchPlaceholder="Search categories, e.g. nurse, driver, data"
            groupValue={(g) => `group:${g}`}
            displayFor={categoryValueLabel}
          />
          <TogglePill on={visaOnly} onChange={setVisaOnly} label="Visa sponsorship" />
          <TogglePill on={flexOnly} onChange={setFlexOnly} label="Remote / hybrid" />
          <TogglePill on={studentOnly} onChange={setStudentOnly} label="Students" />
          {directJobs.length > 0 && <TogglePill on={directOnly} onChange={setDirectOnly} label="Direct from companies" />}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold text-ink-700 hover:bg-ink-100"
          >
            <SlidersHorizontal className="h-4 w-4" />
            All filters
            {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-700 px-1 text-[10px] text-white">{activeFilterCount}</span>}
          </button>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-ink-100 p-0.5 sm:ml-auto">
            {(['newest', 'relevant'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${sortBy === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
              >
                {k === 'newest' ? 'Newest' : 'Most relevant'}
              </button>
            ))}
          </div>
        </div>
        {recent.length > 0 && (
          <div className={`mx-auto flex items-center gap-2 overflow-x-auto px-5 pb-2.5 [scrollbar-width:none] sm:px-8 ${split ? 'max-w-[1360px]' : 'max-w-5xl'}`}>
            <span className="shrink-0 text-[12px] font-bold uppercase tracking-wide text-ink-400">For you</span>
            {recent.map((r) => (
              <button
                key={`${r.q}|${r.country ?? ''}`}
                type="button"
                onClick={() => {
                  setSearch(r.q);
                  if (r.country) setCountry(r.country);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-100 hover:bg-brand-100"
              >
                <HistoryIcon className="h-3.5 w-3.5" aria-hidden />
                {r.q}
                {r.country ? <span className="font-medium text-brand-600">· {r.country}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {showFilters && (
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <PersonalizationBar tone="light" variant="location" />
            </div>
            {/* Mobile: Date posted · Country · Category live here instead of the blue bar */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:hidden">
            <FilterCombo
              tone="light"
              label="Date posted"
              icon={CalendarClock}
              value={datePosted}
              allValue="Any time"
              allLabel="Any time"
              options={dateOptions}
              onChange={(v) => setDatePosted(asDateOption(v))}
            />
            <FilterCombo
              tone="light"
              label="Country"
              icon={Globe2}
              value={country}
              allValue="All countries"
              allLabel="All countries"
              options={countryComboOptions}
              onChange={setCountry}
              searchable
              searchPlaceholder="Search countries"
            />
            <FilterCombo
              tone="light"
              label="Category"
              icon={LayoutGrid}
              value={category}
              allValue={ALL_CATEGORIES}
              allLabel={ALL_CATEGORIES}
              options={categoryComboOptions}
              onChange={setCategory}
              searchable
              searchPlaceholder="Search categories, e.g. nurse, driver, data"
              groupValue={(g) => `group:${g}`}
              displayFor={categoryValueLabel}
              align="right"
              className="col-span-2"
            />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="City" value={city} onChange={setCity} placeholder={cityOptions.slice(0, 3).join(', ') || 'Any city'} />
              <SelectField label="Employment type" value={jobType} options={jobTypeOptions} onChange={setJobType} />
              <TextField label="Company" value={company} onChange={setCompany} placeholder={companyOptions.slice(0, 3).join(', ') || 'Any company'} />
              {experienceLevelOptions.length > 0 && (
                <SelectField label="Experience level" value={experienceLevel} options={['All levels', ...experienceLevelOptions]} onChange={setExperienceLevel} />
              )}

              <SelectField
                label="Remote"
                value={remoteOnly ? 'Remote only' : 'Any'}
                options={['Any', 'Remote only']}
                onChange={(v) => setRemoteOnly(v === 'Remote only')}
              />

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Salary</label>
                <button
                  type="button"
                  onClick={() => setSalaryOnly((v) => !v)}
                  className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-left text-sm font-medium transition ${
                    salaryOnly ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-white text-ink-700 hover:border-brand-400'
                  }`}
                >
                  Salary listed only
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Students</label>
                <button
                  type="button"
                  onClick={() => setStudentOnly((v) => !v)}
                  className={`flex h-10 w-full items-center gap-2 rounded-md border px-3 text-left text-sm font-medium transition ${
                    studentOnly ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-white text-ink-700 hover:border-brand-400'
                  }`}
                >
                  <GraduationCap className="h-4 w-4" />
                  Students &amp; interns only
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visa</label>
                <button
                  type="button"
                  onClick={() => setVisaOnly((v) => !v)}
                  className={`flex h-10 w-full items-center gap-2 rounded-md border px-3 text-left text-sm font-medium transition ${
                    visaOnly ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-white text-ink-700 hover:border-brand-400'
                  }`}
                >
                  <Plane className="h-4 w-4" />
                  Visa sponsorship only
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              {activeFilterCount > 0 ? (
                <button type="button" onClick={clearAllFilters} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Clear all filters
                </button>
              ) : (
                <span className="hidden text-xs text-ink-400 sm:inline">Date posted, country and category are in the blue bar above.</span>
              )}
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                <ChevronUp className="h-4 w-4" />
                Close filters
              </button>
            </div>
          </div>
        </section>
      )}

      <main className={`mx-auto px-5 py-5 sm:px-8 ${split ? 'max-w-[1360px]' : 'max-w-5xl'}`}>
        {activeFilters.length > 0 && (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.onClear}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                {f.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={clearAllFilters} className="text-xs font-semibold text-ink-400 hover:text-ink-600">
              Clear all
            </button>
          </div>
        )}

        {loading ? (
          <>
            <LoadingLatest />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : filterBusy || (filteredJobs.length === 0 && (searchBusy || (loadingFull && !gaveUpWaiting))) ? (
          <>
            <LoadingLatest found={filteredJobs.length} />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : filteredJobs.length === 0 ? (
          <div className="mt-6 border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No jobs found</h3>
            <p className="mt-2 text-sm text-ink-500">Try changing your search or filters — or get the first match by email.</p>
            <AlertSignup className="mx-auto mt-5 max-w-xl text-left" keywords={search || (category !== ALL_CATEGORIES && !category.startsWith('group:') ? category : '')} country={country} onAuth={openAuth} />
            <button
              type="button"
              onClick={() => {
                setSearch('');
                clearAllFilters();
              }}
              className="mt-5 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className={split ? 'mt-3 grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start gap-5' : ''}>
          <div className="min-w-0">
            {!guest && !directOnly && activeFilterCount === 0 && !search && directJobs.length > 0 && (
              <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                      <BadgeCheck className="h-4 w-4 text-emerald-600" />
                      Posted directly on MadeVisa
                    </h3>
                  </div>
                  {directJobs.length > 2 && (
                    <button type="button" onClick={() => setDirectOnly(true)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                      See all {directJobs.length} →
                    </button>
                  )}
                </div>
                <div className={`mt-3 grid grid-cols-1 gap-4 ${split ? '' : 'lg:grid-cols-2'}`}>
                  {directJobs.slice(0, 2).map((job) => (
                    <JobCard key={`direct-${job.id}`} job={job} onLocked={onLocked} onOpen={saveListPlace} onPick={pick} active={slugOf(job) === activeSlug} />
                  ))}
                </div>
              </div>
            )}
            {newJobs.added > 0 && !hasQuery && (
              <button
                type="button"
                onClick={showNewJobs}
                className="sticky top-[72px] z-10 mx-auto mb-3 mt-1 flex w-fit items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-[13.5px] font-bold text-white shadow-lg hover:bg-brand-700"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}+{newJobs.added.toLocaleString('en-US')} new {newJobs.added === 1 ? 'job' : 'jobs'} added
              </button>
            )}
            <SearchStatus
              busy={Boolean(searchBusy || filterBusy || loadingFilterPage || (hasQuery && loadingFull))}
              found={filteredJobs.length}
              more={Boolean(filterKey && serverFiltered?.key === filterKey && serverFiltered.more)}
              filtered={hasQuery}
            />
            <div className={`grid grid-cols-1 gap-4 ${split ? '' : 'mt-4 lg:grid-cols-2'}`}>
              {(guest ? visibleJobs.slice(0, GUEST_JOBS) : visibleJobs).map((job, i) => (
                <Fragment key={job.id}>
                  {i === 6 && !split && (
                    <div className="lg:col-span-2">
                      <CareerOutlook placement="jobs" compact />
                    </div>
                  )}
                  {i === relatedStart && (
                    <div className="mt-2 border-t border-ink-200 pt-5 lg:col-span-2">
                      <p className="text-sm font-bold text-ink-900">More {relatedGroup} jobs</p>
                    </div>
                  )}
                  <JobCard job={job} onLocked={onLocked} onOpen={saveListPlace} onPick={pick} active={slugOf(job) === activeSlug} fresh={freshSet.has(job.id)} lock={free ? cardLock(job, i, terms) : null} onMembersOnly={setMembersOnly} />
                </Fragment>
              ))}
              {(loadingMore || waitingForMore) && Array.from({ length: 2 }).map((_, i) => <JobCardSkeleton key={`more-${i}`} />)}
            </div>

            {guest && filteredJobs.length > GUEST_JOBS && (
              // Signed out: two jobs, then a glimpse of the rest behind a sign-up card.
              <div className="relative mt-4">
                <div aria-hidden className={`pointer-events-none grid select-none grid-cols-1 gap-4 blur-[5px] ${split ? '' : 'lg:grid-cols-2'}`}>
                  {filteredJobs.slice(GUEST_JOBS, GUEST_JOBS + (split ? 2 : 4)).map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-[#f8fafc]/40 via-[#f8fafc]/80 to-[#f8fafc] pt-10">
                  <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl ring-1 ring-ink-200">
                    <p className="text-[19px] font-bold tracking-tight text-ink-950">Explore every job</p>
                    <p className="mt-1 text-[14px] text-ink-500">Free account · no password</p>
                    <button type="button" onClick={() => setAuthOpen('register')} className="mt-4 w-full rounded-full bg-ink-950 px-5 py-3 text-sm font-bold text-white hover:bg-ink-800">
                      Create free account
                    </button>
                    <button type="button" onClick={() => setAuthOpen('login')} className="mt-2 w-full rounded-full px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                      Sign in
                    </button>
                  </div>
                </div>
              </div>
            )}

            {hasMore && !guest && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleShowMore}
                  disabled={loadingMore || waitingForMore}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-7 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-70 sm:w-auto"
                >
                  {loadingMore || waitingForMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>
                      Show more jobs
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            <AlertSignup className="mt-6" keywords={search || (category !== ALL_CATEGORIES && !category.startsWith('group:') ? category : '')} country={country} onAuth={openAuth} />
          </div>
          {split && activeSlug && <JobPane slug={activeSlug} picked={Boolean(selectedJob)} go={go} onAuth={onAuth} />}
          </div>
        )}

        {/* CV match invite and your best matches: below the jobs, not in the way. */}
        <TopMatchesStrip className="mt-10" />
        <CvPrompt className="mt-6" />
        <p className="mt-10 text-[13px] font-semibold text-ink-500">From public company career pages · re-checked daily · only jobs from the last 30 days</p>
      </main>

      <AuthDialog open={Boolean(authOpen)} initial={authOpen || 'register'} onClose={() => setAuthOpen(false)} />
      {membersOnly && <Paywall job={{ title: membersOnly.title, company: membersOnly.company }} onClose={() => setMembersOnly(null)} source="jobs_locked" />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

/** A job's address without the "/jobs/" prefix (how App names the picked job). */
function slugOf(job: Job): string {
  return jobPath(job).slice('/jobs/'.length);
}

/** Desktop: the picked job, beside the list. Scrolls on its own; the list keeps its place. */
function JobPane({ slug, picked, go, onAuth }: { slug: string; picked: boolean; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: 0 });
  }, [slug]);
  return (
    <aside aria-label="Job" className="sticky top-[88px] h-[calc(100dvh-104px)] overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-ink-200">
      <div ref={box} className="job-modal-scroll h-full overflow-y-auto overscroll-contain">
        <JobDetailPage key={slug} id={slug} go={go} onAuth={onAuth} embedded pane seo={picked} />
      </div>
    </aside>
  );
}
