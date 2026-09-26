import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Loader2,
  MapPin,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import {
  fetchVerifiedAgenciesPublic,
  fetchVerifiedExperts,
  type PublicAgency,
  type VerifiedExpert,
} from '@/lib/programs';
import { fetchPublishedSponsoredJobs, type SponsoredJob, companyNameFromUrl } from '@/lib/sponsoredJobs';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';

type ExpertsMarketplacePageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type Tab = 'experts' | 'agencies' | 'employers';

export function ExpertsMarketplacePage({ go, onAuth }: ExpertsMarketplacePageProps) {
  useSeo({
    title: 'Agencies & Experts — Verified Visa Consultants',
    description: 'Compare verified visa agencies, independent immigration experts, and companies sponsoring international roles — reviewed before listing.',
    path: '/experts',
  });
  const [tab, setTab] = useState<Tab>('experts');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [experts, setExperts] = useState<VerifiedExpert[]>([]);
  const [agencies, setAgencies] = useState<PublicAgency[]>([]);
  const [jobs, setJobs] = useState<SponsoredJob[]>([]);

  useEffect(() => {
    Promise.all([fetchVerifiedExperts(), fetchVerifiedAgenciesPublic(), fetchPublishedSponsoredJobs()]).then(
      ([e, a, j]) => {
        setExperts(e);
        setAgencies(a);
        setJobs(j);
        setLoading(false);
      }
    );
  }, []);

  const employers = useMemo(() => {
    const map = new Map<string, { name: string; roles: number; countries: Set<string> }>();
    for (const job of jobs) {
      const name = job.publisher?.name ?? companyNameFromUrl(job.official_url) ?? 'Company';
      const existing = map.get(name);
      if (existing) {
        existing.roles += 1;
        if (job.country) existing.countries.add(job.country.name);
      } else {
        map.set(name, { name, roles: 1, countries: new Set(job.country ? [job.country.name] : []) });
      }
    }
    return Array.from(map.values());
  }, [jobs]);

  const filteredExperts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return experts;
    return experts.filter((e) => e.name.toLowerCase().includes(q) || (e.country?.name ?? '').toLowerCase().includes(q));
  }, [experts, search]);

  const filteredAgencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agencies;
    return agencies.filter((a) => a.name.toLowerCase().includes(q) || (a.city ?? '').toLowerCase().includes(q) || (a.country ?? '').toLowerCase().includes(q));
  }, [agencies, search]);

  const filteredEmployers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employers;
    return employers.filter((e) => e.name.toLowerCase().includes(q));
  }, [employers, search]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="agencies" />

      <section className="border-b border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold text-brand-600">The visa &amp; relocation marketplace</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-[-0.03em] text-ink-950 sm:text-5xl">
            Agencies &amp; Experts.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-ink-500">
            Independent visa specialists, verified agencies, and sponsored employers looking to hire — all reviewed
            before they're listed here.
          </p>

          <div className="mt-8 flex h-12 max-w-md items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, destination or location"
              className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <TabButton active={tab === 'experts'} onClick={() => setTab('experts')} icon={UserRound} label={`Independent experts (${filteredExperts.length})`} />
            <TabButton active={tab === 'agencies'} onClick={() => setTab('agencies')} icon={Building2} label={`Agencies (${filteredAgencies.length})`} />
            <TabButton active={tab === 'employers'} onClick={() => setTab('employers')} icon={Briefcase} label={`Sponsored employers (${filteredEmployers.length})`} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            {tab === 'experts' && (
              filteredExperts.length === 0 ? (
                <EmptyState
                  label="No verified experts yet"
                  detail="Independent visa experts show up here once they apply from their profile and are approved."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredExperts.map((expert) => (
                    <article key={expert.id} className="flex flex-col border border-ink-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
                      <div className="flex items-center gap-3">
                        {expert.logo_url ? (
                          <img src={expert.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                            <UserRound className="h-5 w-5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-ink-900">{expert.name}</h3>
                          {expert.country && (
                            <p className="flex items-center gap-1 truncate text-xs text-ink-500">
                              <CircleFlag countryCode={expert.country.iso_code} label={expert.country.name} size={12} />
                              {expert.country.name}
                            </p>
                          )}
                        </div>
                      </div>
                      {expert.description && <p className="mt-3 flex-1 text-xs leading-5 text-ink-500">{expert.description}</p>}
                      <div className="mt-4 flex items-center gap-2">
                        {expert.website && (
                          <a
                            href={expert.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand-200 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            Visit website
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            {tab === 'agencies' && (
              filteredAgencies.length === 0 ? (
                <EmptyState
                  label="No verified agencies yet"
                  detail="Travel agencies show up here once they register and are approved."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAgencies.map((agency) => (
                    <div key={agency.id} className="border border-ink-200 bg-white p-5 shadow-soft">
                      <div className="flex items-center gap-3">
                        {agency.logo_url ? (
                          <img src={agency.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-900 text-xs font-bold text-white">
                            {agency.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-ink-900">{agency.name}</h3>
                          {(agency.city || agency.country) && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              <MapPin className="h-3 w-3" />
                              {[agency.city, agency.country].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      {agency.description && <p className="mt-4 text-xs leading-5 text-ink-500">{agency.description}</p>}
                      <div className="mt-4 flex items-center gap-2">
                        {agency.website && (
                          <a
                            href={agency.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold text-brand-600"
                          >
                            Visit website
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'employers' && (
              filteredEmployers.length === 0 ? (
                <EmptyState
                  label="No sponsored employers yet"
                  detail="Companies show up here once they post a verified sponsored job."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredEmployers.map((employer) => (
                    <div key={employer.name} className="border border-ink-200 bg-white p-5 shadow-soft">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <h3 className="font-semibold text-ink-900">{employer.name}</h3>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
                        <Users className="h-3.5 w-3.5 text-ink-400" />
                        {employer.roles} open role{employer.roles === 1 ? '' : 's'}
                        {employer.countries.size > 0 && ` · ${Array.from(employer.countries).join(', ')}`}
                      </div>
                      <button onClick={() => go('jobs')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                        View open roles
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Building2; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 text-ink-600 hover:border-brand-300'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function EmptyState({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="border border-ink-200 bg-white px-6 py-16 text-center">
      <Search className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-4 text-lg font-bold text-ink-900">{label}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">{detail}</p>
    </div>
  );
}

