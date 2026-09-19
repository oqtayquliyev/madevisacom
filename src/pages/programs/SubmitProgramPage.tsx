import { useEffect, useState } from 'react';
import { Briefcase, Building2, CheckCircle2, GraduationCap, Landmark, Loader2, Mail, Megaphone, UserRound } from 'lucide-react';
import type { View } from '@/types';
import { useAuth } from '@/lib/auth';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import {
  createPublisherProfile,
  fetchCountries,
  fetchMyPublisherProfile,
  submitSponsoredProgram,
  PUBLISHING_CONTACT_EMAIL,
  type CountryOption,
  type OrgType,
  type ProgramPublisher,
} from '@/lib/programs';
import { submitSponsoredJob } from '@/lib/sponsoredJobs';
import { ImageUploadField } from '@/components/common/ImageUploadField';
import { useSeo } from '@/lib/seo';
import { JOB_CATEGORIES, PROGRAM_CATEGORIES, type JobCategory, type ProgramCategory } from '@/lib/listingCategories';

type SubmitProgramPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-500';

const orgTypeOptions: { type: OrgType; label: string; icon: typeof Building2 }[] = [
  { type: 'government', label: 'Government', icon: Landmark },
  { type: 'company', label: 'Company', icon: Building2 },
  { type: 'agency', label: 'Agency', icon: Building2 },
  { type: 'expert', label: 'Expert', icon: UserRound },
];

export function SubmitProgramPage({ go, onAuth }: SubmitProgramPageProps) {
  useSeo({ title: 'Submit a listing', description: 'Submit a sponsored job or program for review.', path: '/submit-program', noindex: true });
  const { user, loading: authLoading } = useAuth();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [publisher, setPublisher] = useState<ProgramPublisher | null>(null);
  const [checkingPublisher, setCheckingPublisher] = useState(true);
  const [listingType, setListingType] = useState<'program' | 'job'>('program');

  useEffect(() => {
    fetchCountries().then(setCountries);
  }, []);

  useEffect(() => {
    if (!user) {
      setCheckingPublisher(false);
      return;
    }
    fetchMyPublisherProfile(user.id).then((p) => {
      setPublisher(p);
      setCheckingPublisher(false);
    });
  }, [user]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="programs" />

      <main className="mx-auto max-w-2xl px-5 py-14 sm:px-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
          <Megaphone className="h-4 w-4" />
          Publish a listing
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-950">Reach eligible travelers directly.</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Submissions are reviewed before going live. Questions about publishing or pricing — reach us at{' '}
          <a href={`mailto:${PUBLISHING_CONTACT_EMAIL}`} className="font-semibold text-brand-600">
            {PUBLISHING_CONTACT_EMAIL}
          </a>
          .
        </p>

        <div className="mt-8">
          {authLoading || checkingPublisher ? (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !user ? (
            <div className="border border-ink-200 bg-white p-6 text-center">
              <p className="text-sm text-ink-600">Sign in or create an account to submit a listing.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button onClick={() => onAuth?.('login')} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  Sign in
                </button>
                <button onClick={() => onAuth?.('register')} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Create account
                </button>
              </div>
            </div>
          ) : !publisher ? (
            <CreatePublisherForm
              userId={user.id}
              userEmail={user.email ?? ''}
              countries={countries}
              onCreated={setPublisher}
            />
          ) : publisher.verification_status !== 'verified' ? (
            <div className="border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-sm font-semibold text-amber-900">
                {publisher.verification_status === 'pending' ? 'Your account is pending review' : 'Your account is not currently approved'}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                You'll be able to submit listings once {publisher.name} is verified. Questions — {PUBLISHING_CONTACT_EMAIL}.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setListingType('program')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                    listingType === 'program' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'
                  }`}
                >
                  <GraduationCap className="h-4 w-4" />
                  Program
                </button>
                <button
                  type="button"
                  onClick={() => setListingType('job')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                    listingType === 'job' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'
                  }`}
                >
                  <Briefcase className="h-4 w-4" />
                  Job
                </button>
              </div>
              {listingType === 'program' ? (
                <SubmitProgramForm publisher={publisher} countries={countries} />
              ) : (
                <SubmitJobForm publisher={publisher} countries={countries} />
              )}
            </>
          )}
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function CreatePublisherForm({
  userId,
  userEmail,
  countries,
  onCreated,
}: {
  userId: string;
  userEmail: string;
  countries: CountryOption[];
  onCreated: (p: ProgramPublisher) => void;
}) {
  const [orgType, setOrgType] = useState<OrgType>('government');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Organization name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const created = await createPublisherProfile({ ownerId: userId, orgType, name, website, countryId, contactEmail: userEmail, logoUrl });
    setSubmitting(false);
    if (created) onCreated(created);
    else setError('Something went wrong — please try again.');
  };

  return (
    <div className="border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-bold text-ink-900">First, tell us about your organization</h2>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {orgTypeOptions.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => setOrgType(type)}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-semibold ${
              orgType === type ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelClass}>Organization name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ministry of Education" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Country</label>
          <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
            <option value="">Select</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <ImageUploadField userId={userId} value={logoUrl} onChange={setLogoUrl} label="Official logo (optional)" />
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-5 flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Continue
      </button>

      <p className="mt-3 text-[11px] text-ink-400">
        Verification is handled by our team via {PUBLISHING_CONTACT_EMAIL} before your listings go public.
      </p>
    </div>
  );
}
/**
 * Large textarea with a live character counter instead of a hard,
 * silent cutoff — pasting long text is never truncated without the
 * person seeing exactly what's happening.
 */
function CharLimitedTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  rows?: number;
}) {
  const remaining = maxLength - value.length;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className={labelClass.replace('mb-1.5 ', '')}>{label}</label>
        <span className={`text-[11px] font-medium ${remaining < 0 ? 'text-rose-600' : 'text-ink-400'}`}>
          {remaining < 0 ? `${Math.abs(remaining)} over limit` : `${remaining} characters left`}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm font-medium leading-6 text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

function SubmitProgramForm({ publisher, countries }: { publisher: ProgramPublisher; countries: CountryOption[] }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProgramCategory>('Scholarship');
  const [countryId, setCountryId] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (submitted) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <h3 className="mt-3 text-sm font-bold text-emerald-900">Submitted for review</h3>
        <p className="mt-1 text-xs text-emerald-700">
          Our team will follow up at {publisher.contact_email} if we need anything else before it goes live.
        </p>
        <button type="button" onClick={() => setSubmitted(false)} className="mt-4 text-xs font-semibold text-emerald-700 underline">
          Submit another program
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!title.trim()) return setError('Program title is required.');
    if (!countryId) return setError('Destination country is required.');
    if (description.length > 800) return setError('Description is over the character limit — please shorten it.');

    setSubmitting(true);
    setError(null);

    const result = await submitSponsoredProgram({
      publisherId: publisher.id,
      title,
      description,
      category,
      countryId,
      city: city || undefined,
      citizenshipAny: true,
      officialUrl,
      contactEmail: publisher.contact_email,
    });

    setSubmitting(false);
    if (result.ok) {
      setSubmitted(true);
      setTitle(''); setDescription(''); setCity(''); setOfficialUrl('');
    } else {
      setError(result.error ?? 'Something went wrong — please try again.');
    }
  };

  return (
    <div className="border border-ink-200 bg-white p-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Publishing as {publisher.name} ({publisher.org_type})
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Just the essentials for now — our team will reach out to fill in the rest and verify everything before it goes live.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelClass}>Program title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DAAD Scholarship for Master's Students" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ProgramCategory)} className={inputClass}>
              {PROGRAM_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Destination country</label>
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>City (optional)</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Leave blank if nationwide" className={inputClass} />
        </div>

        <CharLimitedTextarea
          label="Short description"
          value={description}
          onChange={setDescription}
          placeholder="A couple of sentences on what this program offers and who it's for."
          maxLength={800}
          rows={4}
        />

        <div>
          <label className={labelClass}>Official source URL (optional)</label>
          <input type="url" value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://" className={inputClass} />
          <p className="mt-1 text-[11px] text-ink-400">Helps us verify faster — a government page, university page, or your own program page.</p>
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-5 flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Submit for review
      </button>
    </div>
  );
}

function SubmitJobForm({ publisher, countries }: { publisher: ProgramPublisher; countries: CountryOption[] }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<JobCategory>('Full time');
  const [countryId, setCountryId] = useState('');
  const [city, setCity] = useState('');
  const [remote, setRemote] = useState(false);
  const [description, setDescription] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (submitted) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <h3 className="mt-3 text-sm font-bold text-emerald-900">Submitted for review</h3>
        <p className="mt-1 text-xs text-emerald-700">
          Our team will follow up at {publisher.contact_email} if we need anything else before it goes live.
        </p>
        <button type="button" onClick={() => setSubmitted(false)} className="mt-4 text-xs font-semibold text-emerald-700 underline">
          Submit another job
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!title.trim()) return setError('Job title is required.');
    if (!countryId && !remote) return setError('Destination country is required (or mark it remote).');
    if (description.length > 800) return setError('Description is over the character limit — please shorten it.');

    setSubmitting(true);
    setError(null);

    const result = await submitSponsoredJob({
      publisherId: publisher.id,
      title,
      description,
      category,
      employmentType: category,
      remote,
      countryId,
      city: city || undefined,
      citizenshipAny: true,
      officialUrl,
      contactEmail: publisher.contact_email,
    });

    setSubmitting(false);
    if (result.ok) {
      setSubmitted(true);
      setTitle(''); setDescription(''); setCity(''); setOfficialUrl('');
    } else {
      setError(result.error ?? 'Something went wrong — please try again.');
    }
  };

  return (
    <div className="border border-ink-200 bg-white p-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Publishing as {publisher.name} ({publisher.org_type})
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Just the essentials for now — our team will reach out to fill in the rest (salary, requirements, etc.) and verify everything before it goes live.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelClass}>Job title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Junior Software Engineer" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as JobCategory)} className={inputClass}>
              {JOB_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Destination country</label>
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className={labelClass}>City (optional)</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Leave blank if not applicable" className={inputClass} />
          </div>
          <label className="flex shrink-0 items-center gap-2 pt-5 text-sm font-medium text-ink-700">
            <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
            Remote-friendly
          </label>
        </div>

        <CharLimitedTextarea
          label="Short description"
          value={description}
          onChange={setDescription}
          placeholder="A couple of sentences on the role and who it's a good fit for."
          maxLength={800}
          rows={4}
        />

        <div>
          <label className={labelClass}>Official source / application URL (optional)</label>
          <input type="url" value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://" className={inputClass} />
          <p className="mt-1 text-[11px] text-ink-400">Helps us verify faster — your job posting or careers page.</p>
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-5 flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Submit for review
      </button>
    </div>
  );
}
