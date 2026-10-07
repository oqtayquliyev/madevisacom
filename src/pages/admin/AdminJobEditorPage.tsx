import { ApplyChannelControl } from '@/components/apply/ApplyChannelControl';
import { useEffect, useState } from 'react';
import { jobPath } from '@/lib/jobUrl';
import { ArrowLeft, ExternalLink, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSeo } from '@/lib/seo';
import {
  fetchSponsoredJobByIdAsAdmin,
  updateSponsoredJobAsAdmin,
  deleteSponsoredJob,
  type AdminSponsoredJob,
} from '@/lib/admin';
import { fetchCountries, type CountryOption } from '@/lib/programs';
import {
  JOB_CATEGORIES,
  LISTING_STATUSES,
  SALARY_STATUSES,
  SALARY_PERIODS,
  type JobCategory,
  type ListingStatus,
  type SalaryStatus,
  type SalaryPeriod,
} from '@/lib/listingCategories';
import { RichTextField } from '@/components/admin/RichTextField';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import type { View } from '@/types';

type AdminJobEditorPageProps = {
  id: string;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

/**
 * The full editable job page requested alongside the grouped pending-jobs
 * panel — opened in its own browser tab (window.open('/admin/jobs/' + id))
 * from a "Preview & edit" button, rather than the small inline expand
 * EditableJobRow already does inside the admin panel's list. Same save
 * path (updateSponsoredJobAsAdmin), just with room for every field at
 * once and a real rich-text box for the description instead of a plain
 * textarea of raw HTML.
 */
export function AdminJobEditorPage({ id, go, onAuth }: AdminJobEditorPageProps) {
  useSeo({ title: 'Edit job', description: 'Admin job editor.', path: `/admin/jobs/${id}`, noindex: true });
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [job, setJob] = useState<AdminSponsoredJob | null | undefined>(undefined);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([fetchSponsoredJobByIdAsAdmin(id), fetchCountries()]).then(([j, c]) => {
      setJob(j);
      setCountries(c);
    });
  }, [id, isAdmin]);

  if (authLoading) return null;

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

  if (job === undefined) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="grid h-96 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <LandingHeader go={go} onAuth={onAuth} active="home" />
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-xl font-bold text-ink-900">Job not found</h1>
          <p className="mt-2 text-sm text-ink-500">It may have been deleted.</p>
          <button onClick={() => window.close()} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Close this tab
          </button>
        </div>
      </div>
    );
  }

  const set = <K extends keyof AdminSponsoredJob>(key: K, value: AdminSponsoredJob[K]) => {
    setJob((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async (statusOverride?: ListingStatus) => {
    setSaving(true);
    setError(null);
    const patch: Partial<AdminSponsoredJob> = { ...job };
    if (statusOverride) patch.status = statusOverride;
    // These are joined-in read-only display data, not real columns —
    // sending them back in the patch would either no-op or error
    // depending on the exact Postgres setup, so strip them out.
    delete (patch as Record<string, unknown>).publisher;
    delete (patch as Record<string, unknown>).country;
    delete (patch as Record<string, unknown>).id;

    const ok = await updateSponsoredJobAsAdmin(job.id, patch);
    setSaving(false);
    if (ok) {
      setSavedAt(Date.now());
      if (statusOverride) set('status', statusOverride);
    } else {
      setError('Save failed — please try again.');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${job.title}"? This can't be undone.`)) return;
    const result = await deleteSponsoredJob(job.id);
    if (result.ok) window.close();
    else window.alert(result.error ?? 'Delete failed.');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => window.close()} className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
            <ArrowLeft className="h-3.5 w-3.5" />
            Close
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {savedAt && <span className="text-xs font-medium text-emerald-700">Saved.</span>}
            {job.status === 'published' && (
              <a
                href={jobPath({ id: `sponsored-${job.id}`, title: job.title, company: job.publisher?.name ?? '' })}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View public page
              </a>
            )}
            <button onClick={remove} className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>

        <div className="mt-5 border border-ink-200 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-slab text-xl font-bold tracking-tight text-ink-950">Edit job</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {job.publisher?.name ?? 'Unknown publisher'}
            {job.official_url && (
              <>
                {' · '}
                <a href={job.official_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
                  Original source
                </a>
              </>
            )}
          </p>

          <div className="mt-6 space-y-5">
            <Section title="Basics">
              <Field label="Title">
                <TextInput value={job.title} onChange={(v) => set('title', v)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Employment type">
                  <Select
                    value={job.category as JobCategory}
                    onChange={(v) => {
                      set('category', v);
                      set('employment_type', v);
                    }}
                    options={JOB_CATEGORIES}
                  />
                </Field>
                <Field label="Job function / department (shown publicly, used for category filtering)">
                  <TextInput value={job.job_function ?? ''} onChange={(v) => set('job_function', v || null)} />
                </Field>
                <Field label="Status">
                  <Select value={job.status} onChange={(v) => set('status', v as ListingStatus)} options={LISTING_STATUSES.map((s) => s.value)} labels={Object.fromEntries(LISTING_STATUSES.map((s) => [s.value, s.label]))} />
                </Field>
              </div>
            </Section>

            <Section title="Description">
              <RichTextField value={job.description ?? ''} onChange={(html) => set('description', html)} />
            </Section>

            <Section title="Location & remote">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Country">
                  <select
                    value={job.country_id ?? ''}
                    onChange={(e) => set('country_id', e.target.value || null)}
                    className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
                  >
                    <option value="">Not set (shows as "Various")</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="City">
                  <TextInput value={job.city ?? ''} onChange={(v) => set('city', v || null)} />
                </Field>
              </div>
              <label className="mt-1 flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={job.remote} onChange={(e) => set('remote', e.target.checked)} />
                Remote
              </label>
              <Field label="Originally posted on source site">
                <input
                  type="date"
                  value={job.source_posted_at ? job.source_posted_at.slice(0, 10) : ''}
                  onChange={(e) => set('source_posted_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className="h-9 w-full max-w-[200px] rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
                />
              </Field>
            </Section>

            <Section title="Compensation">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Salary status">
                  <Select
                    value={job.salary_status}
                    onChange={(v) => set('salary_status', v as SalaryStatus)}
                    options={SALARY_STATUSES.map((s) => s.value)}
                    labels={Object.fromEntries(SALARY_STATUSES.map((s) => [s.value, s.label]))}
                  />
                </Field>
                <Field label="Period">
                  <Select value={job.salary_period} onChange={(v) => set('salary_period', v as SalaryPeriod)} options={SALARY_PERIODS} />
                </Field>
                <Field label="Min">
                  <NumberInput value={job.salary_min} onChange={(v) => set('salary_min', v)} />
                </Field>
                <Field label="Max">
                  <NumberInput value={job.salary_max} onChange={(v) => set('salary_max', v)} />
                </Field>
                <Field label="Currency">
                  <TextInput value={job.salary_currency} onChange={(v) => set('salary_currency', v)} />
                </Field>
                <Field label="Free-text (shown when set)">
                  <TextInput value={job.compensation_text ?? ''} onChange={(v) => set('compensation_text', v || null)} />
                </Field>
              </div>
            </Section>

            <Section title="Eligibility & requirements">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={job.visa_sponsorship} onChange={(e) => set('visa_sponsorship', e.target.checked)} />
                Visa sponsorship offered
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Experience level">
                  <TextInput value={job.experience_level ?? ''} onChange={(v) => set('experience_level', v || null)} />
                </Field>
                <Field label="Education level">
                  <TextInput value={job.education_level ?? ''} onChange={(v) => set('education_level', v || null)} />
                </Field>
              </div>
              <Field label="Languages (comma-separated)">
                <TextInput value={(job.languages ?? []).join(', ')} onChange={(v) => set('languages', v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null)} />
              </Field>
              <Field label="Application deadline">
                <input
                  type="date"
                  value={job.application_deadline ? job.application_deadline.slice(0, 10) : ''}
                  onChange={(e) => set('application_deadline', e.target.value || null)}
                  className="h-9 w-full max-w-[200px] rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
                />
              </Field>
              <Field label="Requirements">
                <TextArea value={job.requirements ?? ''} onChange={(v) => set('requirements', v || null)} />
              </Field>
              <Field label="Benefits">
                <TextArea value={job.benefits ?? ''} onChange={(v) => set('benefits', v || null)} />
              </Field>
            </Section>

            <Section title="Links">
              <Field label="Official listing URL">
                <TextInput value={job.official_url ?? ''} onChange={(v) => set('official_url', v || null)} />
              </Field>
              <Field label="Application URL (if different)">
                <TextInput value={job.application_url ?? ''} onChange={(v) => set('application_url', v || null)} />
              </Field>
            </Section>

            <Section title="Admin only">
              <ApplyChannelControl jobId={job.id} />
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={job.source_verified} onChange={(e) => set('source_verified', e.target.checked)} />
                Source verified
              </label>
              {job.status === 'needs_information' && (
                <Field label="Message to publisher">
                  <TextArea value={job.needs_info_message ?? ''} onChange={(v) => set('needs_info_message', v || null)} />
                </Field>
              )}
              <Field label="Internal notes (never shown publicly)">
                <TextArea value={job.admin_notes ?? ''} onChange={(v) => set('admin_notes', v || null)} />
              </Field>
            </Section>
          </div>

          {error && <p className="mt-4 text-xs font-medium text-rose-600">{error}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-6">
            <button onClick={() => save()} disabled={saving} className="rounded-lg bg-ink-900 px-4 py-2 text-xs font-semibold text-white hover:bg-ink-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={() => save('published')} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              Save & publish
            </button>
            {job.status !== 'rejected' && (
              <button onClick={() => save('rejected')} disabled={saving} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                Reject
              </button>
            )}
          </div>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
    />
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-brand-500"
    />
  );
}

function NumberInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500"
    />
  );
}

function Select<T extends string>({ value, onChange, options, labels }: { value: T; onChange: (v: T) => void; options: readonly T[]; labels?: Record<string, string> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-9 w-full rounded-md border border-ink-200 px-2 text-sm text-ink-900 outline-none focus:border-brand-500">
      {options.map((o) => (
        <option key={o} value={o}>{labels?.[o] ?? o}</option>
      ))}
    </select>
  );
}

function StatusBadge({ status }: { status: string }) {
  const found = LISTING_STATUSES.find((s) => s.value === status);
  return <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600">{found?.label ?? status}</span>;
}
