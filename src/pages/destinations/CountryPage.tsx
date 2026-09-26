import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, BadgeCheck, Building2, ChevronDown, ChevronRight, ExternalLink, Globe2, Info, Landmark, Languages, Plane, Search, Wallet } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { companyPath } from '@/lib/companies';
import { formatRelativeTime } from '@/lib/dates';
import {
  RangeSwitch,
  RingScore,
  RingsWithList,
  ScoreStat,
  SoftCard,
  SoftPanel,
  SparkBars,
  TrendChart,
  TrendLegend,
  weekLabels,
  weeklyCounts,
} from '@/components/charts/SoftCharts';
import {
  ANSWERABLE,
  CANDIDATE_COVER_THIRD_PERSON,
  REQUIREMENT_LABEL,
  ROUTE_KIND_LABEL,
  applicationStepsFor,
  documentsFor,
  destinationPath,
  visaGuideBySlug,
  visaGuides,
  type Requirement,
  type VisaGuide,
  type VisaRoute,
} from '@/data/visa';
import { countryVerdict, needsNoPermit, useDestinationProfile, verdictReason, type Answers, type RouteVerdict } from '@/lib/destinationEligibility';
import { useDestinationStats, type CompanyInCountry, type CountryStats } from '@/lib/destinationStats';
import { CompanyMark, ProfileCard, RateBar, StatusBadge } from '@/pages/destinations/DestinationUI';
import { WRAP, countryName, nav } from '@/lib/pageLayout';

type Props = { slug: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

type NavItem = { id: string; label: string; count?: number; children?: { id: string; label: string }[] };

export function CountryPage({ slug, go, onAuth }: Props) {
  const guide = visaGuideBySlug.get(slug.replace(/\/+$/, '').toLowerCase());

  useSeo({
    title: guide ? `${guide.name} — visas, sponsored jobs & companies hiring` : 'Destination',
    description: guide
      ? `Visa routes for ${guide.name}, years to permanent residence and citizenship, plus live visa-sponsored jobs and the companies hiring there.`
      : 'Destination guide on MadeVisa.',
    path: `/destinations/${slug}`,
  });

  if (!guide) return <NotFoundPage go={go} onAuth={onAuth} />;
  return <CountryView guide={guide} go={go} onAuth={onAuth} />;
}

function CountryView({ guide, go, onAuth }: { guide: VisaGuide; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void }) {
  const me = useDestinationProfile();
  const { stats: all } = useDestinationStats();
  const s = all?.get(guide.code) ?? null;
  const loading = all === null;

  const [range, setRange] = useState<4 | 12 | 26>(12);
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyLimit, setCompanyLimit] = useState(10);
  const [aboutOpen, setAboutOpen] = useState(false);

  const verdict = useMemo(() => countryVerdict(guide, me.citizenship, me.answers), [guide, me.citizenship, me.answers]);
  const exempt = needsNoPermit(guide, me.citizenship);

  const weeklyAll = useMemo(() => weeklyCounts(s?.datesAll ?? [], range), [s, range]);
  const weeklySponsored = useMemo(() => weeklyCounts(s?.datesSponsored ?? [], range), [s, range]);
  const labels = useMemo(() => weekLabels(range), [range]);

  const companies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    return (s?.companies ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [s, companyQuery]);

  const jobsHref = `/jobs?country=${encodeURIComponent(s?.name ?? guide.name)}`;
  const sponsoredJobsHref = `${jobsHref}&visa=1`;

  // Compact bar appears once the big header scrolls away (same as company pages).
  const heroRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'eligibility', label: 'Your eligibility' },
    { id: 'routes', label: 'Visa routes', count: guide.routes.length },
    { id: 'apply', label: 'How to apply' },
    { id: 'pathway', label: 'Path to residence' },
    { id: 'companies', label: 'Companies hiring', count: s?.companies.length, children: [{ id: 'focus', label: 'Roles & cities' }] },
    { id: 'sources', label: 'Short stays & sources' },
    { id: 'about-metrics', label: 'About these metrics' },
  ];
  const activeId = useScrollSpy(['overview', 'eligibility', 'routes', 'apply', 'pathway', 'companies', 'focus', 'sources', 'about-metrics']);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: 'smooth' });
  };

  const sponsoredLabel = s?.rate != null ? `${s.rate}%` : loading ? '…' : '—';
  const firstName = me.firstName;

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="destinations" />

      {/* COMPACT BAR */}
      <div
        className={`fixed inset-x-0 top-[72px] z-30 border-b border-ink-200 bg-white/95 backdrop-blur transition-all duration-300 ${
          compact ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        aria-hidden={!compact}
      >
        <div className={`${WRAP} flex h-16 items-center gap-4`}>
          <CircleFlag countryCode={guide.code} label={guide.name} size={36} />
          <p className="truncate text-[20px] font-medium text-ink-900 sm:text-[24px]">{guide.name}</p>
          <div className="hidden items-center gap-5 lg:flex">
            <ScorePill label="Open jobs" value={loading ? '…' : (s?.total ?? 0).toLocaleString()} />
            <ScorePill label="Visa-sponsored" value={sponsoredLabel} />
            {me.citizenship && <StatusBadge status={verdict.status} />}
          </div>
          <a
            href={sponsoredJobsHref}
            tabIndex={compact ? 0 : -1}
            onClick={(e) => {
              e.preventDefault();
              nav(sponsoredJobsHref);
            }}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[15px] font-semibold text-white hover:bg-brand-800"
          >
            Sponsored jobs
          </a>
        </div>
      </div>

      {/* HEADER */}
      <section ref={heroRef} className="bg-brand-700 text-white">
        <div className={`${WRAP} pb-10 pt-6 sm:pb-12`}>
          <a
            href="/destinations"
            onClick={(e) => {
              e.preventDefault();
              nav('/destinations');
            }}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> All destinations
          </a>
          <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-white p-3 shadow-lg shadow-black/10 sm:h-[128px] sm:w-[128px]">
              <CircleFlag countryCode={guide.code} label={guide.name} size={88} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <h1 className="text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[34px]">{guide.name}</h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <HeroPill label="Open jobs" value={loading ? '…' : (s?.total ?? 0).toLocaleString()} />
                  <HeroPill label="Visa-sponsored" value={sponsoredLabel} />
                  <HeroPill label="Companies" value={loading ? '…' : (s?.companies.length ?? 0).toLocaleString()} />
                </div>
              </div>
              <p className="mt-3 max-w-4xl text-[16px] leading-7 text-white/85">{guide.blurb}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-white/90">
                <span className="flex items-center gap-2">
                  <Globe2 className="h-[18px] w-[18px] text-white/60" /> {guide.region}
                </span>
                <span className="flex items-center gap-2">
                  <Languages className="h-[18px] w-[18px] text-white/60" /> {guide.languages}
                </span>
                <span className="flex items-center gap-2">
                  <Wallet className="h-[18px] w-[18px] text-white/60" /> {guide.currency}
                </span>
                {guide.freeMovement && (
                  <span className="flex items-center gap-2">
                    <BadgeCheck className="h-[18px] w-[18px] text-white/60" /> EU{guide.schengen ? ' · Schengen' : ', not Schengen'}
                  </span>
                )}
              </div>

              {/* Personal status strip */}
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                {me.citizenship ? (
                  <>
                    <CircleFlag countryCode={me.citizenship} label={countryName(me.citizenship)} size={22} />
                    <span className="text-[15px] font-semibold">{firstName ? `${firstName}, ` : ''}with {countryName(me.citizenship)} passport</span>
                    <StatusBadge status={verdict.status} onDark />
                    <span className="text-[14px] text-white/80">
                      {exempt
                        ? verdictReason(verdict.routes[0].verdict, guide)
                        : `${verdict.openCount} of ${guide.routes.length} routes open to you`}
                    </span>
                    <button onClick={() => scrollTo('eligibility')} className="ml-auto text-[14px] font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">
                      Edit profile
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[15px] font-semibold">{firstName ? `${firstName}, add` : 'Add'} your passport to see which routes you qualify for.</span>
                    <button onClick={() => scrollTo('eligibility')} className="ml-auto rounded-full bg-white px-4 py-1.5 text-[14px] font-bold text-brand-700 hover:bg-brand-50">
                      Check eligibility
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MOBILE SECTION NAV */}
      <div className="sticky top-[72px] z-20 border-b border-ink-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex gap-1 overflow-x-auto px-5 py-2 [scrollbar-width:none] sm:px-8">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-[14px] font-medium ${activeId === n.id || n.children?.some((c) => c.id === activeId) ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'text-ink-600'}`}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${WRAP} grid gap-10 py-8 lg:grid-cols-[250px_minmax(0,1fr)]`}>
        <aside className="hidden lg:block">
          <SideNav items={navItems} activeId={activeId} onGo={scrollTo} />
        </aside>

        <main className="min-w-0 space-y-10">
          {/* OVERVIEW */}
          <section id="overview" className="scroll-mt-40">
            <h2 className="text-[24px] font-medium text-ink-900">Overview</h2>
            <SoftPanel className="mt-5">
              <SoftCard className="grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4">
                <ScoreStat title="Open jobs" value={loading ? '…' : (s?.total ?? 0).toLocaleString()} delta={s && s.posted30 > 0 ? { text: `${s.posted30} new`, up: true } : null} note="in past 30 days" />
                <ScoreStat title="Visa-sponsored" value={sponsoredLabel} ring={s?.rate ?? null} note={s ? `${s.sponsored.toLocaleString()} jobs offer sponsorship` : undefined} />
                <ScoreStat title="Companies hiring" value={loading ? '…' : (s?.companies.length ?? 0).toLocaleString()} note={s ? `${s.companies.filter((c) => c.sponsored > 0).length} sponsor visas` : undefined} />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink-600">Years to citizenship</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-[32px] font-bold leading-none tracking-tight text-ink-950 tabular-nums">{guide.citizenshipYears ?? '—'}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-500">{guide.prYears === 0 ? 'PR on arrival possible' : guide.prYears != null ? `PR after ${guide.prYears} years` : 'No fixed PR period'}</p>
                </div>
              </SoftCard>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-bold text-ink-950">Hiring and sponsorship over time</h3>
                  <p className="text-[13px] text-ink-500">New listings per week, by posting date</p>
                </div>
                <RangeSwitch
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: 4, label: '1M' },
                    { value: 12, label: '3M' },
                    { value: 26, label: '6M' },
                  ]}
                />
              </div>
              <div className="mt-4">
                <TrendLegend items={[{ name: 'All new jobs' }, { name: 'Visa-sponsored', shade: 1 }]} />
              </div>
              <div className="mt-4">
                {loading ? (
                  <div className="skeleton-shimmer h-[260px] rounded-lg" />
                ) : !s ? (
                  <EmptyNote text={`No open jobs in ${guide.name} on MadeVisa right now. Visa routes below still apply.`} />
                ) : (
                  <TrendChart
                    labels={labels}
                    unit={['job', 'jobs']}
                    series={[
                      { name: 'All new jobs', values: weeklyAll },
                      { name: 'Visa-sponsored', values: weeklySponsored, shade: 1, fill: true },
                    ]}
                  />
                )}
              </div>
            </SoftPanel>
          </section>

          {/* ELIGIBILITY */}
          <section id="eligibility" className="scroll-mt-40">
            <SectionTitle title="Your eligibility" note="Change any answer and every route below updates." />
            <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <ProfileCard />
              <SoftPanel title="Your best routes">
                {!me.citizenship ? (
                  <EmptyNote text="Add your passport to rank the routes for you." />
                ) : exempt ? (
                  <div className="flex items-start gap-3">
                    <RingScore value={100} label="✓" size={56} />
                    <p className="text-[15px] leading-6 text-ink-700">{verdictReason(verdict.routes[0].verdict, guide)}</p>
                  </div>
                ) : (
                  <ol className="space-y-3">
                    {verdict.routes.slice(0, 3).map(({ route, verdict: v }) => (
                      <li key={route.id}>
                        <button onClick={() => scrollTo(route.id)} className="w-full rounded-lg bg-[#1D4ED8]/5 p-3 text-left transition hover:bg-[#1D4ED8]/10">
                          <span className="block text-[14px] font-semibold leading-snug text-ink-900">{route.name}</span>
                          <StatusBadge status={v.status} className="mt-1.5" />
                          <span className="mt-1 block text-[13px] leading-5 text-ink-600">{verdictReason(v, guide)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </SoftPanel>
            </div>
          </section>

          {/* ROUTES */}
          <section id="routes" className="scroll-mt-40">
            <SectionTitle title={`Visa routes for ${guide.name}`} note={`The main long-stay options, reviewed ${formatReviewed(guide.reviewed)}. Confirm details on the official site before applying.`} />
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {verdict.routes.map(({ route, verdict: v }) => (
                <RouteCard key={route.id} route={route} verdict={v} guide={guide} answers={me.answers} showStatus={Boolean(me.citizenship)} />
              ))}
            </div>
          </section>

          {/* HOW TO APPLY */}
          <section id="apply" className="scroll-mt-40">
            <SectionTitle title="How to apply" note="The usual order of steps for a long-stay visa. Your embassy's own checklist always wins." />
            <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <ol className="space-y-3">
                {applicationStepsFor(guide).map((step, i) => (
                  <li key={step.title} className="flex gap-4 rounded-xl border border-ink-200 bg-white p-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1D4ED8] text-[14px] font-bold text-white">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold text-ink-950">{step.title}</span>
                      <span className="mt-0.5 block text-[14px] leading-6 text-ink-600">{step.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <SoftPanel title="Documents you'll usually need">
                <ul className="space-y-2.5">
                  {documentsFor(guide).map((d) => (
                    <li key={d} className="flex items-start gap-2.5 text-[14px] leading-6 text-ink-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D4ED8]" aria-hidden="true" />
                      {d}
                    </li>
                  ))}
                </ul>
              </SoftPanel>
            </div>
          </section>

          {/* PATHWAY */}
          <section id="pathway" className="scroll-mt-40">
            <SectionTitle title="Path to residence" note="Typical years of legal residence, from arrival" />
            <SoftPanel className="mt-4">
              <PathwayChart guide={guide} />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <SoftCard>
                  <p className="text-[15px] font-bold text-ink-950">Permanent residence</p>
                  <p className="mt-1.5 text-[14px] leading-6 text-ink-600">{guide.prNote}</p>
                </SoftCard>
                <SoftCard>
                  <p className="flex items-center justify-between gap-2 text-[15px] font-bold text-ink-950">
                    Citizenship
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-bold text-ink-600 ring-1 ring-ink-200">
                      Dual citizenship: {guide.dualCitizenship === 'yes' ? 'allowed' : guide.dualCitizenship === 'no' ? 'not allowed' : 'limited'}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[14px] leading-6 text-ink-600">{guide.citizenshipNote}</p>
                </SoftCard>
              </div>
              <PathwayRank guide={guide} />
            </SoftPanel>
          </section>

          {/* COMPANIES */}
          <section id="companies" className="scroll-mt-40">
            <SectionTitle
              title="Companies hiring"
              note="Ranked by visa-sponsored openings on MadeVisa"
              badge={
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" /> Live listings
                </span>
              }
            />
            <div className="mt-4 rounded-xl border border-ink-200 bg-white">
              {loading ? (
                <div className="space-y-3 p-5">
                  {[0, 1, 2, 3].map((k) => (
                    <div key={k} className="skeleton-shimmer h-14 rounded-lg" />
                  ))}
                </div>
              ) : !s || s.companies.length === 0 ? (
                <div className="p-5">
                  <EmptyNote text={`No companies are hiring in ${guide.name} on MadeVisa yet.`} />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
                    <p className="text-[14px] text-ink-500">
                      {s.companies.length} companies · {s.companies.filter((c) => c.sponsored > 0).length} sponsor visas
                    </p>
                    {s.companies.length > 8 && (
                      <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-[#1D4ED8] sm:w-64">
                        <Search className="h-4 w-4 text-ink-400" />
                        <input value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} placeholder="Find a company" aria-label="Find a company" className="h-full w-full bg-transparent text-[15px] outline-none" />
                      </label>
                    )}
                  </div>
                  <div className="hidden grid-cols-[minmax(0,1fr)_90px_minmax(140px,220px)_96px] gap-4 px-5 pt-3 text-[12px] font-semibold text-ink-500 md:grid">
                    <span>Company</span>
                    <span className="text-right">Open jobs</span>
                    <span>Visa-sponsored share</span>
                    <span>8 weeks</span>
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {companies.slice(0, companyLimit).map((c) => (
                      <CompanyRow key={c.id} c={c} />
                    ))}
                  </ul>
                  {companies.length === 0 && <p className="px-5 py-6 text-[15px] text-ink-400">No company matches "{companyQuery}".</p>}
                  {companies.length > companyLimit && (
                    <button onClick={() => setCompanyLimit((n) => n + 20)} className="w-full border-t border-ink-100 py-3.5 text-[15px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
                      Show more ({companies.length - companyLimit} more)
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={sponsoredJobsHref}
                onClick={(e) => {
                  e.preventDefault();
                  nav(sponsoredJobsHref);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-800"
              >
                See visa-sponsored jobs in {guide.name}
              </a>
              <a
                href={jobsHref}
                onClick={(e) => {
                  e.preventDefault();
                  nav(jobsHref);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-ink-800 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
              >
                All jobs in {guide.name}
              </a>
            </div>

            <div id="focus" className="mt-6 grid scroll-mt-40 gap-6 xl:grid-cols-2">
              <SoftPanel title="What they hire for">
                {s && s.functions.length > 0 ? (
                  <ul className="space-y-2.5">
                    {s.functions.slice(0, 6).map((f, k) => (
                      <li key={f.label} className="flex items-center gap-4 rounded-lg bg-[#1D4ED8]/5 px-4 py-2.5">
                        <span className="w-12 text-[20px] font-bold tabular-nums text-ink-950">{f.n}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink-800">{f.label}</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#1D4ED8]/10">
                            <span className="block h-full rounded-full" style={{ width: `${(f.n / s.functions[0].n) * 100}%`, background: `rgba(29,78,216,${1 - k * 0.14})` }} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyNote text={loading ? 'Loading…' : 'No role data yet.'} />
                )}
              </SoftPanel>
              <SoftPanel title="Where the jobs are">
                {s && s.cities.length > 0 ? <RingsWithList items={s.cities.map((c) => ({ label: c.label, n: c.n }))} /> : <EmptyNote text={loading ? 'Loading…' : 'No city data yet.'} />}
              </SoftPanel>
            </div>
          </section>

          {/* SOURCES */}
          <section id="sources" className="scroll-mt-40">
            <SectionTitle title="Short stays & official sources" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-ink-200 bg-white p-5">
                <p className="flex items-center gap-2 text-[15px] font-bold text-ink-950">
                  <Plane className="h-[18px] w-[18px] text-[#1D4ED8]" /> Visiting
                </p>
                <p className="mt-2 text-[14px] leading-6 text-ink-600">{guide.shortStay}</p>
              </div>
              <div className="rounded-xl border border-ink-200 bg-white p-5">
                <p className="flex items-center gap-2 text-[15px] font-bold text-ink-950">
                  <Landmark className="h-[18px] w-[18px] text-[#1D4ED8]" /> Official government sources
                </p>
                <ul className="mt-2 space-y-2">
                  {guide.officialLinks.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-[14px] font-medium text-[#1D4ED8] hover:text-brand-800">
                        <span className="flex-1">{l.label}</span>
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <OtherDestinations guide={guide} stats={all} />
          </section>

          {/* ABOUT */}
          <section id="about-metrics" className="scroll-mt-40">
            <button
              onClick={() => setAboutOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-xl bg-ink-50 px-5 py-4 text-left text-[15px] font-medium text-ink-800 hover:bg-ink-100"
              aria-expanded={aboutOpen}
            >
              <span className="flex items-center gap-2">
                <Info className="h-[18px] w-[18px] text-ink-500" /> About these metrics
              </span>
              <ChevronDown className={`h-5 w-5 text-ink-500 transition-transform ${aboutOpen ? 'rotate-180' : ''}`} />
            </button>
            {aboutOpen && (
              <div className="space-y-2 px-5 pt-4 text-[14px] leading-6 text-ink-600">
                <p>
                  <strong className="text-ink-800">Jobs, companies and sponsorship rates</strong> are counted live from the open listings on MadeVisa whose main location is {guide.name}. A
                  job counts as visa-sponsored when the listing says the employer offers sponsorship.
                </p>
                <p>
                  <strong className="text-ink-800">Eligibility</strong> compares each route's main conditions with your answers. "Likely eligible" means you meet what we can check, and
                  something like a salary threshold or points test still needs confirming. It isn't legal advice.
                </p>
                <p>
                  <strong className="text-ink-800">Visa routes and timelines</strong> are summarised from official government sources and were last reviewed {formatReviewed(guide.reviewed)}.
                  Rules change, so always confirm on the linked official page.
                </p>
              </div>
            )}
          </section>
        </main>
      </div>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function RouteCard({ route, verdict, guide, answers, showStatus }: { route: VisaRoute; verdict: RouteVerdict; guide: VisaGuide; answers: Answers; showStatus: boolean }) {
  return (
    <article id={route.id} className="flex scroll-mt-40 flex-col rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-md bg-[#1D4ED8]/10 px-2 py-0.5 text-[12px] font-bold text-[#1D4ED8]">{ROUTE_KIND_LABEL[route.kind]}</span>
          <h3 className="mt-2 text-[18px] font-bold leading-snug text-ink-950">{route.name}</h3>
        </div>
        {showStatus && <StatusBadge status={verdict.status} />}
      </div>
      <p className="mt-2 text-[14px] leading-6 text-ink-600">{route.summary}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-[#1D4ED8]/5 p-3 text-[13px]">
        <div className="min-w-0">
          <dt className="text-ink-500">Valid for</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{route.validity}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-500">Fee</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{route.fee ?? 'See official site'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-500">Counts to PR</dt>
          <dd className={`mt-0.5 font-semibold ${route.leadsToPR ? 'text-emerald-700' : 'text-ink-500'}`}>{route.leadsToPR ? 'Yes' : 'No'}</dd>
        </div>
      </dl>

      <p className="mt-4 text-[13px] font-semibold text-ink-700">What it asks for</p>
      <ul className="mt-2 space-y-1.5">
        {route.requires.map((r) => (
          <RequirementLine key={r} r={r} answer={ANSWERABLE.includes(r) ? answers[r] ?? null : undefined} />
        ))}
      </ul>
      {route.note && <p className="mt-3 text-[13px] leading-5 text-ink-500">{route.note}</p>}
      {route.employer && <EmployerSideDetails route={route} />}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        {showStatus && <p className="text-[13px] leading-5 text-ink-600">{verdictReason(verdict, guide)}</p>}
        <a href={route.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-[#1D4ED8] hover:text-brand-800">
          Official page <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

/** What the employer does on this route — the same facts a Hiring Brief shows. */
function EmployerSideDetails({ route }: { route: VisaRoute }) {
  const [open, setOpen] = useState(false);
  const e = route.employer!;
  return (
    <div className="mt-4 rounded-lg border border-[#1D4ED8]/15">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[14px] font-semibold text-ink-800">
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#1D4ED8]" /> What the employer does
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.licenceNeeded ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            {e.licenceNeeded ? 'Sponsor licence needed' : 'No sponsor licence'}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#1D4ED8]/10 px-3 pb-3 pt-3 text-[13px] leading-5 text-ink-700">
          {e.licenceNote && <p>{e.licenceNote}</p>}
          <ol className="space-y-2">
            {e.steps.map((st, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-bold text-[#1D4ED8]">{i + 1}.</span>
                <span>
                  {st.text}
                  {st.effort && <span className="text-ink-500"> {st.optional ? '(optional) ' : ''}· {st.effort}</span>}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-ink-600">{e.timeline}</p>
          <p className="text-ink-600">
            <strong className="text-ink-800">The candidate can cover:</strong> {e.candidateMayCover.map((c) => CANDIDATE_COVER_THIRD_PERSON[c].toLowerCase()).join(', ')}.
          </p>
          <p className="rounded-md bg-[#1D4ED8]/5 px-2.5 py-2 text-ink-600">Candidates can send this to employers as a Hiring Brief from any matching job on MadeVisa.</p>
        </div>
      )}
    </div>
  );
}

/** answer: true/false/null for answerable requirements; undefined for "confirm on the official site". */
function RequirementLine({ r, answer }: { r: Requirement; answer: boolean | null | undefined }) {
  const mark =
    answer === true
      ? { cls: 'bg-emerald-100 text-emerald-700', sym: '✓', hint: 'You said yes' }
      : answer === false
        ? { cls: 'bg-amber-100 text-amber-800', sym: '✕', hint: 'You said no' }
        : answer === null
          ? { cls: 'bg-ink-100 text-ink-500', sym: '?', hint: 'Not answered yet' }
          : { cls: 'bg-sky-50 text-sky-700', sym: 'i', hint: 'Confirm on the official site' };
  return (
    <li className="flex items-start gap-2.5 text-[14px]" title={mark.hint}>
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${mark.cls}`} aria-hidden="true">
        {mark.sym}
      </span>
      <span className={answer === false ? 'text-ink-500' : 'text-ink-800'}>
        {REQUIREMENT_LABEL[r]}
        <span className="sr-only"> — {mark.hint}</span>
      </span>
    </li>
  );
}

/** Year axis with arrival → permanent residence → citizenship milestones. */
function PathwayChart({ guide }: { guide: VisaGuide }) {
  const pr = guide.prYears;
  const cit = guide.citizenshipYears;
  const end = Math.max(6, (cit ?? pr ?? 5) + 1);
  const ticks = Array.from({ length: end + 1 }, (_, i) => i);
  const at = (y: number) => `${(y / end) * 100}%`;
  const milestones = [
    { key: 'arrive', year: 0, label: 'Arrive on a visa', strong: false },
    ...(pr != null ? [{ key: 'pr', year: pr, label: pr === 0 ? 'Permanent residence on arrival' : 'Permanent residence', strong: true }] : []),
    ...(cit != null ? [{ key: 'cit', year: cit, label: 'Citizenship', strong: true }] : []),
  ];
  return (
    <div>
      <div className="relative mx-3 h-[118px]">
        {/* track */}
        <div className="absolute inset-x-0 top-[54px] h-2 rounded-full bg-[#1D4ED8]/10" />
        {pr != null && <div className="absolute left-0 top-[54px] h-2 rounded-full bg-[#1D4ED8]/35" style={{ width: at(pr) }} />}
        {cit != null && pr != null && <div className="absolute top-[54px] h-2 rounded-r-full bg-[#1D4ED8]" style={{ left: at(pr), width: `calc(${at(cit)} - ${at(pr)})` }} />}
        {cit != null && pr == null && <div className="absolute left-0 top-[54px] h-2 rounded-full bg-[#1D4ED8]/35" style={{ width: at(cit) }} />}
        {milestones.map((m, i) => {
          const above = i % 2 === 1;
          return (
            <div key={m.key} className="absolute top-0 h-full -translate-x-1/2" style={{ left: at(m.year) }}>
              <span
                className={`absolute left-1/2 top-[48px] grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full ring-4 ring-white ${m.strong ? 'bg-[#1D4ED8]' : 'bg-white shadow-[inset_0_0_0_2px_rgba(29,78,216,0.5)]'}`}
              />
              <span
                className={`absolute w-max max-w-[150px] text-[13px] font-semibold leading-tight text-ink-800 ${above ? 'top-0' : 'top-[80px]'} ${
                  m.year === 0 ? 'left-0 -translate-x-2.5 text-left' : m.year === end ? 'right-0 translate-x-2.5 text-right' : 'left-1/2 -translate-x-1/2 text-center'
                }`}
              >
                {m.label}
                <span className="block text-[12px] font-medium text-ink-500">{m.year === 0 ? 'Year 0' : `Year ${m.year}`}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative mx-3 mt-6 h-4 border-t border-ink-200">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 pt-1 text-[11px] tabular-nums text-ink-400" style={{ left: at(t) }}>
            {t}
          </span>
        ))}
      </div>
      {(pr == null || cit == null) && (
        <p className="mt-6 text-[13px] text-ink-500">{pr == null ? 'There is no fixed waiting period for permanent residence. ' : ''}{cit == null ? 'Citizenship has no fixed residence period here.' : ''}</p>
      )}
    </div>
  );
}

/** "Faster than X of Y destinations" — how this country compares on years to citizenship. */
function PathwayRank({ guide }: { guide: VisaGuide }) {
  if (guide.citizenshipYears == null) return null;
  const known = visaGuides.filter((g) => g.citizenshipYears != null);
  const slower = known.filter((g) => (g.citizenshipYears ?? 0) > (guide.citizenshipYears ?? 0)).length;
  const sorted = [...known].sort((a, b) => (a.citizenshipYears ?? 0) - (b.citizenshipYears ?? 0));
  const max = Math.max(...known.map((g) => g.citizenshipYears ?? 0));
  return (
    <div className="mt-6">
      <p className="text-[15px] font-bold text-ink-950">
        Faster to citizenship than {slower} of {known.length - 1} other destinations
      </p>
      <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label={`Years to citizenship across ${known.length} destinations`}>
        {sorted.map((g) => {
          const me = g.code === guide.code;
          return (
            <a
              key={g.code}
              href={destinationPath(g)}
              onClick={(e) => {
                e.preventDefault();
                nav(destinationPath(g));
              }}
              title={`${g.name}: ${g.citizenshipYears} years`}
              className={`flex-1 rounded-t transition-colors ${me ? 'bg-[#1D4ED8]' : 'bg-[#1D4ED8]/15 hover:bg-[#1D4ED8]/35'}`}
              style={{ height: `${((g.citizenshipYears ?? 0) / max) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-ink-500">
        <span>Fastest</span>
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#1D4ED8]" />
          {guide.name}: {guide.citizenshipYears} years
        </span>
        <span>Slowest</span>
      </div>
    </div>
  );
}

function CompanyRow({ c }: { c: CompanyInCountry }) {
  const href = companyPath({ id: c.id, name: c.name });
  return (
    <li>
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          nav(href);
        }}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-[#1D4ED8]/[0.03] md:grid-cols-[minmax(0,1fr)_90px_minmax(140px,220px)_96px]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <CompanyMark name={c.name} logoUrl={c.logoUrl} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-ink-900">{c.name}</span>
            <span className="block text-[12px] text-ink-500">{c.lastPosted ? `Latest ${formatRelativeTime(c.lastPosted, '')}` : 'Hiring'}</span>
          </span>
        </span>
        <span className="text-right text-[17px] font-bold tabular-nums text-ink-950">{c.total}</span>
        <span className="col-span-2 flex items-center gap-3 md:col-span-1">
          <RateBar value={c.rate} className="flex-1" />
          <span className="w-24 shrink-0 text-right text-[13px] tabular-nums text-ink-600 md:w-auto">
            <strong className="text-ink-900">{c.rate}%</strong> · {c.sponsored}
          </span>
        </span>
        <span className="hidden md:block" title="New listings per week">
          <SparkBars values={c.weekly} height={24} />
        </span>
      </a>
    </li>
  );
}

function OtherDestinations({ guide, stats }: { guide: VisaGuide; stats: Map<string, CountryStats> | null }) {
  const near = visaGuides.filter((g) => g.code !== guide.code && g.region === guide.region);
  const list = (near.length >= 3 ? near : visaGuides.filter((g) => g.code !== guide.code)).slice(0, 6);
  return (
    <div className="mt-6">
      <p className="text-[15px] font-bold text-ink-950">{near.length >= 3 ? `More in ${guide.region}` : 'Other destinations'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((g) => (
          <a
            key={g.code}
            href={destinationPath(g)}
            onClick={(e) => {
              e.preventDefault();
              nav(destinationPath(g));
            }}
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white py-1.5 pl-1.5 pr-3.5 text-[14px] font-medium text-ink-800 hover:border-[#1D4ED8]/40 hover:text-[#1D4ED8]"
          >
            <CircleFlag countryCode={g.code} label={g.name} size={22} />
            {g.name}
            {stats?.get(g.code) && <span className="tabular-nums text-ink-400">{stats.get(g.code)!.total}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ScorePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-bold text-ink-900">
      {label}
      <span className="rounded-md bg-[#1D4ED8]/10 px-2 py-0.5 text-[15px] font-semibold tabular-nums text-[#1D4ED8]">{value}</span>
    </span>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-white">
      {label}
      <span className="rounded-md bg-white px-2 py-0.5 text-[15px] font-bold tabular-nums text-brand-700">{value}</span>
    </span>
  );
}

function SectionTitle({ title, note, badge }: { title: string; note?: string; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[22px] font-medium text-ink-900">{title}</h2>
        {note && <p className="mt-0.5 text-[14px] text-ink-500">{note}</p>}
      </div>
      {badge}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-[#1D4ED8]/5 px-4 py-6 text-center text-[14px] text-ink-500">{text}</p>;
}

function formatReviewed(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function SideNav({ items, activeId, onGo }: { items: NavItem[]; activeId: string; onGo: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <nav className="sticky top-[152px] space-y-1" aria-label="On this page">
      {items.map((n) => {
        const childActive = n.children?.some((c) => c.id === activeId);
        const isOpen = open[n.id] ?? childActive ?? false;
        const active = activeId === n.id || childActive;
        return (
          <div key={n.id}>
            <div className={`flex items-center rounded-lg transition-colors ${active ? 'bg-[#1D4ED8]/10' : 'hover:bg-ink-50'}`}>
              {n.children ? (
                <button onClick={() => setOpen((o) => ({ ...o, [n.id]: !isOpen }))} className="grid h-10 w-7 shrink-0 place-items-center text-ink-500" aria-label={isOpen ? 'Collapse' : 'Expand'}>
                  <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <button onClick={() => onGo(n.id)} className={`flex flex-1 items-center justify-between py-2.5 pr-3 text-left text-[15px] ${active ? 'font-semibold text-[#1D4ED8]' : 'text-ink-600 hover:text-ink-900'}`}>
                {n.label}
                {n.count != null && <span className="text-[13px] font-medium text-ink-400">{n.count}</span>}
              </button>
            </div>
            {n.children && isOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5 border-l border-ink-200 pl-3">
                {n.children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onGo(c.id)}
                    className={`block w-full rounded-md px-3 py-2 text-left text-[14px] ${activeId === c.id ? 'font-semibold text-[#1D4ED8]' : 'text-ink-500 hover:text-ink-900'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-6 rounded-lg bg-ink-50 p-3 text-[13px] leading-5 text-ink-600">
        <Building2 className="mb-1 h-4 w-4 text-ink-400" />
        Hiring in this country? Post your jobs on MadeVisa.
        <a
          href="/submit-job"
          onClick={(e) => {
            e.preventDefault();
            nav('/submit-job');
          }}
          className="mt-1 block font-semibold text-[#1D4ED8] hover:text-brand-800">
          Post a job
        </a>
      </div>
    </nav>
  );
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 170) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}
