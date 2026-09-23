import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  ChevronDown,
  Globe2,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import { isApplied, markApplied, removeApplication } from '@/lib/applications';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { categories, countries, jobTypes, type Job } from '@/data/jobs';
import { fetchArbeitnowJobs } from '@/data/sources/arbeitnow';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { useSeo } from '@/lib/seo';

type JobsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  goToJob?: (id: string) => void;
};

const DATE_POSTED_OPTIONS = ['Any time', 'Past 24 hours', 'Past week', 'Past month'] as const;
type DatePostedOption = (typeof DATE_POSTED_OPTIONS)[number];

type SortOption = 'newest' | 'relevant';

const PAGE_SIZE = 12;

const DISCOVERY_CATEGORIES = ['Technology', 'Design', 'Engineering', 'Healthcare', 'Finance', 'Marketing', 'Business', 'Education'];

function formatDateTag(iso: string | null | undefined): { label: 'NEW' | 'ADDED'; dateText: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dateText = `${dd}/${mm}/${d.getFullYear()}`;
  return { label: days <= 3 ? 'NEW' : 'ADDED', dateText };
}

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

function DateTag({ job }: { job: Job }) {
  const tag = formatDateTag(job.postedDate);
  if (!tag) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-[3px] text-[10px] font-bold tracking-wide text-white ${
        tag.label === 'NEW' ? 'bg-emerald-600' : 'bg-ink-800'
      }`}
    >
      {tag.label} · {tag.dateText}
    </span>
  );
}

function SourceLabel({ job }: { job: Job }) {
  if (job.sourceType === 'company_submitted') {
    return <span className="text-[11px] font-semibold text-emerald-700">Posted by company</span>;
  }
  if (job.sourceType === 'live_feed') {
    return <span className="text-[11px] text-ink-400">Source: {job.source} · live listing</span>;
  }
  return <span className="text-[11px] text-ink-400">Source: {job.company} careers · Added by MadeVisa</span>;
}

function SaveButton({
  refId,
  title,
  organization,
  country,
  countryCode,
  url,
}: {
  refId: string;
  title: string;
  organization: string;
  country: string;
  countryCode: string;
  url?: string;
}) {
  const [saved, setSaved] = useState(() => isApplied('job', refId));

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (saved) removeApplication('job', refId);
        else markApplied({ kind: 'job', refId, title, organization, country, countryCode, url });
        setSaved(!saved);
      }}
      aria-label={saved ? 'Remove from saved jobs' : 'Save job'}
      aria-pressed={saved}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border transition ${
        saved ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 text-ink-600 hover:border-ink-500 hover:text-ink-900'
      }`}
    >
      {saved ? <BookmarkCheck className="h-4 w-4" strokeWidth={2.5} /> : <Bookmark className="h-4 w-4" strokeWidth={2.5} />}
    </button>
  );
}

function JobCard({ job, goToJob }: { job: Job; goToJob?: (id: string) => void }) {
  const isExternal = job.sourceType === 'live_feed';

  const inner = (
    <>
      <div className="flex items-start gap-3.5">
        <JobLogo job={job} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink-500">{job.company}</p>
          <h3 className="mt-0.5 font-slab text-lg font-bold leading-snug text-ink-950 group-hover:text-brand-700">{job.title}</h3>
        </div>
        <SaveButton refId={job.id} title={job.title} organization={job.company} country={job.country} countryCode={job.countryCode} url={job.url} />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-500">
        <span className="flex items-center gap-1.5">
          <CircleFlag countryCode={job.countryCode} label={job.country} size={15} />
          {job.city && job.city !== job.country ? `${job.city}, ${job.country}` : job.country}
        </span>
        <span className="flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-ink-400" />
          {job.type}
        </span>
        {job.remote && <span className="font-semibold text-emerald-700">Remote</span>}
      </div>

      {job.salary && <p className="mt-3 text-[15px] font-bold text-ink-900">{job.salary}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
        <DateTag job={job} />
        <SourceLabel job={job} />
      </div>
    </>
  );

  const cardClass =
    'group block rounded-lg border border-ink-900/15 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg sm:p-6';

  if (isExternal) {
    return (
      <a href={job.url} target="_blank" rel="noopener noreferrer" className={cardClass}>
        {inner}
      </a>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => goToJob?.(job.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') goToJob?.(job.id);
      }}
      className={`${cardClass} cursor-pointer`}
    >
      {inner}
    </div>
  );
}

function JobCardSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <div className="h-[52px] w-[52px] shrink-0 animate-pulse rounded-lg bg-ink-100" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
        </div>
      </div>
      <div className="mt-4 h-3 w-1/2 animate-pulse rounded bg-ink-100" />
      <div className="mt-5 h-3 w-1/3 animate-pulse rounded bg-ink-100" />
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
        className="flex h-10 w-full items-center justify-between rounded-md border border-ink-200 bg-white px-3 text-left text-sm font-medium text-ink-800 transition hover:border-brand-300"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label={`Close ${label}`} onClick={() => setOpen(false)} className="fixed inset-0 z-20 cursor-default" />
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-ink-200 bg-white p-1 shadow-xl">
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
        className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
      />
    </div>
  );
}

export function JobsPage({ go, onAuth, goToJob }: JobsPageProps) {
  useSeo({
    title: 'Jobs Abroad — Visa Sponsorship & International Careers',
    description:
      'Browse international job listings with visa sponsorship, work permits, and relocation support, filtered to what you can actually apply for.',
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
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);
  const [sponsoredJobs, setSponsoredJobs] = useState<Job[]>([]);
  const [loadingSponsored, setLoadingSponsored] = useState(true);

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
    fetchPublishedSponsoredJobs().then((results) => {
      if (!cancelled) {
        setSponsoredJobs(results.map(sponsoredJobToBoardJob));
        setLoadingSponsored(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allJobs = useMemo(() => [...sponsoredJobs, ...liveJobs], [liveJobs, sponsoredJobs]);
  const loading = loadingLive && loadingSponsored && allJobs.length === 0;

  const cityOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.city).filter(Boolean))).sort(), [allJobs]);
  const companyOptions = useMemo(() => Array.from(new Set(allJobs.map((j) => j.company).filter(Boolean))).sort(), [allJobs]);
  const experienceLevelOptions = useMemo(
    () => Array.from(new Set(allJobs.map((j) => j.experienceLevel).filter((v): v is string => Boolean(v)))).sort(),
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

    const query = params.toString();
    window.history.replaceState({}, '', query ? `/jobs?${query}` : '/jobs');
  }, [search, country, category, jobType, remoteOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, country, category, jobType, remoteOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy]);

  const filteredJobs = useMemo(() => {
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
      const matchesCategory = category === 'All categories' || job.category === category;
      const matchesType = jobType === 'All types' || job.type === jobType;
      const matchesRemote = !remoteOnly || job.remote;
      const matchesCity = !normalizedCity || job.city.toLowerCase().includes(normalizedCity);
      const matchesCompany = !normalizedCompany || job.company.toLowerCase().includes(normalizedCompany);
      const matchesSalary = !salaryOnly || Boolean(job.salary);
      const matchesLevel = experienceLevel === 'All levels' || job.experienceLevel === experienceLevel;
      const matchesDate = withinDateWindow(job.postedDate, datePosted);

      return (
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

    if (sortBy === 'newest') {
      return [...matched].sort((a, b) => {
        const da = a.postedDate ? new Date(a.postedDate).getTime() : 0;
        const db = b.postedDate ? new Date(b.postedDate).getTime() : 0;
        return db - da;
      });
    }
    return matched;
  }, [allJobs, search, country, category, jobType, remoteOnly, city, company, salaryOnly, experienceLevel, datePosted, sortBy]);

  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredJobs.length;

  const handleShowMore = () => {
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 300);
  };

  const countryOptions = ['All countries', ...countries.map((c) => c.name)];

  const activeFilterCount =
    Number(country !== 'All countries') +
    Number(category !== 'All categories') +
    Number(jobType !== 'All types') +
    Number(remoteOnly) +
    Number(Boolean(city)) +
    Number(Boolean(company)) +
    Number(salaryOnly) +
    Number(experienceLevel !== 'All levels') +
    Number(datePosted !== 'Any time');

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
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />

      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
          <h1 className="font-slab text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">Find jobs abroad.</h1>
          <p className="mt-2 text-sm text-ink-500 sm:text-base">Real vacancies from companies' own career pages, in one place.</p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <div className="flex h-12 flex-1 items-center gap-3 rounded-md border border-ink-300 bg-white px-3.5">
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
              className="flex h-12 items-center justify-center gap-2 rounded-md border border-ink-300 px-5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] text-white">{activeFilterCount}</span>
              )}
            </button>
          </div>

          <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => setCountry('All countries')}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                country === 'All countries' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              All countries
            </button>
            {countries.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setCountry(item.name)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  country === item.name ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300'
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
              <SelectField label="Employment type" value={jobType} options={jobTypes} onChange={setJobType} />
              <TextField label="Company" value={company} onChange={setCompany} placeholder={companyOptions.slice(0, 3).join(', ') || 'Any company'} />
              {experienceLevelOptions.length > 0 && (
                <SelectField label="Experience level" value={experienceLevel} options={['All levels', ...experienceLevelOptions]} onChange={setExperienceLevel} />
              )}
              <SelectField label="Date posted" value={datePosted} options={[...DATE_POSTED_OPTIONS]} onChange={(v) => setDatePosted(v as DatePostedOption)} />

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Remote</label>
                <button
                  type="button"
                  onClick={() => setRemoteOnly((v) => !v)}
                  className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-left text-sm font-medium transition ${
                    remoteOnly ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700'
                  }`}
                >
                  Remote only
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Salary</label>
                <button
                  type="button"
                  onClick={() => setSalaryOnly((v) => !v)}
                  className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-left text-sm font-medium transition ${
                    salaryOnly ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700'
                  }`}
                >
                  Salary listed only
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
            <p className="mt-0.5 text-sm text-ink-500">{filteredJobs.length.toLocaleString()} opportunities</p>
          </div>

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
        </div>

        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setCategory('All categories')}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              category === 'All categories' ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            All categories
          </button>
          {DISCOVERY_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                category === c ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
              }`}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRemoteOnly((v) => !v)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              remoteOnly ? 'bg-emerald-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            Remote
          </button>
        </div>

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
