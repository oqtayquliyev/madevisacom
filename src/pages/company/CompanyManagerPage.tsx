import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Banknote,
  Briefcase,
  Building2,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { isEmailVerified, useAuth } from '@/lib/auth';
import { VerifyEmailCard } from '@/components/common/VerifyEmailCard';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { RichTextField } from '@/components/admin/RichTextField';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { AutoGrowTextarea, CharCount, cleanText } from '@/components/common/LimitedFields';
import { SoonChip } from '@/components/common/SoonChip';
import { fetchCountries, fetchMyPrograms, type CountryOption, type SponsoredProgram } from '@/lib/programs';
import { fetchMySponsoredJobs, type SponsoredJob } from '@/lib/sponsoredJobs';
import { sanitizeJobHtml } from '@/lib/atsImport';
import { DISCOVERY_CATEGORIES } from '@/lib/jobCategories';
import { PROGRAM_CATEGORIES, SALARY_PERIODS, type ListingStatus, type SalaryPeriod } from '@/lib/listingCategories';
import {
  changeRequestHref,
  CHANGE_REQUEST_EMAIL,
  countMySubmissionsToday,
  deleteCompanyListing,
  EXPERIENCE_LEVELS,
  fetchMyManagedPublishers,
  isLockedListing,
  LISTING_LIMITS,
  SALARY_CURRENCIES,
  salaryLabel,
  saveCompanyJob,
  saveCompanyProgram,
  setCompanyListingStatus,
  updateManagedPublisher,
  validUrl,
  VISA_OPTIONS,
  WORKPLACES,
  type CompanyJobInput,
  type CompanyProgramInput,
  type ManagedPublisher,
  type Workplace,
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

// Employment types a company can choose (the admin-only "Sponsored job" /
// "Other" buckets aren't useful here).
const EMPLOYMENT_TYPES = ['Full time', 'Part time', 'Contract / Freelance', 'Internship', 'Apprenticeship', 'Seasonal work', 'Volunteer'] as const;

export function CompanyManagerPage({ go, onAuth }: Props) {
  useSeo({ title: 'Manage your company', description: 'Manage your company page, vacancies and programs on MadeVisa.', path: '/company', noindex: true });
  const { session, user, profile, loading } = useAuth();
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

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">{children}</main>
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
        {!isEmailVerified(profile, user) && profile?.email && (
          <VerifyEmailCard email={profile.email} reason="Company access only works for verified emails." className="mt-5 text-left" />
        )}
        <p className="mt-2 text-sm text-ink-500">
          You're signed in as <strong>{profile?.email}</strong>. If you're the HR or hiring contact for a company, ask MadeVisa at{' '}
          <a className="text-brand-600 underline" href={`mailto:${CHANGE_REQUEST_EMAIL}`}>{CHANGE_REQUEST_EMAIL}</a> to give this email access. Make sure your email address is confirmed.
        </p>
      </div>
    );
  }

  return shell(
    <>
      <div className="flex flex-wrap items-center gap-4">
        {active.logo_url ? (
          <img src={active.logo_url} alt="" className="h-14 w-14 rounded border border-ink-200 bg-white object-contain p-1" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded border border-ink-200 bg-white"><Building2 className="h-6 w-6 text-ink-300" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Company dashboard</p>
          <h1 className="truncate text-2xl font-bold tracking-tight text-ink-950">{active.name}</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {active.can_publish ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /> Trusted — your listings go live immediately</span>
            ) : (
              'Every new listing is reviewed by MadeVisa before it goes live (usually within a day).'
            )}
          </p>
        </div>
        {publishers.length > 1 && (
          <select value={active.id} onChange={(e) => setActiveId(e.target.value)} className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm">
            {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-ink-200">
          {([
            ['jobs', 'Vacancies', Briefcase],
            ['programs', 'Programs', GraduationCap],
            ['page', 'Company page', Building2],
            ['team', 'Team access', Users],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
                tab === key ? 'border-brand-600 text-brand-700' : key === 'programs' ? 'border-transparent text-ink-400 hover:text-ink-600' : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
              {key === 'programs' && <SoonChip />}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === 'jobs' && <ListingsPanel kind="job" publisher={active} countries={countries} />}
        {tab === 'programs' && (
          <>
            <p className="mb-4 rounded-md border border-ink-200 bg-white px-3 py-2 text-xs text-ink-500">
              Programs open on MadeVisa soon. You can prepare and submit them now — approved programs appear when the section launches.
            </p>
            <ListingsPanel kind="program" publisher={active} countries={countries} />
          </>
        )}
        {tab === 'page' && (
          <CompanyPagePanel publisher={active} userId={profile?.id ?? ''} onSaved={() => fetchMyManagedPublishers(true).then(setPublishers)} />
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
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [today, setToday] = useState(0);

  const load = () => {
    setRows(null);
    (kind === 'job' ? fetchMySponsoredJobs(publisher.id) : fetchMyPrograms(publisher.id)).then((r) => setRows(r as AnyListing[]));
    countMySubmissionsToday().then(setToday);
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
    if (!res.ok) {
      setNotice({ tone: 'error', text: res.error ?? 'Something went wrong.' });
      return;
    }
    setNotice({ tone: 'ok', text: res.status === 'pending' ? `${what} — sent to MadeVisa for review. You'll see it go live here once approved.` : `${what}.` });
    load();
  };

  const noun = kind === 'job' ? 'vacancy' : 'program';
  const limitReached = today >= LISTING_LIMITS.perDay;

  if (editing) {
    const existing = editing === 'new' ? null : editing;
    return kind === 'job' ? (
      <JobForm
        countries={countries}
        canPublish={publisher.can_publish}
        initial={existing as SponsoredJob | null}
        onCancel={() => setEditing(null)}
        onSave={async (input) => {
          const res = await saveCompanyJob(publisher.id, input, publisher.can_publish, existing?.id);
          if (res.ok) setEditing(null);
          afterWrite(res, existing ? 'Vacancy updated' : 'Vacancy submitted');
          return res;
        }}
      />
    ) : (
      <ProgramForm
        countries={countries}
        canPublish={publisher.can_publish}
        initial={existing as SponsoredProgram | null}
        onCancel={() => setEditing(null)}
        onSave={async (input) => {
          const res = await saveCompanyProgram(publisher.id, input, publisher.can_publish, existing?.id);
          if (res.ok) setEditing(null);
          afterWrite(res, existing ? 'Program updated' : 'Program submitted');
          return res;
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
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === f ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'}`}
          >
            {{ all: 'All', live: 'Live', review: 'In review', closed: 'Closed' }[f]} ({counts[f]})
          </button>
        ))}
        <input
          value={search}
          maxLength={80}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 w-full rounded-md border border-ink-200 px-2 text-xs outline-none focus:border-brand-500 sm:w-44"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-[11px] font-medium tabular-nums ${limitReached ? 'text-rose-600' : 'text-ink-400'}`} title="Jobs and programs you submitted in the last 24 hours">
            {today} / {LISTING_LIMITS.perDay} today
          </span>
          <button
            disabled={limitReached}
            onClick={() => {
              setNotice(null);
              setEditing('new');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> New {noun}
          </button>
        </div>
      </div>
      {limitReached && <p className="mt-3 text-xs text-rose-600">You've reached today's limit of {LISTING_LIMITS.perDay} new listings. You can add more tomorrow.</p>}
      {notice && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>
      )}

      <div className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {rows === null && <p className="p-4 text-sm text-ink-400">Loading…</p>}
        {rows !== null && visible.length === 0 && <p className="p-4 text-sm text-ink-400">No {noun === 'vacancy' ? 'vacancies' : 'programs'} here yet.</p>}
        {visible.map((r) => {
          const locked = isLockedListing(r);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-semibold text-ink-900">{r.title}</p>
                <p className="text-[11px] text-ink-400">
                  {r.country?.name ?? 'Various'} · added {new Date(r.created_at).toLocaleDateString()}
                  {'origin' in r && r.origin === 'imported' ? ' · imported from your careers site' : ''}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[r.status] ?? 'bg-ink-100 text-ink-600'}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
              {locked ? (
                <a
                  href={changeRequestHref(publisher.name, r.title)}
                  title="Approved listings can't be edited. Email MadeVisa to request a change."
                  className="flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-500 hover:bg-ink-50"
                >
                  <Lock className="h-3 w-3" /> Request a change
                </a>
              ) : (
                <button onClick={() => setEditing(r)} className="rounded-lg border border-ink-200 p-1.5 text-ink-500 hover:bg-ink-50" aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {r.status === 'published' ? (
                <button onClick={async () => afterWrite(await setCompanyListingStatus(kind, r.id, 'expired'), 'Closed')} className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50">
                  Close
                </button>
              ) : ['draft', 'expired'].includes(r.status) ? (
                <button
                  onClick={async () => afterWrite(await setCompanyListingStatus(kind, r.id, publisher.can_publish || locked ? 'published' : 'pending'), 'Reopened')}
                  className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
                >
                  Reopen
                </button>
              ) : null}
              {!locked && (
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
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-ink-400">
        Once a listing is approved it can't be edited — you can still close or reopen it. To change an approved listing, email{' '}
        <a href={`mailto:${CHANGE_REQUEST_EMAIL}`} className="font-semibold text-brand-700 hover:underline">{CHANGE_REQUEST_EMAIL}</a>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form building blocks
// ---------------------------------------------------------------------------

const inputCls = 'h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function Field({ label, hint, count, max, error, children, wide }: { label: string; hint?: string; count?: string; max?: number; error?: string | null; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-600">{label}</span>
        {count !== undefined && max ? <CharCount value={count} max={max} /> : hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
      </div>
      {children}
      {error && <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}

/** Single-choice chips. `allowNone` lets a second click clear the choice. */
function ChipChoice<T extends string>({ options, value, onChange, allowNone = false }: { options: readonly { value: T; label: string }[]; value: T | ''; onChange: (v: T | '') => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value || 'none'}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && allowNone ? '' : o.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const asOptions = <T extends string>(list: readonly T[]) => list.map((v) => ({ value: v, label: v }));

function CountrySelect({ countries, value, onChange }: { countries: CountryOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Choose a country</option>
      {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-ink-100 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-ink-400">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FormShell({
  title,
  children,
  aside,
  onCancel,
  onSubmit,
  problems,
  canPublish,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  onCancel: () => void;
  onSubmit: () => Promise<{ ok: boolean; error?: string }>;
  problems: string[];
  canPublish: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const blocked = problems.length > 0;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
      <div className="rounded-lg border border-ink-200 bg-white p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50" aria-label="Cancel"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-5">{children}</div>
        {tried && blocked && (
          <ul className="mt-5 space-y-0.5 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-5">
          <button
            disabled={saving}
            onClick={async () => {
              setTried(true);
              if (blocked) return;
              setSaving(true);
              setError(null);
              const res = await onSubmit();
              setSaving(false);
              if (!res.ok) setError(res.error ?? 'Could not save.');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {canPublish ? 'Publish' : 'Submit for review'}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-600 hover:bg-ink-50">Cancel</button>
          {!canPublish && <span className="text-[11px] text-ink-400">MadeVisa reviews it before it goes live. After approval it can't be edited.</span>}
        </div>
      </div>
      {aside && <aside className="lg:sticky lg:top-24">{aside}</aside>}
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const htmlTextLength = (html: string) => html.replace(/<[^>]*>/g, '').length;

// ---------------------------------------------------------------------------
// Vacancy form
// ---------------------------------------------------------------------------

function JobForm({
  initial,
  countries,
  canPublish,
  onSave,
  onCancel,
}: {
  initial: SponsoredJob | null;
  countries: CountryOption[];
  canPublish: boolean;
  onSave: (i: CompanyJobInput) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const initialFunction = initial?.job_function ?? '';
  const [f, setF] = useState<CompanyJobInput>(() => ({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    employment_type: initial?.employment_type && (EMPLOYMENT_TYPES as readonly string[]).includes(initial.employment_type) ? initial.employment_type : 'Full time',
    job_function: initialFunction,
    country_id: initial?.country_id ?? '',
    city: initial?.city ?? '',
    workplace: (initial?.work_arrangement ?? (initial?.remote ? 'remote' : '')) as Workplace | '',
    visa: initial?.visa_status ?? (initial?.visa_sponsorship ? 'offered' : ''),
    experience_level: initial?.experience_level ?? '',
    salary_mode: initial?.salary_status === 'negotiable' ? 'negotiable' : initial?.salary_min || initial?.salary_max ? 'range' : 'none',
    salary_min: initial?.salary_min ? String(initial.salary_min) : '',
    salary_max: initial?.salary_max ? String(initial.salary_max) : '',
    salary_currency: initial?.salary_currency || 'EUR',
    salary_period: (initial?.salary_period as SalaryPeriod) || 'year',
    application_deadline: initial?.application_deadline ?? '',
    official_url: initial?.official_url ?? '',
  }));
  const [customFunction, setCustomFunction] = useState(Boolean(initialFunction) && !DISCOVERY_CATEGORIES.includes(initialFunction));
  const set = <K extends keyof CompanyJobInput>(k: K, v: CompanyJobInput[K]) => setF((p) => ({ ...p, [k]: v }));

  const min = Number(f.salary_min) || 0;
  const max = Number(f.salary_max) || 0;
  const urlError = f.official_url && !validUrl(f.official_url) ? 'Use a full link starting with https://' : null;
  const salaryError = f.salary_mode === 'range' && min && max && max < min ? 'Maximum is lower than minimum.' : null;
  const descLength = htmlTextLength(f.description);

  const problems = [
    f.title.trim().length < 3 && 'Add a job title (at least 3 characters).',
    !f.workplace && 'Choose where the work happens (On-site, Hybrid or Remote).',
    f.workplace !== 'remote' && !f.country_id && 'Choose the country of the job.',
    !f.official_url.trim() && 'Add the apply link.',
    urlError,
    f.salary_mode === 'range' && !min && !max && 'Enter a salary amount, or choose "Don\'t show".',
    salaryError,
    f.description.length > LISTING_LIMITS.description && 'The description is too long.',
  ].filter((p): p is string => Boolean(p));

  const salaryText = salaryLabel(f);
  const preview = (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
      <div className="bg-brand-700 px-4 py-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Preview</p>
        <p className="mt-0.5 line-clamp-2 font-slab text-base font-bold leading-snug">{f.title.trim() || 'Job title'}</p>
      </div>
      <dl className="divide-y divide-ink-100 text-sm">
        <PreviewRow icon={Banknote} label="Compensation" value={salaryText} />
        <PreviewRow icon={MapPin} label="Remote" value={f.workplace === 'remote' ? 'Yes' : f.workplace === 'hybrid' ? 'Hybrid' : f.workplace === 'onsite' ? 'No — on-site' : null} />
        <PreviewRow icon={Briefcase} label="Employment type" value={f.employment_type} />
        <PreviewRow icon={GraduationCap} label="Experience level" value={f.experience_level || null} />
        <PreviewRow icon={Plane} label="Visa sponsorship" value={f.visa === 'offered' ? 'Offered' : f.visa === 'not_offered' ? 'Not offered' : null} />
      </dl>
      <p className="border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-400">This is how the details box looks on your job page. Empty items show as “Not listed”.</p>
    </div>
  );

  return (
    <FormShell
      title={initial ? 'Edit vacancy' : 'New vacancy'}
      onCancel={onCancel}
      problems={problems}
      canPublish={canPublish}
      aside={preview}
      onSubmit={() => onSave({ ...f, title: f.title.trim(), city: f.city.trim(), job_function: f.job_function.trim(), description: sanitizeJobHtml(f.description) })}
    >
      <Section title="The role">
        <Field label="Job title *" count={f.title} max={LISTING_LIMITS.title} wide>
          <input className={inputCls} value={f.title} maxLength={LISTING_LIMITS.title} onChange={(e) => set('title', cleanText(e.target.value, LISTING_LIMITS.title))} placeholder="e.g. Senior Product Designer" />
        </Field>
        <Field label="Employment type *" wide>
          <ChipChoice options={asOptions(EMPLOYMENT_TYPES)} value={f.employment_type as (typeof EMPLOYMENT_TYPES)[number]} onChange={(v) => v && set('employment_type', v)} />
        </Field>
        <Field label="Team / function" hint="Used by the Jobs page category filter" wide>
          <div className="flex flex-wrap gap-1.5">
            {DISCOVERY_CATEGORIES.map((c) => {
              const on = !customFunction && f.job_function === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setCustomFunction(false);
                    set('job_function', on ? '' : c);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700'}`}
                >
                  {c}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={customFunction}
              onClick={() => {
                setCustomFunction(!customFunction);
                set('job_function', '');
              }}
              className={`rounded-full border border-dashed px-3 py-1.5 text-xs font-semibold ${customFunction ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-white text-ink-500 hover:text-brand-700'}`}
            >
              Other…
            </button>
          </div>
          {customFunction && (
            <div className="mt-2 flex items-center gap-2">
              <input
                autoFocus
                className={inputCls}
                value={f.job_function}
                maxLength={LISTING_LIMITS.jobFunction}
                onChange={(e) => set('job_function', cleanText(e.target.value, LISTING_LIMITS.jobFunction))}
                placeholder="e.g. Logistics"
              />
              <CharCount value={f.job_function} max={LISTING_LIMITS.jobFunction} className="shrink-0" />
            </div>
          )}
        </Field>
        <Field label="Experience level" wide>
          <ChipChoice options={asOptions(EXPERIENCE_LEVELS)} value={f.experience_level as (typeof EXPERIENCE_LEVELS)[number]} onChange={(v) => set('experience_level', v)} allowNone />
        </Field>
      </Section>

      <Section title="Location">
        <Field label="Workplace *" wide>
          <ChipChoice options={WORKPLACES} value={f.workplace} onChange={(v) => set('workplace', v)} />
        </Field>
        <Field label={f.workplace === 'remote' ? 'Country (optional for remote)' : 'Country *'}>
          <CountrySelect countries={countries} value={f.country_id} onChange={(v) => set('country_id', v)} />
        </Field>
        <Field label="City" count={f.city} max={LISTING_LIMITS.city}>
          <input className={inputCls} value={f.city} maxLength={LISTING_LIMITS.city} onChange={(e) => set('city', cleanText(e.target.value, LISTING_LIMITS.city))} placeholder="e.g. Berlin" />
        </Field>
      </Section>

      <Section title="Pay & visa">
        <Field label="Salary" wide error={salaryError}>
          <ChipChoice
            options={[
              { value: 'range', label: 'Show amount' },
              { value: 'negotiable', label: 'Negotiable' },
              { value: 'none', label: "Don't show" },
            ]}
            value={f.salary_mode}
            onChange={(v) => v && set('salary_mode', v)}
          />
          {f.salary_mode === 'range' && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-[88px_1fr_1fr] gap-2">
                <select aria-label="Currency" className={inputCls} value={f.salary_currency} onChange={(e) => set('salary_currency', e.target.value)}>
                  {SALARY_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input aria-label="Minimum" inputMode="numeric" className={inputCls} value={f.salary_min} onChange={(e) => set('salary_min', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="Min, e.g. 60000" />
                <input aria-label="Maximum" inputMode="numeric" className={inputCls} value={f.salary_max} onChange={(e) => set('salary_max', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="Max (optional)" />
              </div>
              <ChipChoice options={SALARY_PERIODS.map((p) => ({ value: p, label: `per ${p}` }))} value={f.salary_period} onChange={(v) => v && set('salary_period', v)} />
            </div>
          )}
        </Field>
        <Field label="Visa sponsorship" wide>
          <ChipChoice options={VISA_OPTIONS} value={f.visa} onChange={(v) => set('visa', v as CompanyJobInput['visa'])} />
        </Field>
      </Section>

      <Section title="How to apply">
        <Field label="Apply link *" count={f.official_url} max={LISTING_LIMITS.url} error={urlError}>
          <input
            className={inputCls}
            type="url"
            value={f.official_url}
            maxLength={LISTING_LIMITS.url}
            onChange={(e) => set('official_url', e.target.value.replace(/\s/g, ''))}
            placeholder="https://yourcompany.com/careers/…"
          />
        </Field>
        <Field label="Application deadline" hint="Optional">
          <input type="date" min={todayIso()} className={inputCls} value={f.application_deadline} onChange={(e) => set('application_deadline', e.target.value)} />
        </Field>
      </Section>

      <Section title="Description">
        <div className="sm:col-span-2">
          <RichTextField value={f.description} onChange={(v) => set('description', v)} />
          <p className={`mt-1 text-right text-[11px] tabular-nums ${f.description.length > LISTING_LIMITS.description ? 'text-rose-600' : 'text-ink-400'}`}>
            {descLength.toLocaleString()} characters
          </p>
        </div>
      </Section>
    </FormShell>
  );
}

function PreviewRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div className="min-w-0">
        <dt className="text-[11px] font-medium text-ink-400">{label}</dt>
        <dd className={`truncate ${value ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>{value ?? 'Not listed'}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Program form
// ---------------------------------------------------------------------------

function ProgramForm({
  initial,
  countries,
  canPublish,
  onSave,
  onCancel,
}: {
  initial: SponsoredProgram | null;
  countries: CountryOption[];
  canPublish: boolean;
  onSave: (i: CompanyProgramInput) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<CompanyProgramInput>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? '',
    country_id: initial?.country_id ?? '',
    city: initial?.city ?? '',
    applications_open_at: initial?.applications_open_at ?? '',
    applications_close_at: initial?.applications_close_at ?? '',
    funding_text: initial?.funding_text ?? '',
    official_url: initial?.official_url ?? '',
    spots_available: initial?.spots_available != null ? String(initial.spots_available) : '',
  });
  const set = <K extends keyof CompanyProgramInput>(k: K, v: CompanyProgramInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const urlError = f.official_url && !validUrl(f.official_url) ? 'Use a full link starting with https://' : null;
  const dateError = f.applications_open_at && f.applications_close_at && f.applications_close_at < f.applications_open_at ? 'Closing date is before the opening date.' : null;
  const problems = [
    f.title.trim().length < 3 && 'Add a program title (at least 3 characters).',
    !f.category && 'Choose a category.',
    !f.official_url.trim() && 'Add the official link.',
    urlError,
    dateError,
    f.description.length > LISTING_LIMITS.description && 'The description is too long.',
  ].filter((p): p is string => Boolean(p));

  return (
    <FormShell
      title={initial ? 'Edit program' : 'New program'}
      onCancel={onCancel}
      problems={problems}
      canPublish={canPublish}
      onSubmit={() => onSave({ ...f, title: f.title.trim(), city: f.city.trim(), funding_text: f.funding_text.trim(), description: sanitizeJobHtml(f.description) })}
    >
      <Section title="The program">
        <Field label="Program title *" count={f.title} max={LISTING_LIMITS.title} wide>
          <input className={inputCls} value={f.title} maxLength={LISTING_LIMITS.title} onChange={(e) => set('title', cleanText(e.target.value, LISTING_LIMITS.title))} placeholder="e.g. Graduate Scholarship 2027" />
        </Field>
        <Field label="Category *" wide>
          <ChipChoice options={asOptions(PROGRAM_CATEGORIES)} value={f.category as (typeof PROGRAM_CATEGORIES)[number]} onChange={(v) => set('category', v)} />
        </Field>
        <Field label="Funding / benefits" count={f.funding_text} max={LISTING_LIMITS.funding}>
          <input className={inputCls} value={f.funding_text} maxLength={LISTING_LIMITS.funding} onChange={(e) => set('funding_text', cleanText(e.target.value, LISTING_LIMITS.funding))} placeholder="e.g. Full tuition + stipend" />
        </Field>
        <Field label="Spots available" hint="Optional">
          <input inputMode="numeric" className={inputCls} value={f.spots_available} onChange={(e) => set('spots_available', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="e.g. 20" />
        </Field>
      </Section>

      <Section title="Where & when">
        <Field label="Country">
          <CountrySelect countries={countries} value={f.country_id} onChange={(v) => set('country_id', v)} />
        </Field>
        <Field label="City" count={f.city} max={LISTING_LIMITS.city}>
          <input className={inputCls} value={f.city} maxLength={LISTING_LIMITS.city} onChange={(e) => set('city', cleanText(e.target.value, LISTING_LIMITS.city))} />
        </Field>
        <Field label="Applications open">
          <input type="date" className={inputCls} value={f.applications_open_at} onChange={(e) => set('applications_open_at', e.target.value)} />
        </Field>
        <Field label="Applications close" error={dateError}>
          <input type="date" min={f.applications_open_at || todayIso()} className={inputCls} value={f.applications_close_at} onChange={(e) => set('applications_close_at', e.target.value)} />
        </Field>
        <Field label="Official link *" count={f.official_url} max={LISTING_LIMITS.url} error={urlError} wide>
          <input className={inputCls} type="url" value={f.official_url} maxLength={LISTING_LIMITS.url} onChange={(e) => set('official_url', e.target.value.replace(/\s/g, ''))} placeholder="https://" />
        </Field>
      </Section>

      <Section title="Description">
        <div className="sm:col-span-2">
          <RichTextField value={f.description} onChange={(v) => set('description', v)} />
        </div>
      </Section>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Company page
// ---------------------------------------------------------------------------

const PAGE_LIMITS = { website: 200, email: 120, description: 1000 } as const;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function CompanyPagePanel({ publisher, userId, onSaved }: { publisher: ManagedPublisher; userId: string; onSaved: () => void }) {
  const [description, setDescription] = useState(publisher.description ?? '');
  const [website, setWebsite] = useState(publisher.website ?? '');
  const [logoUrl, setLogoUrl] = useState(publisher.logo_url ?? '');
  const [contactEmail, setContactEmail] = useState(publisher.contact_email ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Approved companies are locked: details change only through MadeVisa.
  const locked = publisher.verification_status === 'verified';

  useEffect(() => {
    setDescription(publisher.description ?? '');
    setWebsite(publisher.website ?? '');
    setLogoUrl(publisher.logo_url ?? '');
    setContactEmail(publisher.contact_email ?? '');
    setMsg(null);
  }, [publisher.id, publisher.description, publisher.website, publisher.logo_url, publisher.contact_email]);

  if (locked) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><BadgeCheck className="h-4 w-4" /> Approved company</p>
            <p className="mt-1 max-w-lg text-xs text-ink-500">
              Your company page is verified, so its details are locked to keep them trustworthy. To change anything, email us and we'll update it for you.
            </p>
          </div>
          <a
            href={changeRequestHref(publisher.name, 'company details')}
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            <Mail className="h-3.5 w-3.5" /> Request a change
          </a>
        </div>
        <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-ink-100 pt-5 text-sm sm:grid-cols-2">
          <ReadOnly label="Company name" value={publisher.name} />
          <ReadOnly label="Website" value={publisher.website} link />
          <ReadOnly label="Public contact email" value={publisher.contact_email} />
          <div>
            <dt className="text-[11px] font-semibold text-ink-400">Logo</dt>
            <dd className="mt-1">
              {publisher.logo_url ? <img src={publisher.logo_url} alt="" className="h-12 w-12 rounded border border-ink-200 object-contain p-1" /> : <span className="text-ink-400">Not added</span>}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold text-ink-400">About the company</dt>
            <dd className="mt-1 whitespace-pre-line text-ink-700">{publisher.description || <span className="text-ink-400">Not added</span>}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const websiteError = website && !validUrl(website) ? 'Use a full link starting with https://' : null;
  const emailError = contactEmail && !isEmail(contactEmail) ? 'Enter a valid email address.' : null;

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 sm:p-6">
      <p className="text-xs text-ink-500">
        This is how <strong>{publisher.name}</strong> appears on MadeVisa. The name is set by MadeVisa, and once your company is approved these details are locked — changes then go through{' '}
        <a href={`mailto:${CHANGE_REQUEST_EMAIL}`} className="font-semibold text-brand-700 hover:underline">{CHANGE_REQUEST_EMAIL}</a>.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Website" count={website} max={PAGE_LIMITS.website} error={websiteError}>
          <input className={inputCls} type="url" value={website} maxLength={PAGE_LIMITS.website} onChange={(e) => setWebsite(e.target.value.replace(/\s/g, ''))} placeholder="https://" />
        </Field>
        <Field label="Public contact email" count={contactEmail} max={PAGE_LIMITS.email} error={emailError}>
          <input className={inputCls} type="email" value={contactEmail} maxLength={PAGE_LIMITS.email} onChange={(e) => setContactEmail(e.target.value.replace(/\s/g, ''))} />
        </Field>
        <div className="sm:col-span-2"><ImageUploadField userId={userId} value={logoUrl} onChange={setLogoUrl} label="Logo" /></div>
        <Field label="About the company" count={description} max={PAGE_LIMITS.description} wide>
          <AutoGrowTextarea
            value={description}
            onChange={setDescription}
            max={PAGE_LIMITS.description}
            minRows={4}
            className="w-full rounded-md border border-ink-200 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </Field>
      </div>
      <button
        disabled={saving || Boolean(websiteError || emailError)}
        onClick={async () => {
          setSaving(true);
          const res = await updateManagedPublisher(publisher.id, {
            description: description.trim() || null,
            website: website.trim() || null,
            logo_url: logoUrl || null,
            contact_email: contactEmail.trim() || publisher.contact_email,
          });
          setSaving(false);
          setMsg(res.ok ? { tone: 'ok', text: 'Saved.' } : { tone: 'error', text: res.error ?? 'Could not save.' });
          if (res.ok) onSaved();
        }}
        className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save company page'}
      </button>
      {msg && <span className={`ml-3 text-xs ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
    </div>
  );
}

function ReadOnly({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-semibold text-ink-400"><Lock className="h-3 w-3" /> {label}</dt>
      <dd className="mt-1 truncate font-medium text-ink-900">
        {!value ? (
          <span className="font-normal text-ink-400">Not added</span>
        ) : link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{value.replace(/^https?:\/\//, '')}</a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team access (owners can invite; everyone can see who has access)
// ---------------------------------------------------------------------------

function TeamPanel({ publisher }: { publisher: ManagedPublisher }) {
  const [members, setMembers] = useState<PublisherMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchPublisherMembers(publisher.id).then(setMembers);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publisher.id]);

  const full = (members?.length ?? 0) >= LISTING_LIMITS.teamMembers;
  const clean = email.trim().toLowerCase();

  const add = async () => {
    setError(null);
    if (!isEmail(clean)) return setError('Enter a valid email address.');
    if (members?.some((m) => m.email === clean)) return setError('This person already has access.');
    setBusy(true);
    const r = await addPublisherMember(publisher.id, clean, false);
    setBusy(false);
    if (!r.ok) return setError(r.error?.replace(/^.*?ERROR:\s*/i, '') ?? 'Could not add.');
    setEmail('');
    load();
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-ink-500">People with these emails can manage {publisher.name}'s page, vacancies and programs after signing in to MadeVisa.</p>
        <span className="text-[11px] font-medium tabular-nums text-ink-400">{members?.length ?? 0} / {LISTING_LIMITS.teamMembers} people</span>
      </div>
      <div className="mt-3 divide-y divide-ink-100">
        {members === null && <p className="py-2 text-sm text-ink-400">Loading…</p>}
        {members?.length === 0 && <p className="py-2 text-sm text-ink-400">Only you so far.</p>}
        {members?.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{m.email}</span>
            <span className={`text-[11px] ${m.can_publish ? 'font-semibold text-emerald-700' : 'text-ink-400'}`}>{m.can_publish ? 'Trusted' : 'Reviewed'}</span>
            {publisher.is_owner && (
              <button
                onClick={async () => {
                  if (!window.confirm(`Remove ${m.email}'s access?`)) return;
                  await removePublisherMember(m.id);
                  load();
                }}
                className="text-ink-300 hover:text-rose-600"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {publisher.is_owner ? (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              type="email"
              maxLength={120}
              disabled={full}
              onChange={(e) => setEmail(e.target.value.replace(/\s/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder={full ? 'Team is full' : 'colleague@company.com'}
              className={inputCls}
            />
            <button
              onClick={add}
              disabled={full || busy || !clean}
              className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Add teammate
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
          <p className="mt-2 text-[11px] text-ink-400">
            Up to {LISTING_LIMITS.teamMembers} people and 5 invites a day. New teammates' listings are reviewed by MadeVisa; only MadeVisa can mark someone as trusted.
          </p>
        </>
      ) : (
        <p className="mt-4 text-[11px] text-ink-400">To add or remove teammates, ask your company's owner or contact MadeVisa at {CHANGE_REQUEST_EMAIL}.</p>
      )}
    </div>
  );
}
