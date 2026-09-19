import { useEffect, useState } from 'react';
import { Briefcase, Building2, Check, Landmark, Pencil, ShieldAlert, ShieldPlus, Trash2, UserRound, X } from 'lucide-react';
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
  grantAdminByEmail,
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
  const [dataLoading, setDataLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';

  const loadAll = () => {
    setDataLoading(true);
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
    ]).then(([pp, vp, prog, jobs, pa, va, adm, allProg, allJ]) => {
      setPendingPublishers(pp);
      setVerifiedPublishers(vp);
      setPendingPrograms(prog);
      setPendingJobs(jobs);
      setPendingAgencies(pa);
      setVerifiedAgencies(va);
      setAdmins(adm);
      setAllPrograms(allProg);
      setAllJobs(allJ);
      setDataLoading(false);
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

            <Section title="Pending publisher accounts" count={pendingPublishers.length}>
              {pendingPublishers.map((p) => (
                <PublisherRow key={p.id} p={p} onChange={loadAll}>
                  <Actions
                    onApprove={async () => { if (await setPublisherStatus(p.id, 'verified')) loadAll(); }}
                    onReject={async () => { if (await setPublisherStatus(p.id, 'rejected')) loadAll(); }}
                  />
                </PublisherRow>
              ))}
            </Section>

            <Section title="Verified publisher accounts" count={verifiedPublishers.length}>
              {verifiedPublishers.map((p) => (
                <PublisherRow key={p.id} p={p} onChange={loadAll}>
                  <button
                    onClick={async () => { if (await setPublisherStatus(p.id, 'suspended')) loadAll(); }}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Suspend
                  </button>
                </PublisherRow>
              ))}
            </Section>

            <Section title="Pending sponsored programs" count={pendingPrograms.length}>
              {pendingPrograms.map((p) => (
                <Row key={p.id}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{p.title}</p>
                    <p className="text-xs text-ink-500">
                      {p.category} · {p.publisher?.name ?? 'Unknown publisher'}{p.country ? ` · ${p.country.name}` : ''}
                    </p>
                  </div>
                  <Actions
                    onApprove={async () => { if (await setProgramStatus(p.id, 'published')) loadAll(); }}
                    onReject={async () => { if (await setProgramStatus(p.id, 'rejected')) loadAll(); }}
                  />
                </Row>
              ))}
            </Section>

            <Section title="Pending sponsored jobs" count={pendingJobs.length}>
              {pendingJobs.map((j) => (
                <Row key={j.id}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
                    <Briefcase className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{j.title}</p>
                    <p className="text-xs text-ink-500">
                      {j.employment_type} · {j.publisher?.name ?? 'Unknown publisher'}{j.country ? ` · ${j.country.name}` : ''}
                    </p>
                  </div>
                  <Actions
                    onApprove={async () => { if (await setSponsoredJobStatus(j.id, 'published')) loadAll(); }}
                    onReject={async () => { if (await setSponsoredJobStatus(j.id, 'rejected')) loadAll(); }}
                  />
                </Row>
              ))}
            </Section>

            <Section title="All sponsored programs" count={allPrograms.length}>
              {allPrograms.map((p) => (
                <EditableProgramRow key={p.id} p={p} onChange={loadAll} />
              ))}
            </Section>

            <Section title="All sponsored jobs" count={allJobs.length}>
              {allJobs.map((j) => (
                <EditableJobRow key={j.id} j={j} onChange={loadAll} />
              ))}
            </Section>

            <Section title="Pending travel agencies" count={pendingAgencies.length}>
              {pendingAgencies.map((a) => (
                <AgencyRow key={a.id} a={a} onChange={loadAll}>
                  <Actions
                    onApprove={async () => { if (await setAgencyStatus(a.id, 'verified')) loadAll(); }}
                    onReject={async () => { if (await setAgencyStatus(a.id, 'rejected')) loadAll(); }}
                  />
                </AgencyRow>
              ))}
            </Section>

            <Section title="Verified travel agencies" count={verifiedAgencies.length}>
              {verifiedAgencies.map((a) => (
                <AgencyRow key={a.id} a={a} onChange={loadAll}>
                  <button
                    onClick={async () => { if (await setAgencyStatus(a.id, 'pending')) loadAll(); }}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    Revoke
                  </button>
                </AgencyRow>
              ))}
            </Section>
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

function EditableProgramRow({ p, onChange }: { p: AdminProgram; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [description, setDescription] = useState(p.description ?? '');
  const [fundingText, setFundingText] = useState(p.funding_text ?? '');
  const [officialUrl, setOfficialUrl] = useState(p.official_url ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await updateProgramAsAdmin(p.id, {
      title,
      description: description || null,
      funding_text: fundingText || null,
      official_url: officialUrl || null,
    });
    setSaving(false);
    if (ok) { setEditing(false); onChange(); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    if (await deleteProgram(p.id)) onChange();
  };

  return (
    <Row>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-8 w-full rounded-md border border-ink-200 px-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500" />
            <input value={fundingText} onChange={(e) => setFundingText(e.target.value)} placeholder="Funding / stipend" className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
            <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="Official URL" className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
            <div className="flex items-center gap-2">
              <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Save</button>
              <button onClick={() => setEditing(false)} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              {p.title}
              <button onClick={() => setEditing(true)} aria-label="Edit" className="text-ink-300 hover:text-ink-600">
                <Pencil className="h-3 w-3" />
              </button>
              <StatusPill status={p.status} />
            </p>
            <p className="text-xs text-ink-500">
              {p.category} · {p.publisher?.name ?? 'Unknown publisher'}{p.country ? ` · ${p.country.name}` : ''}
            </p>
          </>
        )}
      </div>
      <button onClick={remove} aria-label="Delete" className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-rose-50 hover:text-rose-600">
        <Trash2 className="h-4 w-4" />
      </button>
    </Row>
  );
}

function EditableJobRow({ j, onChange }: { j: AdminSponsoredJob; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(j.title);
  const [description, setDescription] = useState(j.description ?? '');
  const [compensationText, setCompensationText] = useState(j.compensation_text ?? '');
  const [officialUrl, setOfficialUrl] = useState(j.official_url ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await updateSponsoredJobAsAdmin(j.id, {
      title,
      description: description || null,
      compensation_text: compensationText || null,
      official_url: officialUrl || null,
    });
    setSaving(false);
    if (ok) { setEditing(false); onChange(); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${j.title}"? This can't be undone.`)) return;
    if (await deleteSponsoredJob(j.id)) onChange();
  };

  return (
    <Row>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500">
        <Briefcase className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-8 w-full rounded-md border border-ink-200 px-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500" />
            <input value={compensationText} onChange={(e) => setCompensationText(e.target.value)} placeholder="Salary" className="h-8 w-full max-w-xs rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
            <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="Official URL" className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs text-ink-700 outline-none focus:border-brand-500" />
            <div className="flex items-center gap-2">
              <button onClick={save} disabled={saving} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Save</button>
              <button onClick={() => setEditing(false)} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              {j.title}
              <button onClick={() => setEditing(true)} aria-label="Edit" className="text-ink-300 hover:text-ink-600">
                <Pencil className="h-3 w-3" />
              </button>
              <StatusPill status={j.status} />
            </p>
            <p className="text-xs text-ink-500">
              {j.employment_type} · {j.publisher?.name ?? 'Unknown publisher'}{j.country ? ` · ${j.country.name}` : ''}
            </p>
          </>
        )}
      </div>
      <button onClick={remove} aria-label="Delete" className="shrink-0 rounded-lg p-2 text-ink-300 hover:bg-rose-50 hover:text-rose-600">
        <Trash2 className="h-4 w-4" />
      </button>
    </Row>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    rejected: 'bg-rose-50 text-rose-700',
  };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${styles[status] ?? 'bg-ink-50 text-ink-500'}`}>
      {status}
    </span>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
        {title} <span className="text-ink-400">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="mt-3 text-xs text-ink-400">Nothing here.</p>
      ) : (
        <div className="mt-3 divide-y divide-ink-100 border border-ink-200 bg-white">{children}</div>
      )}
    </section>
  );
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
