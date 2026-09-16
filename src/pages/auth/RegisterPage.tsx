import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown, Landmark, Search, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleNavClick } from '@/lib/navLink';
import { PhoneInput } from '@/components/common/PhoneInput';
import { AuthCard, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/auth/AuthUI';

type Country = { id: string; name: string; flag_emoji: string | null; iso_code: string };
type Role = 'customer' | 'agency' | 'government' | null;

const institutionTypes = [
  'Ministry / government department',
  'Embassy or consulate',
  'Government agency',
  'Public university or institution',
  'Other official body',
];

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
    <AuthCard title="Create your MadeVisa account" subtitle="Choose your path to get started." onHome={onHome}>
      <ErrorBanner message={error} />
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <Divider label="or" />
      {!role ? (
        <div className="space-y-3">
          {/* Individual / traveler is the primary, highlighted path. Agency
              and government accounts are reviewed by an admin before they
              become public (see ProfilePage + AdminApprovalsPage) — a
              traveler account is instant and needs no review. */}
          <button
            onClick={() => setRole('customer')}
            className="relative flex w-full items-center gap-4 rounded-2xl border-2 border-brand-400 bg-brand-50/50 p-4 text-left shadow-soft-lg transition hover:border-brand-500"
          >
            <span className="absolute -top-2.5 right-4 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              Most people start here
            </span>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <UserRound className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-ink-900">I'm an individual / traveler</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Discover programs, plan your move, and get agency or expert help. You can add an expert profile later.
              </p>
            </div>
          </button>

          <button
            onClick={() => setRole('agency')}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-soft transition hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-ink-900">Agency / Company</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Manage customers, trips, jobs, or programs. Reviewed by our team before your profile goes public.
              </p>
            </div>
          </button>

          <button
            onClick={() => setRole('government')}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-soft transition hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Landmark className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-ink-900">Government institution</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Publish official visa, work, or study programs. Reviewed by our team before your profile goes public.
              </p>
            </div>
          </button>
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

  const country = countries.find((c) => c.id === countryId) ?? null;
  const effectiveNationalityId = nationalitySameAsCountry ? countryId : nationalityId;

  const handleSubmit = async () => {
    setLoading(true);
    onError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
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
      <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required autoComplete="new-password" />
      <PhoneInput countryIsoCode={country?.iso_code} value={phone} onChange={setPhone} />
      <CountrySelect label="Country" countries={countries} value={countryId} onChange={setCountryId} />

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

      <PrimaryButton onClick={handleSubmit} loading={loading}>Create traveler account</PrimaryButton>
      <button onClick={onBack} className="w-full text-center text-sm font-medium text-ink-500 hover:text-ink-900">Back to options</button>
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

  const country = countries.find((c) => c.id === countryId) ?? null;

  const handleSubmit = async () => {
    setLoading(true);
    onError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'agency',
          full_name: fullName,
          phone: phone || null,
          country_id: countryId || null,
          company_name: companyName,
          country: country?.name ?? null,
          city: city || null,
          website: website || null,
          // Server-side (see the `handle_new_user` trigger / migration):
          // agency signups should always land as approval_status='pending'
          // and is_public=false until an admin approves them.
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
      <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
        Agency and company accounts are reviewed before they can post jobs, programs, or appear publicly.
      </div>
      <Input label="Contact person name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Company name" value={companyName} onChange={setCompanyName} placeholder="Your agency or company" required />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="agency@example.com" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required autoComplete="new-password" />
      <CountrySelect label="Country" countries={countries} value={countryId} onChange={setCountryId} />
      <PhoneInput countryIsoCode={country?.iso_code} value={phone} onChange={setPhone} required />
      <Input label="City" value={city} onChange={setCity} placeholder="Baku" required />
      <Input label="Website (optional)" value={website} onChange={setWebsite} placeholder="https://youragency.com" />
      <PrimaryButton onClick={handleSubmit} loading={loading}>Create agency / company account</PrimaryButton>
      <button onClick={onBack} className="w-full text-center text-sm font-medium text-ink-500 hover:text-ink-900">Back to options</button>
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
  const [institutionName, setInstitutionName] = useState('');
  const [institutionType, setInstitutionType] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [countryId, setCountryId] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);

  const country = countries.find((c) => c.id === countryId) ?? null;

  const handleSubmit = async () => {
    setLoading(true);
    onError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'government',
          full_name: fullName,
          phone: phone || null,
          country_id: countryId || null,
          institution_name: institutionName,
          institution_type: institutionType || null,
          country: country?.name ?? null,
          website: website || null,
          // Same as agency: lands as approval_status='pending',
          // is_public=false via the DB trigger until an admin approves it.
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
      <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
        Government and institutional accounts are manually verified before they can publish official programs.
      </div>
      <Input label="Contact person name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Institution name" value={institutionName} onChange={setInstitutionName} placeholder="Ministry of Labour, Embassy of..., etc." required />
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-600">Institution type</label>
        <select
          value={institutionType}
          onChange={(e) => setInstitutionType(e.target.value)}
          className="h-[46px] w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-900 shadow-soft outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        >
          <option value="">Select type</option>
          {institutionTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <Input label="Official email" type="email" value={email} onChange={setEmail} placeholder="name@institution.gov" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required autoComplete="new-password" />
      <CountrySelect label="Country" countries={countries} value={countryId} onChange={setCountryId} />
      <PhoneInput countryIsoCode={country?.iso_code} value={phone} onChange={setPhone} />
      <Input label="Official website (optional)" value={website} onChange={setWebsite} placeholder="https://institution.gov" />
      <PrimaryButton onClick={handleSubmit} loading={loading}>Create institution account</PrimaryButton>
      <button onClick={onBack} className="w-full text-center text-sm font-medium text-ink-500 hover:text-ink-900">Back to options</button>
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
