import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { handleNavClick } from '@/lib/navLink';
import { confirmEmailVerified } from '@/lib/emailVerification';
import { AUTH_REASON_TEXT, readAuthIntent } from '@/lib/authIntent';
import { AuthCard, Divider, ErrorBanner, GoogleButton, Input, PrimaryButton } from '@/components/auth/AuthUI';
import { useCaptcha } from '@/components/auth/Turnstile';

type Props = {
  mode: 'login' | 'register';
  onSwitch: () => void;
  onHome?: () => void;
};

const RESEND_SECONDS = 45;
/** Must match Supabase → Authentication → Sign In / Providers → Email → "Email OTP length". */
const OTP_LENGTH = Number(import.meta.env.VITE_OTP_LENGTH) || 6;

function friendly(message: string): string {
  if (/captcha/i.test(message)) return "The security check didn't go through. Please wait a moment and try again.";
  if (/rate limit|too many|security purposes|seconds/i.test(message)) return 'A code was sent a moment ago. Check your inbox (and spam), or try again in a minute.';
  if (/expired|invalid|token/i.test(message)) return "That code isn't right or has expired. Check the latest email, or send a new code.";
  if (/signups not allowed|not allowed/i.test(message)) return "New sign-ups are paused right now. Please try again later.";
  if (/email/i.test(message) && /valid/i.test(message)) return 'Please enter a valid email address.';
  return message;
}

/**
 * Passwordless sign-in and sign-up: enter your email, type the code we
 * email you — that's it. The same flow creates an account the first time
 * and signs you in every time after. Google works too.
 *
 * Supabase setup: Authentication → Email Templates → "Magic Link" (and
 * "Confirm signup") must include {{ .Token }} so the email shows the code.
 */
export function EmailCodeAuth({ mode, onSwitch, onHome }: Props) {
  const intent = readAuthIntent();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [slow, setSlow] = useState(false);
  const captcha = useCaptcha();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') window.setTimeout(() => codeRef.current?.focus(), 50);
  }, [step]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const sendCode = async () => {
    if (!emailOk) return setError('Please enter a valid email address.');
    if (!captcha.ready) return setError('Please complete the quick check below.');
    setSending(true);
    setError(null);
    setSlow(false);
    // Sending can hang when the mail server is slow — don't leave people
    // staring at a spinner: after 20 s go to the code step anyway (the email
    // usually still arrives) and say so.
    const request = supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, captchaToken: captcha.token, emailRedirectTo: window.location.origin },
    });
    const timedOut = Symbol('timeout');
    const result = await Promise.race([request, new Promise<typeof timedOut>((r) => window.setTimeout(() => r(timedOut), 20_000))]);
    captcha.reset();
    setSending(false);
    if (result === timedOut) {
      setSlow(true);
      request.then(({ error: late }) => late && setError(friendly(late.message)));
    } else if (result.error) {
      return setError(friendly(result.error.message));
    }
    setCode('');
    setStep('code');
    setResendIn(RESEND_SECONDS);
  };

  const verify = async (token = code) => {
    const clean = token.replace(/\D/g, '');
    if (clean.length < OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
    setVerifying(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: clean, type: 'email' });
    if (err) {
      setVerifying(false);
      return setError(friendly(err.message));
    }
    // The code proves the inbox is theirs — record the verified email.
    await confirmEmailVerified().catch(() => undefined);
    // App takes over from here (the session changes): name step, then back to where they were.
  };

  const google = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (err) {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const reason = intent.reason ? AUTH_REASON_TEXT[intent.reason] : null;
  const title = step === 'code' ? 'Check your email' : mode === 'register' ? 'Create your free account' : 'Welcome back';
  const subtitle =
    step === 'code'
      ? `We sent a sign-in code to ${email.trim()}. It works for the next few minutes.`
      : reason ?? (mode === 'register' ? 'No password needed — we’ll email you a code.' : 'Sign in with a code sent to your email.');

  return (
    <AuthCard title={title} subtitle={subtitle} onHome={onHome}>
      <ErrorBanner message={error} />

      {step === 'email' ? (
        <>
          <div className={error ? 'mt-4' : ''}>
            <GoogleButton onClick={google} loading={googleLoading} label="Continue with Google" />
          </div>
          <Divider label="or with email" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoComplete="email" />
            {captcha.element}
            <PrimaryButton loading={sending} disabled={!emailOk || !captcha.ready} className="mt-4">
              Continue <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          </form>
          <p className="mt-4 text-center text-sm text-ink-500">
            {mode === 'register' ? 'Already have an account? ' : 'New to MadeVisa? '}
            <a
              href={mode === 'register' ? '/login' : '/register'}
              onClick={(event) => handleNavClick(event, onSwitch)}
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              {mode === 'register' ? 'Sign in' : 'Create an account'}
            </a>
          </p>
          <p className="mt-3 text-center text-[11px] leading-4 text-ink-400">
            Same steps to sign up and to sign in. By continuing you agree to our{' '}
            <a href="/terms" className="underline hover:text-ink-600">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" className="underline hover:text-ink-600">
              Privacy Policy
            </a>
            .
          </p>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          className={error ? 'mt-4' : ''}
        >
          {slow && (
            <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              Sending is taking longer than usual. The email may still arrive in a minute — if not, tap “Send a new code”.
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-600">Code from the email</span>
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                setCode(v);
                if (v.length === OTP_LENGTH && !verifying) void verify(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={"•".repeat(OTP_LENGTH)}
              aria-label="Sign-in code"
              className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.5em] text-ink-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <PrimaryButton loading={verifying} disabled={code.length < OTP_LENGTH} className="mt-4">
            Continue
          </PrimaryButton>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
              }}
              className="inline-flex items-center gap-1 font-medium text-ink-500 hover:text-ink-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Different email
            </button>
            <button
              type="button"
              disabled={resendIn > 0 || sending || !captcha.ready}
              onClick={() => void sendCode()}
              className="font-semibold text-brand-600 hover:text-brand-700 disabled:text-ink-400"
            >
              {resendIn > 0 ? `Send a new code in ${resendIn}s` : sending ? 'Sending…' : 'Send a new code'}
            </button>
          </div>
          {resendIn <= 0 && captcha.element}
          <p className="mt-4 text-[12px] leading-5 text-ink-400">Can't find it? Check spam or promotions. The email comes from MadeVisa.</p>
        </form>
      )}
    </AuthCard>
  );
}
