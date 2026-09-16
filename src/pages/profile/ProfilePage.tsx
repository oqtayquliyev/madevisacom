import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Shield } from 'lucide-react';
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
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
