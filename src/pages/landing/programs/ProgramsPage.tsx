import { Fragment, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  GraduationCap,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import { programOpportunities, type Opportunity } from '@/data/opportunities';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { PersonalizationBar, EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { AdBanner } from '@/components/ads/AdBanner';

type ProgramsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const programTypes = ['All types', ...Array.from(new Set(programOpportunities.map((p) => p.type)))];
const countryOptions = [
  'All countries',
  ...Array.from(new Set(programOpportunities.map((p) => p.country))),
];

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

function ProgramCard({ program }: { program: Opportunity }) {
  const { profile } = usePersonalization();
  const eligibility = computeEligibility(program.eligibility, profile, program.countryCode);

  return (
    <article className="flex flex-col border border-ink-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-soft-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-ink-500">{program.type}</span>
            <span className="text-xs font-medium text-ink-400">{program.country}</span>
          </div>
          <h2 className="mt-3 text-base font-bold text-ink-950">{program.title}</h2>
          <p className="mt-1 text-sm font-medium text-ink-600">{program.organization}</p>
        </div>
        <EligibilityBadge result={eligibility} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-ink-500">
        {program.duration && (
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 text-ink-400" />
            {program.duration}
          </span>
        )}
        {program.city && <span className="truncate">{program.city}</span>}
      </div>

      {program.compensation && (
        <div className="mt-4">
          <p className="text-xs text-ink-400">Funding</p>
          <p className="mt-0.5 text-sm font-bold text-ink-900">{program.compensation}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
        <span className="rounded-md bg-ink-50 px-2 py-1">
          {program.eligibility.citizenship === 'any'
            ? 'Open to all citizenships'
            : `Open to: ${(program.eligibility.citizenship as string[]).join(', ')}`}
        </span>
        {(program.eligibility.minAge || program.eligibility.maxAge) && (
          <span className="rounded-md bg-ink-50 px-2 py-1">
            Age {program.eligibility.minAge ?? '—'}
            {program.eligibility.maxAge ? `–${program.eligibility.maxAge}` : '+'}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
        <div>
          <p className="text-[11px] text-ink-400">{program.source}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-400">
            <Clock3 className="h-3 w-3" />
            {program.published}
          </p>
        </div>
        <a
          href={program.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          View program
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

export function ProgramsPage({ go, onAuth }: ProgramsPageProps) {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('All countries');
  const [type, setType] = useState('All types');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return programOpportunities.filter((program) => {
      const matchesSearch =
        !q ||
        program.title.toLowerCase().includes(q) ||
        program.organization.toLowerCase().includes(q) ||
        program.category.toLowerCase().includes(q);
      const matchesCountry = country === 'All countries' || program.country === country;
      const matchesType = type === 'All types' || program.type === type;
      return matchesSearch && matchesCountry && matchesType;
    });
  }, [search, country, type]);

  const activeFilterCount = Number(country !== 'All countries') + Number(type !== 'All types');

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
              Sponsored programs, national schemes and exchange placements from multiple sources — filtered to what you can actually apply for.
            </p>
            <button
              type="button"
              onClick={() => go('sponsored-programs')}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              Browse government &amp; company sponsored programs →
            </button>
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
              <SelectField label="Type" value={type} options={programTypes} onChange={setType} />
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
          <div className="text-xs text-ink-400">Currently showing prototype data</div>
        </div>

        <div className="mt-6">
          <PersonalizationBar />
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          {filtered.map((program, index) => (
            <Fragment key={program.id}>
              <ProgramCard program={program} />
              {index === 2 && (
                <AdBanner
                  content={{
                    advertiser: 'Global Relocation Partners',
                    title: 'Get a free eligibility review from a licensed advisor',
                    description: 'Book a 20-minute call before you apply to any program on this page.',
                    cta: 'Book a call',
                    url: 'https://madevisa.com/agencies',
                    image:
                      'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=400&q=80',
                  }}
                />
              )}
            </Fragment>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No programs found</h3>
            <p className="mt-2 text-sm text-ink-500">Try changing your search or filters.</p>
            <button
              type="button"
              onClick={() => { setSearch(''); setCountry('All countries'); setType('All types'); }}
              className="mt-5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="mt-8 border border-ink-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-ink-900">Personalized, from multiple sources</h3>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                MadeVisa brings together national programs, scholarships and exchange placements, and flags whether
                your citizenship, age and current location fit each one. Applications are completed on the original
                program source.
              </p>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
