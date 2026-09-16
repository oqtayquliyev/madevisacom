import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  Clock3,
  MapPin,
  Search,
  Star,
  UserRound,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import { agencies } from '@/data';
import { jobs as curatedJobs } from '@/data/jobs';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';

type ExpertsMarketplacePageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type Tab = 'experts' | 'agencies' | 'employers';

type Expert = {
  name: string;
  title: string;
  agency: string;
  initials: string;
  location: string;
  countryCode: string;
  specialties: string[];
  rating: number;
  reviews: number;
  price: number;
  response: string;
  avatar: string;
  accent: string;
};

const experts: Expert[] = [
  { name: 'Leyla Karimova', title: 'Senior Visa Consultant', agency: 'Global Travel', initials: 'LK', location: 'Baku, Azerbaijan', countryCode: 'AZ', specialties: ['Schengen', 'Business'], rating: 4.9, reviews: 128, price: 85, response: 'Replies in 20 min', avatar: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=160&q=80', accent: 'bg-violet-100 text-violet-700' },
  { name: 'Marco Bellin', title: 'Immigration Specialist', agency: 'Atlas Journeys', initials: 'MB', location: 'Milan, Italy', countryCode: 'IT', specialties: ['Schengen', 'Family'], rating: 4.8, reviews: 94, price: 69, response: 'Replies in 1 hour', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=160&q=80', accent: 'bg-amber-100 text-amber-700' },
  { name: 'Sofia Rahman', title: 'Relocation Advisor', agency: 'Northstar Travel', initials: 'SR', location: 'Dubai, UAE', countryCode: 'AE', specialties: ['Relocation', 'Tourist'], rating: 4.9, reviews: 76, price: 110, response: 'Replies in 45 min', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=160&q=80', accent: 'bg-emerald-100 text-emerald-700' },
  { name: 'Owen Williams', title: 'Visa Documentation Expert', agency: 'Wayfinder Co.', initials: 'OW', location: 'London, UK', countryCode: 'GB', specialties: ['Student', 'Work'], rating: 4.7, reviews: 61, price: 49, response: 'Replies in 2 hours', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80', accent: 'bg-blue-100 text-blue-700' },
  { name: 'Ayla Demir', title: 'Travel Compliance Advisor', agency: 'Route & Co.', initials: 'AD', location: 'Istanbul, Turkey', countryCode: 'TR', specialties: ['Schengen', 'Transit'], rating: 4.8, reviews: 48, price: 59, response: 'Replies in 30 min', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80', accent: 'bg-rose-100 text-rose-700' },
  { name: 'David Chen', title: 'International Visa Advisor', agency: 'Open Atlas', initials: 'DC', location: 'Toronto, Canada', countryCode: 'CA', specialties: ['Student', 'Work'], rating: 4.9, reviews: 112, price: 95, response: 'Replies in 1 hour', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80', accent: 'bg-cyan-100 text-cyan-700' },
];

// "Sponsored employer" profiles — aggregated from companies with open
// listings on the Jobs board. See OPPORTUNITIES.md for how to swap
// this for real paid employer placements.
const employerProfiles = Array.from(
  curatedJobs.reduce((map, job) => {
    const existing = map.get(job.company);
    if (existing) {
      existing.roles += 1;
      existing.countries.add(job.country);
    } else {
      map.set(job.company, { company: job.company, roles: 1, countries: new Set([job.country]), category: job.category });
    }
    return map;
  }, new Map<string, { company: string; roles: number; countries: Set<string>; category: string }>())
).map(([, value]) => value);

export function ExpertsMarketplacePage({ go, onAuth }: ExpertsMarketplacePageProps) {
  const [tab, setTab] = useState<Tab>('experts');
  const [search, setSearch] = useState('');

  const filteredExperts = useMemo(
    () =>
      experts.filter((e) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          e.name.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.specialties.some((s) => s.toLowerCase().includes(q))
        );
      }),
    [search]
  );

  const filteredAgencies = useMemo(
    () =>
      agencies.filter((a) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return a.name.toLowerCase().includes(q) || a.destinations.some((d) => d.toLowerCase().includes(q));
      }),
    [search]
  );

  const filteredEmployers = useMemo(
    () =>
      employerProfiles.filter((e) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return e.company.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
      }),
    [search]
  );

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
            Independent visa specialists, verified agencies, and sponsored employers looking to hire — all in one
            searchable place.
          </p>

          <div className="mt-8 flex h-12 max-w-md items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, destination or specialty"
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
        {tab === 'experts' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredExperts.map((expert) => (
              <article key={expert.name} className="flex flex-col border border-ink-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <img src={expert.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-ink-900">{expert.name}</h3>
                      <p className="truncate text-xs text-ink-500">{expert.title}</p>
                    </div>
                  </div>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${expert.accent}`}>{expert.initials}</span>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
                  <CircleFlag countryCode={expert.countryCode} label={expert.location} size={14} />
                  {expert.location}
                  <span className="ml-auto flex items-center gap-1 font-semibold text-ink-800">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {expert.rating}
                    <span className="font-normal text-ink-400">({expert.reviews})</span>
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {expert.specialties.map((s) => (
                    <span key={s} className="rounded-md bg-ink-50 px-2 py-1 text-[11px] font-medium text-ink-600">{s}</span>
                  ))}
                </div>

                <div className="mt-auto border-t border-ink-100 pt-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-ink-400">Starting at</p>
                      <p className="mt-0.5 text-xl font-bold tracking-tight text-ink-950">€{expert.price}</p>
                    </div>
                    <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <Clock3 className="h-3.5 w-3.5" />
                      {expert.response}
                    </p>
                  </div>
                  <button onClick={() => go('agencies')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                    View profile
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {tab === 'agencies' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAgencies.map((agency) => (
              <div key={agency.id} className="border border-ink-200 bg-white p-5 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-900 text-xs font-bold text-white">{agency.initials}</span>
                    <div>
                      <h3 className="font-semibold text-ink-900">{agency.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                        <MapPin className="h-3 w-3" />
                        {agency.destinations.slice(0, 2).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-ink-700">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {agency.rating}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-xs">
                  <div>
                    <p className="text-ink-400">Specialties</p>
                    <p className="mt-1 font-medium text-ink-700">{agency.services.slice(0, 2).join(' · ')}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">Starting at</p>
                    <p className="mt-1 text-lg font-bold text-ink-950">${agency.priceFrom}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <BadgeCheck className="h-4 w-4" />
                  Verified agency · {agency.tripsHandled.toLocaleString()} helped
                </div>
                <button onClick={() => go('agencies')} className="mt-4 text-xs font-semibold text-brand-600">
                  View agency<ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'employers' && (
          <>
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-500">
              <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              Companies currently hiring abroad through MadeVisa's Jobs board. Sponsored placement available for
              employers — see the footer for contact details.
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEmployers.map((employer) => (
                <div key={employer.company} className="border border-ink-200 bg-white p-5 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-ink-900">{employer.company}</h3>
                      <p className="text-xs text-ink-500">{employer.category}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
                    <Users className="h-3.5 w-3.5 text-ink-400" />
                    {employer.roles} open role{employer.roles === 1 ? '' : 's'} · {Array.from(employer.countries).join(', ')}
                  </div>
                  <button onClick={() => go('jobs')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                    View open roles
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
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
