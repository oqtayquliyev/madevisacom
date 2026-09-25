import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { View } from '@/types';
import { isEmailVerified, useAuth } from '@/lib/auth';
import { useSeo } from '@/lib/seo';
import { confirmEmailVerified } from '@/lib/emailVerification';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { VerifyEmailCard } from '@/components/common/VerifyEmailCard';

/**
 * Where the "Verify your email" link lands. Supabase signs the person in
 * from the link; we then record the verification and say so.
 */
export function VerifyEmailPage({ go, onAuth }: { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void }) {
  useSeo({ title: 'Verify your email', description: 'Email verification for your MadeVisa account.', path: '/verify-email', noindex: true });
  const { user, profile, loading, refreshProfile } = useAuth();
  const [state, setState] = useState<'checking' | 'verified' | 'failed' | 'expired' | 'signed_out'>('checking');

  // Supabase puts link errors in the URL hash (e.g. an expired link).
  const [linkError] = useState(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    return h.get('error_code') || h.get('error') || null;
  });

  useEffect(() => {
    if (loading) return;
    if (linkError) {
      setState('expired');
      return;
    }
    if (!user || !profile) {
      setState('signed_out');
      return;
    }
    if (isEmailVerified(profile, user)) {
      setState('verified');
      return;
    }
    confirmEmailVerified().then(async (r) => {
      if (r.verified) {
        await refreshProfile();
        setState('verified');
      } else {
        setState('failed');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, profile?.email_verified_at, linkError]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className="mx-auto max-w-md px-5 py-20">
        <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-sm sm:p-8">
          {state === 'checking' && (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
              <p className="mt-4 text-sm text-ink-500">Verifying your email…</p>
            </>
          )}
          {state === 'verified' && (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h1 className="mt-4 text-xl font-bold text-ink-950">Email verified</h1>
              <p className="mt-2 text-sm text-ink-500">
                <strong>{user?.email}</strong> is verified. Your profile now shows the Verified badge.
              </p>
              <button onClick={() => go('profile')} className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Go to my profile
              </button>
            </>
          )}
          {(state === 'failed' || state === 'expired') && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-rose-500" />
              <h1 className="mt-4 text-xl font-bold text-ink-950">{state === 'expired' ? 'This link has expired' : "We couldn't verify this link"}</h1>
              <p className="mt-2 text-sm text-ink-500">Links work once, for 1 hour. Send yourself a new one below.</p>
              {user?.email ? (
                <VerifyEmailCard email={user.email} className="mt-6 text-left" />
              ) : (
                <button onClick={() => onAuth?.('login')} className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                  Sign in to send a new link
                </button>
              )}
            </>
          )}
          {state === 'signed_out' && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-ink-300" />
              <h1 className="mt-4 text-xl font-bold text-ink-950">Sign in to verify</h1>
              <p className="mt-2 text-sm text-ink-500">Sign in, then use “Send verification link” on your profile.</p>
              <button onClick={() => onAuth?.('login')} className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Sign in
              </button>
            </>
          )}
        </div>
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}
