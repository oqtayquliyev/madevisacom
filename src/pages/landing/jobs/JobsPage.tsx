import { JobAgeBadge } from '@/components/common/JobAgeBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  ChevronDown,
  Globe2,
  GraduationCap,
  Loader2,
  Plane,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { Logo } from '@/components/layout/Logo';
import { categories, countries, jobTypes, type Job } from '@/data/jobs';
import { DISCOVERY_CATEGORIES, displayJobCategory, isMeaningfulJobType, isStudentOrInternJob, matchesDiscoveryCategory } from '@/lib/jobCategories';
import { moveToBack, recencyBucket, recentlyShownIds, rememberShown, visitShuffle } from '@/lib/feedRotation';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { fetchArbeitnowJobs } from '@/data/sources/arbeitnow';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { isJobViewed, markJobViewed } from '@/lib/viewedJobs';
import { useSeo } from '@/lib/seo';
import { PersonalizationBar } from '@/components/opportunities/PersonalizationBar';
import { jobPath } from '@/lib/jobUrl';
import { experienceBucket } from '@/lib/jobText';
import { DirectListingBadge } from '@/components/common/DirectListingBadge';

type JobsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  /** Receives the job's public path (see jobPath in src/lib/jobUrl.ts). */
  goToJob?: (path: string) => void;
};

const DATE_POSTED_OPTIONS = ['Any time', 'Past 24 hours', 'Past week', 'Past month'] as const;
type DatePostedOption = (typeof DATE_POSTED_OPTIONS)[number];

type SortOption = 'newest' | 'relevant';

const PAGE_SIZE = 12;

function withinDateWindow(iso: string | null | undefined, window: DatePostedOption): boolean {
  if (window === 'Any time') return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (window === 'Past 24 hours') return days <= 1;
  if (window === 'Past week') return days <= 7;
  return days <= 31;
}

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
        <img src={job.imageUrl} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" />
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

function JobCard({ job, goToJob }: { job: Job; goToJob?: (id: string) => void }) {
  const isExternal = job.sourceType === 'live_feed';
  const viewed = isJobViewed(job.id);
  const closed = Boolean(job.closed);

  const inner = (
    <>
      <div className="flex items-start gap-3.5">
        <JobLogo job={job} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink-500">{job.company}</p>
          <h3 className="mt-0.5 font-slab text-lg font-bold leading-snug text-ink-950 group-hover:text-brand-700">{job.title}</h3>
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

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
        {closed ? (
          <span className="rounded border border-ink-300 bg-ink-100 px-1.5 py-[3px] text-[10px] font-bold uppercase tracking-wide text-ink-600">Closed</span>
        ) : (
          <DateTag job={job} />
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
  const cardClass = `group relative block rounded-lg border p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg sm:p-6 ${
    closed
      ? 'border-ink-200 bg-ink-50 opacity-60 grayscale hover:opacity-80'
      : viewed
        ? 'border-ink-200 bg-ink-100/70 opacity-75 grayscale-[40%] hover:opacity-100'
        : 'border-ink-900/15 bg-white'
  }`;

  if (isExternal) {
    return (
      <a href={job.url} target="_blank" rel="noopener noreferrer" className={cardClass}>
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
      onClick={(e) => {
        markJobViewed(job.id, { id: job.id, title: job.title, organization: job.company, country: job.country, countryCode: job.countryCode, url: job.url });
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || !goToJob) return;
        e.preventDefault();
        goToJob(href);
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

export function JobsPage({ go, onAuth, goToJob }: JobsPageProps) {
  useSeo({
    title: 'Jobs Beyond LinkedIn: Company Career Pages & Jobs Abroad',
    description:
      'Discover jobs beyond traditional job boards. MadeVisa collects international jobs and global opportunities from company career pages and other sources, at home or abroad.',
    path: '/jobs',
  });

  const initial = useMemo(() => new URLSearchParams(window.location.search), []);

  const [search, setSearch] = useState(initial.get('q') ?? '');
  const [country, setCountry] = useState(initial.get('country') ?? 'All countries');
  const [category, setCategory] = useState(initial.get('category') ?? 'All categories');
  const [jobType, setJobType] = useState(initial.get('type') ?? 'All types');
  const [remoteOnly, setRemoteOnly] = useState(initial.get('remote') === '1');
  const [city, setCity] = useState(initial.get('city') ?? '');
  const [company, setCompany] = useState(initial.get('company') ?? '');
  const [salaryOnly, setSalaryOnly] = useState(initial.get('salary') === '1');
  const [experienceLevel, setExperienceLevel] = useState(initial.get('level') ?? 'All levels');
  const [datePosted, setDatePosted] = useState<DatePostedOption>((initial.get('posted') as DatePostedOption) ?? 'Any time');
  const [sortBy, setSortBy] = useState<SortOption>((initial.get('sort') as SortOption) ?? 'newest');
  // "Direct from companies": only listings the company posted on MadeVisa itself.
  const [directOnly, setDirectOnly] = useState(initial.get('direct') === '1');
  // Quick filters: student / intern / apprentice roles, and roles offering visa sponsorship.
  const [studentOnly, setStudentOnly] = useState(initial.get('students') === '1');
  const [visaOnly, setVisaOnly] = useState(initial.get('visa') === '1');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);
  const [sponsoredJobs, setSponsoredJobs] = useState<Job[]>([]);
  const [loadingSponsored, setLoadingSponsored] = useState(true);
  // False while showing a cached copy / the first page and the full list is still loading.
  const [, setSponsoredComplete] = useState(false);
  const { session } = useAuth();

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
    let cancelled = false;
    const show = (rows: Parameters<typeof sponsoredJobToBoardJob>[0][]) => {
      if (cancelled) return;
      setSponsoredJobs(rows.map(sponsoredJobToBoardJob));
      setLoadingSponsored(false);
    };
    // Renders the cached copy / newest page first, then the full list.
    fetchPublishedSponsoredJobs({ onPartial: show }).then((rows) => {
      show(rows);
      if (!cancelled) setSponsoredComplete(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allJobs = useMemo(() => [...sponsoredJobs, ...liveJobs], [liveJobs, sponsoredJobs]);
  // OR, not AND: sponsored jobs and the live feed are two independent
  // fetches that resolve at different times (sponsored now paginates
  // past Supabase's 1000-row cap, so it can genuinely take longer than
  // the live feed). With AND, as soon as the faster one finished while
  // the other was still in flight, `loading` flipped to false too
  // early — showing "No jobs found" for a moment before the slower
  // fetch's results actually arrived. Staying "loading" until BOTH are
  // done (or something has already arrived to show) fixes that flash.
  const loading = (loadingLive || loadingSponsored) && allJobs.length === 0;

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
  }, [search, country, category, jobType, remoteOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy, directOnly, studentOnly, visaOnly]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, country, category, jobType, remoteOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy, directOnly, studentOnly, visaOnly]);

  const directJobs = useMemo(() => allJobs.filter((j) => j.sourceType === 'company_submitted'), [allJobs]);
  const studentCount = useMemo(() => allJobs.filter(isStudentOrInternJob).length, [allJobs]);
  const visaCount = useMemo(() => allJobs.filter((j) => j.visaSponsorship).length, [allJobs]);
  // Only employment types that actually have jobs (no empty "Contract / Freelance").
  const jobTypeOptions = useMemo(() => {
    const present = new Set(allJobs.map((j) => j.type).filter(isMeaningfulJobType));
    return ['All types', ...jobTypes.filter((t) => t !== 'All types' && present.has(t))];
  }, [allJobs]);
  // Viewed jobs as of this page load — so opening a job and coming back
  // doesn't reshuffle the list under the person's thumb.
  const viewedAtLoad = useMemo(() => new Set(allJobs.filter((j) => isJobViewed(j.id)).map((j) => j.id)), [allJobs]);
  const shownBefore = useMemo(() => recentlyShownIds('jobs'), []);

  const filteredJobs = useMemo(() => withClosedLast(filterAndSort()), // eslint-disable-next-line react-hooks/exhaustive-deps
  [allJobs, search, country, category, jobType, remoteOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy, directOnly, studentOnly, visaOnly, shownBefore, viewedAtLoad]);

  function filterAndSort(): Job[] {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedCity = city.trim().toLowerCase();
    const normalizedCompany = company.trim().toLowerCase();

    const matched = allJobs.filter((job) => {
      const matchesSearch =
        !normalizedSearch ||
        job.title.toLowerCase().includes(normalizedSearch) ||
        job.company.toLowerCase().includes(normalizedSearch) ||
        job.category.toLowerCase().includes(normalizedSearch) ||
        job.city.toLowerCase().includes(normalizedSearch);

      const matchesCountry = country === 'All countries' || job.country === country;
      const matchesCategory =
        category === 'All categories' || matchesDiscoveryCategory(job.category, category) || matchesDiscoveryCategory(job.title, category);
      const matchesType = jobType === 'All types' || job.type === jobType;
      const matchesRemote = !remoteOnly || job.remote;
      const matchesCity = !normalizedCity || job.city.toLowerCase().includes(normalizedCity);
      const matchesCompany = !normalizedCompany || job.company.toLowerCase().includes(normalizedCompany);
      const matchesSalary = !salaryOnly || Boolean(job.salary);
      const matchesLevel = experienceLevel === 'All levels' || experienceBucket(job.experienceLevel) === experienceLevel;
      const matchesDate = withinDateWindow(job.postedDate, datePosted);
      const matchesDirect = !directOnly || job.sourceType === 'company_submitted';
      const matchesStudent = !studentOnly || isStudentOrInternJob(job);
      const matchesVisa = !visaOnly || Boolean(job.visaSponsorship);

      return (
        matchesDirect &&
        matchesStudent &&
        matchesVisa &&
        matchesSearch &&
        matchesCountry &&
        matchesCategory &&
        matchesType &&
        matchesRemote &&
        matchesCity &&
        matchesCompany &&
        matchesSalary &&
        matchesLevel &&
        matchesDate
      );
    });

    // Diversify by company instead of returning `matched` in whatever
    // order the underlying fetches produced it (grouped by import
    // batch, so one company's hundreds of listings run together before
    // the next company appears at all — confusing when scrolling
    // through hundreds of jobs from what will eventually be hundreds
    // of companies). "newest" sorts each company's own jobs newest
    // first, then round-robins across companies; "relevant" round-
    // robins in the existing order without re-sorting within a company.
    //
    // Each visit also shows a different mix: within a freshness bucket
    // (today, last 3 days, ...) jobs are shuffled per visit, jobs shown
    // at the top last time come after unseen ones, and jobs already
    // opened go to the end of their bucket.
    const rotate = (jobs: Job[], salt: string) =>
      interleaveByCompany(
        moveToBack(
          moveToBack(visitShuffle(jobs, salt), (j) => shownBefore.has(j.id)),
          (j) => viewedAtLoad.has(j.id)
        )
      );

    if (sortBy === 'newest') {
      const buckets: Job[][] = [[], [], [], [], []];
      for (const job of matched) buckets[recencyBucket(job.postedDate)].push(job);
      // Older buckets keep strict newest-first order; the fresh ones rotate.
      return buckets.flatMap((b, i) =>
        i <= 1
          ? rotate(b, `newest-${i}`)
          : interleaveByCompany(
              moveToBack(
                [...b].sort((x, y) => (y.postedDate ? Date.parse(y.postedDate) : 0) - (x.postedDate ? Date.parse(x.postedDate) : 0)),
                (j) => viewedAtLoad.has(j.id)
              )
            )
      );
    }
    return rotate(matched, 'relevant');
  }

  // Remember what led the list this visit, so next visit leads with other jobs.
  const unfiltered = !search && country === 'All countries' && category === 'All categories' && !studentOnly && !visaOnly && !directOnly;
  useEffect(() => {
    if (unfiltered && !loadingSponsored) rememberShown('jobs', filteredJobs.slice(0, PAGE_SIZE).map((j) => j.id));
  }, [unfiltered, loadingSponsored, filteredJobs]);

  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredJobs.length;

  const handleShowMore = () => {
    // Guests see the first page; more pages need a (free, email-code) account.
    if (!session) {
      rememberAuthIntent({ reason: 'more-jobs', next: window.location.pathname + window.location.search });
      onAuth?.('register');
      return;
    }
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 300);
  };

  const countryOptions = ['All countries', ...jobCountryOptions];
  // The full `countries` list will keep growing as more destinations
  // get added; capping the pill row to a fixed top 8 (with the rest
  // reachable via the "Filters" dropdown, which already lists all of
  // them) keeps this row from wrapping into a wall of pills. If the
  // active filter is a country outside that top 8, swap it into the
  // last slot so the selection is always visible here without the
  // person needing to open Filters just to see what's applied.
  const POPULAR_COUNTRY_PILL_COUNT = 8;
  const topCountries = countries.slice(0, POPULAR_COUNTRY_PILL_COUNT);
  const visibleCountryPills =
    country !== 'All countries' && !topCountries.some((c) => c.name === country)
      ? [...topCountries.slice(0, POPULAR_COUNTRY_PILL_COUNT - 1), countries.find((c) => c.name === country)].filter(
          (c): c is (typeof countries)[number] => Boolean(c)
        )
      : topCountries;

  const activeFilterCount =
    Number(country !== 'All countries') +
    Number(category !== 'All categories') +
    Number(jobType !== 'All types') +
    Number(remoteOnly) +
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
    category !== 'All categories' ? { key: 'category', label: category, onClear: () => setCategory('All categories') } : null,
    jobType !== 'All types' ? { key: 'type', label: jobType, onClear: () => setJobType('All types') } : null,
    remoteOnly ? { key: 'remote', label: 'Remote only', onClear: () => setRemoteOnly(false) } : null,
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
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80 sm:text-base">
            We collect roles from company career pages and multiple sources, so you can find opportunities you may not see on LinkedIn or other job sites.
          </p>

          <div className="mt-5">
            <PersonalizationBar tone="dark" variant="location" />
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

          {/* Mobile: "All countries" + one compact dropdown instead of a wall of pills */}
          <div className="mt-4 flex items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => setCountry('All countries')}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold ${
                country === 'All countries' ? 'border-white bg-white text-brand-700' : 'border-white/25 bg-white/10 text-white'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              All countries
            </button>
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Country</span>
              <select
                value={country === 'All countries' ? '' : country}
                onChange={(e) => setCountry(e.target.value || 'All countries')}
                className={`h-9 w-full appearance-none truncate rounded-full border py-0 pl-3.5 pr-8 text-xs font-semibold outline-none ${
                  country !== 'All countries' ? 'border-white bg-white text-brand-700' : 'border-white/25 bg-white/10 text-white'
                }`}
              >
                <option value="" className="text-ink-900">Choose a country…</option>
                {jobCountryOptions.map((c) => (
                  <option key={c} value={c} className="text-ink-900">
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${country !== 'All countries' ? 'text-brand-700' : 'text-white'}`} />
            </label>
          </div>

          <div className="-mx-5 mt-5 hidden flex-wrap gap-2 px-5 pb-1 sm:mx-0 sm:flex sm:px-0">
            <button
              type="button"
              onClick={() => setCountry('All countries')}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                country === 'All countries' ? 'border-white bg-white text-brand-700' : 'border-white/25 bg-white/10 text-white hover:border-white/60 hover:bg-white/15'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              All countries
            </button>
            {visibleCountryPills.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setCountry(item.name)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  country === item.name ? 'border-white bg-white text-brand-700' : 'border-white/25 bg-white/10 text-white hover:border-white/60 hover:bg-white/15'
                }`}
              >
                <CircleFlag countryCode={item.code} label={item.name} size={15} />
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {showFilters && (
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField label="Country" value={country} options={countryOptions} onChange={setCountry} />
              <TextField label="City" value={city} onChange={setCity} placeholder={cityOptions.slice(0, 3).join(', ') || 'Any city'} />
              <SelectField label="Category" value={category} options={categories} onChange={setCategory} />
              <SelectField label="Employment type" value={jobType} options={jobTypeOptions} onChange={setJobType} />
              <TextField label="Company" value={company} onChange={setCompany} placeholder={companyOptions.slice(0, 3).join(', ') || 'Any company'} />
              {experienceLevelOptions.length > 0 && (
                <SelectField label="Experience level" value={experienceLevel} options={['All levels', ...experienceLevelOptions]} onChange={setExperienceLevel} />
              )}
              <SelectField label="Date posted" value={datePosted} options={[...DATE_POSTED_OPTIONS]} onChange={(v) => setDatePosted(v as DatePostedOption)} />

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

            {activeFilterCount > 0 && (
              <button type="button" onClick={clearAllFilters} className="mt-4 text-xs font-semibold text-brand-600 hover:text-brand-700">
                Clear all filters
              </button>
            )}
          </div>
        </section>
      )}

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Jobs in demand</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500">
              Straight from company career pages, updated every day
            </p>
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
              {studentCount > 0 && (
                <FilterSwitch
                  on={studentOnly}
                  onChange={setStudentOnly}
                  icon={GraduationCap}
                  label="Students & interns"
                />
              )}
              {visaCount > 0 && (
                <FilterSwitch on={visaOnly} onChange={setVisaOnly} icon={Plane} label="Visa sponsorship" />
              )}
              {directJobs.length > 0 && (
                <FilterSwitch on={directOnly} onChange={setDirectOnly} icon={BadgeCheck} label="Direct from companies" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory('All categories')}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              category === 'All categories' ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            All categories
          </button>
          {/* Mobile: one compact category dropdown */}
          <label className="relative min-w-[9rem] flex-1 sm:hidden">
            <span className="sr-only">Category</span>
            <select
              value={category === 'All categories' ? '' : category}
              onChange={(e) => setCategory(e.target.value || 'All categories')}
              className={`h-8 w-full appearance-none rounded-md py-0 pl-3 pr-7 text-xs font-semibold outline-none ${
                category !== 'All categories' ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600'
              }`}
            >
              <option value="">Choose a category…</option>
              {DISCOVERY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${category !== 'All categories' ? 'text-white' : 'text-ink-500'}`} />
          </label>
          {DISCOVERY_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`hidden shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:inline-flex ${
                category === c ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
              }`}
            >
              {c}
            </button>
          ))}
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
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="mt-6 border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No jobs found</h3>
            <p className="mt-2 text-sm text-ink-500">Try changing your search or filters.</p>
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
                    <p className="text-xs text-ink-500">Roles companies published here themselves — apply straight to the employer.</p>
                  </div>
                  {directJobs.length > 2 && (
                    <button type="button" onClick={() => setDirectOnly(true)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                      See all {directJobs.length} →
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {directJobs.slice(0, 2).map((job) => (
                    <JobCard key={`direct-${job.id}`} job={job} goToJob={goToJob} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {visibleJobs.map((job) => (
                <JobCard key={job.id} job={job} goToJob={goToJob} />
              ))}
              {loadingMore && Array.from({ length: 2 }).map((_, i) => <JobCardSkeleton key={`more-${i}`} />)}
            </div>

            {hasMore && (
              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  onClick={handleShowMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-md border border-ink-300 px-6 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>
                      Show more jobs
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        <p className="mt-10 text-xs leading-5 text-ink-400">
          MadeVisa collects vacancies from publicly available company career pages. Job availability can change after we import a
          listing, so always verify the current status on the company's <span className="text-brand-600 underline">official careers page</span>.
        </p>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
