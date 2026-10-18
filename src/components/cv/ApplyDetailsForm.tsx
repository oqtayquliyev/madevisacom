// The details an application needs that a CV often lacks (or that we can't be sure of from it):
// name, phone, where they live, citizenship, LinkedIn. Asked once on /cv-match, saved to the MadeVisa profile —
// Auto Apply and the sponsorship documents read them from there, so nobody has to email the person for them.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, UserRoundCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { usePersonalization } from '@/lib/personalization';
import { nameFromCv } from '@/components/cv/CvInsights';
import type { StoredCv } from '@/lib/cv/store';

type Country = { id: string; name: string; flag_emoji: string | null; iso_code: string };

const PHONE = /(?:\+|00)\d[\d\s().-]{7,18}\d/;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i;

const field = 'mt-1 h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export function ApplyDetailsForm({ cv, paid }: { cv: StoredCv; paid: boolean }) {
  const { user, profile, refreshProfile } = useAuth();
  const { profile: visitor } = usePersonalization();
  const [countries, setCountries] = useState<Country[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [live, setLive] = useState('');
  const [citizen, setCitizen] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void supabase
      .from('countries')
      .select('id, name, flag_emoji, iso_code')
      .order('name')
      .then(({ data }) => setCountries((data ?? []) as Country[]));
  }, []);

  // Start from what we already know: the profile first, then the CV, then the visitor's location.
  useEffect(() => {
    if (!profile) return;
    const iso = (code: string | null | undefined) => (code ? countries.find((c) => c.iso_code?.toUpperCase() === code.toUpperCase())?.id ?? '' : '');
    setName((v) => v || profile.full_name?.trim() || nameFromCv(cv.text) || '');
    setPhone((v) => v || profile.phone?.trim() || cv.text.match(PHONE)?.[0]?.trim() || '');
    setLive((v) => v || profile.country_id || iso(visitor.currentLocation));
    setCitizen((v) => v || profile.nationality_country_id || iso(visitor.citizenship));
    setLinkedin((v) => v || profile.linkedin_url?.trim() || cv.text.match(LINKEDIN)?.[0] || '');
  }, [profile, cv.text, countries, visitor.currentLocation, visitor.citizenship]);

  const missing = useMemo(() => {
    if (!profile) return [];
    return [
      !profile.full_name?.trim() && 'name',
      !profile.phone?.trim() && 'phone',
      !profile.country_id && 'country',
      !profile.nationality_country_id && 'citizenship',
    ].filter(Boolean) as string[];
  }, [profile]);

  if (!user || !profile) return null;
  if (saved) {
    return (
      <p className="mx-auto flex max-w-3xl items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-[14.5px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
        <CheckCircle2 className="h-5 w-5" aria-hidden /> Saved to your profile — used for your applications and sponsorship documents.
      </p>
    );
  }
  if (!missing.length) return null;

  const save = async () => {
    if (name.trim().length < 2) return setError('Please write your full name.');
    if (phone.replace(/\D/g, '').length < 7) return setError('Please write your phone number, with the country code.');
    if (!live || !citizen) return setError('Please choose where you live and your citizenship.');
    if (linkedin.trim() && !LINKEDIN.test(linkedin.trim())) return setError('The LinkedIn link should look like linkedin.com/in/your-name.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: phone.trim(), country_id: live, nationality_country_id: citizen, ...(linkedin.trim() ? { linkedin_url: linkedin.trim() } : {}) })
      .eq('id', user.id);
    setBusy(false);
    if (err) return setError('Couldn’t save just now. Please try again.');
    await refreshProfile();
    setSaved(true);
  };

  const options = countries.map((c) => (
    <option key={c.id} value={c.id}>
      {c.flag_emoji ? `${c.flag_emoji} ` : ''}
      {c.name}
    </option>
  ));

  return (
    <section id="apply-details" className="mx-auto max-w-3xl rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-200 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-indigo-100 text-brand-700 ring-1 ring-brand-200">
          <UserRoundCheck className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <h2 className="text-[19px] font-bold leading-snug text-ink-950">{paid ? 'Complete your details for Auto Apply' : 'Complete your details for your applications'}</h2>
          <p className="mt-0.5 text-[14px] font-medium text-ink-600">Employers need these, and your CV doesn’t show all of them. One minute, once.</p>
        </div>
      </div>
      <form
        className="mt-5 grid gap-3.5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block">
          <span className="text-[13.5px] font-semibold text-ink-800">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
        </label>
        <label className="block">
          <span className="text-[13.5px] font-semibold text-ink-800">Phone (with country code)</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+994 50 123 45 67" className={field} />
        </label>
        <label className="block">
          <span className="text-[13.5px] font-semibold text-ink-800">Where you live now</span>
          <select value={live} onChange={(e) => setLive(e.target.value)} className={field}>
            <option value="">Choose a country</option>
            {options}
          </select>
        </label>
        <label className="block">
          <span className="text-[13.5px] font-semibold text-ink-800">Citizenship</span>
          <select value={citizen} onChange={(e) => setCitizen(e.target.value)} className={field}>
            <option value="">Choose a country</option>
            {options}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[13.5px] font-semibold text-ink-800">
            LinkedIn <span className="font-medium text-ink-500">(optional)</span>
          </span>
          <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} type="url" placeholder="linkedin.com/in/your-name" className={field} />
        </label>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 sm:col-span-2">{error}</p>}
        <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 text-[15.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:col-span-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save to my profile
        </button>
        <p className="text-center text-[12.5px] text-ink-500 sm:col-span-2">Shared with an employer only when you apply to their job.</p>
      </form>
    </section>
  );
}
