import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EvidenceReviewSection } from '@/pages/admin/EvidenceReviewSection';
import { ListingRequestsSection } from '@/pages/admin/ListingRequestsSection';
import { PublishReleasePanel } from '@/pages/admin/PublishReleasePanel';
import { ArticlesSection } from '@/pages/admin/ArticlesSection';
import { PlansSection } from '@/pages/admin/PlansSection';
import { OffersSection } from '@/pages/admin/OffersSection';
import { SocialSection } from '@/pages/admin/SocialSection';
import { ControlRoom } from '@/pages/admin/ControlRoom';
import { CvsSection } from '@/pages/admin/CvsSection';
import { ExperienceReportsSection } from '@/pages/admin/ExperienceReportsSection';
import { JobReportsSection } from '@/pages/admin/JobReportsSection';
import { countNewJobReports } from '@/lib/jobReports';
import { listTotpFactors } from '@/lib/mfa';
import { UpdateAllJobsPanel } from '@/pages/admin/UpdateAllJobsPanel';
import { FindCompaniesPanel } from '@/pages/admin/FindCompaniesPanel';
import { PublisherFilterChips, RegisteredCompanyPanel, type PublisherFilter } from '@/pages/admin/RegisteredCompanyPanel';
import { CreditCard, FileSignature, FileText, Gauge, Bell, Briefcase, CheckCircle2, Loader2, XCircle, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, ImageIcon, Inbox, Landmark, Mail, Newspaper, Pencil, RefreshCw, ScanSearch, Settings, ShieldAlert, ShieldPlus, Trash2, UserRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ProgressBar } from '@/components/common/ProgressBar';
import { ImportCenter } from '@/pages/admin/ImportCenter';
import { useSeo } from '@/lib/seo';
import {
  fetchAdmins,
  fetchAllPrograms,
  fetchAllSponsoredJobs,
  getJobsLoadError,
  fetchPendingAgencies,
  fetchPendingPrograms,
  fetchPendingPublishers,
  fetchPendingSponsoredJobs,
  fetchVerifiedAgencies,
  fetchVerifiedPublishers,
  deleteProgram,
  deleteSponsoredJob,
  bulkDeleteJobs,
  bulkDeletePrograms,
  bulkSetJobStatus,
  bulkSetJobImage,
  bulkSetProgramStatus,
  findOrCreateImportedPublisher,
  grantAdminByEmail,
  importJobsAsPending,
  revokeAdminByEmail,
  setAgencyStatus,
  setProgramStatus,
  setPublisherStatus,
  setSponsoredJobStatus,
  setPublisherLogoForAllJobs,
  backfillJobFunctions,
  updateAgencyName,
  updateProgramAsAdmin,
  updatePublisherContactEmail,
  updatePublisherName,
  updateSponsoredJobAsAdmin,
  type AdminProfile,
  type AdminProgram,
  type AdminSponsoredJob,
  type PendingAgency,
  type PendingProgram,
  type PendingPublisher,
  type PendingSponsoredJob,
  fetchDirectRequests,
  countDirectRequests,
  fetchPublisherMembers,
  addPublisherMember,
  updatePublisherMember,
  removePublisherMember,
  type DirectRequest,
  type PublisherMember,
  runJobCheck,
  type JobCheckResult,
  deleteCompany,
  fetchOwnerEmails,
} from '@/lib/admin';
import {
  fetchImportSources,
  fetchedJobToImportInput,
  registerImportSource,
  type ImportSource,
} from '@/lib/importSync';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { fetchCountries, type CountryOption } from '@/lib/programs';
import { fetchGreenhouseJobs, fetchJobsFromCareersUrl } from '@/lib/atsImport';
import {
  COST_STATUSES,
  JOB_CATEGORIES,
  JOB_CATEGORY_FIELDS,
  LISTING_STATUSES,
  PROGRAM_CATEGORIES,
  PROGRAM_CATEGORY_FIELDS,
  SALARY_PERIODS,
  SALARY_STATUSES,
  type CostStatus,
  type JobCategory,
  type ListingStatus,
  type ProgramCategory,
  type SalaryPeriod,
  type SalaryStatus,
} from '@/lib/listingCategories';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import type { View } from '@/types';
import type { OrgType } from '@/lib/programs';

type AdminPanelPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

// Government gets its own more formal/official icon; agency/company
// and expert stay visually lighter.
const orgIcon: Record<OrgType, typeof Building2> = {
  agency: Building2,
  company: Building2,
  government: Landmark,
  expert: UserRound,
};

type AdminTab = 'control' | 'inbox' | 'listings' | 'imports' | 'companies' | 'articles' | 'plans' | 'cvs' | 'offers' | 'images' | 'settings';
const ADMIN_TABS: { key: AdminTab; label: string; icon: typeof Inbox }[] = [
  { key: 'control', label: 'Control room', icon: Gauge },
  { key: 'inbox', label: 'Requests', icon: Inbox },
  { key: 'listings', label: 'Listings', icon: Briefcase },
  { key: 'imports', label: 'Import & sync', icon: RefreshCw },
  { key: 'companies', label: 'Companies & access', icon: Building2 },
  { key: 'articles', label: 'Articles', icon: Newspaper },
  { key: 'plans', label: 'Plans', icon: CreditCard },
  { key: 'cvs', label: 'CVs', icon: FileText },
  { key: 'offers', label: 'Visa Plans', icon: FileSignature },
  { key: 'images', label: 'Social media', icon: ImageIcon },
  { key: 'settings', label: 'Settings', icon: Settings },
];
const INBOX_SEEN_KEY = 'mv_admin_inbox_seen_at';
const INBOX_POLL_MS = 60_000;

function readInboxSeenAt(): string {
  try {
    return localStorage.getItem(INBOX_SEEN_KEY) ?? '1970-01-01T00:00:00.000Z';
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

export function AdminPanelPage({ go, onAuth }: AdminPanelPageProps) {
  useSeo({ title: 'Admin panel', description: 'MadeVisa admin panel.', path: '/admin', noindex: true });
  const { profile, loading } = useAuth();

  const [pendingPublishers, setPendingPublishers] = useState<PendingPublisher[]>([]);
  const [verifiedPublishers, setVerifiedPublishers] = useState<PendingPublisher[]>([]);
  const [pendingPrograms, setPendingPrograms] = useState<PendingProgram[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingSponsoredJob[]>([]);
  const [pendingAgencies, setPendingAgencies] = useState<PendingAgency[]>([]);
  const [verifiedAgencies, setVerifiedAgencies] = useState<PendingAgency[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [allPrograms, setAllPrograms] = useState<AdminProgram[]>([]);
  const [allJobs, setAllJobs] = useState<AdminSponsoredJob[]>([]);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);
  // New "Report this job" reports, for the Requests tab badge.
  const [newReports, setNewReports] = useState(0);
  useEffect(() => {
    const check = () => countNewJobReports().then(setNewReports).catch(() => undefined);
    check();
    const t = window.setInterval(check, 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [requests, setRequests] = useState<{ jobs: DirectRequest[]; programs: DirectRequest[] }>({ jobs: [], programs: [] });
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [members, setMembers] = useState<PublisherMember[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const [tab, setTabState] = useState<AdminTab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as AdminTab | null;
    return t && ADMIN_TABS.some((x) => x.key === t) ? t : 'control';
  });
  const setTab = (t: AdminTab) => {
    setTabState(t);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', t);
    window.history.replaceState({}, '', `/admin?${params.toString()}`);
  };
  const [inboxSeenAt, setInboxSeenAt] = useState(readInboxSeenAt);

  const isAdmin = profile?.role === 'admin';

  // Per-part load status, so a slow or failing request is visible (and
  // can't hold the whole panel on "Loading…" forever).
  const [loadParts, setLoadParts] = useState<Record<string, LoadPart>>({});
  const [loadStartedAt, setLoadStartedAt] = useState(0);

  const loadAll = (only?: string[]) => {
    // Only blank the whole panel on the very first load — later refreshes
    // update in place so the page doesn't look like it's reloading.
    if (!hasLoadedOnce.current) setDataLoading(true);
    const applyJobs = (set: () => void) => {
      const jobsError = getJobsLoadError();
      setJobsLoadError(jobsError);
      // If the job list didn't load, keep what's on screen instead of showing zeros.
      if (!jobsError || !hasLoadedOnce.current) set();
    };
    const tasks: { key: string; label: string; run: () => Promise<unknown>; apply: (v: never) => void }[] = [
      { key: 'pendingPublishers', label: 'Company requests', run: fetchPendingPublishers, apply: setPendingPublishers },
      { key: 'verifiedPublishers', label: 'Verified companies', run: fetchVerifiedPublishers, apply: setVerifiedPublishers },
      { key: 'pendingPrograms', label: 'Pending programs', run: fetchPendingPrograms, apply: setPendingPrograms },
      { key: 'pendingJobs', label: 'Pending jobs', run: fetchPendingSponsoredJobs, apply: (v: PendingSponsoredJob[]) => applyJobs(() => setPendingJobs(v)) },
      { key: 'pendingAgencies', label: 'Agency requests', run: fetchPendingAgencies, apply: setPendingAgencies },
      { key: 'verifiedAgencies', label: 'Verified agencies', run: fetchVerifiedAgencies, apply: setVerifiedAgencies },
      { key: 'admins', label: 'Admins', run: fetchAdmins, apply: setAdmins },
      { key: 'allPrograms', label: 'All programs', run: fetchAllPrograms, apply: setAllPrograms },
      { key: 'allJobs', label: 'All jobs (largest)', run: fetchAllSponsoredJobs, apply: (v: AdminSponsoredJob[]) => applyJobs(() => setAllJobs(v)) },
      { key: 'countries', label: 'Countries', run: fetchCountries, apply: setCountries },
      { key: 'requests', label: 'Listing requests', run: fetchDirectRequests, apply: setRequests },
      { key: 'sources', label: 'Import sources', run: fetchImportSources, apply: setSources },
      { key: 'members', label: 'Company access', run: fetchPublisherMembers, apply: setMembers },
    ];
    // The full job list is by far the heaviest read: only load it on the
    // tabs that use it (Listings, Import & sync), not on every admin visit.
    const run = only ? tasks.filter((t) => only.includes(t.key)) : tasks.filter((t) => t.key !== 'allJobs' || jobsTabRef.current);
    const now = Date.now();
    setLoadStartedAt(now);
    setLoadParts((prev) => {
      const next = only ? { ...prev } : {};
      for (const t of run) next[t.key] = { label: t.label, state: 'loading' };
      return next;
    });
    const mark = (key: string, patch: Partial<LoadPart>) => setLoadParts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    Promise.all(
      run.map((t) =>
        withTimeout(t.run(), LOAD_TIMEOUT_MS)
          .then((v) => {
            t.apply(v as never);
            mark(t.key, { state: 'done', ms: Date.now() - now });
          })
          .catch((err: unknown) => {
            console.error(`Admin load failed: ${t.label}`, err);
            mark(t.key, { state: 'failed', ms: Date.now() - now, error: err instanceof Error ? err.message : String(err) });
          }),
      ),
    ).then(() => {
      // Every part has finished or failed — never leave the panel stuck.
      setDataLoading(false);
      hasLoadedOnce.current = true;
    });
  };

  const reloadRequests = () => {
    Promise.all([fetchDirectRequests(), fetchPendingPublishers(), fetchPendingAgencies()]).then(([reqs, pp, pa]) => {
      setRequests(reqs);
      setPendingPublishers(pp);
      setPendingAgencies(pa);
    });
  };

  useEffect(() => {
    if (isAdmin) loadAll();
    else setDataLoading(false);
  }, [isAdmin]);

  // Load the full job list the first time a tab that needs it is opened.
  const jobsTabRef = useRef(false);
  jobsTabRef.current = tab === 'listings' || tab === 'imports';
  const jobsLoadedRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || !jobsTabRef.current || jobsLoadedRef.current) return;
    jobsLoadedRef.current = true;
    loadAll(['allJobs']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  // New-request notifications: poll a cheap count query; when something
  // newer arrives, refresh the inbox and (if allowed) show a desktop
  // notification. The tab title also carries the unread count.
  const latestSeenByPoll = useRef<string | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    const tick = async () => {
      const c = await countDirectRequests();
      if (latestSeenByPoll.current && c.latest && c.latest > latestSeenByPoll.current) {
        reloadRequests();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('MadeVisa: new listing request', { body: 'A company submitted a new job or program for review.' });
        }
      }
      latestSeenByPoll.current = c.latest ?? latestSeenByPoll.current;
    };
    tick();
    const id = window.setInterval(tick, INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [isAdmin]);

  const allRequestItems = [...requests.jobs, ...requests.programs];
  const newRequestCount =
    allRequestItems.filter((r) => r.created_at > inboxSeenAt).length +
    pendingPublishers.filter((p) => p.created_at > inboxSeenAt).length +
    pendingAgencies.filter((a) => a.created_at > inboxSeenAt).length;
  const openRequestCount = allRequestItems.length + pendingPublishers.length + pendingAgencies.length;

  useEffect(() => {
    document.title = newRequestCount > 0 ? `(${newRequestCount}) Admin panel · MadeVisa` : 'Admin panel · MadeVisa';
  }, [newRequestCount]);

  const markInboxSeen = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(INBOX_SEEN_KEY, now);
    } catch {
      /* private mode — badge just won't persist */
    }
    setInboxSeenAt(now);
  };

  // Pending listings that came from imports stay in "Listings"; ones real
  // users/companies submitted live in the Requests inbox instead.
  const importedPendingJobs = useMemo(() => pendingJobs.filter((j) => j.origin !== 'direct'), [pendingJobs]);
  const otherPendingPrograms = useMemo(() => pendingPrograms.filter((p) => p.origin !== 'direct'), [pendingPrograms]);

  // Jobs per company — shown on publisher rows so duplicates / empty accounts stand out.
  const jobStatsByPublisher = useMemo(() => {
    const m = new Map<string, { total: number; live: number; pending: number }>();
    for (const j of allJobs) {
      if (!j.publisher_id) continue;
      const c = m.get(j.publisher_id) ?? { total: 0, live: 0, pending: 0 };
      c.total++;
      if (j.status === 'published') c.live++;
      else if (j.status === 'pending') c.pending++;
      m.set(j.publisher_id, c);
    }
    return m;
  }, [allJobs]);
  const [deletingCompany, setDeletingCompany] = useState<{ name: string; done: number; total: number } | null>(null);

  // Verified companies: registered on MadeVisa (has an owner account) vs imported.
  const [publisherFilter, setPublisherFilter] = useState<PublisherFilter>('all');
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [ownerEmails, setOwnerEmails] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const ids = verifiedPublishers.map((p) => p.owner_id).filter((v): v is string => Boolean(v));
    if (ids.length) fetchOwnerEmails(ids).then(setOwnerEmails);
  }, [verifiedPublishers]);
  const pendingDirectByPublisher = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of allJobs) if (j.publisher_id && j.origin === 'direct' && j.status === 'pending') m.set(j.publisher_id, (m.get(j.publisher_id) ?? 0) + 1);
    for (const p of allPrograms) if (p.publisher_id && p.origin === 'direct' && p.status === 'pending') m.set(p.publisher_id, (m.get(p.publisher_id) ?? 0) + 1);
    return m;
  }, [allJobs, allPrograms]);
  const publisherMatches = (p: PendingPublisher, f: PublisherFilter) =>
    f === 'all' ? true : f === 'registered' ? Boolean(p.owner_id) : f === 'imported' ? !p.owner_id : (pendingDirectByPublisher.get(p.id) ?? 0) > 0;
  const publisherCounts = {
    all: verifiedPublishers.length,
    registered: verifiedPublishers.filter((p) => publisherMatches(p, 'registered')).length,
    imported: verifiedPublishers.filter((p) => publisherMatches(p, 'imported')).length,
    review: verifiedPublishers.filter((p) => publisherMatches(p, 'review')).length,
  };

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-ink-900">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <main className="mx-auto max-w-lg px-5 py-24 text-center sm:px-8">
          <ShieldAlert className="mx-auto h-10 w-10 text-ink-300" />
          <h1 className="mt-4 text-xl font-bold text-ink-900">Admins only</h1>
          <p className="mt-2 text-sm text-ink-500">You don't have access to this page.</p>
          <button onClick={() => go('home')} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Back to MadeVisa
          </button>
        </main>
        <LandingFooter go={go} onAuth={onAuth} />
      </div>
    );
  }

  const tabBadge = (key: AdminTab): { count: number; hot: boolean } | null => {
    if (key === 'inbox') return openRequestCount + newReports ? { count: openRequestCount + newReports, hot: newRequestCount > 0 || newReports > 0 } : null;
    if (key === 'listings') return importedPendingJobs.length + otherPendingPrograms.length ? { count: importedPendingJobs.length + otherPendingPrograms.length, hot: false } : null;
    if (key === 'imports') {
      const failing = sources.filter((x) => x.last_sync_status === 'error').length;
      return failing ? { count: failing, hot: true } : null;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <AdminMfaReminder onOpen={() => go('profile')} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">Admin panel</h1>
            <p className="mt-1 text-sm text-ink-500">One switch for everything that runs by itself, and requests, listings, CVs and company access in one place.</p>
          </div>
          <button
            onClick={() => setTab('inbox')}
            className="relative flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
            title="New requests since you last marked the inbox as read"
          >
            <Bell className="h-4 w-4" />
            {newRequestCount > 0 ? `${newRequestCount} new` : 'No new requests'}
            {newRequestCount > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />}
          </button>
        </div>

        {jobsLoadError && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="min-w-0 flex-1">
              <strong>The job list didn’t fully load</strong>, so job counts may be out of date. Your jobs are safe — this is only the admin view. <span className="text-amber-700">({jobsLoadError})</span>
            </span>
            <button type="button" onClick={() => loadAll()} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
              Load again
            </button>
          </div>
        )}

        <nav className="sticky top-0 z-10 -mx-5 mt-6 flex gap-1 overflow-x-auto border-b border-ink-200 bg-[#f8fafc] px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {ADMIN_TABS.map(({ key, label, icon: Icon }) => {
            const badge = tabBadge(key);
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                  tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge && (
                  <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${badge.hot ? 'bg-rose-500 text-white' : 'bg-ink-100 text-ink-600'}`}>
                    {badge.count > 999 ? '999+' : badge.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* These two load their own data, so they don't wait for the listings. */}
        {tab === 'control' && <ControlRoom onOpen={setTab} />}
        {tab === 'cvs' && <CvsSection />}

        {tab === 'control' || tab === 'cvs' ? null : dataLoading ? (
          <AdminLoadingPanel parts={loadParts} startedAt={loadStartedAt} onRetry={() => loadAll()} />
        ) : (
          <>
            <FailedPartsBanner parts={loadParts} onRetry={(keys) => loadAll(keys)} />
            {tab === 'inbox' && (
              <>
                <RequestsInboxSection
                  requests={requests}
                  seenAt={inboxSeenAt}
                  onMarkSeen={markInboxSeen}
                  onChange={() => {
                    reloadRequests();
                    loadAll();
                  }}
                />

                <ListingRequestsSection />

                <JobReportsSection />

                <ExperienceReportsSection />

                <EvidenceReviewSection />

                <PaginatedSection
                  title="Company & government account requests"
                  items={pendingPublishers}
                  searchText={(p) => `${p.name} ${p.contact_email}`}
                  renderRow={(p) => (
                    <PublisherRow key={p.id} p={p} onChange={() => loadAll()}>
                      {p.created_at > inboxSeenAt && <NewPill />}
                      <Actions
                        onApprove={async () => { const r = await setPublisherStatus(p.id, 'verified'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                        onReject={async () => { const r = await setPublisherStatus(p.id, 'rejected'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                      />
                    </PublisherRow>
                  )}
                />

                <PaginatedSection
                  title="Travel agency requests"
                  items={pendingAgencies}
                  searchText={(a) => a.name}
                  renderRow={(a) => (
                    <AgencyRow key={a.id} a={a} onChange={() => loadAll()}>
                      {a.created_at > inboxSeenAt && <NewPill />}
                      <Actions
                        onApprove={async () => { const r = await setAgencyStatus(a.id, 'verified'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                        onReject={async () => { const r = await setAgencyStatus(a.id, 'rejected'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                      />
                    </AgencyRow>
                  )}
                />
              </>
            )}

            {tab === 'listings' && (
              <>
                <PaginatedSection
                  title="Pending programs (added by MadeVisa)"
                  items={otherPendingPrograms}
                  searchText={(p) => `${p.title} ${p.publisher?.name ?? ''}`}
                  renderRow={(p) => (
                    <Row key={p.id}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900">{p.title}</p>
                        <p className="text-xs text-ink-500">
                          {p.category} · {p.publisher?.name ?? 'Unknown publisher'}{p.country ? ` · ${p.country.name}` : ''}
                        </p>
                        <p className="text-[11px] text-ink-400">Submitted {formatDate(p.created_at)}</p>
                      </div>
                      <Actions
                        onApprove={async () => { const r = await setProgramStatus(p.id, 'published'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                        onReject={async () => { const r = await setProgramStatus(p.id, 'rejected'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                      />
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
                          const result = await deleteProgram(p.id);
                          if (result.ok) loadAll();
                          else window.alert(result.error ?? 'Delete failed.');
                        }}
                        aria-label="Delete"
                        className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Row>
                  )}
                />

                <GroupedPendingJobsSection jobs={importedPendingJobs} onChange={() => loadAll()} />

                <ManagedProgramsSection programs={allPrograms} onChange={() => loadAll()} />

                <ManagedJobsSection jobs={allJobs} onChange={() => loadAll()} />
              </>
            )}

            {tab === 'imports' && (
              <>
                {/* 1. What runs by itself, every day */}
                <PublishReleasePanel onPublished={() => loadAll(['allJobs'])} />

                {/* 2. Run it now, from this browser */}
                <UpdateAllJobsPanel sources={sources} countries={countries} onChange={() => loadAll()} />

                {/* 3. Companies and where their jobs come from */}
                <ImportCenter
                  sources={sources}
                  allJobs={allJobs}
                  publishers={verifiedPublishers}
                  countries={countries}
                  userId={profile?.id ?? ''}
                  onChange={() => loadAll()}
                />

                {/* 4. Add companies */}
                <FindCompaniesPanel publishers={[...verifiedPublishers, ...pendingPublishers]} sources={sources} countries={countries} onChange={() => loadAll()} />

                <AddJobsTools>
                  <ImportFromCareersUrlSection countries={countries} onImported={() => loadAll()} />
                  <ImportFromAtsSection countries={countries} onImported={() => loadAll()} />
                  <BulkGreenhouseImportSection countries={countries} allJobs={allJobs} onImported={() => loadAll()} />
                </AddJobsTools>

                {/* 5. Clean up older jobs */}
                <JobCheckSection onChange={() => loadAll()} />
              </>
            )}

            {tab === 'companies' && (
              <>
                <CompanyAccessSection publishers={verifiedPublishers} members={members} onChange={() => loadAll()} />

                {deletingCompany && (
                  <div className="mt-6 rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                    <ProgressBar
                      value={deletingCompany.total ? deletingCompany.done / deletingCompany.total : null}
                      label={`Deleting ${deletingCompany.name}`}
                      detail={`${deletingCompany.done.toLocaleString()} of ${deletingCompany.total.toLocaleString()} jobs deleted`}
                    />
                  </div>
                )}

                <PublisherFilterChips value={publisherFilter} onChange={setPublisherFilter} counts={publisherCounts} />
                <PaginatedSection
                  key={publisherFilter}
                  title={
                    { all: 'Verified publisher accounts', registered: 'Registered on MadeVisa', imported: 'Imported companies', review: 'Companies with listings in review' }[publisherFilter]
                  }
                  items={verifiedPublishers.filter((p) => publisherMatches(p, publisherFilter))}
                  defaultOpen={publisherFilter !== 'all'}
                  searchText={(p) => `${p.name} ${p.contact_email} ${p.owner_id ? ownerEmails.get(p.owner_id) ?? '' : ''}`}
                  renderRow={(p) => (
                    <div key={p.id}>
                    <PublisherRow p={p} onChange={() => loadAll()} allowLogo stats={jobStatsByPublisher.get(p.id) ?? { total: 0, live: 0, pending: 0 }}>
                      {p.owner_id ? (
                        <button
                          onClick={() => setOpenCompany(openCompany === p.id ? null : p.id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${openCompany === p.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:bg-ink-50'}`}
                          title={ownerEmails.get(p.owner_id) ? `Registered by ${ownerEmails.get(p.owner_id)}` : 'Registered on MadeVisa'}
                        >
                          Access & listings{pendingDirectByPublisher.get(p.id) ? ` · ${pendingDirectByPublisher.get(p.id)} in review` : ''}
                        </button>
                      ) : (
                        <span className="rounded bg-ink-100 px-2 py-1 text-[10px] font-semibold uppercase text-ink-500">Imported</span>
                      )}
                      <button
                        onClick={async () => { const r = await setPublisherStatus(p.id, 'suspended'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        Suspend
                      </button>
                      <button
                        disabled={!!deletingCompany}
                        onClick={async () => {
                          const n = jobStatsByPublisher.get(p.id)?.total ?? 0;
                          const typed = window.prompt(
                            `Delete the company "${p.name}" completely — its ${n.toLocaleString()} jobs, programs, import sources and manager access?\n\nYou can add it again later.\n\nType DELETE to confirm.`
                          );
                          if (typed !== 'DELETE') return;
                          setDeletingCompany({ name: p.name, done: 0, total: n });
                          const r = await deleteCompany(p.id, (done, total) => setDeletingCompany({ name: p.name, done, total }));
                          setDeletingCompany(null);
                          if (!r.ok) window.alert(r.error ?? 'Delete failed.');
                          loadAll();
                        }}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </PublisherRow>
                    {openCompany === p.id && (
                      <RegisteredCompanyPanel
                        publisher={p}
                        ownerEmail={p.owner_id ? ownerEmails.get(p.owner_id) ?? null : null}
                        members={members.filter((m) => m.publisher_id === p.id)}
                        jobs={allJobs.filter((j) => j.publisher_id === p.id)}
                        programs={allPrograms.filter((x) => x.publisher_id === p.id)}
                        onChange={() => loadAll()}
                      />
                    )}
                    </div>
                  )}
                />

                <PaginatedSection
                  title="Verified travel agencies"
                  items={verifiedAgencies}
                  searchText={(a) => a.name}
                  renderRow={(a) => (
                    <AgencyRow key={a.id} a={a} onChange={() => loadAll()}>
                      <button
                        onClick={async () => { const r = await setAgencyStatus(a.id, 'pending'); if (r.ok) loadAll(); else window.alert(r.error ?? 'Failed.'); }}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        Revoke
                      </button>
                    </AgencyRow>
                  )}
                />
              </>
            )}

            {tab === 'articles' && <ArticlesSection />}

            {tab === 'plans' && <PlansSection />}

            {tab === 'offers' && <OffersSection />}

            {tab === 'images' && <SocialSection />}

            {tab === 'settings' && (
              <>
                <AdminAccessSection admins={admins} currentEmail={profile?.email ?? ''} onChange={() => loadAll()} />
                <DesktopNotificationsSection />
                <BackfillJobFunctionsSection onChange={() => loadAll()} />
              </>
            )}
          </>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function NewPill() {
  return <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>;
}

function PublisherRow({
  p,
  onChange,
  children,
  allowLogo = false,
  stats,
}: {
  p: PendingPublisher;
  onChange: () => void;
  children: React.ReactNode;
  allowLogo?: boolean;
  /** Job counts for this company — shown so duplicate/empty accounts are easy to spot. */
  stats?: { total: number; live: number; pending: number };
}) {
  const Icon = orgIcon[p.org_type];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [email, setEmail] = useState(p.contact_email);
  const [saving, setSaving] = useState(false);

  const [showLogoTool, setShowLogoTool] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const { profile } = useAuth();

  const save = async () => {
    setSaving(true);
    const nameResult = name === p.name ? { ok: true } : await updatePublisherName(p.id, name);
    const emailResult = email === p.contact_email ? { ok: true } : await updatePublisherContactEmail(p.id, email);
    setSaving(false);
    if (nameResult.ok && emailResult.ok) {
      setEditing(false);
      onChange();
    } else {
      window.alert(nameResult.error ?? emailResult.error ?? 'Failed.');
    }
  };

  const applyLogo = async () => {
    if (!logoUrl) return;
    setLogoBusy(true);
    setLogoMessage(null);
    const result = await setPublisherLogoForAllJobs(p.id, logoUrl);
    setLogoBusy(false);
    if (result.ok) {
      setShowLogoTool(false);
      setLogoUrl('');
      onChange();
    } else {
      setLogoMessage(result.error ?? 'Could not apply logo.');
    }
  };

  return (
    <Row>
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-50 text-ink-500">
        {p.logo_url ? (
          <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Contact email"
              className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500"
            />
            <div className="flex items-center gap-2">
              <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Save</button>
              <button onClick={() => { setEditing(false); setName(p.name); setEmail(p.contact_email); }} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              {p.name}
              <button onClick={() => setEditing(true)} aria-label="Edit" className="text-ink-300 hover:text-ink-600">
                <Pencil className="h-3 w-3" />
              </button>
            </p>
            <p className="text-xs text-ink-500">
              {p.org_type} · {p.contact_email}{p.country ? ` · ${p.country.name}` : ''}{p.website ? ` · ${p.website}` : ''}
              {stats && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${stats.total ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500'}`}>
                  {stats.total ? `${stats.total.toLocaleString()} jobs · ${stats.live.toLocaleString()} live · ${stats.pending.toLocaleString()} pending` : 'No jobs'}
                </span>
              )}
            </p>
          </>
        )}

        {allowLogo && showLogoTool && (
          <div className="mt-2 max-w-xs rounded-lg border border-ink-200 bg-white p-3">
            <p className="text-[11px] text-ink-500">Applied to every {p.name} job (pending, published, and any future ones) at once.</p>
            {profile?.id && <ImageUploadField userId={profile.id} value={logoUrl} onChange={setLogoUrl} label="Company logo" />}
            <button
              onClick={applyLogo}
              disabled={logoBusy || !logoUrl}
              className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {logoBusy ? 'Applying…' : 'Apply'}
            </button>
            {logoMessage && <p className="mt-1.5 text-xs font-medium text-rose-600">{logoMessage}</p>}
          </div>
        )}
      </div>
      {allowLogo && (
        <button
          onClick={() => setShowLogoTool((v) => !v)}
          className="shrink-0 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50"
        >
          {p.logo_url ? 'Change logo' : 'Set logo'}
        </button>
      )}
      {children}
    </Row>
  );
}

function AgencyRow({ a, onChange, children }: { a: PendingAgency; onChange: () => void; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result = await updateAgencyName(a.id, name);
    setSaving(false);
    if (result.ok) { setEditing(false); onChange(); }
    else window.alert(result.error ?? 'Failed.');
  };

  return (
    <Row>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
        <Building2 className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500"
            />
            <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Save</button>
            <button onClick={() => { setEditing(false); setName(a.name); }} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            {a.name}
            <button onClick={() => setEditing(true)} aria-label="Edit name" className="text-ink-300 hover:text-ink-600">
              <Pencil className="h-3 w-3" />
            </button>
          </p>
        )}
        <p className="text-xs text-ink-500">
          {[a.city, a.country].filter(Boolean).join(', ')}{a.email ? ` · ${a.email}` : ''}{a.website ? ` · ${a.website}` : ''}
        </p>
      </div>
      {children}
    </Row>
  );
}

function AdminAccessSection({ admins, currentEmail, onChange }: { admins: AdminProfile[]; currentEmail: string; onChange: () => void }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grant = async () => {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    const result = await grantAdminByEmail(email);
    setSaving(false);
    if (result.ok) {
      setEmail('');
      onChange();
    } else {
      setError(result.error ?? 'Could not grant admin access.');
    }
  };

  const revoke = async (targetEmail: string) => {
    if (!window.confirm(`Remove admin access for ${targetEmail}?`)) return;
    const result = await revokeAdminByEmail(targetEmail);
    if (result.ok) onChange();
    else window.alert(result.error ?? 'Could not revoke admin access.');
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
        Admin access <span className="text-ink-400">({admins.length})</span>
      </h2>

      <div className="mt-3 border border-ink-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="h-10 flex-1 rounded-md border border-ink-200 px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
          />
          <button
            onClick={grant}
            disabled={saving || !email.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <ShieldPlus className="h-4 w-4" />
            Grant admin access
          </button>
        </div>
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <p className="mt-2 text-xs text-ink-400">
          The email must already have a MadeVisa account. They'll get full admin access immediately.
        </p>

        {admins.length > 0 && (
          <div className="mt-4 divide-y divide-ink-100 border-t border-ink-100 pt-3">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{a.full_name || 'Unnamed'}</p>
                  <p className="truncate text-xs text-ink-500">{a.email}</p>
                </div>
                {a.email !== currentEmail && (
                  <button
                    onClick={() => revoke(a.email)}
                    className="shrink-0 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * One-off fixup section for jobs imported before job_function existed —
 * see backfillJobFunctions in src/lib/admin.ts for what this actually
 * does. Safe to run repeatedly (it only ever touches jobs that still
 * have no job_function), and safe to leave visible permanently since
 * it's a no-op button once everything's classified — but it earns its
 * spot at the top of the page while there's a backlog to clear.
 */
function BackfillJobFunctionsSection({ onChange }: { onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    const res = await backfillJobFunctions();
    setBusy(false);
    if (res.ok) {
      setResult(
        `Categorized ${res.updated} job${res.updated === 1 ? '' : 's'} from their titles.` +
          (res.skipped > 0 ? ` ${res.skipped} didn't match any known category and were left as-is.` : '')
      );
      onChange();
    } else {
      setError(res.error ?? 'Backfill failed.');
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Fix existing job categories</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4">
        <p className="text-xs text-ink-500">
          Jobs imported before category tracking existed have no job function set, so they won't show up under any category
          filter on the public Jobs page. This classifies each one from its title (Design, Engineering, Healthcare, ...) and
          fills it in directly — no re-import needed, and nothing else about the job is touched. Safe to run more than once;
          it only ever affects jobs that still have no category set.
        </p>
        <button
          onClick={run}
          disabled={busy}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Categorizing…' : 'Categorize existing jobs'}
        </button>
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        {result && <p className="mt-3 text-xs font-medium text-emerald-700">{result}</p>}
      </div>
    </section>
  );
}

/**
 * Every company we've identified as being on Greenhouse, with the
 * board token to pull from. Kept as one flat list rather than only
 * the "still to fetch" ones so it doubles as a way to re-run an
 * already-imported company later (e.g. weekly, to pick up new
 * postings) — fetching is always safe to repeat; it only ever adds to
 * Pending sponsored jobs, never touches what's already published.
 * `done` just controls the little badge below, not what's selectable.
 */
const GREENHOUSE_COMPANIES: { name: string; legalName: string; token: string }[] = [
  { name: 'Stripe', legalName: 'Stripe, Inc.', token: 'stripe' },
  { name: 'Figma', legalName: 'Figma, Inc.', token: 'figma' },
  { name: 'Coinbase', legalName: 'Coinbase, Inc.', token: 'coinbase' },
  { name: 'Cloudflare', legalName: 'Cloudflare, Inc.', token: 'cloudflare' },
  { name: 'Datadog', legalName: 'Datadog, Inc.', token: 'datadog' },
  { name: 'Reddit', legalName: 'Reddit, Inc.', token: 'reddit' },
  { name: 'Twilio', legalName: 'Twilio Inc.', token: 'twilio' },
  { name: 'Gusto', legalName: 'Gusto, Inc.', token: 'gusto' },
  { name: 'Intercom', legalName: 'Intercom, Inc.', token: 'intercom' },
  { name: 'Contentful', legalName: 'Contentful, Inc.', token: 'contentful' },
  { name: 'Brex', legalName: 'Brex Inc.', token: 'brex' },
  { name: 'Ramp', legalName: 'Ramp Business Corporation', token: 'ramp' },
  { name: 'Vanta', legalName: 'Vanta Inc.', token: 'vanta' },
  { name: 'Rippling', legalName: 'Rippling, Inc.', token: 'rippling' },
  { name: 'Lattice', legalName: 'Lattice, Inc.', token: 'lattice' },
  { name: 'Airtable', legalName: 'Airtable, Inc.', token: 'airtable' },
  { name: 'Miro', legalName: 'Miro, Inc.', token: 'miro' },
  { name: 'Webflow', legalName: 'Webflow, Inc.', token: 'webflow' },
  { name: 'Asana', legalName: 'Asana, Inc.', token: 'asana' },
  { name: 'Dropbox', legalName: 'Dropbox, Inc.', token: 'dropbox' },
  { name: 'Canva', legalName: 'Canva Pty Ltd', token: 'canva' },
  { name: 'Duolingo', legalName: 'Duolingo, Inc.', token: 'duolingo' },
  { name: 'GitLab', legalName: 'GitLab Inc.', token: 'gitlab' },
  { name: 'Okta', legalName: 'Okta, Inc.', token: 'okta' },
  { name: 'Robinhood', legalName: 'Robinhood Markets, Inc.', token: 'robinhood' },
  { name: 'Affirm', legalName: 'Affirm Holdings, Inc.', token: 'affirm' },
  { name: 'Plaid', legalName: 'Plaid Inc.', token: 'plaid' },
  { name: 'Mercury', legalName: 'Mercury Technologies, Inc.', token: 'mercury' },
  { name: 'Deel', legalName: 'Deel, Inc.', token: 'deel' },
  { name: 'Personio', legalName: 'Personio SE & Co. KG', token: 'personio' },
  { name: 'Celonis', legalName: 'Celonis SE', token: 'celonis' },
  { name: 'Mollie', legalName: 'Mollie B.V.', token: 'mollie' },
  { name: 'SumUp', legalName: 'SumUp Limited', token: 'sumup' },
  { name: 'Mambu', legalName: 'Mambu GmbH', token: 'mambu' },
  { name: 'Typeform', legalName: 'Typeform S.L.', token: 'typeform' },
  { name: 'Pleo', legalName: 'Pleo Technologies A/S', token: 'pleo' },
  { name: 'Synthesia', legalName: 'Synthesia Limited', token: 'synthesia' },
  { name: 'Hugging Face', legalName: 'Hugging Face, Inc.', token: 'huggingface' },
  { name: 'Scale AI', legalName: 'Scale AI, Inc.', token: 'scaleai' },
  { name: 'Vercel', legalName: 'Vercel Inc.', token: 'vercel' },
  { name: 'Supabase', legalName: 'Supabase Inc.', token: 'supabase' },
  { name: 'MongoDB', legalName: 'MongoDB, Inc.', token: 'mongodb' },
  { name: 'Elastic', legalName: 'Elastic N.V.', token: 'elastic' },
  { name: 'HashiCorp', legalName: 'HashiCorp, Inc.', token: 'hashicorp' },
  { name: 'Snowflake', legalName: 'Snowflake Inc.', token: 'snowflake' },
  { name: 'Databricks', legalName: 'Databricks, Inc.', token: 'databricks' },
  { name: 'HubSpot', legalName: 'HubSpot, Inc.', token: 'hubspot' },
  { name: 'Zendesk', legalName: 'Zendesk, Inc.', token: 'zendesk' },
  { name: 'Squarespace', legalName: 'Squarespace, Inc.', token: 'squarespace' },
  { name: 'Grammarly', legalName: 'Grammarly, Inc.', token: 'grammarly' },
  { name: 'DoorDash', legalName: 'DoorDash, Inc.', token: 'doordash' },
  { name: 'Instacart', legalName: 'Maplebear Inc.', token: 'instacart' },
  { name: 'Lyft', legalName: 'Lyft, Inc.', token: 'lyft' },
  { name: 'Uber', legalName: 'Uber Technologies, Inc.', token: 'uber' },
  { name: 'Pinterest', legalName: 'Pinterest, Inc.', token: 'pinterest' },
  { name: 'Discord', legalName: 'Discord Inc.', token: 'discord' },
  { name: 'Chime', legalName: 'Chime Financial, Inc.', token: 'chime' },
  { name: 'Block', legalName: 'Block, Inc.', token: 'block' },
  { name: 'Wise', legalName: 'Wise plc', token: 'wise' },
  { name: 'Airwallex', legalName: 'Airwallex (Hong Kong) Limited', token: 'airwallex' },
  { name: 'Checkout.com', legalName: 'Checkout Ltd', token: 'checkout' },
  { name: 'N26', legalName: 'N26 SE', token: 'n26' },
  { name: 'Klarna', legalName: 'Klarna Bank AB', token: 'klarna' },
  { name: 'Wolt', legalName: 'Wolt Enterprises Oy', token: 'wolt' },
  { name: 'Delivery Hero', legalName: 'Delivery Hero SE', token: 'deliveryhero' },
  { name: 'Zalando', legalName: 'Zalando SE', token: 'zalando' },
  { name: 'HelloFresh', legalName: 'HelloFresh SE', token: 'hellofresh' },
  { name: 'GetYourGuide', legalName: 'GetYourGuide Deutschland GmbH', token: 'getyourguide' },
  { name: 'Procore', legalName: 'Procore Technologies, Inc.', token: 'procore' },
  { name: 'GuidePoint Security', legalName: 'GuidePoint Security LLC', token: 'guidepointsecurity' },
];

type BulkImportRowStatus = 'idle' | 'fetching' | 'importing' | 'done' | 'error' | 'skipped';

function BulkGreenhouseImportSection({
  countries,
  allJobs,
  onImported,
}: {
  countries: CountryOption[];
  allJobs: AdminSponsoredJob[];
  onImported: () => void;
}) {
  // Real counts from the actual data, not a hardcoded guess — matches
  // every job's publisher name (any status: pending, published, or
  // otherwise) against each company's short name or legal name, since
  // a publisher may have been created under either depending on how it
  // was first imported. This is what makes "Already imported" honest
  // for every company here, not just the handful originally hardcoded.
  const jobCountsByPublisherName = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of allJobs) {
      const name = job.publisher?.name?.trim().toLowerCase();
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return map;
  }, [allJobs]);

  const countFor = (c: (typeof GREENHOUSE_COMPANIES)[number]) =>
    jobCountsByPublisherName.get(c.name.trim().toLowerCase()) ?? jobCountsByPublisherName.get(c.legalName.trim().toLowerCase()) ?? 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, { status: BulkImportRowStatus; note?: string }>>({});
  const [search, setSearch] = useState('');
  const [finalSummary, setFinalSummary] = useState<string | null>(null);

  const filtered = GREENHOUSE_COMPANIES.filter(
    (c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()) || c.token.includes(search.trim().toLowerCase())
  );

  const toggle = (token: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(GREENHOUSE_COMPANIES.map((c) => c.token)));
  const selectNone = () => setSelected(new Set());
  const selectFiltered = () => setSelected(new Set(filtered.map((c) => c.token)));

  const runImport = async () => {
    const queue = GREENHOUSE_COMPANIES.filter((c) => selected.has(c.token));
    if (queue.length === 0) return;

    setRunning(true);
    setStatuses(Object.fromEntries(queue.map((c) => [c.token, { status: 'idle' as const }])));
    setFinalSummary(null);

    let successCount = 0;
    let totalJobsAdded = 0;

    for (const company of queue) {
      setStatuses((prev) => ({ ...prev, [company.token]: { status: 'fetching' } }));

      const res = await fetchGreenhouseJobs(company.token);
      if (!res.ok) {
        setStatuses((prev) => ({ ...prev, [company.token]: { status: 'error', note: res.error ?? 'Fetch failed.' } }));
        continue;
      }
      if (res.jobs.length === 0) {
        setStatuses((prev) => ({ ...prev, [company.token]: { status: 'skipped', note: 'Zero jobs returned — check the token.' } }));
        continue;
      }

      setStatuses((prev) => ({ ...prev, [company.token]: { status: 'importing' } }));
      const publisherResult = await findOrCreateImportedPublisher(company.name);
      if (!publisherResult.ok || !publisherResult.id) {
        setStatuses((prev) => ({ ...prev, [company.token]: { status: 'error', note: publisherResult.error ?? 'Could not set up publisher.' } }));
        continue;
      }

      const source = await registerImportSource({ publisherId: publisherResult.id, kind: 'greenhouse', sourceUrl: company.token, platform: 'Greenhouse' });
      const importResult = await importJobsAsPending(
        publisherResult.id,
        countries,
        res.jobs.map(fetchedJobToImportInput),
        { importSourceId: source.id ?? null }
      );

      if (importResult.ok) {
        successCount++;
        totalJobsAdded += importResult.imported;
        setStatuses((prev) => ({ ...prev, [company.token]: { status: 'done', note: `Added ${importResult.imported} new${importResult.skipped ? `, ${importResult.skipped} already here` : ''}.` } }));
      } else {
        setStatuses((prev) => ({ ...prev, [company.token]: { status: 'error', note: importResult.error ?? 'Import failed.' } }));
      }

      // Small stagger between companies — the same courtesy the careers-
      // page importer already extends per-request, here per-company.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setRunning(false);
    setFinalSummary(
      `Done — ${successCount}/${queue.length} compan${successCount === 1 ? 'y' : 'ies'} succeeded, ${totalJobsAdded} job${totalJobsAdded === 1 ? '' : 's'} added to pending.`
    );
    if (totalJobsAdded > 0) onImported();
  };

  const doneCount = Object.values(statuses).filter((s) => s.status === 'done' || s.status === 'error' || s.status === 'skipped').length;
  const queueSize = Object.keys(statuses).length;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Bulk import from Greenhouse</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4">
        <p className="text-xs text-ink-500">
          Pick any number of companies below and fetch them all in one go — each runs through the exact same
          Greenhouse import as the single-company tool above, straight into <strong>Pending sponsored jobs</strong>.
          Re-running only adds genuinely new postings (duplicates are skipped). To also remove jobs a company has
          closed, use <strong>Sync</strong> in Import sources above — every import here is saved as a source automatically.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name…"
            className="h-8 w-48 rounded-md border border-ink-200 px-2 text-xs text-ink-900 outline-none focus:border-brand-500"
          />
          <button onClick={selectAll} disabled={running} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">
            Select all ({GREENHOUSE_COMPANIES.length})
          </button>
          {search.trim() && (
            <button onClick={selectFiltered} disabled={running} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">
              Select filtered ({filtered.length})
            </button>
          )}
          <button onClick={selectNone} disabled={running} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">
            Select none
          </button>
          <span className="text-[11px] text-ink-400">{selected.size} selected</span>
        </div>

        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-ink-100">
          <div className="divide-y divide-ink-100">
            {filtered.map((c) => {
              const rowStatus = statuses[c.token];
              return (
                <label key={c.token} className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={selected.has(c.token)}
                    onChange={() => toggle(c.token)}
                    disabled={running}
                    className="h-3.5 w-3.5 shrink-0 rounded border-ink-300"
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{c.name}</span>
                  <span className="hidden shrink-0 truncate text-ink-400 sm:block sm:w-56">{c.legalName}</span>
                  <code className="shrink-0 rounded bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-500">{c.token}</code>
                  {(() => {
                    const existingCount = countFor(c);
                    return (
                      existingCount > 0 &&
                      !rowStatus && (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Already imported ({existingCount} job{existingCount === 1 ? '' : 's'})
                        </span>
                      )
                    );
                  })()}
                  {rowStatus && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        rowStatus.status === 'done'
                          ? 'bg-emerald-50 text-emerald-700'
                          : rowStatus.status === 'error'
                          ? 'bg-rose-50 text-rose-700'
                          : rowStatus.status === 'skipped'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {rowStatus.status === 'fetching'
                        ? 'Fetching…'
                        : rowStatus.status === 'importing'
                        ? 'Adding…'
                        : rowStatus.note ?? rowStatus.status}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <button
          onClick={runImport}
          disabled={running || selected.size === 0}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {running ? `Importing… (${doneCount}/${queueSize})` : `Fetch & add ${selected.size || ''} selected`}
        </button>
        {running && (
          <div className="mt-3">
            <ProgressBar value={queueSize ? doneCount / queueSize : 0} label={`Importing ${doneCount} of ${queueSize} companies`} />
          </div>
        )}
        {finalSummary && <p className="mt-2 text-xs font-medium text-ink-600">{finalSummary}</p>}
      </div>
    </section>
  );
}

function ImportFromAtsSection({ countries, onImported }: { countries: CountryOption[]; onImported: () => void }) {
  const [boardToken, setBoardToken] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState<'fetching' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Fetch and commit are one step now: the moment a board's jobs come
  // back, they're inserted as pending and show up for real in the
  // "Pending sponsored jobs" panel below (grouped by company there) —
  // no separate in-memory preview to review and then import.
  const fetchAndImport = async () => {
    const company = companyName.trim() || boardToken.trim();
    if (!company) return;
    setBusy('fetching');
    setError(null);
    setResult(null);

    const res = await fetchGreenhouseJobs(boardToken);
    if (!res.ok) {
      setBusy(null);
      setError(res.error ?? 'Could not fetch that board.');
      return;
    }
    if (res.jobs.length === 0) {
      setBusy(null);
      setError('That board returned zero jobs — double-check the token.');
      return;
    }

    setBusy('importing');
    const publisherResult = await findOrCreateImportedPublisher(company);
    if (!publisherResult.ok || !publisherResult.id) {
      setBusy(null);
      setError(publisherResult.error ?? 'Could not set up the publisher.');
      return;
    }

    const source = await registerImportSource({ publisherId: publisherResult.id, kind: 'greenhouse', sourceUrl: boardToken, platform: 'Greenhouse' });
    const importResult = await importJobsAsPending(
      publisherResult.id,
      countries,
      res.jobs.map(fetchedJobToImportInput),
      { importSourceId: source.id ?? null }
    );

    setBusy(null);
    if (importResult.ok) {
      setResult(
        `Added ${importResult.imported} ${company} job${importResult.imported === 1 ? '' : 's'} to pending` +
          (importResult.skipped ? ` (${importResult.skipped} already on MadeVisa, skipped)` : '') +
          '. Saved as a sync source.'
      );
      setBoardToken('');
      setCompanyName('');
      onImported();
    } else {
      setError(importResult.error ?? 'Import failed.');
    }
  };

  const canFetch = !busy && boardToken.trim();

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Import jobs from an ATS</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4">
        <p className="text-xs text-ink-500">
          Pulls live listings from a company's public Greenhouse job board — a documented, no-auth endpoint meant
          for exactly this kind of syndication — and adds them straight to <strong>Pending sponsored jobs</strong>,
          grouped under this company, for review below. Each job's destination country is matched automatically
          from its own listed location — nothing to pick here.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-500">Greenhouse board token</label>
            <input
              value={boardToken}
              onChange={(e) => setBoardToken(e.target.value)}
              placeholder="e.g. stripe"
              className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-[10px] text-ink-400">The slug in boards.greenhouse.io/&lt;this&gt;</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-500">Company name (as shown on MadeVisa)</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Stripe"
              className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-[10px] text-ink-400">Leave blank to reuse the board token.</p>
          </div>
        </div>

        <button
          onClick={fetchAndImport}
          disabled={!canFetch}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === 'fetching' ? 'Fetching…' : busy === 'importing' ? 'Adding to pending…' : 'Fetch & add to pending'}
        </button>
        {busy && (
          <div className="mt-3">
            <ProgressBar value={busy === 'fetching' ? 0.35 : 0.8} label={busy === 'fetching' ? 'Fetching the Greenhouse board' : 'Adding jobs to pending'} />
          </div>
        )}

        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        {result && <p className="mt-3 text-xs font-medium text-emerald-700">{result}</p>}
      </div>
    </section>
  );
}

/**
 * Separate from ImportFromAtsSection above (Greenhouse only). This one
 * takes any careers page URL and auto-detects the ATS platform behind it
 * server-side (currently: Phenom People sites, e.g. Roche's), since those
 * sites don't allow direct cross-origin browser fetches the way
 * Greenhouse's public API does. See fetchJobsFromCareersUrl in
 * src/lib/atsImport.ts and the import-ats-jobs edge function.
 */
function ImportFromCareersUrlSection({ countries, onImported }: { countries: CountryOption[]; onImported: () => void }) {
  const [careersUrl, setCareersUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState<'fetching' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ imported: number; totalHits: number | null } | null>(null);
  const stopRequested = useRef(false);

  // A large site (Roche has 1000+ listings) can't be fetched in one
  // edge-function call — each call is capped (MAX_JOBS_PER_REQUEST in
  // the function) to stay well inside its execution time limit. So
  // this fetches repeatedly, passing back the `nextFrom` offset the
  // function returns each time, importing every batch as it lands
  // (visible growing live in Pending sponsored jobs below) until the
  // source reports nothing left — rather than silently stopping at
  // whatever the first call's cap happened to be.
  const MAX_BATCHES = 300; // a safety ceiling, not an expected real-world size (some strategies return 60 jobs per batch)

  const fetchAndImport = async () => {
    const company = companyName.trim();
    if (!company) return;
    setError(null);
    setResult(null);
    stopRequested.current = false;

    setBusy('importing');
    const publisherResult = await findOrCreateImportedPublisher(company);
    if (!publisherResult.ok || !publisherResult.id) {
      setBusy(null);
      setError(publisherResult.error ?? 'Could not set up the publisher.');
      return;
    }

    let from = 0;
    let totalImported = 0;
    let totalHits: number | null = null;
    // Filled in by the first batch: where the jobs really live + how to page them.
    let cont: { resolvedUrl?: string | null; strategy?: string | null } | undefined;
    let source: string | null = null;
    let sourceId: string | null = null;
    let totalSkipped = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      if (stopRequested.current) break;

      setBusy('fetching');
      setProgress({ imported: totalImported, totalHits });
      const res = await fetchJobsFromCareersUrl(careersUrl, from, cont);

      if (!res.ok) {
        setBusy(null);
        setProgress(null);
        setError(totalImported > 0 ? `Stopped after ${totalImported} jobs — ${res.error}` : res.error ?? 'Could not fetch that careers page.');
        if (totalImported > 0) onImported();
        return;
      }
      if (res.totalHits != null) totalHits = res.totalHits;
      if (res.strategy) cont = { resolvedUrl: res.resolvedUrl, strategy: res.strategy };
      if (res.source) source = res.source;

      if (res.jobs.length === 0) {
        if (batch === 0) {
          setBusy(null);
          setProgress(null);
          setError('That page returned zero jobs.');
          return;
        }
        break;
      }

      setBusy('importing');
      setProgress({ imported: totalImported, totalHits });
      if (!sourceId) {
        const reg = await registerImportSource({
          publisherId: publisherResult.id,
          kind: 'careers_url',
          sourceUrl: careersUrl,
          resolvedUrl: res.resolvedUrl ?? null,
          strategy: res.strategy ?? null,
          platform: res.source ?? null,
        });
        sourceId = reg.id ?? null;
      }
      const importResult = await importJobsAsPending(
        publisherResult.id,
        countries,
        res.jobs.map(fetchedJobToImportInput),
        { importSourceId: sourceId }
      );

      if (!importResult.ok && importResult.imported === 0) {
        setBusy(null);
        setProgress(null);
        setError(totalImported > 0 ? `Stopped after ${totalImported} jobs — ${importResult.error}` : importResult.error ?? 'Import failed.');
        if (totalImported > 0) onImported();
        return;
      }
      totalImported += importResult.imported;
      totalSkipped += importResult.skipped;
      onImported(); // refresh the pending-jobs panel after every batch, so it visibly fills up live rather than jumping once at the very end

      if (!res.nextFrom) break; // source reports nothing left
      from = res.nextFrom;
    }

    setBusy(null);
    setProgress(null);
    setResult(
      stopRequested.current
        ? `Stopped early — added ${totalImported} ${company} job${totalImported === 1 ? '' : 's'} to Pending sponsored jobs below${source ? ` (via ${source})` : ''}.`
        : `Added ${totalImported} ${company} job${totalImported === 1 ? '' : 's'} to pending${source ? ` (via ${source})` : ''}${totalSkipped ? `, skipped ${totalSkipped} already on MadeVisa` : ''}. Saved as a sync source.`
    );
    setCareersUrl('');
    setCompanyName('');
  };

  const canFetch = !busy && careersUrl.trim() && companyName.trim();

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Import jobs from a careers page</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4">
        <p className="text-xs text-ink-500">
          Paste any careers page — a landing page, a job search page, an ATS board link, or a JSON request URL
          copied from DevTools. The platform behind it (Workday, Eightfold, Oracle, SmartRecruiters, Phenom,
          Greenhouse, Lever, Ashby, TalentBrew, or a generic site) is detected server-side, following "Search jobs"
          links if needed — and jobs get added straight to{' '}
          <strong>Pending sponsored jobs</strong>, grouped under this company, for review below. Each job's
          destination country, description, type, and (where the source page has them) posted date and salary are
          all pulled from that job's own page automatically — nothing to pick here. Large sites (1000+ listings)
          are fetched in batches automatically until everything's in — no need to run this more than once.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-500">Careers page URL</label>
            <input
              value={careersUrl}
              onChange={(e) => setCareersUrl(e.target.value)}
              placeholder="https://careers.roche.com/global/en/search-results"
              className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-[10px] text-ink-400">Landing page, search page, ATS board or API URL — not a single job's URL.</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-500">Company name (as shown on MadeVisa)</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Roche"
              className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAndImport}
            disabled={!canFetch}
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === 'fetching'
              ? 'Fetching…'
              : busy === 'importing'
              ? 'Adding to pending…'
              : 'Fetch & add to pending'}
          </button>
          {busy && (
            <button
              onClick={() => { stopRequested.current = true; }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50"
            >
              Stop after this batch
            </button>
          )}
        </div>
        {busy && (
          <div className="mt-3">
            <ProgressBar
              value={progress?.totalHits ? Math.min(1, progress.imported / progress.totalHits) : null}
              label={busy === 'fetching' ? 'Fetching jobs from the careers page' : 'Adding jobs to pending'}
              detail={progress ? `${progress.imported.toLocaleString()} imported${progress.totalHits ? ` of ~${progress.totalHits.toLocaleString()}` : ''} so far` : 'Detecting the platform…'}
            />
          </div>
        )}

        {error && <p className="mt-2 whitespace-pre-line text-xs font-medium text-rose-600">{error}</p>}
        {result && <p className="mt-3 text-xs font-medium text-emerald-700">{result}</p>}
      </div>
    </section>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
    </div>
  );
}

function NumberInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500"
      />
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
    </div>
  );
}

function TextAreaField({ label, value, onChange, rows = 2, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[11px] font-semibold text-ink-500">{label}</label>
        <span className="text-[10px] text-ink-400">{value.length}/5000</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs leading-5 text-ink-700 outline-none focus:border-brand-500"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function EditableProgramRow({ p, onChange, selected, onToggleSelect }: { p: AdminProgram; onChange: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [category, setCategory] = useState<ProgramCategory>(p.category as ProgramCategory);
  const [description, setDescription] = useState(p.description ?? '');
  const [city, setCity] = useState(p.city ?? '');
  const [status, setStatus] = useState<ListingStatus>(p.status);
  const [costStatus, setCostStatus] = useState<CostStatus>(p.cost_status);
  const [costMin, setCostMin] = useState(p.cost_amount_min?.toString() ?? '');
  const [costMax, setCostMax] = useState(p.cost_amount_max?.toString() ?? '');
  const [costCurrency, setCostCurrency] = useState(p.cost_currency ?? 'USD');
  const [fundingText, setFundingText] = useState(p.funding_text ?? '');
  const [durationText, setDurationText] = useState(p.duration_text ?? '');
  const [eligibilityNotes, setEligibilityNotes] = useState(p.eligibility_notes ?? '');
  const [minAge, setMinAge] = useState(p.min_age?.toString() ?? '');
  const [maxAge, setMaxAge] = useState(p.max_age?.toString() ?? '');
  const [opensAt, setOpensAt] = useState(p.applications_open_at ?? '');
  const [closesAt, setClosesAt] = useState(p.applications_close_at ?? '');
  const [benefits, setBenefits] = useState(p.benefits ?? '');
  const [requirements, setRequirements] = useState(p.requirements ?? '');
  const [spots, setSpots] = useState(p.spots_available?.toString() ?? '');
  const [officialUrl, setOfficialUrl] = useState(p.official_url ?? '');
  const [applicationUrl, setApplicationUrl] = useState(p.application_url ?? '');
  const [imageUrl, setImageUrl] = useState(p.image_url ?? '');
  const [sourceVerified, setSourceVerified] = useState(p.source_verified);
  const [needsInfoMessage, setNeedsInfoMessage] = useState(p.needs_info_message ?? '');
  const [adminNotes, setAdminNotes] = useState(p.admin_notes ?? '');
  const [saving, setSaving] = useState(false);

  const fields = PROGRAM_CATEGORY_FIELDS[category] ?? [];
  const { profile } = useAuth();

  const save = async () => {
    setSaving(true);
    const ok = await updateProgramAsAdmin(p.id, {
      title,
      category,
      description: description || null,
      city: city || null,
      status,
      cost_status: costStatus,
      cost_amount_min: costMin ? Number(costMin) : null,
      cost_amount_max: costMax ? Number(costMax) : null,
      cost_currency: costCurrency,
      funding_text: fundingText || null,
      duration_text: durationText || null,
      eligibility_notes: eligibilityNotes || null,
      min_age: minAge ? Number(minAge) : null,
      max_age: maxAge ? Number(maxAge) : null,
      applications_open_at: opensAt || null,
      applications_close_at: closesAt || null,
      benefits: benefits || null,
      requirements: requirements || null,
      spots_available: spots ? Number(spots) : null,
      official_url: officialUrl || null,
      application_url: applicationUrl || null,
      image_url: imageUrl || null,
      source_verified: sourceVerified,
      needs_info_message: status === 'needs_information' ? needsInfoMessage || null : null,
      admin_notes: adminNotes || null,
    });
    setSaving(false);
    if (ok) { setEditing(false); onChange(); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    const result = await deleteProgram(p.id);
    if (result.ok) onChange();
    else window.alert(result.error ?? 'Delete failed.');
  };

  if (!editing) {
    return (
      <Row>
        {onToggleSelect && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            {p.title}
            <button onClick={() => setEditing(true)} aria-label="Edit" className="text-ink-300 hover:text-ink-600">
              <Pencil className="h-3 w-3" />
            </button>
            <StatusPill status={p.status} />
          </p>
          <p className="text-xs text-ink-500">
            {p.category} · {p.publisher?.name ?? 'Unknown publisher'}{p.country ? ` · ${p.country.name}` : ''}{p.city ? `, ${p.city}` : ''}
          </p>
          <p className="text-[11px] text-ink-400">
            Submitted {formatDate(p.created_at)}
            {p.approved_at && ` · Approved ${formatDate(p.approved_at)}`}
            {p.expires_at && ` · Expires ${formatDate(p.expires_at)}`}
          </p>
        </div>
        <button onClick={remove} aria-label="Delete" className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-rose-50 hover:text-rose-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </Row>
    );
  }

  return (
    <div className="space-y-3 bg-ink-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Title" value={title} onChange={setTitle} />
        <SelectField label="Category" value={category} onChange={(v) => setCategory(v as ProgramCategory)} options={PROGRAM_CATEGORIES} />
      </div>

      <TextAreaField label="Description" value={description} onChange={setDescription} rows={3} />

      <div className="grid grid-cols-3 gap-3">
        <TextField label="City" value={city} onChange={setCity} placeholder="Optional" />
        <SelectField label="Status" value={status} onChange={(v) => setStatus(v as ListingStatus)} options={LISTING_STATUSES.map((s) => s.value)} />
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={sourceVerified} onChange={(e) => setSourceVerified(e.target.checked)} />
            Source verified
          </label>
        </div>
      </div>

      {status === 'needs_information' && (
        <TextAreaField label="Message to submitter — what's missing?" value={needsInfoMessage} onChange={setNeedsInfoMessage} rows={2} placeholder="e.g. Please confirm the application deadline and funding amount." />
      )}

      {fields.includes('cost') && (
        <div className="rounded-md border border-ink-200 bg-white p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">Cost / funding</p>
          <div className="grid grid-cols-4 gap-3">
            <SelectField label="Cost status" value={costStatus} onChange={(v) => setCostStatus(v as CostStatus)} options={COST_STATUSES.map((s) => s.value)} />
            {costStatus === 'cost_available' && (
              <>
                <NumberInput label="Min amount" value={costMin} onChange={setCostMin} />
                <NumberInput label="Max amount" value={costMax} onChange={setCostMax} />
                <TextField label="Currency" value={costCurrency} onChange={setCostCurrency} placeholder="USD" />
              </>
            )}
          </div>
          <div className="mt-3">
            <TextField label="Funding / stipend details" value={fundingText} onChange={setFundingText} placeholder="e.g. Full tuition + $900/mo stipend" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {fields.includes('duration') && <TextField label="Duration" value={durationText} onChange={setDurationText} placeholder="e.g. 6 months" />}
        {fields.includes('eligibility') && (
          <div className="col-span-2">
            <TextAreaField label="Eligibility notes" value={eligibilityNotes} onChange={setEligibilityNotes} rows={2} />
          </div>
        )}
      </div>

      {fields.includes('eligibility') && (
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Min age" value={minAge} onChange={setMinAge} />
          <NumberInput label="Max age" value={maxAge} onChange={setMaxAge} />
        </div>
      )}

      {fields.includes('deadline') && (
        <div className="grid grid-cols-2 gap-3">
          <DateInput label="Applications open" value={opensAt} onChange={setOpensAt} />
          <DateInput label="Applications close" value={closesAt} onChange={setClosesAt} />
        </div>
      )}

      {fields.includes('benefits') && <TextAreaField label="Benefits" value={benefits} onChange={setBenefits} rows={2} />}
      {fields.includes('requirements') && <TextAreaField label="Requirements" value={requirements} onChange={setRequirements} rows={2} />}

      <NumberInput label="Places available (optional)" value={spots} onChange={setSpots} placeholder="Leave blank for unlimited" />

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Official source URL" value={officialUrl} onChange={setOfficialUrl} placeholder="https://" />
        <TextField label="Application URL" value={applicationUrl} onChange={setApplicationUrl} placeholder="https://" />
      </div>

      {profile?.id && <ImageUploadField userId={profile.id} value={imageUrl} onChange={setImageUrl} label="Cover image / logo" />}

      <div>
        <TextAreaField label="Admin notes (internal only, never shown publicly)" value={adminNotes} onChange={setAdminNotes} rows={2} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-ink-500 hover:text-ink-700">Cancel</button>
      </div>
    </div>
  );
}

function EditableJobRow({ j, onChange, selected, onToggleSelect }: { j: AdminSponsoredJob; onChange: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(j.title);
  const [category, setCategory] = useState<JobCategory>(j.category as JobCategory);
  const [description, setDescription] = useState(j.description ?? '');
  const [city, setCity] = useState(j.city ?? '');
  const [remote, setRemote] = useState(j.remote);
  const [status, setStatus] = useState<ListingStatus>(j.status);
  const [salaryStatus, setSalaryStatus] = useState<SalaryStatus>(j.salary_status);
  const [salaryMin, setSalaryMin] = useState(j.salary_min?.toString() ?? '');
  const [salaryMax, setSalaryMax] = useState(j.salary_max?.toString() ?? '');
  const [salaryCurrency, setSalaryCurrency] = useState(j.salary_currency ?? 'USD');
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod>(j.salary_period);
  const [visaSponsorship, setVisaSponsorship] = useState(j.visa_sponsorship);
  const [experienceLevel, setExperienceLevel] = useState(j.experience_level ?? '');
  const [educationLevel, setEducationLevel] = useState(j.education_level ?? '');
  const [languages, setLanguages] = useState((j.languages ?? []).join(', '));
  const [applicationDeadline, setApplicationDeadline] = useState(j.application_deadline ?? '');
  const [benefits, setBenefits] = useState(j.benefits ?? '');
  const [requirements, setRequirements] = useState(j.requirements ?? '');
  const [officialUrl, setOfficialUrl] = useState(j.official_url ?? '');
  const [applicationUrl, setApplicationUrl] = useState(j.application_url ?? '');
  const [sourceVerified, setSourceVerified] = useState(j.source_verified);
  const [needsInfoMessage, setNeedsInfoMessage] = useState(j.needs_info_message ?? '');
  const [adminNotes, setAdminNotes] = useState(j.admin_notes ?? '');
  const [saving, setSaving] = useState(false);

  const fields = JOB_CATEGORY_FIELDS[category] ?? [];

  const save = async () => {
    setSaving(true);
    const ok = await updateSponsoredJobAsAdmin(j.id, {
      title,
      category,
      employment_type: category,
      description: description || null,
      city: city || null,
      remote,
      status,
      salary_status: salaryStatus,
      salary_min: salaryMin ? Number(salaryMin) : null,
      salary_max: salaryMax ? Number(salaryMax) : null,
      salary_currency: salaryCurrency,
      salary_period: salaryPeriod,
      visa_sponsorship: visaSponsorship,
      experience_level: experienceLevel || null,
      education_level: educationLevel || null,
      languages: languages ? languages.split(',').map((l) => l.trim()).filter(Boolean) : null,
      application_deadline: applicationDeadline || null,
      benefits: benefits || null,
      requirements: requirements || null,
      official_url: officialUrl || null,
      application_url: applicationUrl || null,
      source_verified: sourceVerified,
      needs_info_message: status === 'needs_information' ? needsInfoMessage || null : null,
      admin_notes: adminNotes || null,
    });
    setSaving(false);
    if (ok) { setEditing(false); onChange(); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${j.title}"? This can't be undone.`)) return;
    const result = await deleteSponsoredJob(j.id);
    if (result.ok) onChange();
    else window.alert(result.error ?? 'Delete failed.');
  };

  if (!editing) {
    return (
      <Row>
        {onToggleSelect && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1.5 shrink-0" />
        )}
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
          <Briefcase className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            {j.title}
            <button onClick={() => setEditing(true)} aria-label="Edit" className="text-ink-300 hover:text-ink-600">
              <Pencil className="h-3 w-3" />
            </button>
            <StatusPill status={j.status} />
          </p>
          <p className="text-xs text-ink-500">
            {j.category} · {j.publisher?.name ?? 'Unknown publisher'}{j.country ? ` · ${j.country.name}` : ''}{j.city ? `, ${j.city}` : ''}
          </p>
          <p className="text-[11px] text-ink-400">
            Submitted {formatDate(j.created_at)}
            {j.approved_at && ` · Approved ${formatDate(j.approved_at)}`}
            {j.expires_at && ` · Expires ${formatDate(j.expires_at)}`}
          </p>
        </div>
        <button
          onClick={() => window.open(`/admin/jobs/${j.id}`, '_blank', 'noopener')}
          className="shrink-0 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
        >
          Preview &amp; edit
        </button>
        <button onClick={remove} aria-label="Delete" className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-rose-50 hover:text-rose-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </Row>
    );
  }

  return (
    <div className="space-y-3 bg-ink-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Title" value={title} onChange={setTitle} />
        <SelectField label="Category" value={category} onChange={(v) => setCategory(v as JobCategory)} options={JOB_CATEGORIES} />
      </div>

      <TextAreaField label="Description" value={description} onChange={setDescription} rows={3} />

      <div className="grid grid-cols-3 gap-3">
        <TextField label="City" value={city} onChange={setCity} placeholder="Optional" />
        <SelectField label="Status" value={status} onChange={(v) => setStatus(v as ListingStatus)} options={LISTING_STATUSES.map((s) => s.value)} />
        <div className="flex items-end gap-3 pb-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
            Remote
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={sourceVerified} onChange={(e) => setSourceVerified(e.target.checked)} />
            Verified
          </label>
        </div>
      </div>

      {status === 'needs_information' && (
        <TextAreaField label="Message to submitter — what's missing?" value={needsInfoMessage} onChange={setNeedsInfoMessage} rows={2} placeholder="e.g. Please confirm salary range and whether visa sponsorship is offered." />
      )}

      {fields.includes('salary') && (
        <div className="rounded-md border border-ink-200 bg-white p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">Salary</p>
          <div className="grid grid-cols-5 gap-3">
            <SelectField label="Salary status" value={salaryStatus} onChange={(v) => setSalaryStatus(v as SalaryStatus)} options={SALARY_STATUSES.map((s) => s.value)} />
            {salaryStatus === 'disclosed' && (
              <>
                <NumberInput label="Min" value={salaryMin} onChange={setSalaryMin} />
                <NumberInput label="Max" value={salaryMax} onChange={setSalaryMax} />
                <TextField label="Currency" value={salaryCurrency} onChange={setSalaryCurrency} placeholder="USD" />
                <SelectField label="Per" value={salaryPeriod} onChange={(v) => setSalaryPeriod(v as SalaryPeriod)} options={SALARY_PERIODS} />
              </>
            )}
          </div>
        </div>
      )}

      {fields.includes('visaSponsorship') && (
        <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
          <input type="checkbox" checked={visaSponsorship} onChange={(e) => setVisaSponsorship(e.target.checked)} />
          Visa sponsorship offered
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        {fields.includes('experience') && <TextField label="Experience level" value={experienceLevel} onChange={setExperienceLevel} placeholder="e.g. 3+ years" />}
        {fields.includes('education') && <TextField label="Education level" value={educationLevel} onChange={setEducationLevel} placeholder="e.g. Bachelor's degree" />}
      </div>

      <TextField label="Languages (comma-separated)" value={languages} onChange={setLanguages} placeholder="e.g. English, German" />

      {fields.includes('duration') && <DateInput label="Application deadline" value={applicationDeadline} onChange={setApplicationDeadline} />}
      {fields.includes('benefits') && <TextAreaField label="Benefits" value={benefits} onChange={setBenefits} rows={2} />}
      <TextAreaField label="Requirements" value={requirements} onChange={setRequirements} rows={2} />

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Official source URL" value={officialUrl} onChange={setOfficialUrl} placeholder="https://" />
        <TextField label="Application URL" value={applicationUrl} onChange={setApplicationUrl} placeholder="https://" />
      </div>

      <TextAreaField label="Admin notes (internal only, never shown publicly)" value={adminNotes} onChange={setAdminNotes} rows={2} />

      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-ink-500 hover:text-ink-700">Cancel</button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-emerald-50 text-emerald-700',
    verified: 'bg-sky-50 text-sky-700',
    under_review: 'bg-indigo-50 text-indigo-700',
    needs_information: 'bg-amber-50 text-amber-700',
    pending: 'bg-amber-50 text-amber-700',
    draft: 'bg-ink-100 text-ink-500',
    rejected: 'bg-rose-50 text-rose-700',
    expired: 'bg-ink-100 text-ink-500',
  };
  const labels: Record<string, string> = {
    needs_information: 'needs info',
    under_review: 'under review',
  };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${styles[status] ?? 'bg-ink-50 text-ink-500'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ManagedJobsSection({ jobs, onChange }: { jobs: AdminSponsoredJob[]; onChange: () => void }) {
  const [open, setOpen] = useState(jobs.length <= ADMIN_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ListingStatus>('all');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [showLogoTool, setShowLogoTool] = useState(false);
  const { profile } = useAuth();

  const filtered = jobs.filter((j) => {
    const matchesSearch =
      !search.trim() ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.publisher?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const pageJobs = filtered.slice(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE);
  const allOnPageSelected = pageJobs.length > 0 && pageJobs.every((j) => selectedIds.has(j.id));
  // Every job matching the current search + status filter, across ALL
  // pages — not just the 10 visible ones.
  const allFilteredSelected = filtered.length > 0 && filtered.every((j) => selectedIds.has(j.id));

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((j) => next.delete(j.id));
      else filtered.forEach((j) => next.add(j.id));
      return next;
    });
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageJobs.forEach((j) => next.delete(j.id));
      else pageJobs.forEach((j) => next.add(j.id));
      return next;
    });
  };

  const bulkApprove = async () => {
    setBulkBusy(true);
    setBulkMessage(null);
    const result = await bulkSetJobStatus(Array.from(selectedIds), 'published');
    setBulkBusy(false);
    if (result.ok) {
      setBulkMessage(`Published ${selectedIds.size} job${selectedIds.size === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      onChange();
    } else {
      setBulkMessage(result.error ?? 'Bulk publish failed.');
    }
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} job${selectedIds.size === 1 ? '' : 's'}? This can't be undone.`)) return;
    setBulkBusy(true);
    setBulkMessage(null);
    const result = await bulkDeleteJobs(Array.from(selectedIds));
    setBulkBusy(false);
    if (result.ok) {
      setBulkMessage(`Deleted ${selectedIds.size} job${selectedIds.size === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      onChange();
    } else {
      setBulkMessage(result.error ?? 'Bulk delete failed.');
    }
  };

  const applyLogo = async () => {
    if (!logoUrl) return;
    setBulkBusy(true);
    setBulkMessage(null);
    const result = await bulkSetJobImage(Array.from(selectedIds), logoUrl);
    setBulkBusy(false);
    if (result.ok) {
      setBulkMessage(`Applied logo to ${selectedIds.size} job${selectedIds.size === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      setShowLogoTool(false);
      setLogoUrl('');
      onChange();
    } else {
      setBulkMessage(result.error ?? 'Could not apply logo.');
    }
  };

  return (
    <CollapsibleSection title="All sponsored jobs" count={jobs.length} open={open} onToggle={() => setOpen((v) => !v)}>
      <div className="flex flex-wrap gap-2 p-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search title or company…"
          className="h-9 min-w-[220px] flex-1 rounded-md border border-ink-200 px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'all' | ListingStatus); setPage(0); }}
          className="h-9 rounded-md border border-ink-200 px-2 text-sm text-ink-700 outline-none focus:border-brand-500"
        >
          <option value="all">All statuses</option>
          {LISTING_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {filtered.length !== jobs.length && (
        <p className="px-2 text-xs text-ink-400">{filtered.length} of {jobs.length} match this search/filter</p>
      )}

      {selectedIds.size > 0 && (
        <div className="m-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-xs font-semibold text-brand-800">{selectedIds.size} selected</span>
          <button onClick={bulkApprove} disabled={bulkBusy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Publish selected
          </button>
          <button onClick={bulkDelete} disabled={bulkBusy} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            Delete selected
          </button>
          <button onClick={() => setShowLogoTool((v) => !v)} className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            Apply logo to selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-ink-500 hover:text-ink-700">
            Clear selection
          </button>
        </div>
      )}

      {showLogoTool && (
        <div className="mx-2 mb-2 rounded-lg border border-ink-200 bg-white p-3">
          {profile?.id && <ImageUploadField userId={profile.id} value={logoUrl} onChange={setLogoUrl} label="Logo to apply to all selected jobs" />}
          <button onClick={applyLogo} disabled={bulkBusy || !logoUrl} className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Apply to {selectedIds.size} job{selectedIds.size === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {bulkMessage && <p className="mx-2 mb-2 text-xs font-medium text-emerald-700">{bulkMessage}</p>}

      {pageJobs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-ink-100 bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
            Select all on this page ({pageJobs.length})
          </label>
          {filtered.length > pageJobs.length && (
            <label className="flex items-center gap-2 text-brand-700">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
              Select all {filtered.length.toLocaleString()} {filtered.length === jobs.length ? 'jobs (all pages)' : 'matching this filter (all pages)'}
            </label>
          )}
        </div>
      )}
      <div className="divide-y divide-ink-100">
        {pageJobs.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">No jobs match this search/filter.</p>
        ) : (
          pageJobs.map((j) => (
            <EditableJobRow key={j.id} j={j} onChange={onChange} selected={selectedIds.has(j.id)} onToggleSelect={() => toggle(j.id)} />
          ))
        )}
      </div>

      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </CollapsibleSection>
  );
}

/**
 * Dashboard-filter style view of pending sponsored jobs: grouped into a
 * collapsible row per company — "Roche (1290)", "Philips (900)" — instead
 * of one long flat list. This is where ATS-imported batches (see
 * ImportFromAtsSection / ImportFromCareersUrlSection above) actually land
 * and become reviewable as real rows, not a one-off success message.
 * The search box filters by job title OR company name across every group
 * at once, auto-expanding any group with a match.
 */
function GroupedPendingJobsSection({ jobs, onChange }: { jobs: PendingSponsoredJob[]; onChange: () => void }) {
  const [search, setSearch] = useState('');
  const [openCompanies, setOpenCompanies] = useState<Set<string>>(new Set());
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [groupsPage, setGroupsPage] = useState(1);
  const GROUPS_PER_PAGE = 15;

  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  const filtered = useMemo(
    () =>
      !query
        ? jobs
        : jobs.filter(
            (j) => j.title.toLowerCase().includes(query) || (j.publisher?.name ?? '').toLowerCase().includes(query)
          ),
    [jobs, query]
  );

  const groups = useMemo(() => {
    const map = new Map<string, PendingSponsoredJob[]>();
    for (const j of filtered) {
      const key = j.publisher?.name ?? 'Unknown publisher';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    }
    // Biggest batches first (that's usually what you just imported and
    // came here to review) — ties broken alphabetically.
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [filtered]);

  // Back to page 1 whenever the search changes the set of groups —
  // otherwise a filter that narrows things down could leave the view
  // stranded on a now-nonexistent page.
  useEffect(() => {
    setGroupsPage(1);
  }, [query]);

  const totalGroupPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));
  const pagedGroups = groups.slice((groupsPage - 1) * GROUPS_PER_PAGE, groupsPage * GROUPS_PER_PAGE);

  const toggleCompany = (name: string) => {
    setOpenCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const approveAllInGroup = async (name: string, groupJobs: PendingSponsoredJob[]) => {
    if (!window.confirm(`Publish all ${groupJobs.length} pending ${name} job${groupJobs.length === 1 ? '' : 's'}?`)) return;
    setBusyGroup(name);
    setGroupMessage(null);
    const result = await bulkSetJobStatus(groupJobs.map((j) => j.id), 'published');
    setBusyGroup(null);
    if (result.ok) {
      setGroupMessage(`Published ${groupJobs.length} ${name} job${groupJobs.length === 1 ? '' : 's'}.`);
      onChange();
    } else {
      setGroupMessage(result.error ?? 'Bulk publish failed.');
    }
  };

  const deleteAllInGroup = async (name: string, groupJobs: PendingSponsoredJob[]) => {
    if (!window.confirm(`Delete all ${groupJobs.length} pending ${name} job${groupJobs.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    setBusyGroup(name);
    setGroupMessage(null);
    const result = await bulkDeleteJobs(groupJobs.map((j) => j.id));
    setBusyGroup(null);
    if (result.ok) {
      setGroupMessage(`Deleted ${groupJobs.length} ${name} job${groupJobs.length === 1 ? '' : 's'}.`);
      onChange();
    } else {
      setGroupMessage(result.error ?? 'Bulk delete failed.');
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
        Pending sponsored jobs <span className="text-ink-400">({jobs.length})</span>
      </h2>
      <div className="mt-3 border border-ink-200 bg-white">
        <div className="border-b border-ink-100 p-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job title or company…"
            className="h-9 w-full max-w-sm rounded-md border border-ink-200 px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
          />
        </div>

        {isSearching && (
          <p className="px-3 pt-2 text-[11px] text-ink-400">
            {filtered.length} of {jobs.length} match "{search.trim()}"
          </p>
        )}
        {groupMessage && <p className="px-3 pt-2 text-xs font-medium text-emerald-700">{groupMessage}</p>}

        {groups.length === 0 ? (
          <p className="p-4 text-xs text-ink-400">{jobs.length === 0 ? 'Nothing here.' : 'No matches.'}</p>
        ) : (
          <>
            {!isSearching && groups.length > GROUPS_PER_PAGE && (
              <p className="px-3 pt-2 text-[11px] text-ink-400">
                {groups.length} companies — showing {(groupsPage - 1) * GROUPS_PER_PAGE + 1}–
                {Math.min(groupsPage * GROUPS_PER_PAGE, groups.length)}
              </p>
            )}
            <div className="divide-y divide-ink-100">
              {pagedGroups.map(([company, companyJobs]) => (
                <CompanyPendingJobsGroup
                  key={company}
                  company={company}
                  publisherId={companyJobs[0]?.publisher?.id ?? null}
                  jobs={companyJobs}
                  open={isSearching || openCompanies.has(company)}
                  onToggle={() => toggleCompany(company)}
                  onApproveAll={() => approveAllInGroup(company, companyJobs)}
                  onDeleteAll={() => deleteAllInGroup(company, companyJobs)}
                  busy={busyGroup === company}
                  onChange={onChange}
                />
              ))}
            </div>
            {!isSearching && <Pager page={groupsPage} totalPages={totalGroupPages} onChange={setGroupsPage} />}
          </>
        )}
      </div>
    </section>
  );
}

/** One collapsible "{Company} (count)" row within GroupedPendingJobsSection, with its own pagination once expanded. */
function CompanyPendingJobsGroup({
  company,
  publisherId,
  jobs,
  open,
  onToggle,
  onApproveAll,
  onDeleteAll,
  busy,
  onChange,
}: {
  company: string;
  publisherId: string | null;
  jobs: PendingSponsoredJob[];
  open: boolean;
  onToggle: () => void;
  onApproveAll: () => void;
  onDeleteAll: () => void;
  busy: boolean;
  onChange: () => void;
}) {
  const [page, setPage] = useState(0);
  const [showLogoTool, setShowLogoTool] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const { profile } = useAuth();
  const totalPages = Math.max(1, Math.ceil(jobs.length / ADMIN_PAGE_SIZE));
  const pageJobs = jobs.slice(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE);

  const applyCompanyLogo = async () => {
    if (!publisherId || !logoUrl) return;
    setLogoBusy(true);
    setLogoMessage(null);
    const result = await setPublisherLogoForAllJobs(publisherId, logoUrl);
    setLogoBusy(false);
    if (result.ok) {
      setLogoMessage(`Applied to every ${company} job.`);
      setShowLogoTool(false);
      setLogoUrl('');
      onChange();
    } else {
      setLogoMessage(result.error ?? 'Could not apply logo.');
    }
  };

  return (
    <div>
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 hover:bg-ink-50">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
          <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
          <span className="truncate text-sm font-bold text-ink-900">{company}</span>
          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{jobs.length}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {publisherId && (
            <button
              onClick={() => setShowLogoTool((v) => !v)}
              disabled={busy}
              className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
            >
              Set company logo
            </button>
          )}
          <button onClick={onApproveAll} disabled={busy} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            Publish all
          </button>
          <button onClick={onDeleteAll} disabled={busy} className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            Delete all
          </button>
        </div>
      </div>

      {showLogoTool && publisherId && (
        <div className="mx-3 mb-2 rounded-lg border border-ink-200 bg-white p-3">
          <p className="text-[11px] text-ink-500">
            Applied to every {company} job (pending, published, and any future ones) at once — not just what's shown here.
          </p>
          {profile?.id && <ImageUploadField userId={profile.id} value={logoUrl} onChange={setLogoUrl} label="Company logo" />}
          <button
            onClick={applyCompanyLogo}
            disabled={logoBusy || !logoUrl}
            className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {logoBusy ? 'Applying…' : `Apply to all ${company} jobs`}
          </button>
          {logoMessage && <p className="mt-1.5 text-xs font-medium text-ink-600">{logoMessage}</p>}
        </div>
      )}

      {open && (
        <div className="border-t border-ink-100 bg-ink-50/40">
          <div className="divide-y divide-ink-100">
            {pageJobs.map((j) => (
              <Row key={j.id}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-ink-500">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{j.title}</p>
                  <p className="text-xs text-ink-500">
                    {j.employment_type}
                    {j.country ? ` · ${j.country.name}` : ''}
                  </p>
                  <p className="text-[11px] text-ink-400">Submitted {formatDate(j.created_at)}</p>
                </div>
                <button
                  onClick={() => window.open(`/admin/jobs/${j.id}`, '_blank', 'noopener')}
                  className="shrink-0 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
                >
                  Preview &amp; edit
                </button>
                <Actions
                  onApprove={async () => {
                    const r = await setSponsoredJobStatus(j.id, 'published');
                    if (r.ok) onChange();
                    else window.alert(r.error ?? 'Failed.');
                  }}
                  onReject={async () => {
                    const r = await setSponsoredJobStatus(j.id, 'rejected');
                    if (r.ok) onChange();
                    else window.alert(r.error ?? 'Failed.');
                  }}
                />
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete "${j.title}"? This can't be undone.`)) return;
                    const result = await deleteSponsoredJob(j.id);
                    if (result.ok) onChange();
                    else window.alert(result.error ?? 'Delete failed.');
                  }}
                  aria-label="Delete"
                  className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Row>
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

function ManagedProgramsSection({ programs, onChange }: { programs: AdminProgram[]; onChange: () => void }) {
  const [open, setOpen] = useState(programs.length <= ADMIN_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ListingStatus>('all');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const filtered = programs.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.publisher?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const pagePrograms = filtered.slice(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE);
  const allOnPageSelected = pagePrograms.length > 0 && pagePrograms.every((p) => selectedIds.has(p.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pagePrograms.forEach((p) => next.delete(p.id));
      else pagePrograms.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const bulkApprove = async () => {
    setBulkBusy(true);
    setBulkMessage(null);
    const result = await bulkSetProgramStatus(Array.from(selectedIds), 'published');
    setBulkBusy(false);
    if (result.ok) {
      setBulkMessage(`Published ${selectedIds.size} program${selectedIds.size === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      onChange();
    } else {
      setBulkMessage(result.error ?? 'Bulk publish failed.');
    }
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} program${selectedIds.size === 1 ? '' : 's'}? This can't be undone.`)) return;
    setBulkBusy(true);
    setBulkMessage(null);
    const result = await bulkDeletePrograms(Array.from(selectedIds));
    setBulkBusy(false);
    if (result.ok) {
      setBulkMessage(`Deleted ${selectedIds.size} program${selectedIds.size === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      onChange();
    } else {
      setBulkMessage(result.error ?? 'Bulk delete failed.');
    }
  };

  return (
    <CollapsibleSection title="All sponsored programs" count={programs.length} open={open} onToggle={() => setOpen((v) => !v)}>
      <div className="flex flex-wrap gap-2 p-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search title or publisher…"
          className="h-9 min-w-[220px] flex-1 rounded-md border border-ink-200 px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'all' | ListingStatus); setPage(0); }}
          className="h-9 rounded-md border border-ink-200 px-2 text-sm text-ink-700 outline-none focus:border-brand-500"
        >
          <option value="all">All statuses</option>
          {LISTING_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {filtered.length !== programs.length && (
        <p className="px-2 text-xs text-ink-400">{filtered.length} of {programs.length} match this search/filter</p>
      )}

      {selectedIds.size > 0 && (
        <div className="m-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-xs font-semibold text-brand-800">{selectedIds.size} selected</span>
          <button onClick={bulkApprove} disabled={bulkBusy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Publish selected
          </button>
          <button onClick={bulkDelete} disabled={bulkBusy} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            Delete selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-ink-500 hover:text-ink-700">
            Clear selection
          </button>
        </div>
      )}

      {bulkMessage && <p className="mx-2 mb-2 text-xs font-medium text-emerald-700">{bulkMessage}</p>}

      {pagePrograms.length > 0 && (
        <label className="flex items-center gap-2 border-y border-ink-100 bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
          Select all on this page ({pagePrograms.length})
        </label>
      )}
      <div className="divide-y divide-ink-100">
        {pagePrograms.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">No programs match this search/filter.</p>
        ) : (
          pagePrograms.map((p) => (
            <EditableProgramRow key={p.id} p={p} onChange={onChange} selected={selectedIds.has(p.id)} onToggleSelect={() => toggle(p.id)} />
          ))
        )}
      </div>

      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </CollapsibleSection>
  );
}

const ADMIN_PAGE_SIZE = 10;

/**
 * Generic collapsible + searchable + paginated list wrapper, used for
 * every simple admin review section (pending/verified publishers,
 * agencies, pending programs/jobs). Sections with bulk actions
 * (all programs/jobs) use their own Managed*Section instead, wrapped
 * in the same CollapsibleSection shell for a consistent look.
 */
function PaginatedSection<T>({
  title,
  items,
  searchText,
  renderRow,
  defaultOpen,
  emptyLabel = 'Nothing here.',
}: {
  title: string;
  items: T[];
  searchText: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
  defaultOpen?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? items.length <= ADMIN_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = items.filter((item) => !search.trim() || searchText(item).toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const pageItems = filtered.slice(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE);

  return (
    <CollapsibleSection title={title} count={items.length} open={open} onToggle={() => setOpen((v) => !v)}>
      {items.length > ADMIN_PAGE_SIZE && (
        <div className="border-b border-ink-100 p-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search…"
            className="h-9 w-full max-w-xs rounded-md border border-ink-200 px-3 text-sm text-ink-900 outline-none focus:border-brand-500"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="p-4 text-xs text-ink-400">{items.length === 0 ? emptyLabel : 'No matches.'}</p>
      ) : (
        <div className="divide-y divide-ink-100">{pageItems.map(renderRow)}</div>
      )}

      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </CollapsibleSection>
  );
}

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
          {title} <span className="text-ink-400">({count})</span>
        </h2>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <div className="mt-3 border border-ink-200 bg-white">{children}</div>}
    </section>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;

  // Keep the page-number list short even with many pages: current ±2,
  // plus first/last, with ellipses for the gaps.
  const pages = new Set<number>([0, totalPages - 1, page, page - 1, page + 1, page - 2, page + 2]);
  const sorted = Array.from(pages).filter((p) => p >= 0 && p < totalPages).sort((a, b) => a - b);

  return (
    <div className="flex items-center justify-center gap-1 border-t border-ink-100 p-3">
      <button
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        aria-label="Previous page"
        className="rounded-full p-1.5 text-ink-500 hover:bg-ink-50 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {sorted.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - sorted[i - 1] > 1 && <span className="px-1 text-xs text-ink-300">…</span>}
          <button
            onClick={() => onChange(p)}
            className={`h-7 min-w-[28px] rounded-md px-1.5 text-xs font-semibold ${p === page ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
          >
            {p + 1}
          </button>
        </span>
      ))}

      <button
        onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        aria-label="Next page"
        className="rounded-full p-1.5 text-ink-500 hover:bg-ink-50 disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 p-4">{children}</div>;
}

function Actions({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={onApprove}
        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        <Check className="h-3.5 w-3.5" />
        Approve
      </button>
      <button
        onClick={onReject}
        className="flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </button>
    </div>
  );
}

// ===========================================================================
// Requests inbox — jobs & programs real users/companies submitted
// ===========================================================================

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function RequestsInboxSection({
  requests,
  seenAt,
  onMarkSeen,
  onChange,
}: {
  requests: { jobs: DirectRequest[]; programs: DirectRequest[] };
  seenAt: string;
  onMarkSeen: () => void;
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'job' | 'program'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = useMemo(
    () =>
      [...requests.jobs, ...requests.programs]
        .filter((r) => filter === 'all' || r.kind === filter)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [requests, filter]
  );
  const newCount = [...requests.jobs, ...requests.programs].filter((r) => r.created_at > seenAt).length;

  const act = async (r: DirectRequest, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(r.id);
    const res = await fn();
    setBusyId(null);
    if (!res.ok) window.alert(res.error ?? 'Failed.');
    else onChange();
  };
  const setStatus = (r: DirectRequest, status: ListingStatus) => (r.kind === 'job' ? setSponsoredJobStatus(r.id, status) : setProgramStatus(r.id, status));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Listing requests from companies</h2>
        {newCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{newCount} new</span>}
        <div className="ml-auto flex items-center gap-1">
          {(['all', 'job', 'program'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${filter === f ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
            >
              {f === 'all' ? `All (${requests.jobs.length + requests.programs.length})` : f === 'job' ? `Jobs (${requests.jobs.length})` : `Programs (${requests.programs.length})`}
            </button>
          ))}
          <button onClick={onMarkSeen} className="ml-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">
            Mark all as read
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-400">
        Submitted on MadeVisa by real accounts (company owners and managers). Once published they show as “Directly on MadeVisa by …” and get their own section on the Jobs / Programs pages.
      </p>

      <div className="mt-3 divide-y divide-ink-100 border border-ink-200 bg-white">
        {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">No open requests. 🎉</p>}
        {items.map((r) => (
          <div key={`${r.kind}-${r.id}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${r.created_at > seenAt ? 'bg-rose-50/40' : ''}`}>
            {r.publisher?.logo_url ? (
              <img src={r.publisher.logo_url} alt="" className="h-9 w-9 shrink-0 rounded border border-ink-100 object-contain p-0.5" />
            ) : (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded border border-ink-100 bg-ink-50">
                {r.kind === 'job' ? <Briefcase className="h-4 w-4 text-ink-400" /> : <Landmark className="h-4 w-4 text-ink-400" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${r.kind === 'job' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>{r.kind}</span>
                <p className="truncate text-sm font-semibold text-ink-900">{r.title}</p>
                {r.created_at > seenAt && <NewPill />}
              </div>
              <p className="text-xs text-ink-500">
                {r.publisher?.name ?? 'Unknown company'} · {r.category}
                {r.country ? ` · ${r.country.name}` : ''}
              </p>
              <p className="text-[11px] text-ink-400">
                by {r.submitter?.email ?? r.publisher?.contact_email ?? 'unknown'} · {timeAgo(r.created_at)}
                {r.updated_at && r.updated_at > r.created_at ? ` · edited ${timeAgo(r.updated_at)}` : ''}
              </p>
            </div>
            <StatusPill status={r.status} />
            {r.kind === 'job' && (
              <button onClick={() => window.open(`/admin/jobs/${r.id}`, '_blank')} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">
                Review
              </button>
            )}
            <button
              disabled={busyId === r.id}
              onClick={() => act(r, () => setStatus(r, 'needs_information'))}
              className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-amber-50 disabled:opacity-50"
            >
              Needs info
            </button>
            <Actions onApprove={() => act(r, () => setStatus(r, 'published'))} onReject={() => act(r, () => setStatus(r, 'rejected'))} />
            <button
              onClick={() => {
                if (!window.confirm(`Delete "${r.title}"? This can't be undone.`)) return;
                act(r, () => (r.kind === 'job' ? deleteSponsoredJob(r.id) : deleteProgram(r.id)));
              }}
              aria-label="Delete"
              className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function DesktopNotificationsSection() {
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState<string>(supported ? Notification.permission : 'unsupported');
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Request notifications</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4 text-xs text-ink-600">
        While the admin panel is open it checks for new company requests every minute — the Requests tab badge and the
        browser tab title show the count. Turn on desktop notifications to get a pop-up too.
        <div className="mt-3">
          {perm === 'granted' ? (
            <span className="font-semibold text-emerald-700">Desktop notifications are on.</span>
          ) : perm === 'denied' ? (
            <span className="text-ink-500">Blocked in this browser — allow notifications for this site in browser settings.</span>
          ) : perm === 'unsupported' ? (
            <span className="text-ink-500">This browser doesn't support desktop notifications.</span>
          ) : (
            <button onClick={async () => setPerm(await Notification.requestPermission())} className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">
              Enable desktop notifications
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Company access — give an email (e.g. hr@netflix.com) rights over a company
// ===========================================================================

function CompanyAccessSection({ publishers, members, onChange }: { publishers: PendingPublisher[]; members: PublisherMember[]; onChange: () => void }) {
  const [publisherId, setPublisherId] = useState('');
  const [publisherSearch, setPublisherSearch] = useState('');
  const [email, setEmail] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const matchingPublishers = publishers.filter((p) => !publisherSearch.trim() || p.name.toLowerCase().includes(publisherSearch.trim().toLowerCase())).slice(0, 50);
  const selected = publishers.find((p) => p.id === publisherId);
  const shownMembers = members.filter((m) => {
    const q = filter.trim().toLowerCase();
    return !q || m.email.includes(q) || (m.publisher?.name ?? '').toLowerCase().includes(q);
  });

  const inviteText = (m: { email: string; companyName: string }) =>
    `Hi,\n\nYou now have access to manage ${m.companyName} on MadeVisa — your vacancies, programs and company page.\n\n` +
    `Sign in (or create an account) with ${m.email} at ${window.location.origin}/company\n\n— The MadeVisa team`;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Company managers</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4">
        <p className="text-xs text-ink-500">
          Give someone at a company (e.g. <code>hr@netflix.com</code>) access to manage that company on MadeVisa. They sign in
          or sign up with that exact email (it must be confirmed) and get a <strong>Manage company</strong> page at{' '}
          <code>/company</code>: vacancies, programs, logo/about text, and team. Enforced by the database, not just the UI.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <input
              value={selected && !publisherSearch ? selected.name : publisherSearch}
              onChange={(e) => {
                setPublisherSearch(e.target.value);
                setPublisherId('');
              }}
              placeholder="Search company…"
              className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm outline-none focus:border-brand-500"
            />
            {publisherSearch && !publisherId && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-ink-200 bg-white shadow-sm">
                {matchingPublishers.length === 0 && <p className="px-3 py-2 text-xs text-ink-400">No verified company with that name.</p>}
                {matchingPublishers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPublisherId(p.id);
                      setPublisherSearch('');
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-ink-50"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@company.com"
            className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-600">
            <input type="checkbox" checked={canPublish} onChange={(e) => setCanPublish(e.target.checked)} />
            Can publish without review (trusted)
          </label>
          <button
            disabled={!publisherId || !email.trim()}
            onClick={async () => {
              const r = await addPublisherMember(publisherId, email, canPublish);
              if (!r.ok) return setMsg(r.error ?? 'Failed.');
              setMsg(`${email.trim().toLowerCase()} can now manage ${selected?.name}. Copy the invite from the list below.`);
              setEmail('');
              setCanPublish(false);
              onChange();
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Give access
          </button>
          {msg && <span className="text-xs text-ink-500">{msg}</span>}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Who has access ({members.length})</p>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="ml-auto h-7 w-40 rounded-md border border-ink-200 px-2 text-xs outline-none focus:border-brand-500" />
        </div>
        <div className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-100">
          {shownMembers.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-400">Nobody yet.</p>}
          {shownMembers.map((m) => {
            const companyName = m.publisher?.name ?? 'this company';
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                <span className="w-40 truncate font-semibold text-ink-900">{companyName}</span>
                <span className="min-w-0 flex-1 truncate text-ink-700">{m.email}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.hasAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                  {m.hasAccount ? 'Has account' : 'Not signed up yet'}
                </span>
                <label className="flex items-center gap-1 text-ink-600" title="Publishes without MadeVisa review">
                  <input
                    type="checkbox"
                    checked={m.can_publish}
                    onChange={async (e) => {
                      const r = await updatePublisherMember(m.id, { can_publish: e.target.checked });
                      if (r.ok) onChange();
                      else window.alert(r.error);
                    }}
                  />
                  Trusted
                </label>
                <button
                  onClick={() => navigator.clipboard?.writeText(inviteText({ email: m.email, companyName }))}
                  className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                  title="Copy invite message"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(`Manage ${companyName} on MadeVisa`)}&body=${encodeURIComponent(inviteText({ email: m.email, companyName }))}`}
                  className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                  title="Email invite"
                >
                  <Mail className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Remove ${m.email}'s access to ${companyName}?`)) return;
                    const r = await removePublisherMember(m.id);
                    if (r.ok) onChange();
                    else window.alert(r.error);
                  }}
                  className="rounded p-1 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                  title="Remove access"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Check jobs — details from descriptions AND locations, in one run
// ===========================================================================

type CheckScope = 'recent24' | 'recent168' | 'missing' | 'all';
const CHECK_SCOPES: { value: CheckScope; label: string; hint: string }[] = [
  { value: 'recent24', label: 'Added in 24 h', hint: 'Jobs that went live or were added in the last 24 hours.' },
  { value: 'recent168', label: 'Last 7 days', hint: 'Jobs from the last week.' },
  { value: 'missing', label: 'Not checked yet', hint: 'Details for every job the detector hasn’t read yet; locations for the last 7 days.' },
  { value: 'all', label: 'All jobs', hint: 'Every job — slow on a large catalogue.' },
];

function JobCheckSection({ onChange }: { onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<{ name: 'junk' | 'details' | 'locations'; done: number; total: number } | null>(null);
  const [result, setResult] = useState<JobCheckResult | null>(null);
  const [stopped, setStopped] = useState(false);
  const [refetchThin, setRefetchThin] = useState(false);
  const [scope, setScope] = useState<CheckScope>('recent24');
  const stop = useRef(false);
  const current = CHECK_SCOPES.find((x) => x.value === scope)!;

  const run = async () => {
    stop.current = false;
    setBusy(true);
    setStopped(false);
    setResult(null);
    const r = await runJobCheck(
      scope === 'recent24' ? { recentHours: 24, refetchThin } : scope === 'recent168' ? { recentHours: 168, refetchThin } : scope === 'missing' ? { onlyMissing: true, recentHours: 168, refetchThin } : { refetchThin },
      (name, done, total) => setStep({ name, done, total }),
      () => stop.current,
    );
    setBusy(false);
    setStep(null);
    setStopped(stop.current);
    setResult(r);
    onChange();
  };

  const c = result?.details.counts ?? {};
  const moved = result
    ? Object.entries(result.locations.byCountry)
        .sort((a, b) => b[1] - a[1])
        .map(([iso, n]) => `${n} → ${iso}`)
        .join(', ')
    : '';
  const detailParts = result
    ? ([
        ['salary', c.compensation],
        ['experience', c.experience],
        ['employment type', c.employment],
        ['work type', c.workType],
        ['visa', c.visa],
        ['posted date', c.posted],
        ['department', c.department],
        ['location text', c.location],
        ['pages re-read', c.refetched],
      ] as [string, number | undefined][]).filter(([, n]) => n)
    : [];

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-950">
            <ScanSearch className="h-4 w-4 text-brand-600" /> Check jobs — details &amp; locations
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-ink-500">
            Reads each description for salary, experience, work type, visa and posting date, and fixes countries read from state codes — “North Chicago, IL” as Israel,
            “Phoenix, AZ” as Azerbaijan, “San Jose, CA” as Canada — using the city, the posting’s own location line and where the company’s other jobs are. Syncs and the
            daily pipeline run this on every new job automatically; use it here for older jobs.
          </p>
        </div>
        {busy ? (
          <button onClick={() => (stop.current = true)} className="shrink-0 rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            Stop
          </button>
        ) : (
          <button onClick={() => void run()} className="shrink-0 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Check {current.label.toLowerCase()}
          </button>
        )}
      </div>
      <div className="space-y-3 px-4 py-4 text-xs text-ink-600 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-lg bg-ink-100 p-0.5">
            {CHECK_SCOPES.map((o) => (
              <button
                key={o.value}
                disabled={busy}
                onClick={() => setScope(o.value)}
                aria-pressed={scope === o.value}
                className={`rounded-md px-3 py-1.5 font-semibold transition-colors disabled:opacity-60 ${scope === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-ink-400">{current.hint}</span>
        </div>
        <label className="flex items-center gap-2 text-ink-600">
          <input type="checkbox" checked={refetchThin} disabled={busy} onChange={(e) => setRefetchThin(e.target.checked)} />
          Also re-read the job page when the saved description is short (slower)
        </label>

        {busy && step && (
          <ol className="grid gap-2 sm:grid-cols-3">
            {(['junk', 'details', 'locations'] as const).map((k, i) => {
              const order = ['junk', 'details', 'locations'].indexOf(step.name);
              const state = i < order ? 'done' : i === order ? 'running' : 'waiting';
              const label = k === 'junk' ? 'Remove bot-check pages' : k === 'details' ? 'Read descriptions' : 'Fix locations';
              return (
                <li key={k} className={`rounded-lg border p-2.5 ${state === 'running' ? 'border-brand-300 bg-brand-50/50' : state === 'done' ? 'border-emerald-200 bg-emerald-50/40' : 'border-ink-100'}`}>
                  <p className="flex items-center gap-1.5 font-semibold text-ink-800">
                    {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : state === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-ink-300" />}
                    {label}
                  </p>
                  {state === 'running' && step.total > 0 && (
                    <div className="mt-2">
                      <ProgressBar value={step.done / step.total} label={`${step.done.toLocaleString()} of ${step.total.toLocaleString()}`} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {result && (
          <div className={`rounded-lg px-3 py-2.5 ${result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">
              {stopped ? 'Stopped. ' : result.ok ? 'Done. ' : `Finished with a problem: ${result.error}. `}
              {result.details.scanned.toLocaleString()} jobs read, {result.details.updated.toLocaleString()} got new details · {result.locations.scanned.toLocaleString()} locations checked,{' '}
              {result.locations.fixed.toLocaleString()} corrected{moved ? ` (${moved})` : ''}
              {result.junkRemoved ? ` · ${result.junkRemoved} bot-check pages removed` : ''}.
            </p>
            {detailParts.length > 0 && <p className="mt-0.5">Filled: {detailParts.map(([k, n]) => `${k} ${n}`).join(' · ')}</p>}
            {result.details.migrationMissing && <p className="mt-0.5">Run the 20260925090000 migration to also store work type &amp; “visa not offered”.</p>}
            {result.details.scanned === 0 && scope.startsWith('recent') && <p className="mt-0.5">No jobs went live in that window.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function AddJobsTools({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-8">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink-500 hover:text-ink-800">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        One-off import tools
        <span className="text-[11px] font-normal normal-case tracking-normal text-ink-400">— careers URL, Greenhouse token, Greenhouse catalog (everything imported is saved as a source above)</span>
      </button>
      {open && <div className="-mt-4">{children}</div>}
    </section>
  );
}

/** Shown until this admin turns on two-step login (Profile → Settings). */
function AdminMfaReminder({ onOpen }: { onOpen: () => void }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    listTotpFactors().then(({ verified }) => setMissing(verified.length === 0));
  }, []);
  if (!missing) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1 text-sm text-amber-900">
        <strong>Protect admin access.</strong> Turn on two-step login so a leaked password alone can't open this panel.
      </p>
      <button onClick={onOpen} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
        Set it up (Profile → Settings)
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading status

type LoadPart = { label: string; state: 'loading' | 'done' | 'failed'; ms?: number; error?: string };

const LOAD_TIMEOUT_MS = 45_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`No response after ${Math.round(ms / 1000)} seconds`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Shows what is loading, what finished and what failed — instead of a bare "Loading…". */
function AdminLoadingPanel({ parts, startedAt, onRetry }: { parts: Record<string, LoadPart>; startedAt: number; onRetry: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const list = Object.values(parts);
  const done = list.filter((p) => p.state !== 'loading').length;
  const total = list.length || 1;
  const seconds = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const slow = seconds >= 15;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold text-ink-950">
          Loading admin data · {done} of {list.length} ready
        </p>
        <p className="text-[13px] tabular-nums text-ink-500">{seconds}s</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1D4ED8]/10">
        <div className="h-full rounded-full bg-[#1D4ED8] transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[13px]">
            {p.state === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#1D4ED8]" />
            ) : p.state === 'done' ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
            )}
            <span className={p.state === 'loading' ? 'text-ink-800' : p.state === 'failed' ? 'text-rose-700' : 'text-ink-500'}>{p.label}</span>
            {p.ms != null && <span className="ml-auto tabular-nums text-ink-400">{(p.ms / 1000).toFixed(1)}s</span>}
          </li>
        ))}
      </ul>
      {slow && (
        <div className="mt-5 flex flex-col gap-3 rounded-lg bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1">
            This is taking longer than usual. The panel opens automatically when every part has loaded or given up (after {LOAD_TIMEOUT_MS / 1000} seconds). If it keeps happening,
            check the Supabase dashboard for slow queries.
          </p>
          <button onClick={onRetry} className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">
            Start again
          </button>
        </div>
      )}
    </div>
  );
}

/** After loading: which parts failed, with a one-click retry for just those. */
function FailedPartsBanner({ parts, onRetry }: { parts: Record<string, LoadPart>; onRetry: (keys: string[]) => void }) {
  const failed = Object.entries(parts).filter(([, p]) => p.state === 'failed');
  const retrying = Object.values(parts).some((p) => p.state === 'loading');
  if (failed.length === 0 && !retrying) return null;
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1">
        {retrying ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Retrying…
          </span>
        ) : (
          <>
            <strong>Some data didn't load:</strong> {failed.map(([, p]) => p.label).join(', ')}. Everything else below is up to date.
            <span className="mt-0.5 block text-rose-700/80">{failed[0][1].error}</span>
          </>
        )}
      </p>
      {!retrying && (
        <button onClick={() => onRetry(failed.map(([k]) => k))} className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-900 ring-1 ring-rose-300 hover:bg-rose-100">
          Retry these
        </button>
      )}
    </div>
  );
}
