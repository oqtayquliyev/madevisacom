import { useMemo, useState } from 'react';
import { ExternalLink, Landmark, Search } from 'lucide-react';
import type { View } from '@/types';
import { officialPartners, partnerCategories, type PartnerCategory } from '@/data/officialPartners';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { useSeo } from '@/lib/seo';

type OfficialPartnersPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

export function OfficialPartnersPage({ go, onAuth }: OfficialPartnersPageProps) {
  useSeo({
    title: 'Official Government & Global Opportunity Institutions',
    description: 'Official immigration, investment, education, research and tourism institutions from around the world — public information sources, not partnerships.',
    path: '/official-sources',
  });
  const [category, setCategory] = useState<PartnerCategory | 'All'>('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return officialPartners.filter((p) => {
      const matchesCategory = category === 'All' || p.category === category;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.programs.some((prog) => prog.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="destinations" />

      <section className="border-b border-ink-200 bg-white px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold text-brand-600">Official institutions</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-[-0.03em] text-ink-950 sm:text-5xl">
            Official opportunities from around the world.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-500">
            Discover immigration pathways, talent programs, jobs, education, investment and other opportunities
            published by official institutions.
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-ink-400">
            Shown as public information sources — MadeVisa is not partnered with or endorsed by these institutions,
            and this listing is free with no promotional arrangement.
          </p>

          <div className="mt-8 flex h-12 max-w-md items-center gap-2 rounded-lg border border-ink-200 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institutions — Canada, Germany, Scholarships…"
              className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <FilterButton active={category === 'All'} onClick={() => setCategory('All')} label={`All (${officialPartners.length})`} />
            {partnerCategories.map((c) => (
              <FilterButton
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
                label={`${c} (${officialPartners.filter((p) => p.category === c).length})`}
              />
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        {filtered.length === 0 ? (
          <div className="border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No institutions found</h3>
            <p className="mt-2 text-sm text-ink-500">Try a different search or filter.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((partner) => (
              <PartnerCard key={partner.name} partner={partner} />
            ))}
          </div>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 text-ink-600 hover:border-brand-300'
      }`}
    >
      {label}
    </button>
  );
}

function PartnerCard({ partner }: { partner: (typeof officialPartners)[number] }) {
  return (
    <a
      href={partner.officialWebsite}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col border border-ink-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg"
    >
      {/* No institutional logos or crests: they need the owner's permission and
          would suggest an endorsement. A neutral text mark instead. */}
      <div className="flex h-14 items-center">
        <span className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs font-bold text-ink-500">
          <Landmark className="h-4 w-4" />
          {partner.name
            .split(' ')
            .filter((w) => w[0] === w[0]?.toUpperCase())
            .slice(0, 3)
            .map((w) => w[0])
            .join('')}
        </span>
      </div>

      <h3 className="mt-4 text-sm font-bold leading-snug text-ink-900">{partner.name}</h3>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
        <CircleFlag countryCode={partner.countryCode} label={partner.country} size={14} />
        {partner.country}
      </div>

      <span className="mt-2 w-fit rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
        {partner.category}
      </span>

      <p className="mt-3 flex-1 text-xs leading-5 text-ink-500">{partner.description}</p>

      {partner.programs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {partner.programs.map((program) => (
            <span key={program} className="rounded-md bg-ink-50 px-2 py-1 text-[11px] font-medium text-ink-600">
              {program}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 border-t border-ink-100 pt-3 text-xs font-semibold text-brand-600 group-hover:text-brand-700">
        Official source
        <ExternalLink className="h-3.5 w-3.5" />
      </div>
    </a>
  );
}
