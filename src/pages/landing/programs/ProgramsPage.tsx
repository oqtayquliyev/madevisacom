import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  GraduationCap,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import {
  fetchSponsoredPrograms,
  getApplicationWindowStatus,
  toEligibilityCriteria,
  type SponsoredProgram,
} from '@/lib/programs';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { isApplied, markApplied, removeApplication } from '@/lib/applications';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { PersonalizationBar, EligibilityBadge } from '@/components/opportunities/PersonalizationBar';

type ProgramsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  goToProgram?: (id: string) => void;
};

const windowLabel = {
  open: 'Applications open',
  upcoming: 'Opens soon',
  closed: 'Applications closed',
  rolling: 'Rolling applications',
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
    <div className="relative">
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-ink-200 bg-white px-3 text-left text-sm font-medium text-ink-800 hover:border-brand-300"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="close" onClick={() => setOpen(false)} className="fixed inset-0 z-30" />
          <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-64 overflow-y-auto border border-ink-200 bg-white p-1 shadow-xl">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => { onChange(option); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50"
              >
                {option}
                {option === value && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProgramCard({ program, goToProgram }: { program: SponsoredProgram; goToProgram?: (id: string) => void }) {
  const { profile } = usePersonalization();
  const eligibility = computeEligibility(toEligibilityCriteria(program), profile, program.country?.iso_code);
  const windowStatus = getApplicationWindowStatus(program);

  return (
    <article className="flex flex-col border border-ink-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-soft-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-ink-500">{program.category}</span>
            {program.country && <span className="text-xs font-medium text-ink-400">{program.country.name}</span>}
          </div>
          <h2 className="mt-3 text-base font-bold text-ink-950">{program.title}</h2>
          <p className="mt-1 text-sm font-medium text-ink-600">{program.publisher?.name}</p>
        </div>
        <EligibilityBadge result={eligibility} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-500">
        <span className="rounded-md bg-ink-50 px-2 py-1 font-medium">{windowLabel[windowStatus]}</span>
        {program.spots_available != null && (
          <span className="rounded-md bg-ink-50 px-2 py-1">{program.spots_available} spot{program.spots_available === 1 ? '' : 's'}</span>
        )}
      </div>

      {program.funding_text && (
        <div className="mt-4">
          <p className="text-xs text-ink-400">Funding</p>
          <p className="mt-0.5 text-sm font-bold text-ink-900">{program.funding_text}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
        <span className="rounded-md bg-ink-50 px-2 py-1">
          {program.citizenship_any ? 'Open to all citizenships' : `Open to: ${(program.citizenship_allowed ?? []).join(', ')}`}
        </span>
        {(program.min_age || program.max_age) && (
          <span className="rounded-md bg-ink-50 px-2 py-1">
            Age {program.min_age ?? '—'}
            {program.max_age ? `–${program.max_age}` : '+'}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
        <div>
          {(program.applications_open_at || program.applications_close_at) && (
            <p className="flex items-center gap-1 text-[11px] text-ink-400">
              <Clock3 className="h-3 w-3" />
              {program.applications_close_at ? `Deadline ${program.applications_close_at}` : `Opens ${program.applications_open_at}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SaveButton
            kind="program"
            refId={program.id}
            title={program.title}
            organization={program.publisher?.name ?? 'Unknown'}
            country={program.country?.name ?? 'Various'}
            countryCode={program.country?.iso_code ?? ''}
            url={program.official_url ?? undefined}
          />
          <button
            type="button"
            onClick={() => goToProgram?.(program.id)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            View program
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
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

export function ProgramsPage({ go, onAuth, goToProgram }: ProgramsPageProps) {
  const [allPrograms, setAllPrograms] = useState<SponsoredProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('All countries');
  const [category, setCategory] = useState('All types');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchSponsoredPrograms().then((rows) => {
      setAllPrograms(rows);
      setLoading(false);
    });
  }, []);

  const countryOptions = useMemo(
    () => ['All countries', ...Array.from(new Set(allPrograms.map((p) => p.country?.name).filter(Boolean) as string[]))],
    [allPrograms]
  );
  const categoryOptions = useMemo(
    () => ['All types', ...Array.from(new Set(allPrograms.map((p) => p.category)))],
    [allPrograms]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPrograms.filter((program) => {
      const matchesSearch =
        !q ||
        program.title.toLowerCase().includes(q) ||
        (program.publisher?.name ?? '').toLowerCase().includes(q) ||
        program.category.toLowerCase().includes(q);
      const matchesCountry = country === 'All countries' || program.country?.name === country;
      const matchesCategory = category === 'All types' || program.category === category;
      return matchesSearch && matchesCountry && matchesCategory;
    });
  }, [allPrograms, search, country, category]);

  const activeFilterCount = Number(country !== 'All countries') + Number(category !== 'All types');

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="programs" />

      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-medium text-white/70">
              <GraduationCap className="h-4 w-4" />
              Programs &amp; exchanges
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-6xl">Scholarships, exchanges &amp; work programs.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Real, verified programs from governments, companies and agencies — filtered to what you can actually apply for.
            </p>
          </div>

          <div className="mt-9 border border-white/15 bg-white p-2 shadow-xl">
            <div className="flex flex-col gap-2 lg:flex-row">
              <div className="flex h-12 flex-1 items-center gap-3 px-3">
                <Search className="h-5 w-5 shrink-0 text-ink-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Program name, field or organization"
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
            </div>
          </div>
        </div>
      </section>

      {showFilters && (
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Country" value={country} options={countryOptions} onChange={setCountry} />
              <SelectField label="Category" value={category} options={categoryOptions} onChange={setCategory} />
            </div>
          </div>
        </section>
      )}

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-5 border-b border-ink-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
              <Sparkles className="h-4 w-4" />
              MadeVisa Programs
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">{filtered.length.toLocaleString()} programs</h2>
            <p className="mt-1 text-sm text-ink-500">National schemes, scholarships and exchanges in one place.</p>
          </div>
        </div>

        <div className="mt-6">
          <PersonalizationBar />
        </div>

        {loading ? (
          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading programs…
          </div>
        ) : (
          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            {filtered.map((program) => (
              <ProgramCard key={program.id} program={program} goToProgram={goToProgram} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No programs found</h3>
            <p className="mt-2 text-sm text-ink-500">
              {allPrograms.length === 0 ? 'No programs have been published yet — check back soon.' : 'Try changing your search or filters.'}
            </p>
            {allPrograms.length > 0 && (
              <button
                type="button"
                onClick={() => { setSearch(''); setCountry('All countries'); setCategory('All types'); }}
                className="mt-5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="mt-8 border border-ink-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-ink-900">Personalized, from verified sources</h3>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                MadeVisa brings together national programs, scholarships and exchange placements submitted by
                verified governments, companies and agencies, and flags whether your citizenship, age and current
                location fit each one.
              </p>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
