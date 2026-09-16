import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import type { View } from '@/types';

type ProfilePageProps = {
  go: (view: View) => void;
};

type CountryOption = { id: string; name: string; flag_emoji: string | null };

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-500';

const roleLabel: Record<string, string> = {
  customer: 'Traveler',
  agency: 'Travel agency',
  admin: 'Admin',
};

export function ProfilePage({ go }: ProfilePageProps) {
  const { profile, refreshProfile } = useAuth();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalityId, setNationalityId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji').order('name').then(({ data }) => {
      if (data) setCountries(data as CountryOption[]);
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setNationalityId(profile.nationality_country_id ?? '');
  }, [profile]);

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} active="home" />

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

        <div className="mt-8 border border-ink-200 bg-white p-6">
          <h2 className="text-sm font-bold text-ink-900">Your details</h2>
          <p className="mt-1 text-xs text-ink-500">This is the information you gave us when you signed up.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-ink-100 bg-ink-50 px-3 text-sm text-ink-500">
                <Mail className="h-4 w-4 text-ink-400" />
                {profile.email}
              </div>
            </div>

            <div>
              <label className={labelClass}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+994 50 555 12 34" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Nationality</label>
              <select value={nationalityId} onChange={(e) => setNationalityId(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flag_emoji ?? ''} {c.name}
                  </option>
                ))}
              </select>
            </div>
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

      <LandingFooter go={go} />
    </div>
  );
}
