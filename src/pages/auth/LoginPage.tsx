import { useState } from 'react';
import { Link } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthCard, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/auth/AuthUI';

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
    }
  };

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
    <AuthCard title="Welcome back" subtitle="Sign in to continue managing your trips.">
      <ErrorBanner message={error} />
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <Divider label="or" />
      <div className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" required autoComplete="current-password" />
      </div>
      <PrimaryButton onClick={handleSignIn} loading={loading} className="mt-5">Sign in</PrimaryButton>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button className="font-medium text-brand-600 hover:text-brand-700">Forgot password?</button>
        <button onClick={onSwitchToRegister} className="inline-flex items-center gap-1.5 font-medium text-ink-500 hover:text-ink-900">
          <Link className="h-3.5 w-3.5" />Create account
        </button>
      </div>
    </AuthCard>
  );
}
