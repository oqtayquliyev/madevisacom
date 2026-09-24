import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Briefcase, Building2, GraduationCap, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { RichTextField } from '@/components/admin/RichTextField';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { fetchCountries, fetchMyPrograms, type CountryOption, type SponsoredProgram } from '@/lib/programs';
import { fetchMySponsoredJobs, type SponsoredJob } from '@/lib/sponsoredJobs';
import { sanitizeJobHtml } from '@/lib/atsImport';
import { JOB_CATEGORIES, PROGRAM_CATEGORIES, type ListingStatus } from '@/lib/listingCategories';
import {
  deleteCompanyListing,
  fetchMyManagedPublishers,
  saveCompanyJob,
  saveCompanyProgram,
  setCompanyListingStatus,
  updateManagedPublisher,
  type CompanyJobInput,
  type CompanyProgramInput,
  type ManagedPublisher,
} from '@/lib/companyManager';
import { addPublisherMember, fetchPublisherMembers, removePublisherMember, type PublisherMember } from '@/lib/admin';
import type { View } from '@/types';

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };
type Tab = 'jobs' | 'programs' | 'page' | 'team';

const STATUS_STYLE: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  under_review: 'bg-amber-50 text-amber-700',
  needs_information: 'bg-orange-50 text-orange-700',
  draft: 'bg-ink-100 text-ink-600',
  expired: 'bg-ink-100 text-ink-500',
  rejected: 'bg-rose-50 text-rose-700',
  verified: 'bg-sky-50 text-sky-700',
};
const STATUS_LABEL: Record<string, string> = {
  published: 'Live',
  pending: 'In review',
  under_review: 'In review',
  needs_information: 'Needs info',
  draft: 'Unpublished',
  expired: 'Closed',
  rejected: 'Rejected',
  verified: 'Verified',
};

export function CompanyManagerPage({ go, onAuth }: Props) {
  useSeo({ title: 'Manage your company', description: 'Manage your company page, vacancies and programs on MadeVisa.', path: '/company', noindex: true });
  const { session, profile, loading } = useAuth();
  const [publishers, setPublishers] = useState<ManagedPublisher[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('jobs');
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    if (!session) return;
    fetchMyManagedPublishers(true).then((list) => {
      setPublishers(list);
      const wanted = new URLSearchParams(window.location.search).get('company');
      setActiveId(list.find((p) => p.id === wanted)?.id ?? list[0]?.id ?? null);
    });
    fetchCountries().then(setCountries);
  }, [session]);

  const active = publishers?.find((p) => p.id === activeId) ?? null;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">{children}</main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );

  if (loading) return null;
  if (!session) {
    return shell(
      <div className="mx-auto max-w-md py-16 text-center">
        <Building2 className="mx-auto h-10 w-10 text-ink-300" />
        <h1 className="mt-4 text-xl font-bold">Manage your company on MadeVisa</h1>
        <p className="mt-2 text-sm text-ink-500">Sign in with the work email MadeVisa gave access to.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => onAuth?.('login')} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Sign in</button>
          <button onClick={() => onAuth?.('register')} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Create account</button>
        </div>
      </div>
    );
  }
  if (publishers === null) return shell(<p className="text-sm text-ink-400">Loading…</p>);
  if (!active) {
    return shell(
      <div className="mx-auto max-w-md py-16 text-center">
        <Building2 className="mx-auto h-10 w-10 text-ink-300" />
        <h1 className="mt-4 text-xl font-bold">No company access yet</h1>
        <p className="mt-2 text-sm text-ink-500">
          You're signed in as <strong>{profile?.email}</strong>. If you're the HR or hiring contact for a company, ask MadeVisa at{' '}
          <a className="text-brand-600 underline" href="mailto:hello@madevisa.com">hello@madevisa.com</a> to give this email access. Make sure your email address is confirmed.
        </p>
      </div>
    );
  }

  return shell(
    <>
      <div className="flex flex-wrap items-center gap-4">
        {active.logo_url ? (
          <img src={active.logo_url} alt="" className="h-14 w-14 rounded-lg border border-ink-200 bg-white object-contain p-1" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-lg border border-ink-200 bg-white"><Building2 className="h-6 w-6 text-ink-300" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Company dashboard</p>
          <h1 className="truncate text-2xl font-bold tracking-tight text-ink-950">{active.name}</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {active.can_publish ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /> Your changes go live immediately</span>
            ) : (
              'New and edited listings are reviewed by MadeVisa before going live (usually within a day).'
            )}
          </p>
        </div>
        {publishers.length > 1 && (
          <select value={active.id} onChange={(e) => setActiveId(e.target.value)} className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm">
            {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-ink-200">
        {([
          ['jobs', 'Vacancies', Briefcase],
          ['programs', 'Programs', GraduationCap],
          ['page', 'Company page', Building2],
          ['team', 'Team access', Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'jobs' && <ListingsPanel kind="job" publisher={active} countries={countries} />}
        {tab === 'programs' && <ListingsPanel kind="program" publisher={active} countries={countries} />}
        {tab === 'page' && (
          <CompanyPagePanel
            publisher={active}
            userId={profile?.id ?? ''}
            onSaved={() => fetchMyManagedPublishers(true).then(setPublishers)}
          />
        )}
        {tab === 'team' && <TeamPanel publisher={active} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Listings (jobs or programs)
// ---------------------------------------------------------------------------

type AnyListing = (SponsoredJob | SponsoredProgram) & { status: ListingStatus };

function ListingsPanel({ kind, publisher, countries }: { kind: 'job' | 'program'; publisher: ManagedPublisher; countries: CountryOption[] }) {
  const [rows, setRows] = useState<AnyListing[] | null>(null);
  const [editing, setEditing] = useState<AnyListing | 'new' | null>(null);
  const [filter, setFilter] = useState<'all' | 'live' | 'review' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setRows(null);
    (kind === 'job' ? fetchMySponsoredJobs(publisher.id) : fetchMyPrograms(publisher.id)).then((r) => setRows(r as AnyListing[]));
  };
  useEffect(load, [kind, publisher.id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (filter === 'live') return r.status === 'published';
      if (filter === 'review') return ['pending', 'under_review', 'needs_information'].includes(r.status);
      if (filter === 'closed') return ['draft', 'expired', 'rejected'].includes(r.status);
      return true;
    });
  }, [rows, filter, search]);

  const afterWrite = (res: { ok: boolean; status?: string; error?: string }, what: string) => {
    if (!res.ok) return window.alert(res.error ?? 'Something went wrong.');
    setNotice(res.status === 'pending' ? `${what} — sent to MadeVisa for review.` : `${what}.`);
    load();
  };

  const noun = kind === 'job' ? 'vacancy' : 'program';

  if (editing) {
    return kind === 'job' ? (
      <JobForm
        countries={countries}
        initial={editing === 'new' ? null : (editing as SponsoredJob)}
        onCancel={() => setEditing(null)}
        onSave={async (input) => {
          const res = await saveCompanyJob(publisher.id, input, editing === 'new' ? undefined : editing.id);
          if (res.ok) setEditing(null);
          afterWrite(res, editing === 'new' ? 'Vacancy created' : 'Vacancy updated');
        }}
      />
    ) : (
      <ProgramForm
        countries={countries}
        initial={editing === 'new' ? null : (editing as SponsoredProgram)}
        onCancel={() => setEditing(null)}
        onSave={async (input) => {
          const res = await saveCompanyProgram(publisher.id, input, editing === 'new' ? undefined : editing.id);
          if (res.ok) setEditing(null);
          afterWrite(res, editing === 'new' ? 'Program created' : 'Program updated');
        }}
      />
    );
  }

  const counts = {
    all: rows?.length ?? 0,
    live: rows?.filter((r) => r.status === 'published').length ?? 0,
    review: rows?.filter((r) => ['pending', 'under_review', 'needs_information'].includes(r.status)).length ?? 0,
    closed: rows?.filter((r) => ['draft', 'expired', 'rejected'].includes(r.status)).length ?? 0,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'live', 'review', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === f ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'}`}
          >
            {{ all: 'All', live: 'Live', review: 'In review', closed: 'Closed' }[f]} ({counts[f]})
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-44 rounded-md border border-ink-200 px-2 text-xs outline-none focus:border-brand-500" />
        <button onClick={() => setEditing('new')} className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
          <Plus className="h-3.5 w-3.5" /> New {noun}
        </button>
      </div>
      {notice && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{notice}</p>}

      <div className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {rows === null && <p className="p-4 text-sm text-ink-400">Loading…</p>}
        {rows !== null && visible.length === 0 && <p className="p-4 text-sm text-ink-400">No {noun === 'vacancy' ? 'vacancies' : 'programs'} here yet.</p>}
        {visible.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{r.title}</p>
              <p className="text-[11px] text-ink-400">
                {r.country?.name ?? 'Various'} · added {new Date(r.created_at).toLocaleDateString()}
                {'origin' in r && r.origin === 'imported' ? ' · imported from your careers site' : ''}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[r.status] ?? 'bg-ink-100 text-ink-600'}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
            <button onClick={() => setEditing(r)} className="rounded-lg border border-ink-200 p-1.5 text-ink-500 hover:bg-ink-50" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            {r.status === 'published' ? (
              <button onClick={async () => afterWrite(await setCompanyListingStatus(kind, r.id, 'expired'), 'Closed')} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">Close</button>
            ) : ['draft', 'expired'].includes(r.status) ? (
              <button onClick={async () => afterWrite(await setCompanyListingStatus(kind, r.id, 'published'), 'Reopened')} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">Reopen</button>
            ) : null}
            <button
              onClick={async () => {
                if (!window.confirm(`Delete "${r.title}"? This can't be undone.`)) return;
                afterWrite(await deleteCompanyListing(kind, r.id), 'Deleted');
              }}
              className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-brand-500';

function FormShell({ title, children, onCancel, onSubmit, canSubmit }: { title: string; children: React.ReactNode; onCancel: () => void; onSubmit: () => Promise<void>; canSubmit: boolean }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">{title}</h2>
        <button onClick={onCancel} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50" aria-label="Cancel"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
      <div className="mt-5 flex gap-2">
        <button
          disabled={!canSubmit || saving}
          onClick={async () => { setSaving(true); await onSubmit(); setSaving(false); }}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save & publish
        </button>
        <button onClick={onCancel} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50">Cancel</button>
      </div>
    </div>
  );
}

function CountrySelect({ countries, value, onChange }: { countries: CountryOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Various / not specified</option>
      {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function JobForm({ initial, countries, onSave, onCancel }: { initial: SponsoredJob | null; countries: CountryOption[]; onSave: (i: CompanyJobInput) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<CompanyJobInput>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    employment_type: initial?.employment_type ?? 'Full time',
    job_function: initial?.job_function ?? '',
    country_id: initial?.country_id ?? '',
    city: initial?.city ?? '',
    remote: initial?.remote ?? false,
    visa_sponsorship: initial?.visa_sponsorship ?? false,
    compensation_text: initial?.compensation_text ?? '',
    application_deadline: initial?.application_deadline ?? '',
    official_url: initial?.official_url ?? '',
  });
  const set = <K extends keyof CompanyJobInput>(k: K, v: CompanyJobInput[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <FormShell title={initial ? 'Edit vacancy' : 'New vacancy'} onCancel={onCancel} canSubmit={!!f.title.trim()} onSubmit={() => onSave({ ...f, description: sanitizeJobHtml(f.description) })}>
      <Field label="Job title *"><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Team / function"><input className={inputCls} value={f.job_function} onChange={(e) => set('job_function', e.target.value)} placeholder="e.g. Engineering" /></Field>
      <Field label="Employment type">
        <select className={inputCls} value={f.employment_type} onChange={(e) => set('employment_type', e.target.value)}>
          {JOB_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Country"><CountrySelect countries={countries} value={f.country_id} onChange={(v) => set('country_id', v)} /></Field>
      <Field label="City"><input className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
      <Field label="Salary (as you'd like it shown)"><input className={inputCls} value={f.compensation_text} onChange={(e) => set('compensation_text', e.target.value)} placeholder="e.g. €60–75k / year" /></Field>
      <Field label="Application deadline"><input type="date" className={inputCls} value={f.application_deadline} onChange={(e) => set('application_deadline', e.target.value)} /></Field>
      <Field label="Apply link"><input className={inputCls} value={f.official_url} onChange={(e) => set('official_url', e.target.value)} placeholder="https://" /></Field>
      <div className="flex items-center gap-5 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.remote} onChange={(e) => set('remote', e.target.checked)} /> Remote</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.visa_sponsorship} onChange={(e) => set('visa_sponsorship', e.target.checked)} /> Visa sponsorship available</label>
      </div>
      <div className="sm:col-span-2"><RichTextField label="Description" value={f.description} onChange={(v) => set('description', v)} /></div>
    </FormShell>
  );
}

function ProgramForm({ initial, countries, onSave, onCancel }: { initial: SponsoredProgram | null; countries: CountryOption[]; onSave: (i: CompanyProgramInput) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<CompanyProgramInput>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? 'Other',
    country_id: initial?.country_id ?? '',
    city: initial?.city ?? '',
    applications_open_at: initial?.applications_open_at ?? '',
    applications_close_at: initial?.applications_close_at ?? '',
    funding_text: initial?.funding_text ?? '',
    official_url: initial?.official_url ?? '',
    spots_available: initial?.spots_available != null ? String(initial.spots_available) : '',
  });
  const set = <K extends keyof CompanyProgramInput>(k: K, v: CompanyProgramInput[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <FormShell title={initial ? 'Edit program' : 'New program'} onCancel={onCancel} canSubmit={!!f.title.trim()} onSubmit={() => onSave({ ...f, description: sanitizeJobHtml(f.description) })}>
      <Field label="Program title *"><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Category">
        <select className={inputCls} value={f.category} onChange={(e) => set('category', e.target.value)}>
          {PROGRAM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Country"><CountrySelect countries={countries} value={f.country_id} onChange={(v) => set('country_id', v)} /></Field>
      <Field label="City"><input className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
      <Field label="Applications open"><input type="date" className={inputCls} value={f.applications_open_at} onChange={(e) => set('applications_open_at', e.target.value)} /></Field>
      <Field label="Applications close"><input type="date" className={inputCls} value={f.applications_close_at} onChange={(e) => set('applications_close_at', e.target.value)} /></Field>
      <Field label="Funding / benefits"><input className={inputCls} value={f.funding_text} onChange={(e) => set('funding_text', e.target.value)} placeholder="e.g. Full tuition + stipend" /></Field>
      <Field label="Spots available"><input type="number" min={0} className={inputCls} value={f.spots_available} onChange={(e) => set('spots_available', e.target.value)} /></Field>
      <Field label="Official link"><input className={inputCls} value={f.official_url} onChange={(e) => set('official_url', e.target.value)} placeholder="https://" /></Field>
      <div className="sm:col-span-2"><RichTextField label="Description" value={f.description} onChange={(v) => set('description', v)} /></div>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Company page
// ---------------------------------------------------------------------------

function CompanyPagePanel({ publisher, userId, onSaved }: { publisher: ManagedPublisher; userId: string; onSaved: () => void }) {
  const [description, setDescription] = useState(publisher.description ?? '');
  const [website, setWebsite] = useState(publisher.website ?? '');
  const [logoUrl, setLogoUrl] = useState(publisher.logo_url ?? '');
  const [contactEmail, setContactEmail] = useState(publisher.contact_email ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDescription(publisher.description ?? '');
    setWebsite(publisher.website ?? '');
    setLogoUrl(publisher.logo_url ?? '');
    setContactEmail(publisher.contact_email ?? '');
  }, [publisher.id]);

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <p className="text-xs text-ink-500">
        This is how <strong>{publisher.name}</strong> appears on MadeVisa. The company name itself can only be changed by MadeVisa.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Website"><input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
        <Field label="Public contact email"><input className={inputCls} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></Field>
        <div className="sm:col-span-2"><ImageUploadField userId={userId} value={logoUrl} onChange={setLogoUrl} label="Logo" /></div>
        <div className="sm:col-span-2">
          <Field label="About the company">
            <textarea rows={5} className="w-full rounded-md border border-ink-200 p-2 text-sm outline-none focus:border-brand-500" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </div>
      <button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const res = await updateManagedPublisher(publisher.id, { description: description || null, website: website || null, logo_url: logoUrl || null, contact_email: contactEmail || publisher.contact_email });
          setSaving(false);
          setMsg(res.ok ? 'Saved.' : res.error ?? 'Could not save.');
          if (res.ok) onSaved();
        }}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save company page'}
      </button>
      {msg && <span className="ml-3 text-xs text-ink-500">{msg}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team access (owners can invite; everyone can see who has access)
// ---------------------------------------------------------------------------

function TeamPanel({ publisher }: { publisher: ManagedPublisher }) {
  const [members, setMembers] = useState<PublisherMember[] | null>(null);
  const [email, setEmail] = useState('');
  const load = () => fetchPublisherMembers(publisher.id).then(setMembers);
  useEffect(() => { load(); }, [publisher.id]);

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <p className="text-xs text-ink-500">People with these emails can manage {publisher.name}'s page, vacancies and programs after signing in to MadeVisa.</p>
      <div className="mt-3 divide-y divide-ink-100">
        {members === null && <p className="py-2 text-sm text-ink-400">Loading…</p>}
        {members?.length === 0 && <p className="py-2 text-sm text-ink-400">Only you so far.</p>}
        {members?.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{m.email}</span>
            <span className="text-[11px] text-ink-400">{m.can_publish ? 'Publishes directly' : 'Changes reviewed'}</span>
            {publisher.is_owner && (
              <button onClick={async () => { await removePublisherMember(m.id); load(); }} className="text-ink-300 hover:text-rose-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
      </div>
      {publisher.is_owner ? (
        <div className="mt-4 flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" className={inputCls} />
          <button
            onClick={async () => {
              const r = await addPublisherMember(publisher.id, email, false);
              if (!r.ok) return window.alert(r.error);
              setEmail('');
              load();
            }}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Add teammate
          </button>
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-ink-400">To add or remove teammates, contact MadeVisa at hello@madevisa.com.</p>
      )}
    </div>
  );
}
