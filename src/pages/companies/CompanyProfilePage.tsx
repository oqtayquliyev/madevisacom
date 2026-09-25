import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  Clock,
  ExternalLink,
  GraduationCap,
  Info,
  Landmark,
  MapPin,
  MessageSquare,
  Scale,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { CircleFlag } from '@/components/common/CircleFlag';
import { fetchCompanyBySlug, fetchCompanyInsights, type CompanyInsights, type CompanyProfile } from '@/lib/companies';
import { fetchPublishedJobsByPublisher, sponsoredJobToBoardJob } from '@/lib/sponsoredJobs';
import { fetchPublishedProgramsByPublisher, type SponsoredProgram } from '@/lib/programs';
import { jobPath } from '@/lib/jobUrl';
import { formatRelativeTime } from '@/lib/dates';
import type { Job } from '@/data/jobs';

type Props = { slug: string; go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const ORG_LABEL: Record<string, string> = { company: 'Company', government: 'Government', agency: 'Agency', expert: 'Expert', university: 'University' };

function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

export function CompanyProfilePage({ slug, go, onAuth }: Props) {
  const [company, setCompany] = useState<CompanyProfile | null | undefined>(undefined);
  const [insights, setInsights] = useState<CompanyInsights | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [programs, setPrograms] = useState<SponsoredProgram[] | null>(null);
  const [tab, setTab] = useState<'jobs' | 'programs'>('jobs');
  const [jobQuery, setJobQuery] = useState('');
  const [jobLimit, setJobLimit] = useState(30);

  useEffect(() => {
    let alive = true;
    setCompany(undefined);
    fetchCompanyBySlug(slug).then((c) => {
      if (!alive) return;
      setCompany(c);
      if (!c) return;
      fetchCompanyInsights(c.id).then((i) => alive && setInsights(i));
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

  useSeo({
    title: company ? `${company.name} — jobs, hiring activity & applicant response` : 'Company',
    description: company
      ? `Open jobs and programs at ${company.name}, plus real hiring activity and applicant response data tracked on MadeVisa.`
      : 'Company profile on MadeVisa.',
    path: `/companies/${slug}`,
  });

  const shownJobs = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    return (jobs ?? []).filter((j) => !q || `${j.title} ${j.city} ${j.country}`.toLowerCase().includes(q));
  }, [jobs, jobQuery]);

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="jobs" />
      {children}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );

  if (company === undefined) {
    return shell(
      <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <div className="skeleton-shimmer h-10 w-64 rounded-md" />
        <div className="skeleton-shimmer mt-4 h-4 w-96 max-w-full rounded-md" />
      </div>
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

  return shell(
    <>
      {/* HEADER — same visual language as the job page */}
      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-6 sm:px-8 sm:pb-12 sm:pt-8">
          <button onClick={() => nav('/companies')} className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> All companies
          </button>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-2 shadow-sm sm:h-24 sm:w-24">
              {company.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain" /> : <OrgIcon className="h-9 w-9 text-ink-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-slab text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{company.name}</h1>
                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30" title="Verified by MadeVisa">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                )}
              </div>
              {company.description && <p className="mt-2 line-clamp-3 max-w-3xl text-sm leading-6 text-white/80">{company.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
                <span className="flex items-center gap-1.5">
                  <OrgIcon className="h-4 w-4" /> {ORG_LABEL[company.org_type] ?? 'Organization'}
                </span>
                {company.country && (
                  <span className="flex items-center gap-1.5">
                    <CircleFlag countryCode={company.country.iso_code} label={company.country.name} size={16} /> {company.country.name}
                  </span>
                )}
                {i && i.top_countries.length > 0 && !company.country && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> Hiring in {i.top_countries.map((c) => c.name).slice(0, 3).join(', ')}
                  </span>
                )}
                {websiteHost && (
                  <a href={company.website!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline decoration-white/40 underline-offset-2 hover:decoration-white">
                    {websiteHost} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {i && i.top_functions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {i.top_functions.map((f) => (
                    <span key={f} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => nav(`/companies?compare=${company.id}`)}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50"
            >
              <Scale className="h-4 w-4" /> Compare
            </button>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        {/* HEADLINE NUMBERS */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Open jobs" value={i ? i.active_jobs.toLocaleString() : jobs?.length.toLocaleString()} icon={Briefcase} reliability="records" />
          <Metric label="Open programs" value={i ? i.active_programs.toLocaleString() : programs?.length.toLocaleString()} icon={GraduationCap} reliability="records" />
          <Metric label="Response rate" value={i?.response_rate != null ? `${i.response_rate}%` : '—'} icon={MessageSquare} reliability={i ? reliabilityOf(i) : undefined} />
          <Metric
            label="Avg. response time"
            value={i?.avg_response_days != null ? `${i.avg_response_days} ${i.avg_response_days === 1 ? 'day' : 'days'}` : '—'}
            icon={Clock}
            reliability={i ? (i.avg_response_days != null ? reliabilityOf(i) : 'insufficient') : undefined}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* HIRING ACTIVITY */}
          <Panel title="Hiring activity" icon={TrendingUp} note="From listings on MadeVisa" badge={<ReliabilityLabel level="records" />}>
            {i ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Stat label="Active listings" value={(i.active_jobs + i.active_programs).toLocaleString()} />
                <Stat label="Closed / filled (90 days)" value={i.closed_90d.toLocaleString()} />
                <Stat label="New in last 30 days" value={i.posted_30d.toLocaleString()} />
                <Stat label="Posting frequency" value={perMonth != null ? `${perMonth} / month` : '—'} />
                <Stat label="Latest new listing" value={i.last_listed ? formatRelativeTime(i.last_listed, '—') : '—'} />
                <Stat label="On MadeVisa since" value={i.first_listed ? new Date(i.first_listed).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'} />
              </dl>
            ) : (
              <Pending />
            )}
          </Panel>

          {/* APPLICANT RESPONSE */}
          <Panel
            title="Applicant response"
            icon={Users}
            note={i ? `${i.tracked} applications tracked${i.applicants != null ? ` from ${i.applicants} applicant${i.applicants === 1 ? '' : 's'}` : ''}${i.verified ? ` · ${i.verified} verified` : ''}` : 'From applications tracked on MadeVisa'}
            badge={i ? <ReliabilityLabel level={reliabilityOf(i)} /> : null}
          >
            {i ? (
              i.tracked === 0 ? (
                <EmptyApplications />
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Stat label="Applications tracked" value={i.tracked.toLocaleString()} />
                    <Stat label="Last 90 days" value={i.last90.toLocaleString()} />
                    <Stat label="Got a response" value={i.response_rate != null ? `${i.response_rate}%` : '—'} />
                    <Stat label="Replied within a week" value={i.response_week_rate != null ? `${i.response_week_rate}%` : '—'} />
                  </dl>
                  {i.response_rate == null && (
                    <p className="mt-4 flex items-start gap-1.5 rounded-md bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Rates appear once at least 5 applications from 3 different applicants are tracked, so no individual can be identified.
                    </p>
                  )}
                </>
              )
            ) : (
              <Pending />
            )}
          </Panel>

          {/* TRUST */}
          <Panel title="Trust & engagement" icon={ShieldCheck} note="Based on MadeVisa records" badge={<ReliabilityLabel level="records" />}>
            <ul className="space-y-2.5 text-sm">
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
          </Panel>
        </div>

        {/* LISTINGS */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-200">
            {(['jobs', 'programs'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
              >
                {t === 'jobs' ? `Jobs (${jobs?.length ?? '…'})` : `Programs (${programs?.length ?? '…'})`}
              </button>
            ))}
            {tab === 'jobs' && (jobs?.length ?? 0) > 8 && (
              <input
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
                placeholder="Search these jobs…"
                className="mb-1 ml-auto h-8 w-full rounded-md border border-ink-200 bg-white px-2.5 text-sm outline-none focus:border-brand-500 sm:w-56"
              />
            )}
          </div>

          {tab === 'jobs' && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {jobs === null && [0, 1, 2, 3].map((k) => <div key={k} className="skeleton-shimmer h-24 rounded-lg" />)}
              {jobs && shownJobs.length === 0 && <p className="text-sm text-ink-400">No open jobs right now.</p>}
              {shownJobs.slice(0, jobLimit).map((j) => (
                <a
                  key={j.id}
                  href={jobPath(j)}
                  onClick={(e) => {
                    e.preventDefault();
                    nav(jobPath(j));
                  }}
                  className="group rounded-lg border border-ink-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                >
                  <p className="font-slab text-base font-bold leading-snug text-ink-950 group-hover:text-brand-700">{j.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    {j.countryCode && <CircleFlag countryCode={j.countryCode} label={j.country} size={13} />}
                    {[j.city, j.country].filter(Boolean).join(', ') || 'Various locations'}
                    {j.remote && <span className="font-semibold text-emerald-700">Remote</span>}
                    {j.postedDate && <span>· {formatRelativeTime(j.postedDate, '')}</span>}
                  </p>
                  {j.salary && <p className="mt-2 font-slab text-base font-bold text-ink-950">{j.salary}</p>}
                </a>
              ))}
              {shownJobs.length > jobLimit && (
                <button onClick={() => setJobLimit((n) => n + 30)} className="rounded-lg border border-ink-200 bg-white py-3 text-sm font-semibold text-brand-700 hover:bg-ink-50 md:col-span-2">
                  Show more ({shownJobs.length - jobLimit} more)
                </button>
              )}
            </div>
          )}

          {tab === 'programs' && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {programs === null && [0, 1].map((k) => <div key={k} className="skeleton-shimmer h-24 rounded-lg" />)}
              {programs && programs.length === 0 && <p className="text-sm text-ink-400">No open programs right now.</p>}
              {programs?.map((p) => (
                <a
                  key={p.id}
                  href={`/programs/${p.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    nav(`/programs/${p.id}`);
                  }}
                  className="group rounded-lg border border-ink-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                >
                  <p className="font-slab text-base font-bold leading-snug text-ink-950 group-hover:text-brand-700">{p.title}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {p.category}
                    {p.country ? ` · ${p.country.name}` : ''}
                  </p>
                  {p.funding_text && <p className="mt-2 font-slab text-base font-bold text-ink-950">{p.funding_text}</p>}
                </a>
              ))}
            </div>
          )}
        </section>

        <p className="mt-10 flex items-start gap-1.5 text-[11px] leading-5 text-ink-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Real hiring activity and applicant response data, based on verified interactions on MadeVisa: listings MadeVisa tracks, and
          applications signed-in users start through MadeVisa and report back on. Not paid for, and not anonymous reviews.
        </p>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------

function Metric({ label, value, icon: Icon, hint, reliability }: { label: string; value?: string; icon: typeof Briefcase; hint?: string; reliability?: Reliability }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4" title={hint}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1.5 font-slab text-2xl font-bold text-ink-950 tabular-nums">{value ?? '…'}</p>
      {reliability && (
        <div className="mt-1">
          <ReliabilityLabel level={reliability} compact />
        </div>
      )}
    </div>
  );
}

type Reliability = 'verified' | 'reported' | 'insufficient' | 'records';

/** Tells the reader how much to trust each number. */
function ReliabilityLabel({ level, compact = false }: { level: Reliability; compact?: boolean }) {
  const map: Record<Reliability, [string, string, string]> = {
    records: ['Verified data', 'bg-emerald-50 text-emerald-700', 'From MadeVisa records of listings — not self-reported.'],
    verified: ['Verified data', 'bg-emerald-50 text-emerald-700', 'Enough applicant reports, including at least 5 backed by evidence MadeVisa verified.'],
    reported: ['Applicant reported', 'bg-sky-50 text-sky-700', 'From applications users tracked through MadeVisa (5+ reports from 3+ applicants).'],
    insufficient: ['Insufficient data', 'bg-ink-100 text-ink-500', 'Not enough tracked applications yet — figures are withheld.'],
  };
  const [label, cls, tip] = map[level];
  return (
    <span title={tip} className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold ${cls} ${compact ? 'px-1.5 py-[1px] text-[9px]' : 'px-2.5 py-0.5 text-[10px]'}`}>
      {level === 'verified' || level === 'records' ? <BadgeCheck className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> : null}
      {label}
    </span>
  );
}

function Panel({ title, icon: Icon, note, badge, children }: { title: string; icon: typeof Briefcase; note: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-950">
            <Icon className="h-4 w-4 text-brand-600" /> {title}
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-400">{note}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-ink-950 tabular-nums">{value}</dd>
    </div>
  );
}

function reliabilityOf(i: CompanyInsights): Reliability {
  if (i.reliability) return i.reliability;
  // Before the v2 migration: derive from confidence.
  return i.confidence === 'insufficient' ? 'insufficient' : 'reported';
}

function Check({ ok, text, neutral = false }: { ok: boolean; text: string; neutral?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
          ok ? 'bg-emerald-100 text-emerald-700' : neutral ? 'bg-ink-100 text-ink-400' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {ok ? '✓' : neutral ? '·' : '!'}
      </span>
      <span className={ok ? 'text-ink-800' : 'text-ink-500'}>{text}</span>
    </li>
  );
}

function Pending() {
  return <p className="text-sm text-ink-400">Statistics will appear here shortly.</p>;
}

function EmptyApplications() {
  return (
    <div className="text-sm text-ink-500">
      <p>No applications tracked yet.</p>
      <p className="mt-2 text-[12px] leading-5">
        When you apply through MadeVisa while signed in, you can report back from your dashboard whether the company responded — that's
        what builds these numbers.
      </p>
      <a href="/profile" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
        Go to your dashboard <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
