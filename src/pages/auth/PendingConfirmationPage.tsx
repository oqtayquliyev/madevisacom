import { useState } from 'react';
import { useCaptcha } from '@/components/auth/Turnstile';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { TravelerAvatar } from '@/components/common/TravelerAvatar';
import { useSeo } from '@/lib/seo';
import type { PendingSignup } from '@/pages/auth/RegisterPage';
import type { View } from '@/types';

type PendingConfirmationPageProps = {
  info: PendingSignup;
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
};

const roleLabel: Record<PendingSignup['role'], string> = {
  customer: 'Traveler',
  agency: 'Agency / company',
  government: 'Government institution',
};

/**
 * Shown instead of a blocking "check your email" screen right after
 * signup. Looks like a lightweight profile page using the data the
 * person just entered — there's no session yet (email unconfirmed), so
 * this can't read from the database; it just reflects what was typed.
 */
export function PendingConfirmationPage({ info, go, onAuth }: PendingConfirmationPageProps) {
  useSeo({ title: 'Confirm your email', description: 'Confirm your email to activate your MadeVisa account.', path: '/register', noindex: true });
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captcha = useCaptcha({ invisible: true });

  const handleResend = async () => {
    setResending(true);
    setError(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email: info.email, options: { captchaToken: captcha.token } });
    captcha.reset();
    setResending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active="home" />

      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
        <div className="flex items-center gap-4">
          <TravelerAvatar seed={info.email} size={72} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950">{info.fullName || 'Your profile'}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
              <Shield className="h-3.5 w-3.5 text-brand-600" />
              {roleLabel[info.role]}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">Account not confirmed yet</p>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              We sent a confirmation link to <span className="font-semibold">{info.email}</span>. Click it to
              activate your account — until then, this page just shows what you entered; nothing's saved to a live
              profile yet.
            </p>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || !captcha.ready}
                className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Resend confirmation email
              </button>
              {captcha.element}
              {resent && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sent
                </span>
              )}
            </div>
            {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
          </div>
        </div>

        <div className="mt-6 border border-ink-200 bg-white p-6">
          <h2 className="text-sm font-bold text-ink-900">Your details</h2>
          <p className="mt-1 text-xs text-ink-500">This is what you entered — you can edit it once your account is confirmed.</p>

          <div className="mt-5 space-y-3 text-sm">
            <DetailRow label="Email" value={info.email} />
            <DetailRow label="Phone" value={info.phone || '—'} />
            <DetailRow label="Country" value={info.countryName ?? '—'} />
            {info.role === 'customer' && <DetailRow label="Nationality" value={info.nationalityName ?? '—'} />}
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-ink-500">
          Already confirmed?{' '}
          <button onClick={() => onAuth?.('login')} className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </button>
        </div>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 pb-3 last:border-0 last:pb-0">
      <span className="text-ink-500">{label}</span>
      <span className="font-semibold text-ink-900">{value}</span>
    </div>
  );
}
