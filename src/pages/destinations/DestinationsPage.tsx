import { useMemo, useState } from 'react';
import { ArrowUpRight, Info, Search } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { RangeSwitch, SoftPanel, SparkBars, weeklyCounts } from '@/components/charts/SoftCharts';
import { destinationPath, visaGuideByCode, visaGuides, type VisaGuide } from '@/data/visa';
import { countryVerdict, useDestinationProfile, type RouteStatus } from '@/lib/destinationEligibility';
import { useDestinationStats, type CountryStats } from '@/lib/destinationStats';
import { ProfileCard, RateBar, StatusBadge } from '@/pages/destinations/DestinationUI';
import { WRAP, countryName, nav } from '@/lib/pageLayout';

type DestinationsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type Sort = 'fit' | 'jobs' | 'rate' | 'name';

const FIT_RANK: Record<RouteStatus, number> = { citizen: 0, free: 1, eligible: 2, likely: 3, check: 4, unknown: 5, missing: 6 };
const OPEN: RouteStatus[] = ['citizen', 'free', 'eligible', 'likely'];

export function DestinationsPage({ go, onAuth }: DestinationsPageProps) {
  useSeo({
    title: 'Visas by Country — visa routes, sponsorship rates and companies hiring by country',
    description: `Compare ${visaGuides.length} countries: visa routes you qualify for, live visa-sponsored job counts, companies hiring, and years to permanent residence and citizenship.`,
    path: '/destinations',
  });

  const me = useDestinationProfile();
  const { stats, complete } = useDestinationStats();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All');
  const [sort, setSort] = useState<Sort>('fit');
  const [chartMode, setChartMode] = useState<'share' | 'volume'>('volume');

  const rows = useMemo(
    () =>
      visaGuides.map((g) => ({
        guide: g,
        stats: stats?.get(g.code) ?? null,
        verdict: countryVerdict(g, me.citizenship, me.answers),
      })),
    [stats, me.citizenship, me.answers],
  );

  const regions = useMemo(() => ['All', ...Array.from(new Set(visaGuides.map((g) => g.region))).sort()], []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(
      (r) => (region === 'All' || r.guide.region === region) && (!q || `${r.guide.name} ${r.guide.region} ${r.guide.routes.map((x) => x.name).join(' ')}`.toLowerCase().includes(q)),
    );
    const jobs = (r: (typeof rows)[number]) => r.stats?.total ?? 0;
    return list.sort((a, b) => {
      if (sort === 'name') return a.guide.name.localeCompare(b.guide.name);
      if (sort === 'jobs') return jobs(b) - jobs(a);
      if (sort === 'rate') return (b.stats?.sponsored ?? 0) - (a.stats?.sponsored ?? 0) || jobs(b) - jobs(a);
      return FIT_RANK[a.verdict.status] - FIT_RANK[b.verdict.status] || b.verdict.openCount - a.verdict.openCount || jobs(b) - jobs(a);
    });
  }, [rows, search, region, sort]);

  const totals = useMemo(() => {
    let sponsored = 0;
    let companies = 0;
    for (const r of rows) {
      sponsored += r.stats?.sponsored ?? 0;
      companies += r.stats?.companies.length ?? 0;
    }
    const open = rows.filter((r) => OPEN.includes(r.verdict.status)).length;
    return { sponsored, companies, open };
  }, [rows]);

  // Countries with jobs on MadeVisa but no guide yet — still worth surfacing.
  const otherCountries = useMemo(
    () =>
      stats
        ? [...stats.values()]
            .filter((s) => !visaGuideByCode.has(s.code) && s.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 12)
        : [],
    [stats],
  );

  const chartRows = useMemo(
    () =>
      rows
        .filter((r): r is typeof r & { stats: CountryStats } => (r.stats?.total ?? 0) > 0)
        .sort((a, b) => (chartMode === 'share' ? (b.stats.rate ?? 0) - (a.stats.rate ?? 0) : b.stats.sponsored - a.stats.sponsored) || b.stats.total - a.stats.total)
        .slice(0, 12),
    [rows, chartMode],
  );
  const maxSponsored = Math.max(1, ...chartRows.map((r) => r.stats.sponsored));

  const passport = me.citizenship ? countryName(me.citizenship) : null;

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="destinations" />

      {/* HEADER */}
      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} pb-12 pt-10 sm:pb-14 sm:pt-12`}>
          <h1 className="max-w-3xl text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[44px]">
            {me.firstName ? `${me.firstName}, here's where you can go` : 'Where you can go, and who is hiring'}
          </h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-white/85">
            Visa routes for {visaGuides.length} countries, checked against {passport ? `your ${passport} passport` : 'your passport'}, with live counts of jobs that sponsor visas and the
            companies behind them.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            {me.citizenship ? (
              <HeroFigure label="Countries with a route for you" value={`${totals.open} of ${visaGuides.length}`} />
            ) : (
              <a href="#your-profile" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[15px] font-bold text-brand-700 hover:bg-brand-50">
                Add your passport to see your routes
              </a>
            )}
          </div>
        </div>
      </section>

      <main className={`${WRAP} space-y-10 py-10`}>
        <section id="your-profile" className="scroll-mt-28">
          <ProfileCard compact />
        </section>

        {/* SPONSORSHIP BY COUNTRY */}
        <SoftPanel
          title="Visa sponsorship by country"
          sub={chartMode === 'volume' ? 'Open jobs on MadeVisa that offer visa sponsorship' : "Share of each country's open jobs that offer visa sponsorship"}
          right={
            <RangeSwitch
              value={chartMode}
              onChange={setChartMode}
              options={[
                { value: 'volume', label: 'Jobs' },
                { value: 'share', label: 'Share' },
              ]}
            />
          }
        >
          {!stats ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((k) => (
                <div key={k} className="skeleton-shimmer h-8 rounded-md" />
              ))}
            </div>
          ) : chartRows.length === 0 ? (
            <p className="rounded-lg bg-[#1D4ED8]/5 px-4 py-6 text-center text-[14px] text-ink-500">No open jobs in these countries right now.</p>
          ) : (
            <ol className="space-y-1">
              {chartRows.map(({ guide, stats: s }) => (
                <li key={guide.code}>
                  <a
                    href={destinationPath(guide)}
                    onClick={(e) => {
                      e.preventDefault();
                      nav(destinationPath(guide));
                    }}
                    className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#1D4ED8]/5 sm:grid-cols-[200px_minmax(0,1fr)_170px] sm:gap-5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <CircleFlag countryCode={guide.code} label={guide.name} size={22} />
                      <span className="truncate text-[15px] font-semibold text-ink-900">{guide.name}</span>
                    </span>
                    <RateBar value={chartMode === 'share' ? s.rate : (s.sponsored / maxSponsored) * 100} className="h-2.5" />
                    <span className="text-right text-[14px] tabular-nums text-ink-600">
                      <strong className="text-ink-950">{chartMode === 'share' ? `${s.rate}%` : s.sponsored.toLocaleString()}</strong>
                      <span className="hidden sm:inline">{chartMode === 'share' ? ` of ${s.total.toLocaleString()} jobs` : ` of ${s.total.toLocaleString()} (${s.rate}%)`}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </SoftPanel>

        {/* COUNTRIES */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-medium text-ink-900">Countries</h2>
              <p className="mt-0.5 text-[14px] text-ink-500">
                {shown.length} of {visaGuides.length} shown
              </p>
            </div>
            <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-[#1D4ED8] sm:w-80">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a country or visa"
                aria-label="Search a country or visa"
                className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-400"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {regions.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  aria-pressed={region === r}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${region === r ? 'bg-[#1D4ED8] text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}
                >
                  {r === 'All' ? 'All regions' : r}
                </button>
              ))}
            </div>
            <RangeSwitch
              value={sort}
              onChange={setSort}
              options={[
                { value: 'fit', label: 'Best for you' },
                { value: 'rate', label: 'Most sponsored' },
                { value: 'jobs', label: 'Most jobs' },
                { value: 'name', label: 'A–Z' },
              ]}
            />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => (
              <CountryCard key={r.guide.code} guide={r.guide} stats={r.stats} loading={!stats} status={me.citizenship ? r.verdict.status : null} openRoutes={r.verdict.openCount} />
            ))}
          </div>

          {shown.length === 0 && (
            <div className="rounded-xl border border-ink-200 px-6 py-14 text-center">
              <Search className="mx-auto h-8 w-8 text-ink-300" />
              <h3 className="mt-4 text-lg font-bold text-ink-900">No countries match "{search}"</h3>
              <button
                onClick={() => {
                  setSearch('');
                  setRegion('All');
                }}
                className="mt-3 text-[14px] font-semibold text-[#1D4ED8] hover:text-brand-800"
              >
                Show all countries
              </button>
            </div>
          )}
        </section>

        {complete && otherCountries.length > 0 && (
          <section>
            <h2 className="text-[20px] font-medium text-ink-900">Also hiring on MadeVisa</h2>
            <p className="mt-0.5 text-[14px] text-ink-500">Countries without a visa guide yet. Open the jobs to see who's hiring.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherCountries.map((s) => (
                <OtherCountry key={s.code} s={s} />
              ))}
            </div>
          </section>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-ink-50 px-4 py-3 text-[13px] leading-6 text-ink-600">
          <Info className="mt-1 h-4 w-4 shrink-0 text-ink-400" />
          <p>
            Eligibility here is a first check against what you told us, not legal advice. Salary thresholds and rules change every year, so confirm on the official site linked from each
            country. Job counts and sponsorship rates are live from listings on MadeVisa. For hands-on help, use a{' '}
            <button onClick={() => go('experts')} className="font-semibold text-[#1D4ED8] hover:text-brand-800">
              verified expert
            </button>
            .
          </p>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function HeroFigure({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-white">
      {label}
      <span className="rounded-md bg-white px-2 py-0.5 text-[15px] font-bold tabular-nums text-brand-700">{value}</span>
    </span>
  );
}

function CountryCard({ guide, stats, loading, status, openRoutes }: { guide: VisaGuide; stats: CountryStats | null; loading: boolean; status: RouteStatus | null; openRoutes: number }) {
  const weekly = useMemo(() => (stats ? weeklyCounts(stats.datesAll, 8) : (Array(8).fill(0) as number[])), [stats]);
  const href = destinationPath(guide);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        nav(href);
      }}
      className="group flex flex-col rounded-xl border border-ink-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-[0_8px_24px_rgba(37,99,235,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
    >
      <div className="flex items-start gap-3">
        <CircleFlag countryCode={guide.code} label={guide.name} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-bold leading-snug text-ink-950 group-hover:text-[#1D4ED8]">{guide.name}</h3>
          <p className="text-[13px] text-ink-500">{guide.region}</p>
        </div>
        {status && <StatusBadge status={status} />}
      </div>

      <p className="mt-3 line-clamp-2 text-[14px] leading-6 text-ink-600">{guide.blurb}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-[#1D4ED8]/5 p-3">
        <Metric label="Open jobs" value={loading ? '…' : (stats?.total ?? 0).toLocaleString()} />
        <Metric label="Sponsored" value={loading ? '…' : stats?.rate != null ? `${stats.rate}%` : '—'} />
        <Metric label="Routes for you" value={status ? String(openRoutes) : '—'} />
      </dl>

      <div className="mt-auto flex items-end justify-between gap-4 pt-4">
        <p className="text-[13px] text-ink-500">
          {guide.prYears === 0 ? 'PR on arrival' : guide.prYears != null ? `PR in ${guide.prYears} yrs` : 'No fixed PR period'}
          {' · '}
          {guide.citizenshipYears != null ? `citizenship in ${guide.citizenshipYears}` : 'citizenship varies'}
        </p>
        {(stats?.total ?? 0) > 0 && (
          <div className="w-20 shrink-0" title="New listings, last 8 weeks">
            <SparkBars values={weekly} height={26} />
          </div>
        )}
      </div>
    </a>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12px] font-medium text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-[18px] font-bold tabular-nums text-ink-950">{value}</dd>
    </div>
  );
}

function OtherCountry({ s }: { s: CountryStats }) {
  const href = `/jobs?country=${encodeURIComponent(s.name)}`;
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        nav(href);
      }}
      className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white py-1.5 pl-1.5 pr-3.5 text-[14px] font-medium text-ink-800 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
    >
      <CircleFlag countryCode={s.code} label={s.name} size={22} />
      {s.name}
      <span className="tabular-nums text-ink-400">{s.total}</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-ink-400" />
    </a>
  );
}
