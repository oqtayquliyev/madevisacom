import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown, Search, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthCard, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/AuthUI';

type Country = { id: string; name: string; flag_emoji: string | null };
type Role = 'customer' | 'agency' | null;

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [role, setRole] = useState<Role>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    supabase.from('countries').select('id, name, flag_emoji').order('name').then(({ data }) => {
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
    <AuthCard title="Create your MadeVisa account" subtitle="Choose your path to get started.">
      <ErrorBanner message={error} />
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <Divider label="or" />
      {!role ? (
        <div className="space-y-3">
          <button
            onClick={() => setRole('customer')}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-soft transition hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><UserRound className="h-6 w-6" /></span>
            <div>
              <p className="font-semibold text-ink-900">I'm a traveler</p>
              <p className="mt-0.5 text-sm text-ink-500">Plan trips, track requirements, get agency help.</p>
            </div>
          </button>
          <button
            onClick={() => setRole('agency')}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-soft transition hover:border-brand-300 hover:shadow-soft-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="h-6 w-6" /></span>
            <div>
              <p className="font-semibold text-ink-900">I'm a travel agency</p>
              <p className="mt-0.5 text-sm text-ink-500">Manage customers, trips, and requests.</p>
            </div>
          </button>
        </div>
      ) : role === 'customer' ? (
        <CustomerForm countries={countries} onBack={() => setRole(null)} onError={setError} />
      ) : (
        <AgencyForm countries={countries} onBack={() => setRole(null)} onError={setError} />
      )}
      <div className="mt-5 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <button onClick={onSwitchToLogin} className="font-semibold text-brand-600 hover:text-brand-700">Sign in</button>
      </div>
    </AuthCard>
  );
}

function CustomerForm({ countries, onBack, onError }: { countries: Country[]; onBack: () => void; onError: (msg: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalityId, setNationalityId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    onError('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      onError(error.message.includes('already') ? 'An account with this email already exists.' : 'Registration failed. Please check your details.');
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        email,
        phone: phone || null,
        role: 'customer',
        nationality_country_id: nationalityId || null,
      });
      if (profileError) {
        onError('Account created but profile setup failed. Please contact support.');
        setLoading(false);
        return;
      }
    }
  };

  return (
    <div className="space-y-4">
      <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required autoComplete="new-password" />
      <Input label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+994 50 555 12 34" />
      <CountrySelect label="Nationality" countries={countries} value={nationalityId} onChange={setNationalityId} />
      <PrimaryButton onClick={handleSubmit} loading={loading}>Create traveler account</PrimaryButton>
      <button onClick={onBack} className="w-full text-center text-sm font-medium text-ink-500 hover:text-ink-900">Back to options</button>
    </div>
  );
}

function AgencyForm({ countries, onBack, onError }: { countries: Country[]; onBack: () => void; onError: (msg: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    onError('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      onError(error.message.includes('already') ? 'An account with this email already exists.' : 'Registration failed. Please check your details.');
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        email,
        phone: phone || null,
        role: 'agency',
      });
      if (profileError) {
        onError('Account created but profile setup failed. Please contact support.');
        setLoading(false);
        return;
      }
      const { error: agencyError } = await supabase.from('agencies').insert({
        owner_id: data.user.id,
        name: companyName,
        email,
        phone: phone || null,
        country: country || null,
        city: city || null,
        website: website || null,
        verification_status: 'pending',
      });
      if (agencyError) {
        onError('Profile created but agency setup failed. Please contact support.');
        setLoading(false);
        return;
      }
    }
  };

  return (
    <div className="space-y-4">
      <Input label="Contact person name" value={fullName} onChange={setFullName} placeholder="Your full name" required />
      <Input label="Company name" value={companyName} onChange={setCompanyName} placeholder="Your travel agency" required />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="agency@example.com" required autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required autoComplete="new-password" />
      <Input label="Phone" value={phone} onChange={setPhone} placeholder="+994 50 555 12 34" required />
      <CountrySelect label="Country" countries={countries} value={country} onChange={setCountry} />
      <Input label="City" value={city} onChange={setCity} placeholder="Baku" required />
      <Input label="Website (optional)" value={website} onChange={setWebsite} placeholder="https://youragency.com" />
      <PrimaryButton onClick={handleSubmit} loading={loading}>Create agency account</PrimaryButton>
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
