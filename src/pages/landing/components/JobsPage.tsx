import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Globe2,
  Landmark,
  Loader2,
  MapPin,
  Megaphone,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { isApplied, markApplied, removeApplication } from '@/lib/applications';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { PersonalizationBar, EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { AdBanner } from '@/components/ads/AdBanner';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { categories, countries, jobs as curatedJobs, jobTypes, type Job } from '@/data/jobs';
import { fetchArbeitnowJobs } from '@/data/sources/arbeitnow';
import { fetchPublishedSponsoredJobs, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';

type JobsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

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
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-ink-200 bg-white px-3 text-left text-sm font-medium text-ink-800 transition hover:border-brand-300"
      >
        <span className="truncate">
          {value}
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-400 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={`Close ${label}`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />

          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-xl">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-ink-700 transition hover:bg-ink-50"
              >
                {option}

                {option === value && (
                  <CheckCircle2 className="h-4 w-4 text-brand-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function JobCard({
  job,
}: {
  job: Job;
}) {
  const { profile } = usePersonalization();
  const eligibility = computeEligibility(job.eligibility, profile, job.countryCode);
  const isLive = job.source.toLowerCase().includes('live');
  const isSponsored = Boolean(job.publisherOrgType);
  const SponsorIcon = job.publisherOrgType === 'government' ? Landmark : Building2;

  return (
    <article className="border border-ink-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-soft-lg">

      <div className="flex items-start justify-between gap-4">

        <div className="flex min-w-0 items-start gap-3">

          {isSponsored ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
              <SponsorIcon className="h-5 w-5" />
            </span>
          ) : (
            <CompanyLogo name={job.company} size={40} />
          )}

          <div className="min-w-0">

            <div className="flex items-center gap-1.5">

              <CircleFlag countryCode={job.countryCode} label={job.country} size={16} />

              <span className="truncate text-xs font-medium text-ink-400">
                {job.country}
              </span>

              {isSponsored && (
                <span className="ml-1 flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                  <Megaphone className="h-2.5 w-2.5" />
                  Sponsored
                </span>
              )}

              {isLive && (
                <span className="ml-1 flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Wifi className="h-2.5 w-2.5" />
                  Live
                </span>
              )}

            </div>

            <h2 className="mt-1.5 text-base font-bold text-ink-950">
              {job.title}
            </h2>

            <p className="mt-0.5 text-sm font-medium text-ink-600">
              {job.company}
            </p>

          </div>

        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <EligibilityBadge result={eligibility} />
          {job.verified && (
            <span title="Verified source">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </span>
          )}
        </div>

      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-500">

        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-ink-400" />
          {job.city}
        </span>

        <span className="flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-ink-400" />
          {job.type}
        </span>

        {job.remote && (
          <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
            Remote
          </span>
        )}

      </div>

      {job.salary && (
        <div className="mt-4">
          <p className="text-xs text-ink-400">
            Salary
          </p>

          <p className="mt-0.5 text-base font-bold text-ink-950">
            {job.salary}
          </p>
        </div>
      )}

      {(job.requirements || job.spotsAvailable != null) && (
        <div className="mt-3 rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
          {job.requirements && <p>{job.requirements}</p>}
          {job.spotsAvailable != null && (
            <p className="mt-0.5 font-semibold text-ink-700">{job.spotsAvailable} position{job.spotsAvailable === 1 ? '' : 's'} available</p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">

        <div>

          <p className="text-[11px] text-ink-400">
            {job.source}
          </p>

          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-400">
            <Clock3 className="h-3 w-3" />
            {job.published}
          </p>

        </div>

        <div className="flex items-center gap-2">
          <SaveButton
            kind="job"
            refId={job.id}
            title={job.title}
            organization={job.company}
            country={job.country}
            countryCode={job.countryCode}
            url={job.url}
          />

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            View job
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

      </div>

    </article>
  );
}

function SaveButton({
  kind,
  refId,
  title,
  organization,
  country,
  countryCode,
  url,
}: {
  kind: 'job' | 'program';
  refId: string;
  title: string;
  organization: string;
  country: string;
  countryCode: string;
  url?: string;
}) {
  const [saved, setSaved] = useState(() => isApplied(kind, refId));

  return (
    <button
      type="button"
      onClick={() => {
        if (saved) {
          removeApplication(kind, refId);
        } else {
          markApplied({ kind, refId, title, organization, country, countryCode, url });
        }
        setSaved(!saved);
      }}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${
        saved ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
      }`}
    >
      {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

export function JobsPage({
  go,
  onAuth,
}: JobsPageProps) {
  // Read initial filters from the URL (e.g. /jobs?country=Germany&age=27)
  // so filtered views are shareable/bookmarkable links.
  const initial = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );

  const [search, setSearch] =
    useState(initial.get('q') ?? '');

  const [country, setCountry] =
    useState(initial.get('country') ?? 'All countries');

  const [category, setCategory] =
    useState(initial.get('category') ?? 'All categories');

  const [jobType, setJobType] =
    useState(initial.get('type') ?? 'All types');

  const [remoteOnly, setRemoteOnly] =
    useState(initial.get('remote') === '1');

  const [age, setAge] =
    useState(initial.get('age') ?? '');

  const [showFilters, setShowFilters] =
    useState(false);

  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);
  const [sponsoredJobs, setSponsoredJobs] = useState<Job[]>([]);

  // Pull in real, live listings from the Arbeitnow public job board API
  // and merge them with the curated set below.
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

  // Verified sponsors' approved job postings (see Submit a listing /
  // admin panel) — shown with their org icon + a "Sponsored" badge.
  useEffect(() => {
    let cancelled = false;

    fetchPublishedSponsoredJobs().then((results) => {
      if (!cancelled) setSponsoredJobs(results.map(sponsoredJobToBoardJob));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const allJobs = useMemo(
    () => [...sponsoredJobs, ...curatedJobs, ...liveJobs],
    [liveJobs, sponsoredJobs]
  );

  // Keep the URL in sync with the active filters so filtered views can
  // be shared/bookmarked as links (e.g. /jobs?country=Germany&age=27).
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
    if (age) params.set('age', age);

    const query = params.toString();
    const nextUrl = query ? `/jobs?${query}` : '/jobs';

    window.history.replaceState({}, '', nextUrl);
  }, [search, country, category, jobType, remoteOnly, age]);

  const numericAge = age ? Number(age) : null;

  const filteredJobs = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return allJobs.filter((job) => {

      const matchesSearch =
        !normalizedSearch ||
        job.title
          .toLowerCase()
          .includes(normalizedSearch) ||
        job.company
          .toLowerCase()
          .includes(normalizedSearch) ||
        job.category
          .toLowerCase()
          .includes(normalizedSearch) ||
        job.city
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesCountry =
        country === 'All countries' ||
        job.country === country;

      const matchesCategory =
        category === 'All categories' ||
        job.category === category;

      const matchesType =
        jobType === 'All types' ||
        job.type === jobType;

      const matchesRemote =
        !remoteOnly ||
        job.remote;

      const matchesAge =
        numericAge === null ||
        ((job.eligibility.minAge === undefined || numericAge >= job.eligibility.minAge) &&
          (job.eligibility.maxAge === undefined || numericAge <= job.eligibility.maxAge));

      return (
        matchesSearch &&
        matchesCountry &&
        matchesCategory &&
        matchesType &&
        matchesRemote &&
        matchesAge
      );
    });
  }, [
    allJobs,
    search,
    country,
    category,
    jobType,
    remoteOnly,
    numericAge,
  ]);

  const countryOptions = [
    'All countries',
    ...countries.map(
      (item) => item.name
    ),
  ];

  const activeFilterCount =
    Number(country !== 'All countries') +
    Number(category !== 'All categories') +
    Number(jobType !== 'All types') +
    Number(remoteOnly) +
    Number(Boolean(age));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">

      <LandingHeader go={go} onAuth={onAuth} active="jobs" />

      {/* HERO */}

      <section className="bg-brand-700 text-white">

        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">

          <div className="max-w-3xl">

            <div className="flex items-center gap-2 text-sm font-medium text-white/70">

              <Briefcase className="h-4 w-4" />

              Global jobs

            </div>

            <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-6xl">

              Find jobs abroad.

            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">

              Discover vacancies from multiple sources
              and explore opportunities by country.

            </p>

          </div>

          {/* SEARCH */}

          <div className="mt-9 border border-white/15 bg-white p-2 shadow-xl">

            <div className="flex flex-col gap-2 lg:flex-row">

              <div className="flex h-12 flex-1 items-center gap-3 px-3">

                <Search className="h-5 w-5 shrink-0 text-ink-400" />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Job title, skill, company or city"
                  className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-ink-400 hover:text-ink-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

              </div>

              <button
                type="button"
                onClick={() =>
                  setShowFilters(
                    (current) => !current
                  )
                }
                className="flex h-12 items-center justify-center gap-2 rounded-lg border border-ink-200 px-5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
              >

                <SlidersHorizontal className="h-4 w-4" />

                Filters

                {activeFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}

              </button>

              <button
                type="button"
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-7 text-sm font-semibold text-white hover:bg-brand-700"
              >

                <Search className="h-4 w-4" />

                Search jobs

              </button>

            </div>

          </div>

        </div>

      </section>

      {/* FILTERS */}

      {showFilters && (
        <section className="border-b border-ink-200 bg-white">

          <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

              <SelectField
                label="Country"
                value={country}
                options={countryOptions}
                onChange={setCountry}
              />

              <SelectField
                label="Category"
                value={category}
                options={categories}
                onChange={setCategory}
              />

              <SelectField
                label="Job type"
                value={jobType}
                options={jobTypes}
                onChange={setJobType}
              />

              <div>

                <label className="mb-1.5 block text-xs font-semibold text-ink-500">
                  Your age
                </label>

                <div className="flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
                  <CalendarRange className="h-4 w-4 shrink-0 text-ink-400" />
                  <input
                    type="number"
                    min={14}
                    max={90}
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    placeholder="e.g. 27"
                    className="h-full w-full min-w-0 bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
                  />
                  {age && (
                    <button type="button" onClick={() => setAge('')} className="text-ink-400 hover:text-ink-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

              </div>

              <div>

                <label className="mb-1.5 block text-xs font-semibold text-ink-500">
                  Work arrangement
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setRemoteOnly(
                      (current) => !current
                    )
                  }
                  className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm font-medium transition ${
                    remoteOnly
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-ink-200 bg-white text-ink-700'
                  }`}
                >

                  Remote only

                  {remoteOnly && (
                    <CheckCircle2 className="h-4 w-4 text-brand-600" />
                  )}

                </button>

              </div>

            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCountry('All countries');
                  setCategory('All categories');
                  setJobType('All types');
                  setRemoteOnly(false);
                  setAge('');
                }}
                className="mt-4 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Clear all filters
              </button>
            )}

          </div>

        </section>
      )}

      {/* JOB CONTENT */}

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">

        {/* SUMMARY */}

        <div className="flex flex-col gap-5 border-b border-ink-200 pb-7 sm:flex-row sm:items-end sm:justify-between">

          <div>

            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600">

              <Sparkles className="h-4 w-4" />

              MadeVisa Jobs

            </div>

            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">

              {filteredJobs.length.toLocaleString()}{' '}
              opportunities

            </h2>

            <p className="mt-1 text-sm text-ink-500">

              Jobs from multiple sources in one place.

            </p>

          </div>

          <div className="flex items-center gap-2 text-xs text-ink-400">
            {loadingLive ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                Fetching live listings…
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                {liveJobs.length} live + {curatedJobs.length} curated
              </>
            )}
          </div>

        </div>

        <div className="mt-6">
          <PersonalizationBar />
        </div>

        {/* COUNTRY STRIP */}

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">

          <button
            type="button"
            onClick={() =>
              setCountry('All countries')
            }
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              country === 'All countries'
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300'
            }`}
          >

            <Globe2 className="h-3.5 w-3.5" />

            All countries

          </button>

          {countries.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() =>
                setCountry(item.name)
              }
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                country === item.name
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300'
              }`}
            >

              <CircleFlag countryCode={item.code} label={item.name} size={16} />

              {item.name}

            </button>
          ))}

        </div>

        {/* JOB LIST */}

        <div className="mt-7 grid gap-4 lg:grid-cols-2">

          {filteredJobs.map((job, index) => (
            <Fragment key={job.id}>
              <JobCard job={job} />
              {index === 3 && (
                <AdBanner
                  content={{
                    advertiser: 'Global Travel Agency',
                    title: 'Relocating for a new job? Get your work visa sorted first.',
                    description: 'Verified agencies can prep your documents while you interview.',
                    cta: 'Find an expert',
                    url: 'https://madevisa.com/agencies',
                    image:
                      'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=400&q=80',
                  }}
                />
              )}
            </Fragment>
          ))}

        </div>

        {filteredJobs.length === 0 && (
          <div className="border border-ink-200 bg-white px-6 py-16 text-center">

            <Search className="mx-auto h-8 w-8 text-ink-300" />

            <h3 className="mt-4 text-lg font-bold text-ink-900">
              No jobs found
            </h3>

            <p className="mt-2 text-sm text-ink-500">
              Try changing your search or filters.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCountry('All countries');
                setCategory('All categories');
                setJobType('All types');
                setRemoteOnly(false);
                setAge('');
              }}
              className="mt-5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Clear filters
            </button>

          </div>
        )}

        {/* SOURCE NOTE */}

        <div className="mt-8 border border-ink-200 bg-white p-5">

          <div className="flex items-start gap-3">

            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />

            <div>

              <h3 className="text-sm font-bold text-ink-900">
                Jobs from multiple sources
              </h3>

              <p className="mt-1 text-xs leading-5 text-ink-500">
                MadeVisa brings together vacancies from approved job
                sources into one searchable board — jobs tagged{' '}
                <span className="font-semibold text-emerald-700">Live</span>{' '}
                are fetched in real time from Arbeitnow's public job
                board API; the rest are curated listings. Applications
                are completed on the original job source.
              </p>

            </div>

          </div>

        </div>

      </main>

      <LandingFooter go={go} onAuth={onAuth} />

    </div>
  );
}
