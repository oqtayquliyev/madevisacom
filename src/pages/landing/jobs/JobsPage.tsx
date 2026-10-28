import { JobAgeBadge } from '@/components/common/JobAgeBadge';
import { NEW_TAB } from '@/lib/navLink';
import { AlertSignup } from '@/components/jobs/AlertSignup';
import { Fragment, startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Globe2,
  LayoutGrid,
  GraduationCap,
  Home,
  Loader2,
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
import { CATEGORIES_BY_GROUP, categoryGroup, categoryMatches, categoryValueLabel, classifyJob, type JobCategory } from '@/lib/jobTaxonomy';
import { FilterCombo, type ComboOption } from '@/components/jobs/FilterCombo';
import { moveToBack, recentlyShownIds, rememberShown, visitShuffle } from '@/lib/feedRotation';
import { useAuth } from '@/lib/auth';
import { fetchArbeitnowJobs } from '@/data/sources/arbeitnow';
import { JobSignals } from '@/components/jobs/JobSignals';
import { useJobFacets } from '@/lib/jobFacets';
import { fetchNewestDiverseJobs, fetchPublishedSponsoredJobs, hasSavedJobList, searchPublishedJobs, sponsoredJobToBoardJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { rememberSearch } from '@/lib/lastSearch';
import { useMembership } from '@/lib/plans';
import { Paywall } from '@/components/pro/Paywall';
import { isJobViewed, markJobViewed, viewedJobIds } from '@/lib/viewedJobs';
import { rememberJobPreview } from '@/lib/jobPreview';
import { nav } from '@/lib/pageLayout';
import { useSeo } from '@/lib/seo';
import { SEO_META } from '@/lib/seoMeta';
import { PersonalizationBar } from '@/components/opportunities/PersonalizationBar';
import { jobPath } from '@/lib/jobUrl';
import { experienceBucket } from '@/lib/jobText';
import { DirectListingBadge } from '@/components/common/DirectListingBadge';
import { NewCompanyBadge } from '@/components/common/NewCompanyBadge';
import { TitleChips } from '@/components/common/TitleChips';
import { AuthDialog } from '@/components/auth/AuthDialog';

type JobsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  /** Receives the job's public path (see jobPath in src/lib/jobUrl.ts). */
  /** No longer used: job cards open the job in a new tab. Kept so callers still compile. */
  goToJob?: (path: string) => void;
};

// MadeVisa only lists jobs posted in the last 30 days, so "Any time" = 30 days.
const MAX_AGE_DAYS = 30;
const DATE_POSTED_OPTIONS = ['Any time', 'Past 24 hours', 'Past 3 days', 'Past week', 'Past 2 weeks'] as const;
type DatePostedOption = (typeof DATE_POSTED_OPTIONS)[number];
const WINDOW_DAYS: Record<DatePostedOption, number> = { 'Any time': MAX_AGE_DAYS, 'Past 24 hours': 1, 'Past 3 days': 3, 'Past week': 7, 'Past 2 weeks': 14 };
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
/** Phones and tablets: a job opens in the same tab (a new tab means loading the whole site again). */
const sameTab = () => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
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

function LoadingLatest() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => Math.min(n + 1, LOADING_LINES.length - 1)), 1400);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="mt-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
        <Zap className="h-4 w-4 fill-amber-300 text-amber-400" aria-hidden />
        {LOADING_LINES[i]}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full w-1/3 animate-[mvslide_1.2s_ease-in-out_infinite] rounded-full bg-brand-600" />
      </div>
    </div>
  );
}

const PAGE_SIZE = 12;

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
function FilterSwitch({ on, onChange, icon: Icon, label }: { on: boolean; onChange: (v: boolean) => void; icon: typeof Plane; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="group flex items-center gap-2 text-xs font-semibold">
      <span className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors duration-200 ${on ? 'bg-[#1D4ED8]' : 'bg-ink-200 group-hover:bg-ink-300'}`}>
        <span className={`absolute left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-3.5' : ''}`} />
      </span>
      <Icon className={`h-3.5 w-3.5 ${on ? 'text-[#1D4ED8]' : 'text-ink-400'}`} />
      <span className={on ? 'text-ink-900' : 'text-ink-600 group-hover:text-ink-900'}>{label}</span>
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

function JobCard({ job, onLocked, onOpen }: { job: Job; /** Not a member: picking an outside listing opens the membership card instead. */ onLocked?: (job: Job) => void; /** Opening it in this tab (phones). */ onOpen?: () => void }) {
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

      {job.salary && <p className="mt-3 font-slab text-lg font-bold leading-snug text-ink-950">{job.salary}</p>}

      {!isExternal && !closed && (
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

  // Already-viewed jobs turn grey (muted background + softened content)
  // so it's easy to spot what you haven't opened yet.
  const cardClass = `min-w-0 max-w-full overflow-hidden group relative block rounded-lg border p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg sm:p-6 ${
    closed
      ? 'border-ink-200 bg-ink-50 opacity-60 grayscale hover:opacity-80'
      : viewed
        ? 'border-ink-200 bg-ink-100/70 opacity-75 grayscale-[40%] hover:opacity-100'
        : 'border-ink-900/15 bg-white'
  }`;

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
        {inner}
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
        // Phones: open it right here (instant, and Back returns to this spot in the list).
        if (!sameTab() || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen?.();
        nav(href);
      }}
      className={`${cardClass} cursor-pointer`}
    >
      {inner}
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

export function JobsPage({ go, onAuth }: JobsPageProps) {
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
  const { session } = useAuth();
  const { member, ready: memberReady } = useMembership();
  // An outside listing picked by someone who isn't a member: the membership card, here on the list.
  const [lockedJob, setLockedJob] = useState<Job | null>(null);
  const onLocked = memberReady && !member ? setLockedJob : undefined;

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
    if (session || hasQuery || visibleCount > quickJobs.length) setWantFull(true);
  }, [session, hasQuery, visibleCount, quickJobs.length]);
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
  }, [searchKey]);
  const searchBusy = searchKey.length >= 2 && serverHits?.q !== searchKey && (!fullJobs || loadingFull);
  const baseJobs = useMemo(() => [...sponsoredJobs, ...liveJobs], [liveJobs, sponsoredJobs]);
  const baseIds = useMemo(() => new Set(sponsoredJobs.map((j) => j.id)), [sponsoredJobs]);
  const extraJobs = useMemo(() => (serverHits && serverHits.q === searchKey ? serverHits.jobs.filter((j) => !baseIds.has(j.id)) : []), [serverHits, searchKey, baseIds]);
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

  const cityOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.city).filter(Boolean))).sort(), [allJobs]);
  const companyOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.company).filter(Boolean))).sort(), [allJobs]);
  // Unlike cityOptions/companyOptions above, this used to come from the
  // small hardcoded `countries` list (the same one behind the pill
  // row) rather than the actual job data — so as soon as jobs existed
  // in a country outside that curated set (India, Singapore, etc. —
  // already true today), there was no way to filter by them even
  // though their jobs were right there on the page. Deriving it from
  // allJobs, same as the other two, fixes that.
  const jobCountryOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.country).filter(Boolean))).sort(), [allJobs]);
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

  const categoryCounts = useMemo(() => {
    const labels = new Map<string, number>();
    const groups = new Map<string, number>();
    for (const j of baseMatched) {
      const c = catOf.get(j.id);
      if (!c) continue;
      labels.set(c.label, (labels.get(c.label) ?? 0) + 1);
      groups.set(c.group, (groups.get(c.group) ?? 0) + 1);
    }
    return { labels, groups };
  }, [baseMatched, catOf]);

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
  }, [baseMatched, catOf, category, sortBy, shownBefore, viewedAtLoad, hasQuery, quickIds]);

  function buildMainList(): Job[] {
    const matched = category === ALL_CATEGORIES ? baseMatched : baseMatched.filter((j) => categoryMatches(catOf.get(j.id) ?? null, category));
    // Nothing searched: the newest jobs shown first stay first when more jobs arrive (no jump).
    if (!hasQuery && quickIds.size) {
      const first = matched.filter((j) => quickIds.has(j.id));
      const rest = matched.filter((j) => !quickIds.has(j.id));
      if (sortBy === 'newest') return withClosedLast([...first, ...rest]);
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
  const hasMore = visibleCount < filteredJobs.length || (!fullJobs && !hasQuery);

  // Free accounts are made right here, in a dialog (job alerts).
  const [authOpen, setAuthOpen] = useState(false);

  // Everyone sees every job: the next page, from the full list (loading it first when needed).
  // Placeholders only while something is really on its way: a search being answered, or (no search) the full list.
  const waitingForMore = visibleCount > filteredJobs.length && (deferredSearch.trim().length >= 2 ? searchBusy : loadingFull);
  const handleShowMore = () => {
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

  // ---- Hero filters: Date posted · Country · Category ----
  const dateOptions = useMemo<ComboOption[]>(() => {
    const counts = new Map<DatePostedOption, number>();
    const now = Date.now();
    for (const j of allJobs) {
      const days = (now - postedMs(j)) / DAY_MS;
      for (const o of DATE_POSTED_OPTIONS) if (o !== 'Any time' && days <= WINDOW_DAYS[o]) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return DATE_POSTED_OPTIONS.filter((o) => o !== 'Any time').map((o) => ({ value: o, label: o, count: loading ? undefined : counts.get(o) ?? 0 }));
  }, [allJobs, loading]);

  const facets = useJobFacets();
  const activeFilterCountExceptCategory =
    Number(country !== 'All countries') +
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

  const countryComboOptions = useMemo<ComboOption[]>(() => {
    // Daily counts over ALL live jobs — the same for guests and signed-in users.
    if (facets && facets.countries.length) {
      const opts = facets.countries.map((c) => ({ value: c.name, label: c.name, count: c.n, flag: c.iso || undefined }));
      if (country !== 'All countries' && !opts.some((o) => o.value === country)) opts.push({ value: country, label: country, count: 0, flag: undefined });
      return opts;
    }
    const stats = new Map<string, { n: number; code: string }>();
    for (const j of allJobs) {
      if (!j.country) continue;
      const s = stats.get(j.country) ?? { n: 0, code: j.countryCode };
      s.n++;
      stats.set(j.country, s);
    }
    const opts = jobCountryOptions.map((c) => ({ value: c, label: c, count: stats.get(c)?.n ?? 0, flag: stats.get(c)?.code || undefined }));
    return opts.sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label));
  }, [allJobs, jobCountryOptions, facets, country]);

  const categoryComboOptions = useMemo<ComboOption[]>(() => {
    // No other filter or search active → the daily counts over ALL jobs
    // (same for everyone). With other filters, count what's matched.
    const otherFilters = Boolean(search.trim()) || activeFilterCountExceptCategory > 0;
    const daily = facets && !otherFilters ? new Map(Object.entries(facets.categories)) : null;
    const counts = daily ?? categoryCounts.labels;
    const haveCounts = counts.size > 0;
    return CATEGORIES_BY_GROUP.flatMap(({ group, labels }) =>
      labels
        .filter((l) => !haveCounts || counts.has(l) || l === category)
        .map((l) => ({ value: l, label: l, group, count: haveCounts ? counts.get(l) ?? 0 : undefined }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryCounts, category, facets, search, activeFilterCountExceptCategory]);


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
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />

      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-14">
          <h1 className="font-slab text-3xl font-bold leading-[1.3] tracking-tight text-white sm:text-4xl sm:leading-[1.3]">
            Discover <span className="rounded-md bg-white px-2 font-extrabold text-brand-700 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] sm:px-2.5">jobs</span> beyond traditional job boards.
          </h1>
          <TitleChips tone="dark" className="mt-4" items={['Straight from company career pages', 'New jobs every day', 'Checked live daily']} />

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <PersonalizationBar tone="dark" variant="location" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25">
              <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
              Only jobs from the last 30 days
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex h-12 shrink-0 items-center gap-3 rounded-md border border-white bg-white sm:flex-1 px-3.5 shadow-sm">
              <Search className="h-4.5 w-4.5 shrink-0 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Job title, skill, company or city"
                className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-ink-400 hover:text-ink-700">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="flex h-12 items-center justify-center gap-2 rounded-md border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] text-brand-700">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {/* Date posted · Country · Category — desktop; on mobile they're in the Filters panel */}
          <div className="relative mt-4 hidden grid-cols-3 gap-3 sm:grid">
            <FilterCombo
              label="Date posted"
              icon={CalendarClock}
              value={datePosted}
              allValue="Any time"
              allLabel="Any time"
              options={dateOptions}
              onChange={(v) => setDatePosted(asDateOption(v))}
            />
            <FilterCombo
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
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </section>

      {showFilters && (
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8">
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

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <CvPrompt className="mb-6" />
        <TopMatchesStrip className="mb-6" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Jobs in demand</h2>
          </div>

          <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
            <div className="flex items-center gap-1 rounded-md border border-ink-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setSortBy('newest')}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition ${sortBy === 'newest' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
              >
                Newest
              </button>
              <button
                type="button"
                onClick={() => setSortBy('relevant')}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition ${sortBy === 'relevant' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
              >
                Most relevant
              </button>
            </div>
            {/* Quick filters — switches under the sort */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
              <FilterSwitch on={studentOnly} onChange={setStudentOnly} icon={GraduationCap} label="Students & interns" />
              <FilterSwitch on={visaOnly} onChange={setVisaOnly} icon={Plane} label="Visa sponsorship" />
              <FilterSwitch on={flexOnly} onChange={setFlexOnly} icon={Home} label="Remote / hybrid" />
              {directJobs.length > 0 && (
                <FilterSwitch on={directOnly} onChange={setDirectOnly} icon={BadgeCheck} label="Direct from companies" />
              )}
            </div>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
        ) : filteredJobs.length === 0 && (searchBusy || (loadingFull && !gaveUpWaiting)) ? (
          <>
            <LoadingLatest />
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
            <AlertSignup className="mx-auto mt-5 max-w-xl text-left" keywords={search || (category !== ALL_CATEGORIES && !category.startsWith('group:') ? category : '')} country={country} onAuth={(p) => (p === 'register' ? setAuthOpen(true) : onAuth?.(p))} />
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
          <>
            {!directOnly && activeFilterCount === 0 && !search && directJobs.length > 0 && (
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
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {directJobs.slice(0, 2).map((job) => (
                    <JobCard key={`direct-${job.id}`} job={job} onLocked={onLocked} onOpen={saveListPlace} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visibleJobs.map((job, i) => (
                <Fragment key={job.id}>
                  {i === relatedStart && (
                    <div className="mt-2 border-t border-ink-200 pt-5 lg:col-span-2">
                      <p className="text-sm font-bold text-ink-900">More {relatedGroup} jobs</p>
                    </div>
                  )}
                  <JobCard job={job} onLocked={onLocked} onOpen={saveListPlace} />
                </Fragment>
              ))}
              {(loadingMore || waitingForMore) && Array.from({ length: 2 }).map((_, i) => <JobCardSkeleton key={`more-${i}`} />)}
            </div>

            {hasMore && (
              <div className="mt-7 rounded-xl bg-brand-50 px-5 py-6 text-center ring-1 ring-brand-100">
                <p className="text-sm font-semibold text-brand-900">
                  {waitingForMore ? 'Loading more of the latest jobs for you…' : 'There are more jobs waiting for you'}
                </p>
                <button
                  type="button"
                  onClick={handleShowMore}
                  disabled={loadingMore || waitingForMore}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-7 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-70 sm:w-auto"
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

            <AlertSignup className="mt-6" keywords={search || (category !== ALL_CATEGORIES && !category.startsWith('group:') ? category : '')} country={country} onAuth={(p) => (p === 'register' ? setAuthOpen(true) : onAuth?.(p))} />
          </>
        )}

        <p className="mt-10 text-[13px] font-semibold text-ink-500">From public company career pages · re-checked daily</p>
      </main>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      {lockedJob && <Paywall job={{ title: lockedJob.title, company: lockedJob.company }} onClose={() => setLockedJob(null)} source="jobs_list" />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
