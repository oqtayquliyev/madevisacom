import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthCard, ErrorBanner, Input, PrimaryButton } from '@/components/auth/AuthUI';

export function ResetPasswordPage({
  onHome,
  onSwitchToLogin,
}: {
  onHome: () => void;
  onSwitchToLogin: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    // Supabase's recovery link redirects here with the token in the
    // URL; the client (detectSessionInUrl: true, in lib/supabase.ts)
    // turns that into a session automatically. We just confirm it's
    // there before showing the form.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasRecoverySession(Boolean(session));
    });
  }, []);

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="You can now sign in with your new password." onHome={onHome}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <PrimaryButton onClick={onSwitchToLogin}>Go to sign in</PrimaryButton>
        </div>
      </AuthCard>
    );
  }

  if (hasRecoverySession === false) {
    return (
      <AuthCard title="This link has expired" subtitle="Request a new password reset link and try again." onHome={onHome}>
        <PrimaryButton onClick={onSwitchToLogin}>Back to sign in</PrimaryButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your account." onHome={onHome}>
      <ErrorBanner message={error} />
      <div className="space-y-4">
        <Input label="New password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" required autoComplete="new-password" />
        <Input label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" required autoComplete="new-password" />
      </div>
      <PrimaryButton onClick={handleSubmit} loading={loading} className="mt-5">Update password</PrimaryButton>
    </AuthCard>
  );
}
