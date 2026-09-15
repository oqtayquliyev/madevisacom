import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Landmark, Loader2, Mail, Megaphone } from 'lucide-react';
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

type SubmitProgramPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-500';

export function SubmitProgramPage({ go, onAuth }: SubmitProgramPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [publisher, setPublisher] = useState<ProgramPublisher | null>(null);
  const [checkingPublisher, setCheckingPublisher] = useState(true);

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
          Publish a programme
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
              <p className="text-sm text-ink-600">Sign in or create an account to submit a programme.</p>
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
              countries={countries}
              onCreated={setPublisher}
            />
          ) : (
            <SubmitProgramForm publisher={publisher} countries={countries} />
          )}
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function CreatePublisherForm({
  userId,
  countries,
  onCreated,
}: {
  userId: string;
  countries: CountryOption[];
  onCreated: (p: ProgramPublisher) => void;
}) {
  const [orgType, setOrgType] = useState<OrgType>('government');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Organization name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const created = await createPublisherProfile({ ownerId: userId, orgType, name, website, countryId });
    setSubmitting(false);
    if (created) onCreated(created);
    else setError('Something went wrong — please try again.');
  };

  return (
    <div className="border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-bold text-ink-900">First, tell us about your organization</h2>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setOrgType('government')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
            orgType === 'government' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'
          }`}
        >
          <Landmark className="h-4 w-4" />
          Government
        </button>
        <button
          type="button"
          onClick={() => setOrgType('company')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
            orgType === 'company' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Company
        </button>
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
        Verification is handled by our team via {PUBLISHING_CONTACT_EMAIL} before your programs go public.
      </p>
    </div>
  );
}

function SubmitProgramForm({ publisher, countries }: { publisher: ProgramPublisher; countries: CountryOption[] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Scholarship');
  const [countryId, setCountryId] = useState('');
  const [citizenshipAny, setCitizenshipAny] = useState(true);
  const [citizenshipCodes, setCitizenshipCodes] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [funding, setFunding] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (submitted) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <h3 className="mt-3 text-sm font-bold text-emerald-900">Submitted for review</h3>
        <p className="mt-1 text-xs text-emerald-700">
          We'll reach out from {PUBLISHING_CONTACT_EMAIL} once it's verified and published.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-4 text-xs font-semibold text-emerald-700 underline"
        >
          Submit another programme
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await submitSponsoredProgram({
      publisherId: publisher.id,
      title,
      description,
      category,
      countryId,
      citizenshipAny,
      citizenshipAllowed: citizenshipAny
        ? undefined
        : citizenshipCodes.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
      minAge: minAge ? Number(minAge) : undefined,
      maxAge: maxAge ? Number(maxAge) : undefined,
      applicationsOpenAt: opensAt || undefined,
      applicationsCloseAt: closesAt || undefined,
      fundingText: funding,
      officialUrl: url,
    });

    setSubmitting(false);
    if (result.ok) {
      setSubmitted(true);
      setTitle(''); setDescription(''); setFunding(''); setUrl('');
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

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelClass}>Program title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. National STEM Scholarship" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {['Scholarship', 'Work & Travel', 'Exchange', 'Apprenticeship', 'Investor Program', 'Cultural Exchange', 'General'].map((c) => (
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
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-500">
            <input type="checkbox" checked={citizenshipAny} onChange={(e) => setCitizenshipAny(e.target.checked)} />
            Open to all citizenships
          </label>
          {!citizenshipAny && (
            <input
              value={citizenshipCodes}
              onChange={(e) => setCitizenshipCodes(e.target.value)}
              placeholder="Country codes, comma-separated (e.g. AZ, TR, GE)"
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Min age</label>
            <input type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Max age</label>
            <input type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Applications open</label>
            <input type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Applications close</label>
            <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Funding / stipend (optional)</label>
          <input value={funding} onChange={(e) => setFunding(e.target.value)} placeholder="e.g. Full tuition + $900/mo stipend" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Official program URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={inputClass} />
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
