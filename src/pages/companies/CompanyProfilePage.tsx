import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Landmark,
  MessageSquarePlus,
  Search,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { companyDescriptionMeta, companyTitleMeta } from '@/lib/seoMeta';
import { useUkSponsor } from '@/lib/sponsorRegister';
import { SponsorAnswer } from '@/components/companies/SponsorProof';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { HireCountries } from '@/components/companies/HireCountries';
import { ShareExperienceDialog } from '@/components/companies/ShareExperienceDialog';
import { feedbackPath, fetchExperienceSummary, scoreWord, type ExperienceSummary } from '@/lib/companyExperiences';
import { CircleFlag } from '@/components/common/CircleFlag';
import { companyPath, fetchCompanyBySlug, fetchCompanyInsights, type CompanyInsights, type CompanyProfile } from '@/lib/companies';
import { fetchPublishedJobsByPublisher, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchPublishedProgramsByPublisher, type SponsoredProgram } from '@/lib/programs';
import { jobPath } from '@/lib/jobUrl';
import { formatRelativeTime } from '@/lib/dates';
import type { Job } from '@/data/jobs';
import {
  RangeSwitch,
  RingScore,
  RingsWithList,
  ScoreStat,
  SoftCard,
  SoftPanel,
  SparkBars,
  StepFlow,
  TrendChart,
  TrendLegend,
  rolling,
  weekLabels,
  weeklyCounts,
} from '@/components/charts/SoftCharts';

type Props = { slug: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const ORG_LABEL: Record<string, string> = { company: 'Company', government: 'Government', agency: 'Agency', expert: 'Expert', university: 'University' };

/** Same width as the site header, so edges line up and there are no big side margins. */
const WRAP = 'mx-auto w-full max-w-7xl px-5 sm:px-8';

function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

type NavItem = { id: string; label: string; count?: number; children?: { id: string; label: string }[] };

export function CompanyProfilePage({ slug, go, onAuth }: Props) {
  const [company, setCompany] = useState<CompanyProfile | null | undefined>(undefined);
  const [insights, setInsights] = useState<CompanyInsights | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [programs, setPrograms] = useState<SponsoredProgram[] | null>(null);
  const [tab, setTab] = useState<'jobs' | 'programs'>('jobs');
  const [jobQuery, setJobQuery] = useState('');
  const [jobLimit, setJobLimit] = useState(24);
  const [range, setRange] = useState<4 | 12 | 26>(12);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shared, setShared] = useState<ExperienceSummary | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setCompany(undefined);
    fetchCompanyBySlug(slug).then((c) => {
      if (!alive) return;
      setCompany(c);
      if (!c) return;
      fetchCompanyInsights(c.id).then((i) => alive && setInsights(i));
      fetchExperienceSummary(c.id).then((x) => alive && setShared(x));
      fetchPublishedJobsByPublisher(c.id).then((rows) => alive && setJobs(rows.map(sponsoredJobToBoardJob)));
      fetchPublishedProgramsByPublisher(c.id).then((rows) => {
        if (!alive) return;
        setPrograms(rows);
      });
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (jobs && programs && jobs.length === 0 && programs.length > 0) setTab('programs');
  }, [jobs, programs]);

  const ukSponsor = useUkSponsor(company?.id);
  useSeo({
    title: company ? companyTitleMeta(company.name) : 'Company',
    description: company ? companyDescriptionMeta(company.name, jobs?.length, Boolean(ukSponsor)) : 'Company profile on MadeVisa.',
    // Always the company's own address, whatever spelling the visitor arrived on.
    path: company ? companyPath(company) : `/companies/${slug}`,
    noindex: company === null,
    ogImage: `https://madevisa.com/api/og/company?slug=${encodeURIComponent(company ? companyPath(company).slice('/companies/'.length) : slug)}`,
  });

  const shownJobs = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    return (jobs ?? []).filter((j) => !q || `${j.title} ${j.city} ${j.country}`.toLowerCase().includes(q));
  }, [jobs, jobQuery]);

  // Weekly new listings (from posting dates of the listings MadeVisa holds).
  const listingDates = useMemo(() => [...(jobs ?? []).map((j) => j.postedDate ?? j.published), ...(programs ?? []).map((p) => p.created_at)], [jobs, programs]);
  const weekly = useMemo(() => weeklyCounts(listingDates, range), [listingDates, range]);
  const weekly8 = useMemo(() => weeklyCounts(listingDates, 8), [listingDates]);
  const labels = useMemo(() => weekLabels(range), [range]);

  // What they hire for — counted from the open jobs' categories.
  const focus = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs ?? []) if (j.category) m.set(j.category, (m.get(j.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }));
  }, [jobs]);

  // Compact bar appears once the big header scrolls away (Crunchbase-style).
  const heroRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [company]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'hiring', label: 'Hiring activity', children: [{ id: 'hiring-performance', label: 'Performance' }, { id: 'hiring-locations', label: 'Locations & focus' }] },
    { id: 'response', label: 'Applicant response', children: [{ id: 'response-funnel', label: 'Response funnel' }, { id: 'response-shared', label: 'Shared by applicants' }] },
    { id: 'trust', label: 'Trust & engagement' },
    { id: 'listings', label: 'Open jobs', count: jobs?.length },
    { id: 'about-metrics', label: 'About these metrics' },
  ];
  const activeId = useScrollSpy(['overview', 'hiring-performance', 'hiring', 'hiring-locations', 'response', 'response-funnel', 'response-shared', 'trust', 'listings', 'about-metrics'], company);

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="companies" />
      {children}
      {company && <ShareExperienceDialog open={shareOpen} onClose={() => setShareOpen(false)} company={{ id: company.id, name: company.name, logo_url: company.logo_url }} onAuth={onAuth} />}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );

  if (company === undefined) {
    return shell(
      <div className={`${WRAP} py-10`}>
        <div className="flex gap-6">
          <div className="skeleton-shimmer h-28 w-28 rounded-xl" />
          <div className="flex-1">
            <div className="skeleton-shimmer h-8 w-72 rounded-md" />
            <div className="skeleton-shimmer mt-4 h-4 w-full max-w-2xl rounded-md" />
            <div className="skeleton-shimmer mt-3 h-4 w-96 max-w-full rounded-md" />
          </div>
        </div>
      </div>,
    );
  }
  if (company === null) {
    return <NotFoundPage kind="company" go={go} onAuth={onAuth} />;
  }

  const i = insights;
  const verified = company.verification_status === 'verified';
  const postsDirectly = Boolean(company.owner_id);
  const syncedRecently = i?.last_synced ? Date.now() - new Date(i.last_synced).getTime() < 3 * 86_400_000 : false;
  const perMonth = i ? Math.round((i.posted_90d / 3) * 10) / 10 : null;
  const websiteHost = company.website ? company.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
  const OrgIcon = company.org_type === 'government' ? Landmark : company.org_type === 'agency' ? Users : Building2;
  const openListings = i ? i.active_jobs + i.active_programs : (jobs?.length ?? 0) + (programs?.length ?? 0);
  const rel = i ? reliabilityOf(i) : undefined;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: 'smooth' });
  };

  const pills = (
    <>
      <ScorePill label="Open listings" value={openListings.toLocaleString()} up={(i?.posted_30d ?? 0) > 0} />
      <ScorePill label="Response rate" value={i?.response_rate != null ? `${i.response_rate}%` : '—'} up={i?.response_rate != null ? i.response_rate >= 50 : undefined} />
      <ScorePill label="New · 30d" value={i ? i.posted_30d.toLocaleString() : '—'} up={i ? i.posted_30d > 0 : undefined} />
    </>
  );

  const heroPills = (
    <>
      <HeroPill label="Open listings" value={openListings.toLocaleString()} up={(i?.posted_30d ?? 0) > 0} />
      <HeroPill label="Response rate" value={i?.response_rate != null ? `${i.response_rate}%` : '—'} up={i?.response_rate != null ? i.response_rate >= 50 : undefined} />
      <HeroPill label="New · 30d" value={i ? i.posted_30d.toLocaleString() : '—'} up={i ? i.posted_30d > 0 : undefined} />
    </>
  );

  return shell(
    <>
      {/* COMPACT BAR — slides in when the header scrolls away */}
      <div
        className={`fixed inset-x-0 top-[72px] z-30 border-b border-ink-200 bg-white/95 backdrop-blur transition-all duration-300 ${
          compact ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        aria-hidden={!compact}
      >
        <div className={`${WRAP} flex h-16 items-center gap-4`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-white p-1">
            {company.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain" /> : <OrgIcon className="h-5 w-5 text-ink-300" />}
          </span>
          <p className="truncate text-[20px] font-medium text-ink-900 sm:text-[24px]">{company.name}</p>
          <div className="hidden items-center gap-5 lg:flex">{pills}</div>
          <button
            onClick={() => scrollTo('listings')}
            tabIndex={compact ? 0 : -1}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[15px] font-semibold text-white hover:bg-brand-700"
          >
            <Briefcase className="h-4 w-4" /> Open jobs
          </button>
        </div>
      </div>

      {/* HEADER */}
      <section ref={heroRef} className="bg-brand-700 text-white">
        <div className={`${WRAP} pb-10 pt-6 sm:pb-12`}>
          <button onClick={() => nav('/companies')} className="flex items-center gap-1.5 text-[14px] font-semibold text-white/80 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Company Scores
          </button>
          <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-3 shadow-lg shadow-black/10 transition-transform duration-300 hover:scale-[1.03] sm:h-[128px] sm:w-[128px]">
              {company.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain" /> : <OrgIcon className="h-12 w-12 text-ink-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <h1 className="flex items-center gap-2 text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[34px]">
                  {company.name}
                  {verified && (
                    <span title="Verified by MadeVisa">
                      <BadgeCheck className="h-6 w-6 text-white" />
                    </span>
                  )}
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{heroPills}</div>
              </div>
              {i && i.top_countries.length > 0 && (
                <HireCountries countries={i.top_countries} max={4} tone="dark" size={20} className="mt-2" />
              )}
              {company.description && <p className="mt-3 line-clamp-3 max-w-5xl text-[16px] leading-7 text-white/85">{company.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-white/90">
                <span className="flex items-center gap-2">
                  <OrgIcon className="h-[18px] w-[18px] text-ink-400" /> {ORG_LABEL[company.org_type] ?? 'Organization'}
                </span>
                {verified && (
                  <span className="flex items-center gap-2">
                    <BadgeCheck className="h-[18px] w-[18px] text-ink-400" /> Verified
                  </span>
                )}
                {company.country && (
                  <span className="flex items-center gap-2">
                    <CircleFlag countryCode={company.country.iso_code} label={company.country.name} size={18} /> {company.country.name}
                  </span>
                )}
                {i?.first_listed && (
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-[18px] w-[18px] text-ink-400" /> On MadeVisa since {new Date(i.first_listed).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                )}
                {websiteHost && (
                  <a href={company.website!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline decoration-white/40 underline-offset-2 hover:decoration-white">
                    <ExternalLink className="h-[18px] w-[18px] text-ink-400" /> {websiteHost}
                  </a>
                )}
              </div>
              {i && i.top_functions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {i.top_functions.map((f) => (
                    <span key={f} className="rounded-full bg-white/15 px-4 py-1.5 text-[15px] font-medium text-white ring-1 ring-white/20 transition-colors hover:bg-white/25">
                      {f}
                    </span>
                  ))}
                </div>
              )}
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
        {/* LEFT NAV */}
        <aside className="hidden lg:block">
          <SideNav items={navItems} activeId={activeId} onGo={scrollTo} />
        </aside>

        {/* RIGHT CONTENT */}
        <main className="min-w-0 space-y-8">
          {company && <SponsorAnswer publisherId={company.id} companyName={company.name} />}
          <section id="overview" className="scroll-mt-40">
            <h2 className="text-[24px] font-medium text-ink-900">Overview</h2>

            {/* Summary + performance — one soft panel, like Crunchbase's summary card */}
            <SoftPanel className="mt-5" id="hiring-performance">
              <SoftCard className="grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4">
                <ScoreStat
                  title="Open listings"
                  value={openListings.toLocaleString()}
                  delta={i && i.posted_30d > 0 ? { text: `${i.posted_30d} new`, up: true } : null}
                  note="in past 30 days"
                />
                <ScoreStat title="Response rate" value={i?.response_rate != null ? `${i.response_rate}%` : '—'} ring={i ? i.response_rate : null} note={rel ? RELIABILITY[rel][0] : 'Loading…'} />
                <ScoreStat
                  title="Replied in a week"
                  value={i?.response_week_rate != null ? `${i.response_week_rate}%` : '—'}
                  ring={i ? (i.response_week_rate ?? null) : null}
                  note={i?.avg_response_days != null ? `avg. ${i.avg_response_days}d to reply` : undefined}
                />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink-600">Posting frequency</p>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-[32px] font-bold leading-none tracking-tight text-ink-950 tabular-nums">{perMonth ?? '—'}</span>
                    <div className="w-20 pb-1">
                      <SparkBars values={weekly8} height={28} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-500">listings / month</p>
                </div>
              </SoftCard>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-bold text-ink-950">Hiring performance</h3>
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
                <TrendLegend items={[{ name: 'New listings' }, { name: '4-week trend', dashed: true, shade: 1 }]} />
              </div>
              <div className="mt-4">
                {jobs === null ? (
                  <div className="skeleton-shimmer h-[260px] rounded-lg" />
                ) : (
                  <TrendChart
                    labels={labels}
                    unit={['listing', 'listings']}
                    series={[
                      { name: 'New listings', values: weekly },
                      { name: '4-week trend', values: rolling(weekly, 4), dashed: true, shade: 1 },
                    ]}
                  />
                )}
              </div>
            </SoftPanel>
          </section>

          {/* HIRING ACTIVITY */}
          <section id="hiring" className="scroll-mt-40">
            <SectionTitle title="Hiring activity" badge={<ReliabilityLabel level="records" />} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {i ? (
                <>
                  <Tile label="Active listings" value={(i.active_jobs + i.active_programs).toLocaleString()} />
                  <Tile label="Closed / filled · 90 days" value={i.closed_90d.toLocaleString()} />
                  <Tile label="New in last 30 days" value={i.posted_30d.toLocaleString()} spark={weekly8.slice(-4)} />
                  <Tile label="Posting frequency" value={perMonth != null ? `${perMonth} / mo` : '—'} />
                  <Tile label="Latest new listing" value={i.last_listed ? formatRelativeTime(i.last_listed, '—') : '—'} />
                  <Tile label="On MadeVisa since" value={i.first_listed ? new Date(i.first_listed).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'} />
                </>
              ) : (
                [0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="skeleton-shimmer h-[92px] rounded-xl" />)
              )}
            </div>

            <div id="hiring-locations" className="mt-6 grid scroll-mt-40 gap-6 xl:grid-cols-2">
              <SoftPanel title="Where they hire">
                {i && i.top_countries.length > 0 ? (
                  <RingsWithList items={i.top_countries.map((c) => ({ label: c.name, code: c.code, n: c.n }))} />
                ) : (
                  <EmptyNote text={i ? 'No location data yet.' : 'Loading…'} />
                )}
              </SoftPanel>

              <SoftPanel title="Hiring focus">
                {focus.length > 0 ? (
                  <ul className="space-y-2.5">
                    {focus.slice(0, 5).map((f, k) => (
                      <li key={f.label} className="group/f flex items-center gap-4 rounded-lg bg-[#1D4ED8]/5 px-4 py-2.5 transition duration-300 hover:translate-x-1 hover:bg-[#1D4ED8]/[0.08]">
                        <span className="w-10 text-[22px] font-bold tabular-nums text-ink-950">{f.n}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink-800">{f.label}</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#1D4ED8]/10">
                            <span className="block h-full rounded-full" style={{ width: `${(f.n / focus[0].n) * 100}%`, background: `rgba(29,78,216,${1 - k * 0.16})` }} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyNote text={jobs === null ? 'Loading…' : 'No open jobs to group yet.'} />
                )}
              </SoftPanel>
            </div>
          </section>

          {/* APPLICANT RESPONSE */}
          <section id="response" className="scroll-mt-40">
            <SectionTitle
              title="Applicant response"
              badge={rel ? <ReliabilityLabel level={rel} /> : null}
              note={
                i
                  ? `${i.tracked} applications tracked${i.applicants != null ? ` from ${i.applicants} applicant${i.applicants === 1 ? '' : 's'}` : ''}${i.verified ? ` · ${i.verified} verified` : ''}`
                  : 'From applications tracked on MadeVisa'
              }
            />
            <SoftPanel className="mt-4" id="response-funnel">
              {!i ? (
                <EmptyNote text="Statistics will appear here shortly." />
              ) : i.tracked === 0 ? (
                <SoftCard className="p-5">
                  <EmptyApplications />
                </SoftCard>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <SoftCard className="p-5">
                    <p className="mb-5 text-[15px] font-bold text-ink-950">Application → offer</p>
                    <StepFlow
                      steps={[
                        { label: 'Tracked', value: i.tracked.toLocaleString(), strength: 1 },
                        { label: 'Got a reply', value: pct(i.response_rate), strength: (i.response_rate ?? 0) / 100, empty: i.response_rate == null },
                        { label: 'Within a week', value: pct(i.response_week_rate), strength: (i.response_week_rate ?? 0) / 100, empty: i.response_week_rate == null },
                        { label: 'Interview', value: pct(i.interview_rate), strength: (i.interview_rate ?? 0) / 100, empty: i.interview_rate == null },
                        { label: 'Offer', value: pct(i.offer_rate), strength: (i.offer_rate ?? 0) / 100, empty: i.offer_rate == null },
                      ]}
                    />
                  </SoftCard>
                  <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
                    <MiniRing label="Response" value={i.response_rate} />
                    <MiniRing label="No response" value={i.no_response_rate} />
                    <SoftCard className="flex flex-col items-center justify-center text-center xl:flex-row xl:gap-3 xl:text-left">
                      <span className="text-[26px] font-bold leading-none tabular-nums text-ink-950">{i.last90}</span>
                      <span className="mt-1 text-[12px] font-medium text-ink-600 xl:mt-0">last 90 days</span>
                    </SoftCard>
                  </div>
                </div>
              )}
              {i && i.tracked > 0 && i.response_rate == null && (
                <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-[#1D4ED8]/5 px-3 py-2 text-[13px] text-ink-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Rates appear once at least 5 applications from 3 different applicants are tracked, so no individual can be identified.
                </p>
              )}
            </SoftPanel>
          </section>

          {/* SHARED BY APPLICANTS (applications made outside MadeVisa, reviewed) */}
          <SoftPanel
            id="response-shared"
            title="Shared by applicants"
            sub="Applications made elsewhere — careers site, LinkedIn, referrals. Reviewed, private, one voice per person — offers and interviews count more, since they’re rarely reported."
            right={
              <button
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1D4ED8] px-4 py-2 text-[14px] font-semibold text-white transition hover:scale-[1.03] hover:bg-brand-800"
              >
                <MessageSquarePlus className="h-4 w-4" /> Share your experience
              </button>
            }
          >
            <p className="-mt-2 mb-4 text-[13px] text-ink-500">
              Hiring at {company.name}?{' '}
              <a
                href={feedbackPath(company)}
                onClick={(e) => {
                  e.preventDefault();
                  nav(feedbackPath(company));
                }}
                className="font-semibold text-[#1D4ED8] hover:underline"
              >
                Get your feedback link for candidates
              </a>
            </p>
            {shared && shared.total > 0 && !shared.hidden ? (
              <SharedOutcomes s={shared} />
            ) : shared && shared.total > 0 ? (
              <EmptyNote text={`${shared.total} ${shared.total === 1 ? 'person has' : 'people have'} shared so far. The breakdown appears once 3 different people have shared — applied to ${company.name}? Add yours.`} />
            ) : (
              <EmptyNote text={`No shared experiences yet. Applied to ${company.name}? Be the first to tell others how it went.`} />
            )}
          </SoftPanel>

          {/* TRUST */}
          <section id="trust" className="scroll-mt-40">
            <SectionTitle title="Trust & engagement" badge={<ReliabilityLabel level="records" />} />
            <ul className="mt-4 grid gap-3 rounded-xl border border-ink-200 bg-white p-5 text-[15px] md:grid-cols-2">
              <Check ok={verified} text={verified ? 'Company verified by MadeVisa' : 'Verification pending'} />
              <Check ok={postsDirectly} text={postsDirectly ? 'Posts jobs directly on MadeVisa' : 'Listings imported from the official careers site'} neutral={!postsDirectly} />
              <Check
                ok={syncedRecently}
                text={i?.last_synced ? `Listings checked against the official site ${formatRelativeTime(i.last_synced, '')}` : 'Listings not yet auto-checked against the official site'}
                neutral={!i?.last_synced}
              />
              <Check ok={(i?.posted_30d ?? 0) > 0} text={(i?.posted_30d ?? 0) > 0 ? 'Actively posting — new listings in the last 30 days' : 'No new listings in the last 30 days'} neutral />
              <Check
                ok={(i?.response_rate ?? 0) >= 50}
                text={i?.response_rate != null ? `Responds to ${i.response_rate}% of applicants` : 'Response rate not established yet'}
                neutral={i?.response_rate == null}
              />
            </ul>
          </section>

          {/* LISTINGS */}
          <section id="listings" className="scroll-mt-40">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-200">
              {(['jobs', 'programs'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-3 text-[16px] font-semibold ${tab === t ? 'border-[#1D4ED8] text-[#1D4ED8]' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
                >
                  {t === 'jobs' ? `Jobs (${jobs?.length ?? '…'})` : `Programs (${programs?.length ?? '…'})`}
                </button>
              ))}
              {tab === 'jobs' && (jobs?.length ?? 0) > 8 && (
                <label className="mb-1.5 ml-auto flex h-10 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-[#1D4ED8] sm:w-72">
                  <Search className="h-4 w-4 text-ink-400" />
                  <input value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="Search these jobs…" className="h-full w-full bg-transparent text-[15px] outline-none" />
                </label>
              )}
            </div>

            {tab === 'jobs' && (
              <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {jobs === null && [0, 1, 2, 3].map((k) => <div key={k} className="skeleton-shimmer h-28 rounded-xl" />)}
                {jobs && shownJobs.length === 0 && <p className="text-[15px] text-ink-400">No open jobs right now.</p>}
                {shownJobs.slice(0, jobLimit).map((j) => (
                  <a
                    key={j.id}
                    href={jobPath(j)}
                    onClick={(e) => {
                      e.preventDefault();
                      nav(jobPath(j));
                    }}
                    className="group rounded-xl border border-ink-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-[0_8px_24px_rgba(37,99,235,0.10)]"
                  >
                    <p className="line-clamp-2 text-[17px] font-semibold leading-snug text-ink-950 group-hover:text-[#1D4ED8]">{j.title}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-500">
                      <span className="flex items-center gap-1.5">
                        {j.countryCode && <CircleFlag countryCode={j.countryCode} label={j.country} size={15} />}
                        {[j.city, j.country].filter(Boolean).join(', ') || 'Various locations'}
                      </span>
                      {j.remote && <span className="font-semibold text-emerald-700">Remote</span>}
                      {j.postedDate && <span>· {formatRelativeTime(j.postedDate, '')}</span>}
                    </p>
                    {j.salary && <p className="mt-2.5 text-[16px] font-bold text-ink-950">{j.salary}</p>}
                  </a>
                ))}
                {shownJobs.length > jobLimit && (
                  <button
                    onClick={() => setJobLimit((n) => n + 24)}
                    className="rounded-xl border border-ink-200 bg-white py-3.5 text-[15px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5 md:col-span-2 2xl:col-span-3"
                  >
                    Show more ({shownJobs.length - jobLimit} more)
                  </button>
                )}
              </div>
            )}

            {tab === 'programs' && (
              <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {programs === null && [0, 1].map((k) => <div key={k} className="skeleton-shimmer h-28 rounded-xl" />)}
                {programs && programs.length === 0 && <p className="text-[15px] text-ink-400">No open programs right now.</p>}
                {programs?.map((p) => (
                  <a
                    key={p.id}
                    href={`/programs/${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      nav(`/programs/${p.id}`);
                    }}
                    className="group rounded-xl border border-ink-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#1D4ED8]/40 hover:shadow-[0_8px_24px_rgba(37,99,235,0.10)]"
                  >
                    <p className="line-clamp-2 text-[17px] font-semibold leading-snug text-ink-950 group-hover:text-[#1D4ED8]">{p.title}</p>
                    <p className="mt-2 text-[14px] text-ink-500">
                      {p.category}
                      {p.country ? ` · ${p.country.name}` : ''}
                    </p>
                    {p.funding_text && <p className="mt-2.5 text-[16px] font-bold text-ink-950">{p.funding_text}</p>}
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* ABOUT THESE METRICS */}
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
                  Real hiring activity and applicant response data, based on verified interactions on MadeVisa: listings MadeVisa tracks, and applications signed-in users start through
                  MadeVisa and report back on. Not paid for, and not anonymous reviews.
                </p>
                <p>
                  <strong className="text-ink-800">Hiring performance</strong> counts the listings MadeVisa holds by the week they were posted. The dotted line is a 4-week rolling average.
                </p>
                <p>
                  <strong className="text-ink-800">Response rates</strong> appear once at least 5 applications from 3 different applicants are tracked, so no individual can be identified.
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </>,
  );
}

// ---------------------------------------------------------------------------

/** "Response rate 63 ↑" inline score, like Crunchbase's header scores. */
function ScorePill({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-bold text-ink-900">
      {label}
      <span className="rounded-md bg-[#1D4ED8]/10 px-2 py-0.5 text-[15px] font-semibold tabular-nums text-[#1D4ED8]">{value}</span>
      {up !== undefined && <span className={up ? 'text-emerald-600' : 'text-ink-300'}>{up ? '↑' : '→'}</span>}
    </span>
  );
}

function HeroPill({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-white">
      {label}
      <span className="rounded-md bg-white px-2 py-0.5 text-[15px] font-bold tabular-nums text-brand-700">{value}</span>
      {up !== undefined && <span className={up ? 'text-emerald-300' : 'text-white/50'}>{up ? '↑' : '→'}</span>}
    </span>
  );
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
    </nav>
  );
}

function useScrollSpy(ids: string[], dep: unknown) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    const onScroll = () => {
      let current = ids[0];
      // ids are in document order: the last one whose top has passed the bars wins.
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
  }, [key, dep]);
  return active;
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

function Tile({ label, value, spark }: { label: string; value: string; spark?: number[] }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[#1D4ED8]/30 hover:shadow-[0_8px_24px_rgba(29,78,216,0.08)]">
      <p className="text-[13px] font-medium text-ink-600">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="text-[24px] font-bold leading-tight tabular-nums text-ink-950">{value}</p>
        {spark && (
          <div className="w-14 pb-1">
            <SparkBars values={spark} height={24} />
          </div>
        )}
      </div>
    </div>
  );
}

function MiniRing({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <SoftCard className="flex flex-col items-center gap-2 text-center xl:flex-row xl:text-left">
      <RingScore value={value ?? 0} empty={value == null} label={value != null ? `${value}%` : ''} size={64} stroke={6} />
      <span className="text-[13px] font-medium text-ink-600">{label}</span>
    </SoftCard>
  );
}

/** Approved outside-MadeVisa reports: one bar per outcome, counts only. */
function SharedOutcomes({ s }: { s: ExperienceSummary }) {
  const rows: { label: string; n: number }[] = [
    { label: 'No response', n: s.no_response },
    { label: 'Rejected', n: s.rejected },
    { label: 'Replied', n: s.responded },
    { label: 'Interview', n: s.interview },
    { label: 'Offer', n: s.offer },
  ];
  const heard = s.total - s.no_response;
  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr]">
      <SoftCard>
        {s.score != null && (
          <div className="mb-4 border-b border-[#1D4ED8]/10 pb-4">
            <p className="text-[13px] text-ink-600">Applicant experience</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-[34px] font-bold leading-none text-ink-950">{s.score}</span>
              <span className="text-[13px] text-ink-500">/ 100 · {scoreWord(s.score)}</span>
            </p>
          </div>
        )}
        <p className="text-[13px] text-ink-600">Heard back</p>
        <p className="mt-1 text-[34px] font-bold leading-none text-ink-950">{Math.round((heard / s.total) * 100)}%</p>
        <p className="mt-2 text-[12px] text-ink-500">
          shared by {s.total} applicant{s.total === 1 ? '' : 's'}
          {s.avg_reply_days != null ? ` · first reply in ~${s.avg_reply_days} days` : ''}
        </p>
      </SoftCard>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[96px_1fr_40px] items-center gap-3 text-[13px]">
            <span className="text-ink-600">{r.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-[#1D4ED8]/10">
              <span className="block h-full rounded-full bg-[#1D4ED8] transition-all duration-700" style={{ width: `${s.total ? (r.n / s.total) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums text-ink-900">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-[#1D4ED8]/5 px-4 py-6 text-center text-[14px] text-ink-500">{text}</p>;
}

function pct(n: number | null | undefined) {
  return n != null ? `${n}%` : '–';
}

type Reliability = 'verified' | 'reported' | 'insufficient' | 'records';

const RELIABILITY: Record<Reliability, [string, string, string]> = {
  records: ['Verified data', 'bg-emerald-50 text-emerald-700', 'From MadeVisa records of listings — not self-reported.'],
  verified: ['Verified data', 'bg-emerald-50 text-emerald-700', 'Enough applicant reports, including at least 5 backed by evidence MadeVisa verified.'],
  reported: ['Applicant reported', 'bg-sky-50 text-sky-700', 'From applications users tracked through MadeVisa (5+ reports from 3+ applicants).'],
  insufficient: ['Insufficient data', 'bg-ink-100 text-ink-500', 'Not enough tracked applications yet — figures are withheld.'],
};

/** Tells the reader how much to trust each number. */
function ReliabilityLabel({ level }: { level: Reliability }) {
  const [label, cls, tip] = RELIABILITY[level];
  return (
    <span title={tip} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${cls}`}>
      {level === 'verified' || level === 'records' ? <BadgeCheck className="h-3.5 w-3.5" /> : null}
      {label}
    </span>
  );
}

function reliabilityOf(i: CompanyInsights): Reliability {
  if (i.reliability) return i.reliability;
  // Before the v2 migration: derive from confidence.
  return i.confidence === 'insufficient' ? 'insufficient' : 'reported';
}

function Check({ ok, text, neutral = false }: { ok: boolean; text: string; neutral?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
          ok ? 'bg-emerald-100 text-emerald-700' : neutral ? 'bg-ink-100 text-ink-400' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {ok ? '✓' : neutral ? '·' : '!'}
      </span>
      <span className={ok ? 'text-ink-800' : 'text-ink-500'}>{text}</span>
    </li>
  );
}

function EmptyApplications() {
  return (
    <div className="text-[15px] text-ink-600">
      <p className="flex items-center gap-2 font-semibold text-ink-900">
        <Briefcase className="h-[18px] w-[18px] text-[#1D4ED8]" /> No applications tracked yet.
      </p>
      <p className="mt-2 text-[14px] leading-6">
        When you apply through MadeVisa while signed in, you can report back from your dashboard whether the company responded — that's what builds these numbers.
      </p>
      <a href="/profile" className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-[#1D4ED8] hover:text-brand-800">
        Go to your dashboard <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}
