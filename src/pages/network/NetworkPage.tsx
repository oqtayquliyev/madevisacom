import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BadgeCheck, Briefcase, Building2, ExternalLink, Loader2, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/lib/auth';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import { LinkedInLogo } from '@/components/common/LinkedInLogo';
import { RangeSwitch, SparkBars, weeklyCounts } from '@/components/charts/SoftCharts';
import { companyPath } from '@/lib/companies';
import { companyNameFromUrl, fetchPublishedSponsoredJobs, isClosedJob, type SponsoredJob } from '@/lib/sponsoredJobs';
import { offersSponsorship } from '@/lib/destinationStats';
import {
  INTENT_LABEL,
  ROLE_LABEL,
  fetchNetworkCounts,
  fetchNetworkDirectory,
  fetchRecruitmentOrgs,
  type NetworkCounts,
  type NetworkIntent,
  type NetworkPerson,
  type NetworkRole,
  type RecruitmentOrg,
} from '@/lib/network';
import { CompanyMark, RateBar } from '@/pages/destinations/DestinationUI';
import { WRAP, nav } from '@/lib/pageLayout';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };
type Tab = 'people' | 'employers' | 'experts';

type SponsoringEmployer = { id: string; name: string; logoUrl: string | null; total: number; sponsored: number; rate: number; countries: { code: string; name: string }[]; weekly: number[] };

const TAB_FROM_URL = (): Tab => {
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'employers' || t === 'experts' ? t : 'people';
};

export function NetworkPage({ go, onAuth }: Props) {
  useSeo({
    title: 'Network — people hiring across borders, employers who sponsor visas',
    description: 'Meet hiring managers, recruiters and people looking to move, and see which employers sponsor visas, with live sponsorship rates.',
    path: '/network',
  });
  const { session, profile } = useAuth();
  const [tab, setTabState] = useState<Tab>(TAB_FROM_URL);
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<NetworkCounts | null | undefined>(undefined);
  const [employers, setEmployers] = useState<SponsoringEmployer[] | null>(null);
  const [orgs, setOrgs] = useState<RecruitmentOrg[] | null>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    const url = t === 'people' ? '/network' : `/network?tab=${t}`;
    window.history.replaceState({}, '', url);
  };

  // Each part loads on its own, so one slow or failing request never blocks the page.
  useEffect(() => {
    fetchNetworkCounts().then(setCounts);
    fetchRecruitmentOrgs().then(setOrgs);
  }, []);

  useEffect(() => {
    if (employers !== null) return;
    let alive = true;
    const build = (rows: SponsoredJob[]) => alive && setEmployers(buildEmployers(rows));
    fetchPublishedSponsoredJobs({ onPartial: build })
      .then(build)
      .catch(() => alive && setEmployers([]));
    return () => {
      alive = false;
    };
    // Loaded once; the header count needs it too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinHref = session ? '/profile?tab=settings#network' : null;
  const listed = Boolean(profile?.network_visible && profile?.username);

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="network" />

      {/* HEADER */}
      <section className="bg-brand-700 text-white">
        <div className={`${WRAP} pb-10 pt-10 sm:pb-12 sm:pt-12`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[44px]">The MadeVisa Network</h1>
              <p className="mt-4 text-[16px] leading-7 text-white/85">
                Hiring managers who hire across borders, people ready to move, and the employers and recruiters that make visas happen.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <HeroFigure label="People" value={counts === undefined ? '…' : (counts?.people ?? 0).toLocaleString()} />
                <HeroFigure label="Hiring now" value={counts === undefined ? '…' : (counts?.hiring ?? 0).toLocaleString()} />
                <HeroFigure label="Employers who sponsor" value={employers ? employers.length.toLocaleString() : '…'} />
              </div>
            </div>
            <div className="shrink-0">
              {joinHref ? (
                <a
                  href={joinHref}
                  onClick={(e) => {
                    e.preventDefault();
                    nav(joinHref);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-bold text-brand-700 hover:bg-brand-50"
                >
                  {listed ? 'Edit your Network profile' : 'Join the Network'}
                </a>
              ) : (
                <button onClick={() => onAuth?.('register')} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-bold text-brand-700 hover:bg-brand-50">
                  Join the Network
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* TABS */}
      <div className="border-b border-ink-200 bg-white/95 backdrop-blur md:sticky md:top-[72px] md:z-20">
        <div className={`${WRAP} flex flex-col gap-3 py-3 md:flex-row md:items-center`}>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-50 p-1 md:inline-flex md:w-auto" role="tablist">
            <TabButton active={tab === 'people'} onClick={() => setTab('people')} icon={Users} label="People" count={counts?.people} />
            <TabButton active={tab === 'employers'} onClick={() => setTab('employers')} icon={Building2} label="Employers who sponsor" short="Employers" count={employers?.length} />
            <TabButton
              active={tab === 'experts'}
              onClick={() => setTab('experts')}
              icon={ShieldCheck}
              label="Recruiters & experts"
              short="Recruiters"
              count={orgs && counts !== undefined ? orgs.length + (counts?.recruiters ?? 0) : undefined}
            />
          </div>
          <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-[#1D4ED8] md:ml-auto md:w-80">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'employers' ? 'Search employers' : tab === 'experts' ? 'Search recruiters & experts' : 'Search people or headlines'}
              aria-label="Search"
              className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-400"
            />
          </label>
        </div>
      </div>

      <main className={`${WRAP} py-8`}>
        {tab === 'people' && <PeopleTab search={search} counts={counts} onJoin={() => (joinHref ? nav(joinHref) : onAuth?.('register'))} listed={listed} />}
        {tab === 'employers' && <EmployersTab employers={employers} search={search} />}
        {tab === 'experts' && <ExpertsTab orgs={orgs} search={search} onApply={() => (session ? nav('/profile?tab=partner') : onAuth?.('register'))} />}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// People

function PeopleTab({ search, counts, onJoin, listed }: { search: string; counts: NetworkCounts | null | undefined; onJoin: () => void; listed: boolean }) {
  const [intent, setIntent] = useState<NetworkIntent | 'all'>('all');
  const [role, setRole] = useState<NetworkRole | 'all'>('all');
  const [people, setPeople] = useState<NetworkPerson[] | null | undefined>(undefined);
  const [q, setQ] = useState(search);

  // Debounce the search box.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setPeople(undefined);
    fetchNetworkDirectory({ intent: intent === 'all' ? null : intent, role: role === 'all' ? null : role, search: q, limit: 90 }).then((rows) => alive && setPeople(rows));
    return () => {
      alive = false;
    };
  }, [intent, role, q]);

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <RangeSwitch
          value={intent}
          onChange={setIntent}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'hiring', label: `Hiring${counts?.hiring ? ` · ${counts.hiring}` : ''}` },
            { value: 'looking', label: `Looking${counts?.looking ? ` · ${counts.looking}` : ''}` },
          ]}
        />
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {(['all', 'hiring_manager', 'recruiter', 'visa_expert', 'job_seeker'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${role === r ? 'bg-[#1D4ED8] text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}
            >
              {r === 'all' ? 'All roles' : `${ROLE_LABEL[r]}s`}
            </button>
          ))}
        </div>
      </div>

      {!listed && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[#1D4ED8]/20 bg-[#1D4ED8]/5 p-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[14px] leading-6 text-ink-700">
            <strong className="text-ink-950">Hiring, or looking for your next move?</strong> Add yourself so the right people can find you. You choose what's shown; your email and
            phone never are.
          </p>
          <button onClick={onJoin} className="shrink-0 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-800">
            Join the Network
          </button>
        </div>
      )}

      <div className="mt-6">
        {people === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <div key={k} className="skeleton-shimmer h-48 rounded-xl" />
            ))}
          </div>
        ) : people === null ? (
          <Empty title="The Network is almost ready" detail="People will appear here once the Network database update is live." />
        ) : people.length === 0 ? (
          <Empty
            title={q || intent !== 'all' || role !== 'all' ? 'No one matches these filters yet' : 'Be one of the first in the Network'}
            detail="Join from your profile settings: pick whether you're hiring or looking, and add a one-line headline."
            action={{ label: 'Join the Network', onClick: onJoin }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((p) => (
              <PersonCard key={p.username} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonCard({ p }: { p: NetworkPerson }) {
  const href = `/u/${p.username}`;
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
        <TravelerAvatar avatarUrl={p.avatar_url} size={52} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[17px] font-bold leading-snug text-ink-950 group-hover:text-[#1D4ED8]">
            <span className="truncate">{p.full_name ?? p.username}</span>
            {p.linkedin_url && <LinkedInLogo size={16} />}
          </p>
          <p className="truncate text-[13px] text-ink-500">@{p.username}</p>
          {p.network_intent && <IntentBadge intent={p.network_intent} className="mt-1.5 sm:hidden" />}
        </div>
        {p.network_intent && <IntentBadge intent={p.network_intent} className="hidden shrink-0 sm:inline-flex" />}
      </div>

      {p.headline && <p className="mt-3 line-clamp-2 text-[14px] leading-6 text-ink-700">{p.headline}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.network_role && <Chip strong>{ROLE_LABEL[p.network_role]}</Chip>}
        {p.has_sponsored && <Chip title="Self-reported by this person">Has sponsored visas</Chip>}
        {p.company_name && (
          <Chip>
            {p.company_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#1D4ED8]" />} {p.company_name}
          </Chip>
        )}
      </div>

      <div className="flex-1" />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-[13px] text-ink-500">
        {p.lives_in_name && (
          <span className="flex items-center gap-1.5">
            <CircleFlag countryCode={p.lives_in_code} label={p.lives_in_name} size={16} /> {p.lives_in_name}
          </span>
        )}
        {p.public_applications > 0 && (
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" /> {p.public_applications} tracked
          </span>
        )}
        <span className="ml-auto">Since {new Date(p.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Employers who sponsor

function buildEmployers(rows: SponsoredJob[]): SponsoringEmployer[] {
  const map = new Map<string, { name: string; logo: string | null; jobs: SponsoredJob[] }>();
  for (const j of rows) {
    if (isClosedJob(j)) continue;
    const id = j.publisher?.id ?? j.publisher_id;
    if (!id) continue;
    const e = map.get(id) ?? { name: j.publisher?.name ?? companyNameFromUrl(j.official_url ?? j.application_url) ?? 'Company', logo: j.publisher?.logo_url ?? null, jobs: [] };
    e.jobs.push(j);
    map.set(id, e);
  }
  const out: SponsoringEmployer[] = [];
  for (const [id, e] of map) {
    const sponsoredJobs = e.jobs.filter(offersSponsorship);
    if (sponsoredJobs.length === 0) continue; // only employers that actually sponsor
    const countries = new Map<string, string>();
    for (const j of sponsoredJobs) if (j.country?.iso_code) countries.set(j.country.iso_code, j.country.name);
    out.push({
      id,
      name: e.name,
      logoUrl: e.logo,
      total: e.jobs.length,
      sponsored: sponsoredJobs.length,
      rate: Math.round((sponsoredJobs.length / e.jobs.length) * 100),
      countries: [...countries.entries()].map(([code, name]) => ({ code, name })),
      weekly: weeklyCounts(
        sponsoredJobs.map((j) => j.source_posted_at ?? j.approved_at ?? j.created_at),
        8,
      ),
    });
  }
  return out.sort((a, b) => b.sponsored - a.sponsored || b.rate - a.rate);
}

function EmployersTab({ employers, search }: { employers: SponsoringEmployer[] | null; search: string }) {
  const [limit, setLimit] = useState(30);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employers ?? []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.countries.some((c) => c.name.toLowerCase().includes(q)));
  }, [employers, search]);

  if (!employers) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[14px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Counting visa-sponsored jobs…
        </p>
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="skeleton-shimmer h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[14px] text-ink-500">Companies with at least one open job on MadeVisa that offers visa sponsorship, ranked by how many they have open now.</p>
      <div className="mt-4 rounded-xl border border-ink-200 bg-white">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_minmax(140px,220px)_minmax(0,160px)_90px] gap-4 border-b border-ink-100 px-5 py-3 text-[12px] font-semibold text-ink-500 md:grid">
          <span>Employer</span>
          <span className="text-right">Sponsored jobs</span>
          <span>Share of their jobs</span>
          <span>Where</span>
          <span>8 weeks</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-ink-500">{search ? `No employer matches "${search}".` : 'No open visa-sponsored jobs right now.'}</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.slice(0, limit).map((e) => {
              const href = companyPath({ id: e.id, name: e.name });
              return (
                <li key={e.id}>
                  <a
                    href={href}
                    onClick={(ev) => {
                      ev.preventDefault();
                      nav(href);
                    }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-[#1D4ED8]/[0.03] md:grid-cols-[minmax(0,1fr)_110px_minmax(140px,220px)_minmax(0,160px)_90px]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <CompanyMark name={e.name} logoUrl={e.logoUrl} size={36} />
                      <span className="truncate text-[15px] font-semibold text-ink-900">{e.name}</span>
                    </span>
                    <span className="text-right text-[17px] font-bold tabular-nums text-ink-950">{e.sponsored}</span>
                    <span className="col-span-2 flex items-center gap-3 md:col-span-1">
                      <RateBar value={e.rate} className="flex-1" />
                      <span className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ink-600 md:w-auto">
                        <strong className="text-ink-900">{e.rate}%</strong> of {e.total}
                      </span>
                    </span>
                    <span className="col-span-2 flex items-center gap-1 md:col-span-1">
                      {e.countries.slice(0, 5).map((c) => (
                        <span key={c.code} title={c.name}>
                          <CircleFlag countryCode={c.code} label={c.name} size={20} />
                        </span>
                      ))}
                      {e.countries.length > 5 && <span className="text-[12px] text-ink-500">+{e.countries.length - 5}</span>}
                    </span>
                    <span className="hidden md:block" title="New visa-sponsored listings per week">
                      <SparkBars values={e.weekly} height={24} />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        {shown.length > limit && (
          <button onClick={() => setLimit((n) => n + 30)} className="w-full border-t border-ink-100 py-3.5 text-[15px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
            Show more ({shown.length - limit} more)
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recruiters & experts

function ExpertsTab({ orgs, search, onApply }: { orgs: RecruitmentOrg[] | null; search: string; onApply: () => void }) {
  const [people, setPeople] = useState<NetworkPerson[] | null | undefined>(undefined);
  useEffect(() => {
    Promise.all([fetchNetworkDirectory({ role: 'recruiter', limit: 60 }), fetchNetworkDirectory({ role: 'visa_expert', limit: 60 })]).then(([a, b]) =>
      setPeople(a === null && b === null ? null : [...(a ?? []), ...(b ?? [])]),
    );
  }, []);

  const q = search.trim().toLowerCase();
  const shownOrgs = (orgs ?? []).filter((o) => !q || `${o.name} ${o.country?.name ?? ''} ${o.description ?? ''}`.toLowerCase().includes(q));
  const shownPeople = (people ?? []).filter((p) => !q || `${p.full_name ?? ''} ${p.username} ${p.headline ?? ''}`.toLowerCase().includes(q));
  const loading = orgs === null || people === undefined;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-[22px] font-medium text-ink-900">Verified agencies & experts</h2>
        <p className="mt-0.5 text-[14px] text-ink-500">Recruitment agencies and immigration experts reviewed by MadeVisa before they're listed.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading && [0, 1, 2].map((k) => <div key={k} className="skeleton-shimmer h-40 rounded-xl" />)}
          {!loading &&
            shownOrgs.map((o) => (
              <article key={o.id} className="flex flex-col rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <CompanyMark name={o.name} logoUrl={o.logo_url} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[17px] font-bold text-ink-950">
                      <span className="truncate">{o.name}</span> <BadgeCheck className="h-4 w-4 shrink-0 text-[#1D4ED8]" />
                    </p>
                    <p className="text-[13px] text-ink-500">{o.org_type === 'agency' ? 'Recruitment agency' : 'Immigration expert'}</p>
                  </div>
                </div>
                {o.description && <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-600">{o.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[13px]">
                  {o.country ? (
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <CircleFlag countryCode={o.country.iso_code} label={o.country.name} size={16} /> {o.country.name}
                    </span>
                  ) : (
                    <span />
                  )}
                  {o.website && (
                    <a href={o.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#1D4ED8] hover:text-brand-800">
                      Website <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </article>
            ))}
        </div>
        {!loading && shownOrgs.length === 0 && (
          <Empty
            title={q ? `No agency or expert matches "${search}"` : 'No verified agencies or experts yet'}
            detail="Recruitment agencies and immigration experts can apply from their profile. We check every one before listing it."
            action={{ label: 'Apply as an agency or expert', onClick: onApply }}
          />
        )}
      </section>

      {shownPeople.length > 0 && (
        <section>
          <h2 className="text-[22px] font-medium text-ink-900">Recruiters & experts in the Network</h2>
          <p className="mt-0.5 text-[14px] text-ink-500">Individuals who describe themselves as recruiters or immigration experts. Not verified by MadeVisa.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shownPeople.map((p) => (
              <PersonCard key={p.username} p={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function IntentBadge({ intent, className = '' }: { intent: NetworkIntent; className?: string }) {
  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[12px] font-bold ${intent === 'hiring' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'} ${className}`}
    >
      {INTENT_LABEL[intent]}
    </span>
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

function TabButton({ active, onClick, icon: Icon, label, short, count }: { active: boolean; onClick: () => void; icon: typeof Users; label: string; short?: string; count?: number }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-3.5 sm:text-[14px] ${
        active ? 'bg-white text-[#1D4ED8] shadow-sm ring-1 ring-ink-200' : 'text-ink-600 hover:text-ink-900'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">
        <span className="md:hidden">{short ?? label}</span>
        <span className="hidden md:inline">{label}</span>
        {count != null && <span className="ml-1 font-medium text-ink-400">{count}</span>}
      </span>
    </button>
  );
}

function Chip({ children, strong = false, title }: { children: ReactNode; strong?: boolean; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold ${strong ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'bg-ink-100 text-ink-700'}`}>
      {children}
    </span>
  );
}

function Empty({ title, detail, action }: { title: string; detail: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 px-6 py-12 text-center">
      <UserRound className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 text-[17px] font-bold text-ink-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-[14px] leading-6 text-ink-500">{detail}</p>
      {action && (
        <button onClick={action.onClick} className="mt-4 rounded-lg bg-[#1D4ED8] px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-800">
          {action.label}
        </button>
      )}
    </div>
  );
}
