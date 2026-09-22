import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown, Landmark, Search, Sparkles, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleNavClick } from '@/lib/navLink';
import { PhoneInput } from '@/components/common/PhoneInput';
import { AuthCard, BackButton, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/auth/AuthUI';
import { Turnstile } from '@/components/auth/Turnstile';
import { useSeo } from '@/lib/seo';

type Country = { id: string; name: string; flag_emoji: string | null; iso_code: string };
type Role = 'customer' | 'agency' | 'government' | null;

const MIN_PASSWORD_LENGTH = 8;

/** Shared minimum across every signup flow in this file. Returns an
 *  error message, or null if the password is acceptable. Client-side
 *  UX only — Supabase Auth's own configured minimum is the real
 *  enforcement boundary and should be set to match. */
function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export type PendingSignup = {
  email: string;
  fullName: string;
  phone: string;
  countryName: string | null;
  nationalityName: string | null;
  role: 'customer' | 'agency' | 'government';
};

type RegisterPageProps = {
  onSwitchToLogin: () => void;
  onHome?: () => void;
  /** Called instead of showing a blocking "check your email" screen,
   *  when signup succeeds but no session was returned (confirmation
   *  required). The caller navigates to a pending-confirmation view
   *  that shows this data. */
  onPendingConfirmation: (info: PendingSignup) => void;
};

export function RegisterPage({ onSwitchToLogin, onHome, onPendingConfirmation }: RegisterPageProps) {
  useSeo({ title: 'Create account', description: 'Create your MadeVisa account.', path: '/register', noindex: true });
  const [role, setRole] = useState<Role>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji, iso_code').order('name').then(({ data }) => {
      if (data) setCountries(data as Country[]);
    });
  }, []);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  return (
    <AuthCard title="Create your MadeVisa account" subtitle="Choose your path to get started." onHome={onHome} showSidePanel>
      <ErrorBanner message={error} />
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <Divider label="or" />
      {!role ? (
        <div className="space-y-3">
          <button
            onClick={() => setRole('customer')}
            className="relative flex w-full items-center gap-4 rounded-2xl border-2 border-brand-500 bg-brand-50/40 p-4 text-left shadow-soft transition hover:shadow-soft-lg"
          >
            <span className="absolute -top-2.5 right-4 flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              <Sparkles className="h-2.5 w-2.5" />
              Most popular
            </span>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><UserRound className="h-6 w-6" /></span>
            <div>
              <p className="font-semibold text-ink-900">Explore opportunities</p>
              <p className="mt-0.5 text-sm text-ink-500">Jobs, programs, and visa paths abroad — track requirements, get agency help.</p>
            </div>
          </button>
          <button
            onClick={() => setRole('agency')}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-soft transition hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="h-6 w-6" /></span>
            <div>
              <p className="font-semibold text-ink-900">I'm an agency / company</p>
              <p className="mt-0.5 text-sm text-ink-500">Manage customers, trips, and post sponsored jobs or programs.</p>
            </div>
          </button>
          <button
            onClick={() => setRole('government')}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-soft transition hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Landmark className="h-6 w-6" /></span>
            <div>
              <p className="font-semibold text-ink-900">I'm a government institution</p>
              <p className="mt-0.5 text-sm text-ink-500">Promote official programs, visas and opportunities.</p>
            </div>
          </button>
          <p className="text-center text-[11px] text-ink-400">
            Agency, company and government accounts are reviewed before their listings go public.
          </p>
        </div>
      ) : role === 'customer' ? (
        <CustomerForm countries={countries} onBack={() => setRole(null)} onError={setError} onPendingConfirmation={onPendingConfirmation} />
      ) : role === 'agency' ? (
        <AgencyForm countries={countries} onBack={() => setRole(null)} onError={setError} onPendingConfirmation={onPendingConfirmation} />
      ) : (
        <GovernmentForm countries={countries} onBack={() => setRole(null)} onError={setError} onPendingConfirmation={onPendingConfirmation} />
      )}
      <div className="mt-5 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <a
          href="/login"
          onClick={(event) => handleNavClick(event, onSwitchToLogin)}
          className="font-semibold text-brand-600 hover:text-brand-700"
        >
          Sign in
        </a>
      </div>
    </AuthCard>
  );
}

function CustomerForm({
  countries,
  onBack,
  onError,
  onPendingConfirmation,
}: {
  countries: Country[];
  onBack: () => void;
  onError: (msg: string) => void;
  onPendingConfirmation: (info: PendingSignup) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [nationalitySameAsCountry, setNationalitySameAsCountry] = useState(true);
  const [nationalityId, setNationalityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  const country = countries.find((c) => c.id === countryId) ?? null;
  const effectiveNationalityId = nationalitySameAsCountry ? countryId : nationalityId;

  const handleSubmit = async () => {
    const pwError = passwordError(password);
    if (pwError) {
      onError(pwError);
      return;
    }

    if (!captchaToken) {
      onError('Please complete the verification below.');
      return;
    }

    setLoading(true);
    onError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: {
          role: 'customer',
          full_name: fullName,
          phone: phone || null,
          country_id: countryId || null,
          nationality_country_id: effectiveNationalityId || null,
        },
      },
    });

    setLoading(false);

    if (error) {
      onError(error.message.includes('already') ? 'An account with this email already exists.' : error.message);
      return;
    }

    if (!data.session) {
      const nationalityCountry = countries.find((c) => c.id === effectiveNationalityId) ?? null;
      onPendingConfirmation({
        email,
        fullName,
        phone,
        countryName: country?.name ?? null,
        nationalityName: nationalityCountry?.name ?? null,
        role: 'customer',
      });
    }
    // If a session WAS returned (email confirmation disabled), the
    // AuthProvider's onAuthStateChange listener picks it up automatically.
  };

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />
      <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" required autoComplete="new-password" />
      <CountrySelect label="Country (optional)" countries={countries} value={countryId} onChange={setCountryId} />
      <PhoneInput countryIsoCode={country?.iso_code} value={phone} onChange={setPhone} />

      <label className="flex items-center gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          checked={nationalitySameAsCountry}
          onChange={(e) => setNationalitySameAsCountry(e.target.checked)}
          className="h-4 w-4 rounded border-ink-300"
        />
        My nationality is the same as my country
      </label>

      {!nationalitySameAsCountry && (
        <CountrySelect label="Nationality / citizenship" countries={countries} value={nationalityId} onChange={setNationalityId} />
      )}

      <Turnstile onVerify={setCaptchaToken} />
      <PrimaryButton onClick={handleSubmit} loading={loading} disabled={!captchaToken}>Create account</PrimaryButton>
    </div>
  );
}

function AgencyForm({
  countries,
  onBack,
  onError,
  onPendingConfirmation,
}: {
  countries: Country[];
  onBack: () => void;
  onError: (msg: string) => void;
  onPendingConfirmation: (info: PendingSignup) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  const country = countries.find((c) => c.id === countryId) ?? null;

  const handleSubmit = async () => {
    const pwError = passwordError(password);
    if (pwError) {
      onError(pwError);
      return;
    }

    if (!captchaToken) {
      onError('Please complete the verification below.');
      return;
    }

    setLoading(true);
    onError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: {
          role: 'agency',
          full_name: fullName,
          phone: phone || null,
          country_id: countryId || null,
          company_name: companyName,
          country: country?.name ?? null,
          city: city || null,
          website: website || null,
        },
      },
    });

    setLoading(false);

    if (error) {
      onError(error.message.includes('already') ? 'An account with this email already exists.' : error.message);
      return;
    }

    if (!data.session) {
      onPendingConfirmation({
        email,
        fullName,
        phone,
        countryName: country?.name ?? null,
        nationalityName: null,
        role: 'agency',
      });
    }
  };

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />
      <Input label="Contact person name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Company name" value={companyName} onChange={setCompanyName} placeholder="Your travel agency" required />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="agency@example.com" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" required autoComplete="new-password" />
      <CountrySelect label="Country" countries={countries} value={countryId} onChange={setCountryId} />
      <PhoneInput countryIsoCode={country?.iso_code} value={phone} onChange={setPhone} required />
      <Input label="City" value={city} onChange={setCity} placeholder="Baku" required />
      <Input label="Website (optional)" value={website} onChange={setWebsite} placeholder="https://youragency.com" />
      <Turnstile onVerify={setCaptchaToken} />
      <PrimaryButton onClick={handleSubmit} loading={loading} disabled={!captchaToken}>Create agency account</PrimaryButton>
    </div>
  );
}

function GovernmentForm({
  countries,
  onBack,
  onError,
  onPendingConfirmation,
}: {
  countries: Country[];
  onBack: () => void;
  onError: (msg: string) => void;
  onPendingConfirmation: (info: PendingSignup) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  const country = countries.find((c) => c.id === countryId) ?? null;

  const handleSubmit = async () => {
    const pwError = passwordError(password);
    if (pwError) {
      onError(pwError);
      return;
    }

    if (!captchaToken) {
      onError('Please complete the verification below.');
      return;
    }

    setLoading(true);
    onError('');

    // role stays 'customer' — a government account's ability to
    // publish is entirely governed by the pending program_publishers
    // row this creates (see the handle_new_user trigger), reviewed
    // from the admin panel before anything goes public.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: {
          role: 'customer',
          full_name: fullName,
          phone: phone || null,
          country_id: countryId || null,
          publisher_org_type: 'government',
          company_name: orgName,
          website: website || null,
        },
      },
    });

    setLoading(false);

    if (error) {
      onError(error.message.includes('already') ? 'An account with this email already exists.' : error.message);
      return;
    }

    if (!data.session) {
      onPendingConfirmation({
        email,
        fullName,
        phone,
        countryName: country?.name ?? null,
        nationalityName: null,
        role: 'government',
      });
    }
  };

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />
      <Input label="Contact person name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Ministry / institution name" value={orgName} onChange={setOrgName} placeholder="e.g. Ministry of Labor" required />
      <Input label="Official email" type="email" value={email} onChange={setEmail} placeholder="you@ministry.gov" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" required autoComplete="new-password" />
      <CountrySelect label="Country" countries={countries} value={countryId} onChange={setCountryId} />
      <PhoneInput countryIsoCode={country?.iso_code} value={phone} onChange={setPhone} required />
      <Input label="Official website (optional)" value={website} onChange={setWebsite} placeholder="https://www.ministry.gov" />
      <Turnstile onVerify={setCaptchaToken} />
      <PrimaryButton onClick={handleSubmit} loading={loading} disabled={!captchaToken}>Create government account</PrimaryButton>
      <p className="text-center text-[11px] text-ink-400">
        Verified by MadeVisa before you can publish — usually within 1-2 business days.
      </p>
    </div>
  );
}

function CountrySelect({ label, countries, value, onChange }: { label: string; countries: Country[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = countries.find((c) => c.id === value);
  const filtered = countries.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium text-ink-600">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-3 text-left shadow-soft transition ${open ? 'border-brand-400 ring-4 ring-brand-100' : 'border-ink-200 hover:border-ink-300'}`}
      >
        <span className="flex items-center gap-3">
          <span className="text-xl">{selected?.flag_emoji ?? '🌐'}</span>
          <span className={`text-sm ${selected ? 'font-medium text-ink-900' : 'text-ink-400'}`}>{selected?.name ?? 'Select country'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-xl">
          <div className="flex items-center gap-2 border-b border-ink-100 p-2">
            <Search className="h-4 w-4 text-ink-400" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search countries" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setQuery(''); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50"
              >
                <span className="text-xl">{c.flag_emoji}</span>
                <span className="font-medium text-ink-800">{c.name}</span>
                {c.id === value && <Check className="ml-auto h-4 w-4 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
