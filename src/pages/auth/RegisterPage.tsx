import { useEffect, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleNavClick } from '@/lib/navLink';
import { AuthCard, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/auth/AuthUI';
import { Turnstile } from '@/components/auth/Turnstile';
import { useSeo } from '@/lib/seo';

type Country = { id: string; name: string; flag_emoji: string | null; iso_code: string };

/** Live password rules — all must pass. Client-side UX; set Supabase Auth's
 *  password policy to match (Authentication → Providers → Email). */
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: '8 characters or longer', test: (p) => p.length >= 8 },
  { label: 'At least one number', test: (p) => /\d/.test(p) },
  { label: 'At least one lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
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
  /** Called when signup succeeds but email confirmation is required. */
  onPendingConfirmation: (info: PendingSignup) => void;
};

/**
 * One simple sign-up for everyone. Organizations (companies, agencies,
 * governments) create a normal account first, then set up their
 * organization from Profile → For organizations.
 */
export function RegisterPage({ onSwitchToLogin, onHome, onPendingConfirmation }: RegisterPageProps) {
  useSeo({ title: 'Create account', description: 'Create your MadeVisa account.', path: '/register', noindex: true });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryId, setCountryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji, iso_code').order('name').then(({ data }) => {
      if (data) setCountries(data as Country[]);
    });
  }, []);

  const passwordOk = PASSWORD_RULES.every((r) => r.test(password));

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) return setError('Please enter your name.');
    if (!passwordOk) return setError('Your password doesn\'t meet all the requirements yet.');
    if (!captchaToken) return setError('Please complete the verification below.');
    setLoading(true);
    setError(null);
    const country = countries.find((c) => c.id === countryId) ?? null;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: { role: 'customer', full_name: fullName.trim(), country_id: countryId || null, nationality_country_id: countryId || null },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message.includes('already') ? 'An account with this email already exists.' : error.message);
      return;
    }
    if (!data.session) {
      onPendingConfirmation({ email, fullName, phone: '', countryName: country?.name ?? null, nationalityName: country?.name ?? null, role: 'customer' });
    }
    // With a session (email confirmation off) the AuthProvider picks it up automatically.
  };

  return (
    <AuthCard title="Create your account" subtitle="Track the jobs you apply to and see which companies respond." onHome={onHome}>
      <ErrorBanner message={error} />
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <Divider label="or" />
      <div className="space-y-4">
        <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" required autoComplete="name" />
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
        <div>
          <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Create a password" required autoComplete="new-password" />
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2" aria-live="polite">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li key={r.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-700' : 'text-ink-500'}`}>
                  {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0 text-ink-300" />}
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>
        <CountrySelect label="Country (optional)" countries={countries} value={countryId} onChange={setCountryId} />
        <Turnstile onVerify={setCaptchaToken} />
        <PrimaryButton onClick={handleSubmit} loading={loading} disabled={!captchaToken || !passwordOk}>
          Create account
        </PrimaryButton>
        <p className="text-center text-xs leading-5 text-ink-500">
          By registering, you agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">
            Privacy Policy
          </a>
          .
        </p>
      </div>
      <div className="mt-5 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <a href="/login" onClick={(event) => handleNavClick(event, onSwitchToLogin)} className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </a>
      </div>
    </AuthCard>
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
