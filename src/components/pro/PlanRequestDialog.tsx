import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { allCountries } from '@/data/allCountries';
import { EXPERIENCE_OPTIONS, PLAN_NAME, submitPlanRequest, type Billing, type PlanId, type PriceRegion } from '@/lib/plans';

// Plan request form. No card needed: hello@madevisa.com gets the request
// and replies with a secure payment link. For Pro it also fills in the
// profile details matching needs (role, specialization, experience,
// passport, target country) and saves them to the person's profile.

const input = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
const PERSONAL: PlanId[] = ['pro', 'relocation'];

async function countryIdFor(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const { data } = await supabase.from('countries').select('id').eq('iso_code', code).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
async function countryCodeFor(id: string | null | undefined): Promise<string> {
  if (!id) return '';
  const { data } = await supabase.from('countries').select('iso_code').eq('id', id).maybeSingle();
  return (data as { iso_code: string } | null)?.iso_code ?? '';
}

export function PlanRequestDialog({
  plan,
  billing,
  priceLabel,
  region,
  onClose,
  onAuth,
}: {
  plan: PlanId;
  billing: Billing;
  priceLabel: string;
  region: PriceRegion;
  onClose: () => void;
  onAuth?: (page: 'login' | 'register') => void;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const personal = PERSONAL.includes(plan);
  const [f, setF] = useState({
    name: profile?.full_name ?? '',
    email: profile?.email ?? user?.email ?? '',
    company: '',
    occupation: profile?.occupation ?? '',
    specialization: profile?.specialization ?? '',
    experience: profile?.experience ?? '',
    passport: '',
    target: '',
    message: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (p: Partial<typeof f>) => setF((cur) => ({ ...cur, ...p }));
  const countries = useMemo(() => [...allCountries].sort((a, b) => a.name.localeCompare(b.name)), []);

  useEffect(() => {
    let alive = true;
    Promise.all([countryCodeFor(profile?.nationality_country_id), countryCodeFor(profile?.preferred_destination_country_id)]).then(([p, t]) => {
      if (alive) setF((cur) => ({ ...cur, passport: cur.passport || p, target: cur.target || t }));
    });
    return () => {
      alive = false;
    };
  }, [profile?.nationality_country_id, profile?.preferred_destination_country_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setErr(null);
    if (!f.email.trim()) return setErr('Add your email so we can send the payment link.');
    if (personal && (!f.occupation.trim() || !f.experience || !f.passport)) return setErr('Please add your role, experience and passport — alerts and visa matching use them.');
    setBusy(true);
    const res = await submitPlanRequest({
      plan,
      billing,
      priceLabel,
      region,
      email: f.email,
      name: f.name,
      company: f.company,
      countryCode: f.passport || null,
      occupation: f.occupation,
      specialization: f.specialization,
      experience: f.experience,
      targetCountries: f.target ? [f.target] : [],
      message: f.message,
    });
    if (res.ok && user && personal) {
      // Save the matching details to the profile too.
      const [nat, dest] = await Promise.all([countryIdFor(f.passport), countryIdFor(f.target)]);
      await supabase
        .from('profiles')
        .update({
          occupation: f.occupation.trim() || null,
          specialization: f.specialization.trim() || null,
          experience: f.experience || null,
          ...(nat ? { nationality_country_id: nat } : {}),
          ...(dest ? { preferred_destination_country_id: dest } : {}),
        })
        .eq('id', user.id);
      void refreshProfile();
    }
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Get ${PLAN_NAME[plan]}`}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-ink-950">{PLAN_NAME[plan]}</p>
            <p className="text-sm text-ink-500">{priceLabel}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 text-lg font-bold text-ink-950">Request received</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-ink-600">
              We’ll email <strong>{f.email}</strong> a secure payment link within one working day{personal && user ? ', and your plan turns on as soon as it’s paid' : ''}.
            </p>
            <button onClick={onClose} className="mt-5 rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white">
              Done
            </button>
          </div>
        ) : personal && !user ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm leading-6 text-ink-700">Pro is linked to your MadeVisa account — alerts, visa matching and tracking all use your profile. Create a free account first; it takes a minute.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => onAuth?.('register')} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Create account
              </button>
              <button onClick={() => onAuth?.('login')} className="rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Sign in
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-700">
                Name
                <input className={`${input} mt-1`} value={f.name} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-ink-700">
                Email
                <input type="email" className={`${input} mt-1`} value={f.email} onChange={(e) => set({ email: e.target.value })} />
              </label>
            </div>
            {!personal && (
              <label className="block text-xs font-medium text-ink-700">
                Company
                <input className={`${input} mt-1`} value={f.company} onChange={(e) => set({ company: e.target.value })} />
              </label>
            )}
            {personal && (
              <>
                <p className="pt-1 text-xs font-semibold text-ink-500">Your profile — used for job alerts and visa matching</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-ink-700">
                    Role you’re looking for
                    <input className={`${input} mt-1`} placeholder="e.g. Accountant" value={f.occupation} onChange={(e) => set({ occupation: e.target.value })} />
                  </label>
                  <label className="text-xs font-medium text-ink-700">
                    Specialization
                    <input className={`${input} mt-1`} placeholder="e.g. IFRS reporting" value={f.specialization} onChange={(e) => set({ specialization: e.target.value })} />
                  </label>
                  <label className="text-xs font-medium text-ink-700">
                    Experience
                    <select className={`${input} mt-1`} value={f.experience} onChange={(e) => set({ experience: e.target.value })}>
                      <option value="">Choose…</option>
                      {EXPERIENCE_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-ink-700">
                    Passport
                    <select className={`${input} mt-1`} value={f.passport} onChange={(e) => set({ passport: e.target.value })}>
                      <option value="">Choose…</option>
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-ink-700 sm:col-span-2">
                    Country you want to work in
                    <select className={`${input} mt-1`} value={f.target} onChange={(e) => set({ target: e.target.value })}>
                      <option value="">Anywhere</option>
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
            <label className="block text-xs font-medium text-ink-700">
              Anything we should know? (optional)
              <textarea className={`${input} mt-1`} rows={2} value={f.message} onChange={(e) => set({ message: e.target.value })} />
            </label>
            {err && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{err}</p>}
            <button onClick={() => void submit()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request {PLAN_NAME[plan]}
            </button>
            <p className="text-center text-xs text-ink-500">No card needed now — we email you a secure payment link.</p>
          </div>
        )}
      </div>
    </div>
  );
}
