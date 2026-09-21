import { useEffect, useRef, useState } from 'react';
import { Briefcase, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Landmark, Pencil, ShieldAlert, ShieldPlus, Trash2, UserRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSeo } from '@/lib/seo';
import {
  fetchAdmins,
  fetchAllPrograms,
  fetchAllSponsoredJobs,
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
} from '@/lib/admin';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { fetchCountries, type CountryOption } from '@/lib/programs';
import { fetchGreenhouseJobs, sanitizeJobHtml } from '@/lib/atsImport';
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
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const isAdmin = profile?.role === 'admin';

  const loadAll = () => {
    // Only blank the whole panel on the very first load — every
    // subsequent refresh (after approving/rejecting/deleting/etc.)
    // updates the data in place instead, so the page doesn't look
    // like it's reloading on every click.
    if (!hasLoadedOnce.current) setDataLoading(true);

    Promise.all([
      fetchPendingPublishers(),
      fetchVerifiedPublishers(),
      fetchPendingPrograms(),
      fetchPendingSponsoredJobs(),
      fetchPendingAgencies(),
      fetchVerifiedAgencies(),
      fetchAdmins(),
      fetchAllPrograms(),
      fetchAllSponsoredJobs(),
      fetchCountries(),
    ]).then(([pp, vp, prog, jobs, pa, va, adm, allProg, allJ, ctys]) => {
      setPendingPublishers(pp);
      setVerifiedPublishers(vp);
      setPendingPrograms(prog);
      setPendingJobs(jobs);
      setPendingAgencies(pa);
      setVerifiedAgencies(va);
      setAdmins(adm);
      setAllPrograms(allProg);
      setAllJobs(allJ);
      setCountries(ctys);
      setDataLoading(false);
      hasLoadedOnce.current = true;
    });
  };

  useEffect(() => {
    if (isAdmin) loadAll();
    else setDataLoading(false);
  }, [isAdmin]);

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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink-950">Admin panel</h1>
        <p className="mt-1 text-sm text-ink-500">Approve or reject publisher accounts, listings, and agencies.</p>

        {dataLoading ? (
          <p className="mt-8 text-sm text-ink-400">Loading…</p>
        ) : (
          <>
            <AdminAccessSection admins={admins} currentEmail={profile?.email ?? ''} onChange={loadAll} />

            <ImportFromAtsSection countries={countries} onImported={loadAll} />

            <PaginatedSection
              title="Pending publisher accounts"
              items={pendingPublishers}
              searchText={(p) => `${p.name} ${p.contact_email}`}
              renderRow={(p) => (
                <PublisherRow key={p.id} p={p} onChange={loadAll}>
                  <Actions
                    onApprove={async () => { if (await setPublisherStatus(p.id, 'verified')) loadAll(); }}
                    onReject={async () => { if (await setPublisherStatus(p.id, 'rejected')) loadAll(); }}
                  />
                </PublisherRow>
              )}
            />

            <PaginatedSection
              title="Verified publisher accounts"
              items={verifiedPublishers}
              searchText={(p) => `${p.name} ${p.contact_email}`}
              renderRow={(p) => (
                <PublisherRow key={p.id} p={p} onChange={loadAll}>
                  <button
                    onClick={async () => { if (await setPublisherStatus(p.id, 'suspended')) loadAll(); }}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Suspend
                  </button>
                </PublisherRow>
              )}
            />

            <PaginatedSection
              title="Pending sponsored programs"
              items={pendingPrograms}
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
                    onApprove={async () => { if (await setProgramStatus(p.id, 'published')) loadAll(); }}
                    onReject={async () => { if (await setProgramStatus(p.id, 'rejected')) loadAll(); }}
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

            <PaginatedSection
              title="Pending sponsored jobs"
              items={pendingJobs}
              searchText={(j) => `${j.title} ${j.publisher?.name ?? ''}`}
              renderRow={(j) => (
                <Row key={j.id}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
                    <Briefcase className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{j.title}</p>
                    <p className="text-xs text-ink-500">
                      {j.employment_type} · {j.publisher?.name ?? 'Unknown publisher'}{j.country ? ` · ${j.country.name}` : ''}
                    </p>
                    <p className="text-[11px] text-ink-400">Submitted {formatDate(j.created_at)}</p>
                  </div>
                  <Actions
                    onApprove={async () => { if (await setSponsoredJobStatus(j.id, 'published')) loadAll(); }}
                    onReject={async () => { if (await setSponsoredJobStatus(j.id, 'rejected')) loadAll(); }}
                  />
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Delete "${j.title}"? This can't be undone.`)) return;
                      const result = await deleteSponsoredJob(j.id);
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

            <ManagedProgramsSection programs={allPrograms} onChange={loadAll} />

            <ManagedJobsSection jobs={allJobs} onChange={loadAll} />

            <PaginatedSection
              title="Pending travel agencies"
              items={pendingAgencies}
              searchText={(a) => a.name}
              renderRow={(a) => (
                <AgencyRow key={a.id} a={a} onChange={loadAll}>
                  <Actions
                    onApprove={async () => { if (await setAgencyStatus(a.id, 'verified')) loadAll(); }}
                    onReject={async () => { if (await setAgencyStatus(a.id, 'rejected')) loadAll(); }}
                  />
                </AgencyRow>
              )}
            />

            <PaginatedSection
              title="Verified travel agencies"
              items={verifiedAgencies}
              searchText={(a) => a.name}
              renderRow={(a) => (
                <AgencyRow key={a.id} a={a} onChange={loadAll}>
                  <button
                    onClick={async () => { if (await setAgencyStatus(a.id, 'pending')) loadAll(); }}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Revoke
                  </button>
                </AgencyRow>
              )}
            />
          </>
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function PublisherRow({ p, onChange, children }: { p: PendingPublisher; onChange: () => void; children: React.ReactNode }) {
  const Icon = orgIcon[p.org_type];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [email, setEmail] = useState(p.contact_email);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const nameOk = name === p.name || (await updatePublisherName(p.id, name));
    const emailOk = email === p.contact_email || (await updatePublisherContactEmail(p.id, email));
    setSaving(false);
    if (nameOk && emailOk) { setEditing(false); onChange(); }
  };

  return (
    <Row>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
        <Icon className="h-4 w-4" />
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
            </p>
          </>
        )}
      </div>
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
    const ok = await updateAgencyName(a.id, name);
    setSaving(false);
    if (ok) { setEditing(false); onChange(); }
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

type PreviewJob = { externalId: string; title: string; locationText: string; offices: string[]; description: string; url: string; selected: boolean };

function ImportFromAtsSection({ countries, onImported }: { countries: CountryOption[]; onImported: () => void }) {
  const [boardToken, setBoardToken] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewJob[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchJobs = async () => {
    setFetching(true);
    setFetchError(null);
    setPreview(null);
    setResult(null);
    const res = await fetchGreenhouseJobs(boardToken);
    setFetching(false);
    if (!res.ok) {
      setFetchError(res.error ?? 'Could not fetch that board.');
      return;
    }
    setPreview(
      res.jobs.map((j) => ({
        externalId: j.externalId,
        title: j.title,
        locationText: j.locationText,
        offices: j.offices,
        description: sanitizeJobHtml(j.descriptionHtml),
        url: j.url,
        selected: true,
      }))
    );
    if (!companyName) setCompanyName(boardToken);
  };

  const toggle = (id: string) => {
    setPreview((rows) => rows?.map((r) => (r.externalId === id ? { ...r, selected: !r.selected } : r)) ?? null);
  };

  const runImport = async () => {
    if (!preview || !countryId || !companyName.trim()) return;
    setImporting(true);
    setResult(null);

    const publisherResult = await findOrCreateImportedPublisher(companyName);
    if (!publisherResult.ok || !publisherResult.id) {
      setImporting(false);
      setResult(publisherResult.error ?? 'Could not set up the publisher.');
      return;
    }

    const selected = preview.filter((j) => j.selected);
    const importResult = await importJobsAsPending(
      publisherResult.id,
      countryId,
      selected.map((j) => ({ title: j.title, description: j.description, officialUrl: j.url, additionalLocations: j.offices }))
    );

    setImporting(false);
    if (importResult.ok) {
      setResult(`Imported ${importResult.imported} job${importResult.imported === 1 ? '' : 's'} as pending — review them below.`);
      setPreview(null);
      setBoardToken('');
      onImported();
    } else {
      setResult(importResult.error ?? 'Import failed.');
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Import jobs from an ATS</h2>
      <div className="mt-3 border border-ink-200 bg-white p-4">
        <p className="text-xs text-ink-500">
          Pulls live listings from a company's public Greenhouse job board — a documented, no-auth endpoint meant
          for exactly this kind of syndication. Imported jobs land as <strong>pending</strong>, same review flow as
          everything else.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-500">Destination country for this batch</label>
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500">
              <option value="">Select</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={fetchJobs}
          disabled={fetching || !boardToken.trim()}
          className="mt-3 rounded-lg bg-ink-900 px-4 py-2 text-xs font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {fetching ? 'Fetching…' : 'Fetch jobs'}
        </button>

        {fetchError && <p className="mt-2 text-xs font-medium text-rose-600">{fetchError}</p>}

        {preview && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-ink-700">
              {preview.length} job{preview.length === 1 ? '' : 's'} found — {preview.filter((j) => j.selected).length} selected
            </p>
            <div className="mt-2 max-h-80 divide-y divide-ink-100 overflow-auto rounded-md border border-ink-200">
              {preview.map((j) => (
                <label key={j.externalId} className="flex items-start gap-2 p-2.5 text-xs hover:bg-ink-50">
                  <input type="checkbox" checked={j.selected} onChange={() => toggle(j.externalId)} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{j.title}</p>
                    <p className="text-ink-400">{j.locationText}</p>
                  </div>
                </label>
              ))}
            </div>

            <button
              onClick={runImport}
              disabled={importing || !countryId || !companyName.trim() || preview.every((j) => !j.selected)}
              className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Import ${preview.filter((j) => j.selected).length} selected as pending`}
            </button>
          </div>
        )}

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
        <label className="flex items-center gap-2 border-y border-ink-100 bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
          Select all on this page ({pageJobs.length})
        </label>
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
