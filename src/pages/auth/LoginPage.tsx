import { useState } from 'react';
import { CheckCircle2, Link } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleNavClick } from '@/lib/navLink';
import { AuthCard, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/auth/AuthUI';
import { Turnstile } from '@/components/auth/Turnstile';
import { useSeo } from '@/lib/seo';

type LoginPageProps = {
  onSwitchToRegister: () => void;
  onHome?: () => void;
};

export function LoginPage({ onSwitchToRegister, onHome }: LoginPageProps) {
  useSeo({ title: 'Sign in', description: 'Sign in to your MadeVisa account.', path: '/login', noindex: true });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  const handleSignIn = async () => {
    if (!captchaToken) {
      setError('Please complete the verification below.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
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

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email above first, then click "Forgot password?".');
      return;
    }
    setResetLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  };

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to continue managing your trips." onHome={onHome} showSidePanel>
      <ErrorBanner message={error} />
      {resetSent && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Password reset link sent to {email}. Check your inbox.
        </div>
      )}
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <Divider label="or" />
      <div className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" required autoComplete="current-password" />
      </div>
      <Turnstile onVerify={setCaptchaToken} />
      <PrimaryButton onClick={handleSignIn} loading={loading} disabled={!captchaToken} className="mt-5">Sign in</PrimaryButton>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetLoading}
          className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          Forgot password?
        </button>
        <a
          href="/register"
          onClick={(event) => handleNavClick(event, onSwitchToRegister)}
          className="inline-flex items-center gap-1.5 font-medium text-ink-500 hover:text-ink-900"
        >
          <Link className="h-3.5 w-3.5" />Create account
        </a>
      </div>
    </AuthCard>
  );
}
