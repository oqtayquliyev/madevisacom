import { useEffect, useState } from 'react';
import { Loader2, MailCheck, ShieldAlert } from 'lucide-react';
import { sendVerificationEmail, verifyCooldownLeft } from '@/lib/emailVerification';
import { useCaptcha } from '@/components/auth/Turnstile';

/**
 * Amber card for accounts that haven't verified their email yet. Explains
 * what verifying unlocks and sends the link. `reason` tailors the first line
 * to where it's shown (profile, company dashboard, registering a company).
 */
export function VerifyEmailCard({ email, reason, className = '' }: { email: string; reason?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(verifyCooldownLeft());
  const captcha = useCaptcha({ invisible: true });

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait(verifyCooldownLeft()), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setError(null);
    setState('sending');
    const res = await sendVerificationEmail(email, captcha.token);
    captcha.reset();
    if (res.ok) {
      setState('sent');
      setWait(verifyCooldownLeft());
    } else {
      setState('idle');
      setError(res.error ?? 'Could not send the email.');
    }
  };

  return (
    <div className={`flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 ${className}`}>
      {state === 'sent' ? <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
      <div className="min-w-0 flex-1">
        {state === 'sent' ? (
          <>
            <p className="text-sm font-bold text-ink-900">Check your inbox</p>
            <p className="mt-1 text-xs leading-5 text-ink-600">
              We sent a link to <strong>{email}</strong>. Open it on any device to verify — it works for 1 hour. Not there? Check spam.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-amber-900">Verify your email</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              {reason ?? 'You can use MadeVisa as usual.'} Verifying <strong>{email}</strong> gives you the Verified badge and lets you manage or register a company.
            </p>
          </>
        )}
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        {captcha.element}
        <button
          type="button"
          onClick={send}
          disabled={state === 'sending' || wait > 0 || !captcha.ready}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:bg-amber-300"
        >
          {state === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {wait > 0 ? `Send again in ${wait}s` : state === 'sent' ? 'Send again' : 'Send verification link'}
        </button>
      </div>
    </div>
  );
}
