import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Landmark,
  Loader2,
  Mail,
  Shield,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
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

// NOTE: these fields (approval_status, is_public, is_expert,
// expert_approval_status, requested_role, requested_role_status,
// institution_name, rejection_reason, expert_rejection_reason,
// requested_role_rejection_reason) are added by the migration in
// supabase_migration.sql. Cast through `unknown` here the same way the
// file already does for `country_id`, until they're added to the real
// Profile type in `@/lib/auth`.
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type ExtendedProfile = {
  country_id: string | null;
  company_name: string | null;
  institution_name: string | null;
  approval_status: ApprovalStatus | null;
  is_public: boolean | null;
  rejection_reason: string | null;
  is_expert: boolean | null;
  expert_approval_status: ApprovalStatus | null;
  expert_rejection_reason: string | null;
  requested_role: 'agency' | 'government' | null;
  requested_role_status: ApprovalStatus | null;
  requested_role_org_name: string | null;
  requested_role_rejection_reason: string | null;
};

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-500';

const roleLabel: Record<string, string> = {
  customer: 'Traveler',
  agency: 'Agency / Company',
  government: 'Government institution',
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

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji, iso_code').order('name').then(({ data }) => {
      if (data) setCountries(data as CountryOption[]);
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setCountryId((profile as unknown as ExtendedProfile).country_id ?? '');
    setNationalityId(profile.nationality_country_id ?? '');
  }, [profile]);

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const ext = profile as unknown as ExtendedProfile;
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
              {ext.is_expert && ext.expert_approval_status === 'approved' && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
                  <Sparkles className="h-3 w-3" /> Verified expert
                </span>
              )}
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

        {(profile.role === 'agency' || profile.role === 'government') && (
          <ApprovalBanner
            role={profile.role}
            status={ext.approval_status ?? 'pending'}
            rejectionReason={ext.rejection_reason}
          />
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

        {profile.role === 'customer' && (
          <ExpertSection
            profileId={profile.id}
            isExpert={Boolean(ext.is_expert)}
            status={ext.expert_approval_status}
            rejectionReason={ext.expert_rejection_reason}
            onChanged={refreshProfile}
          />
        )}

        {profile.role === 'customer' && (
          <RoleSwitchSection
            profileId={profile.id}
            requestedRole={ext.requested_role}
            requestedStatus={ext.requested_role_status}
            rejectionReason={ext.requested_role_rejection_reason}
            onChanged={refreshProfile}
          />
        )}
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function ApprovalBanner({
  role,
  status,
  rejectionReason,
}: {
  role: 'agency' | 'government';
  status: ApprovalStatus;
  rejectionReason: string | null;
}) {
  const label = role === 'agency' ? 'agency / company' : 'government institution';

  if (status === 'approved') {
    return (
      <div className="mt-6 flex items-start gap-3 border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-emerald-900">Verified {label}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-700">
            Your profile is public. You can post sponsored jobs and programs.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="mt-6 flex items-start gap-3 border border-rose-200 bg-rose-50 p-4">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div>
          <p className="text-sm font-bold text-rose-900">Application not approved</p>
          <p className="mt-1 text-xs leading-5 text-rose-700">
            {rejectionReason || 'Please contact support for details, or update your information and reapply.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4">
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-bold text-amber-900">Pending review</p>
        <p className="mt-1 text-xs leading-5 text-amber-700">
          Your {label} account is under review. You'll be able to post jobs and programs publicly once approved.
        </p>
      </div>
    </div>
  );
}

function ExpertSection({
  profileId,
  isExpert,
  status,
  rejectionReason,
  onChanged,
}: {
  profileId: string;
  isExpert: boolean;
  status: ApprovalStatus | null;
  rejectionReason: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleApply = async () => {
    setSubmitting(true);
    await supabase
      .from('profiles')
      .update({ is_expert: true, expert_approval_status: 'pending' })
      .eq('id', profileId);
    setSubmitting(false);
    await onChanged();
  };

  return (
    <div className="mt-6 border border-ink-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-bold text-ink-900">Expert profile</h2>
      </div>
      <p className="mt-1 text-xs text-ink-500">
        Verified experts can appear in the Experts marketplace and be booked by travelers for paid advice.
      </p>

      {!isExpert && (
        <button
          type="button"
          onClick={handleApply}
          disabled={submitting}
          className="mt-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Apply to become a verified expert
        </button>
      )}

      {isExpert && status === 'pending' && (
        <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Clock className="h-3.5 w-3.5" /> Your expert application is under review.
        </p>
      )}

      {isExpert && status === 'approved' && (
        <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> You're a verified expert.
        </p>
      )}

      {isExpert && status === 'rejected' && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <XCircle className="h-3.5 w-3.5" /> Your expert application wasn't approved.
          </p>
          {rejectionReason && <p className="mt-1 text-xs text-ink-500">{rejectionReason}</p>}
          <button
            type="button"
            onClick={handleApply}
            disabled={submitting}
            className="mt-2 text-xs font-semibold text-brand-600 underline hover:text-brand-700 disabled:opacity-50"
          >
            Reapply
          </button>
        </div>
      )}
    </div>
  );
}

function RoleSwitchSection({
  profileId,
  requestedRole,
  requestedStatus,
  rejectionReason,
  onChanged,
}: {
  profileId: string;
  requestedRole: 'agency' | 'government' | null;
  requestedStatus: ApprovalStatus | null;
  rejectionReason: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [opening, setOpening] = useState<'agency' | 'government' | null>(null);
  const [orgName, setOrgName] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasPendingRequest = requestedStatus === 'pending';

  const handleSubmit = async () => {
    if (!opening) return;
    setSubmitting(true);
    await supabase
      .from('profiles')
      .update({
        requested_role: opening,
        requested_role_status: 'pending',
        requested_role_org_name: orgName,
        requested_role_website: website || null,
      })
      .eq('id', profileId);
    setSubmitting(false);
    setOpening(null);
    setOrgName('');
    setWebsite('');
    await onChanged();
  };

  if (hasPendingRequest) {
    return (
      <div className="mt-6 border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-900">Account type</h2>
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          Your request to become a {requestedRole === 'agency' ? 'agency / company' : 'government institution'} account is under review.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-bold text-ink-900">Account type</h2>
      <p className="mt-1 text-xs text-ink-500">
        Want to publish jobs or programs? Apply to switch this account to an agency/company or government profile. Reviewed before it becomes public.
      </p>

      {requestedStatus === 'rejected' && (
        <p className="mt-3 text-xs font-medium text-rose-600">
          Your last request wasn't approved{rejectionReason ? `: ${rejectionReason}` : '.'}
        </p>
      )}

      {!opening ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setOpening('agency')}
            className="flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:border-brand-300"
          >
            <Building2 className="h-3.5 w-3.5" /> Apply as agency / company
          </button>
          <button
            type="button"
            onClick={() => setOpening('government')}
            className="flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:border-brand-300"
          >
            <Landmark className="h-3.5 w-3.5" /> Apply as government institution
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>{opening === 'agency' ? 'Company name' : 'Institution name'}</label>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Website (optional)</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !orgName}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Submit for review
            </button>
            <button
              type="button"
              onClick={() => setOpening(null)}
              className="text-xs font-medium text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
