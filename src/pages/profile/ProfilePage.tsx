import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Landmark, Loader2, Mail, Shield, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  createPublisherProfile,
  fetchMyPublisherProfile,
  resubmitPublisherProfile,
  PUBLISHING_CONTACT_EMAIL,
  type OrgType,
  type ProgramPublisher,
} from '@/lib/programs';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import { PhoneInput } from '@/components/common/PhoneInput';
import type { View } from '@/types';

type ProfilePageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

type CountryOption = { id: string; name: string; flag_emoji: string | null; iso_code: string };

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-500';

const roleLabel: Record<string, string> = {
  customer: 'Traveler',
  agency: 'Travel agency',
  admin: 'Admin',
};

export function ProfilePage({ go, onAuth }: ProfilePageProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [nationalityId, setNationalityId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [publisher, setPublisher] = useState<ProgramPublisher | null>(null);
  const [publisherLoading, setPublisherLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchMyPublisherProfile(user.id).then((p) => {
      setPublisher(p);
      setPublisherLoading(false);
    });
  }, [user]);

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji, iso_code').order('name').then(({ data }) => {
      if (data) setCountries(data as CountryOption[]);
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setCountryId((profile as unknown as { country_id: string | null }).country_id ?? '');
    setNationalityId(profile.nationality_country_id ?? '');
  }, [profile]);

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const residenceCountry = countries.find((c) => c.id === countryId);
  const isEmailConfirmed = Boolean(user?.email_confirmed_at);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
        country_id: countryId || null,
        nationality_country_id: nationalityId || null,
      })
      .eq('id', profile.id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleResendConfirmation = async () => {
    if (!profile.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: profile.email });
    setResending(false);
    if (!error) {
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
        <div className="flex items-center gap-4">
          <TravelerAvatar seed={profile.id} size={72} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">
              {profile.full_name || 'Your profile'}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
              <Shield className="h-3.5 w-3.5 text-brand-600" />
              {roleLabel[profile.role ?? 'customer']}
            </p>
          </div>
        </div>

        {!isEmailConfirmed && (
          <div className="mt-6 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Email not confirmed</p>
              <p className="mt-1 text-xs leading-5 text-amber-700">
                We sent a confirmation link to {profile.email}. Some features may be limited until you confirm it.
              </p>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resending}
                className="mt-2 text-xs font-semibold text-amber-800 underline hover:text-amber-900 disabled:opacity-50"
              >
                {resent ? 'Sent — check your inbox' : resending ? 'Sending…' : 'Resend confirmation email'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 border border-ink-200 bg-white p-6">
          <h2 className="text-sm font-bold text-ink-900">Your details</h2>
          <p className="mt-1 text-xs text-ink-500">This is the information you gave us when you signed up.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-ink-100 bg-ink-50 px-3 text-sm text-ink-500">
                <Mail className="h-4 w-4 text-ink-400" />
                {profile.email}
                {isEmailConfirmed && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />}
              </div>
            </div>

            <div>
              <label className={labelClass}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Country you're in</label>
                <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
                  <option value="">Select</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Citizenship</label>
                <select value={nationalityId} onChange={(e) => setNationalityId(e.target.value)} className={inputClass}>
                  <option value="">Select</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <PhoneInput countryIsoCode={residenceCountry?.iso_code} value={phone} onChange={setPhone} />
          </div>

          {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>

            {saved && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>

        <PartnerSection
          go={go}
          publisher={publisher}
          loading={publisherLoading}
          countries={countries}
          userId={user?.id}
          userEmail={user?.email ?? ''}
          onCreated={setPublisher}
        />
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

const orgTypeLabel: Record<OrgType, string> = {
  agency: 'Agency',
  company: 'Company',
  government: 'Government',
  expert: 'Independent expert',
};

const orgTypeIcon: Record<OrgType, typeof Building2> = {
  agency: Building2,
  company: Building2,
  government: Landmark,
  expert: UserRound,
};

const statusCopy: Record<ProgramPublisher['verification_status'], { label: string; className: string }> = {
  pending: { label: 'Pending review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Verified', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Not approved', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  suspended: { label: 'Suspended', className: 'bg-ink-100 text-ink-500 border-ink-200' },
};

function PartnerSection({
  go,
  publisher,
  loading,
  countries,
  userId,
  userEmail,
  onCreated,
}: {
  go: (view: View) => void;
  publisher: ProgramPublisher | null;
  loading: boolean;
  countries: CountryOption[];
  userId: string | undefined;
  userEmail: string;
  onCreated: (p: ProgramPublisher) => void;
}) {
  const [applying, setApplying] = useState<OrgType | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [website, setWebsite] = useState('');
  const [countryId, setCountryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  const canReapply = publisher && (publisher.verification_status === 'rejected' || publisher.verification_status === 'suspended');

  if (publisher && !resubmitting) {
    const Icon = orgTypeIcon[publisher.org_type];
    const status = statusCopy[publisher.verification_status];
    return (
      <div className="mt-6 border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-900">Partner status</h2>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-ink-50 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-ink-500">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{publisher.name}</p>
              <p className="text-xs text-ink-500">{orgTypeLabel[publisher.org_type]}</p>
            </div>
          </div>
          <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
        </div>
        {publisher.verification_status === 'pending' && (
          <p className="mt-3 text-xs text-ink-500">
            We'll email you once this is reviewed. Questions — {PUBLISHING_CONTACT_EMAIL}.
          </p>
        )}
        {publisher.verification_status === 'verified' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => go('submit-program')}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Submit a program
            </button>
            <button
              onClick={() => go('submit-program')}
              className="rounded-lg border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
            >
              Submit a job
            </button>
          </div>
        )}
        {canReapply && (
          <div className="mt-4">
            <p className="text-xs text-ink-500">
              {publisher.verification_status === 'suspended'
                ? "This partner account was suspended, but you're welcome to send another request."
                : "This request wasn't approved, but you're welcome to try again."}
            </p>
            <button
              onClick={() => {
                setOrgName(publisher.name);
                setWebsite(publisher.website ?? '');
                setCountryId(publisher.country_id ?? '');
                setResubmitting(true);
              }}
              className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Send another request
            </button>
          </div>
        )}
      </div>
    );
  }

  const submit = async () => {
    if (!orgName.trim()) {
      setError('Organization name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    if (resubmitting && publisher) {
      const updated = await resubmitPublisherProfile(publisher.id, { orgType: applying ?? publisher.org_type, name: orgName, website, countryId });
      setSubmitting(false);
      if (updated) { onCreated(updated); setResubmitting(false); }
      else setError('Something went wrong — please try again.');
      return;
    }

    if (!userId || !applying) {
      setSubmitting(false);
      return;
    }
    const created = await createPublisherProfile({ ownerId: userId, orgType: applying, name: orgName, website, countryId, contactEmail: userEmail });
    setSubmitting(false);
    if (created) onCreated(created);
    else setError('Something went wrong — please try again.');
  };

  return (
    <div className="mt-6 border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-bold text-ink-900">{resubmitting ? 'Send another request' : 'Become a partner'}</h2>
      {!resubmitting && (
        <p className="mt-1 text-xs text-ink-500">
          Apply to publish sponsored jobs or programs, or be listed as an independent visa expert. Reviewed before
          anything goes public.
        </p>
      )}

      {!applying ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(Object.keys(orgTypeLabel) as OrgType[]).map((type) => {
            const Icon = orgTypeIcon[type];
            return (
              <button
                key={type}
                onClick={() => setApplying(type)}
                className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-4 py-3 text-left text-sm font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50/40"
              >
                <Icon className="h-4 w-4 text-ink-400" />
                {orgTypeLabel[type]}
              </button>
            );
          })}
          {resubmitting && (
            <button
              onClick={() => setResubmitting(false)}
              className="col-span-full text-center text-xs font-semibold text-ink-500 hover:text-ink-800"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>{applying === 'expert' ? 'Your professional name' : 'Organization name'}</label>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Website (optional)</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Country</label>
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Submit for review
            </button>
            <button
              onClick={() => { setApplying(null); setResubmitting(false); }}
              className="text-xs font-semibold text-ink-500 hover:text-ink-800"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
