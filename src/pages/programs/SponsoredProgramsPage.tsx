import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Landmark,
  Mail,
  Megaphone,
  Search,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { PersonalizationBar, EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { useSeo } from '@/lib/seo';
import { formatCost } from '@/lib/listingCategories';
import {
  fetchCountries,
  fetchSponsoredPrograms,
  getApplicationWindowStatus,
  toEligibilityCriteria,
  PUBLISHING_CONTACT_EMAIL,
  type CountryOption,
  type OrgType,
  type SponsoredProgram,
} from '@/lib/programs';

type SponsoredProgramsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  goToProgram?: (id: string) => void;
};

const windowCopy: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  open: { label: 'Applications open', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  upcoming: { label: 'Opens soon', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock3 },
  closed: { label: 'Applications closed', className: 'bg-ink-100 text-ink-500 border-ink-200', icon: X },
  rolling: { label: 'Rolling / no deadline', className: 'bg-brand-50 text-brand-700 border-brand-200', icon: CalendarClock },
};

function ProgramCard({ program, goToProgram }: { program: SponsoredProgram; goToProgram?: (id: string) => void }) {
  const { profile } = usePersonalization();
  const eligibility = computeEligibility(toEligibilityCriteria(program), profile, program.country?.iso_code);
  const windowStatus = getApplicationWindowStatus(program);
  const WindowIcon = windowCopy[windowStatus].icon;
  const isGovernment = program.publisher?.org_type === 'government';

  return (
    <article className="flex flex-col border border-ink-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-soft-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
              isGovernment ? 'bg-indigo-50 text-indigo-600' : 'bg-brand-50 text-brand-600'
            }`}
          >
            {isGovernment ? <Landmark className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-xs font-semibold text-ink-500">{program.publisher?.name}</p>
            <p className="text-[11px] uppercase tracking-wide text-ink-400">
              {isGovernment ? 'Government' : 'Company'} · {program.category}
            </p>
          </div>
        </div>
        <EligibilityBadge result={eligibility} />
      </div>

      <h2 className="mt-3 text-base font-bold text-ink-950">{program.title}</h2>
      {program.description && <p className="mt-1.5 line-clamp-2 text-sm text-ink-500">{program.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {program.country && (
          <span className="flex items-center gap-1.5 rounded-md bg-ink-50 px-2 py-1 text-ink-600">
            <CircleFlag countryCode={program.country.iso_code} label={program.country.name} size={14} />
            {program.country.name}
          </span>
        )}
        <span className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold ${windowCopy[windowStatus].className}`}>
          <WindowIcon className="h-3 w-3" />
          {windowCopy[windowStatus].label}
        </span>
      </div>

      {formatCost(program) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-600">
          <Banknote className="h-3.5 w-3.5 text-ink-400" />
          {formatCost(program)}
        </div>
      )}

      {(program.requirements || program.spots_available != null) && (
        <div className="mt-3 rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
          {program.requirements && <p>{program.requirements}</p>}
          {program.spots_available != null && (
            <p className="mt-0.5 font-semibold text-ink-700">{program.spots_available} spot{program.spots_available === 1 ? '' : 's'} available</p>
          )}
        </div>
      )}

      {(program.applications_open_at || program.applications_close_at) && (
        <p className="mt-1.5 text-[11px] text-ink-400">
          {program.applications_open_at && `Opens ${program.applications_open_at}`}
          {program.applications_open_at && program.applications_close_at && ' · '}
          {program.applications_close_at && `Deadline ${program.applications_close_at}`}
        </p>
      )}

      <div className="mt-5 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={() => goToProgram?.(program.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          View program
        </button>
      </div>
    </article>
  );
}

export function SponsoredProgramsPage({ go, onAuth, goToProgram }: SponsoredProgramsPageProps) {
  useSeo({
    title: 'Sponsored Programs — Government & Company Opportunities',
    description: 'Browse government and company sponsored programs, scholarships and exchanges, verified before publishing.',
    path: '/sponsored-programs',
  });
  const [programs, setPrograms] = useState<SponsoredProgram[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryId, setCountryId] = useState<string>('');
  const [orgType, setOrgType] = useState<OrgType | ''>('');
  const [openCountry, setOpenCountry] = useState(false);

  useEffect(() => {
    fetchCountries().then(setCountries);
  }, []);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      fetchSponsoredPrograms({ search: search || undefined, countryId: countryId || undefined, orgType: orgType || undefined })
        .then(setPrograms)
        .finally(() => setLoading(false));
    }, 250); // light debounce for the search box

    return () => clearTimeout(timeout);
  }, [search, countryId, orgType]);

  const selectedCountry = useMemo(() => countries.find((c) => c.id === countryId) ?? null, [countries, countryId]);
  const activeFilterCount = Number(Boolean(countryId)) + Number(Boolean(orgType));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="programs" />

      <section className="bg-ink-950 text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="flex items-center gap-2 text-sm font-medium text-white/60">
            <Megaphone className="h-4 w-4" />
            Sponsored programs
          </div>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            Programs from governments &amp; companies.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
            Search official schemes and company-sponsored programs, filtered by country and publisher — with your
            eligibility and application deadlines shown on every listing.
          </p>

          <div className="mt-8 flex flex-col gap-2 border border-white/10 bg-white p-2 shadow-xl sm:flex-row">
            <div className="flex h-12 flex-1 items-center gap-3 px-3">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search programs, e.g. 'scholarship', 'work permit'"
                className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>

            {/* Country filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenCountry((v) => !v)}
                className="flex h-12 w-full items-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 sm:w-48"
              >
                {selectedCountry ? (
                  <CircleFlag countryCode={selectedCountry.iso_code} label={selectedCountry.name} size={16} />
                ) : (
                  <Search className="h-3.5 w-3.5 text-ink-400" />
                )}
                <span className="flex-1 truncate text-left">{selectedCountry?.name ?? 'All countries'}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-ink-400 transition ${openCountry ? 'rotate-180' : ''}`} />
              </button>
              {openCountry && (
                <>
                  <button type="button" aria-label="close" onClick={() => setOpenCountry(false)} className="fixed inset-0 z-30" />
                  <div className="absolute right-0 top-full z-40 mt-1 max-h-64 w-64 overflow-y-auto border border-ink-200 bg-white p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => { setCountryId(''); setOpenCountry(false); }}
                      className="flex w-full items-center px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50"
                    >
                      All countries
                    </button>
                    {countries.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCountryId(c.id); setOpenCountry(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50"
                      >
                        <CircleFlag countryCode={c.iso_code} label={c.name} size={18} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Publisher type filter */}
            <div className="flex h-12 items-center gap-1 rounded-lg border border-ink-200 p-1 sm:w-64">
              {(['', 'government', 'company'] as const).map((value) => (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => setOrgType(value)}
                  className={`flex h-full flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition ${
                    orgType === value ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-50'
                  }`}
                >
                  {value === 'government' && <Landmark className="h-3.5 w-3.5" />}
                  {value === 'company' && <Building2 className="h-3.5 w-3.5" />}
                  {value === '' ? 'All' : value === 'government' ? 'Gov' : 'Company'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <PersonalizationBar />

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-ink-500">
            {loading ? 'Loading…' : `${programs.length} program${programs.length === 1 ? '' : 's'}`}
            {activeFilterCount > 0 && !loading && ' matching your filters'}
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setCountryId(''); setOrgType(''); }}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} goToProgram={goToProgram} />
          ))}
        </div>

        {!loading && programs.length === 0 && (
          <div className="mt-4 border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No programs found yet</h3>
            <p className="mt-2 text-sm text-ink-500">
              Try different filters, or be the first to publish one below.
            </p>
          </div>
        )}

        {/* PUBLISH / PRICING */}
        <div className="mt-12 grid gap-4 border border-ink-200 bg-white p-6 shadow-soft sm:p-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">For governments &amp; companies</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">Publish your programme.</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-ink-500">
              Reach travelers who are already filtered by citizenship, age and destination — no unqualified
              applicants. Every submission is reviewed before it goes live.
            </p>
            <button
              type="button"
              onClick={() => go('submit-program')}
              className="mt-5 flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Megaphone className="h-4 w-4" />
              Submit a programme
            </button>
          </div>

          <div className="border-t border-ink-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Publishing &amp; pricing</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li>• Government programs: published free after verification.</li>
              <li>• Company-sponsored programs: flat placement fee, billed per listing or as a season package.</li>
              <li>• Featured/pinned placement available for higher visibility.</li>
            </ul>
            <a
              href={`mailto:${PUBLISHING_CONTACT_EMAIL}?subject=Publishing%20a%20sponsored%20programme`}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              <Mail className="h-4 w-4" />
              {PUBLISHING_CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
