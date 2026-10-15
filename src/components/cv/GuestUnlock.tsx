import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { confirmEmailVerified } from '@/lib/emailVerification';
import { useCaptcha } from '@/components/auth/Turnstile';
import { MatchRing } from '@/components/cv/MatchBits';
import type { StoredCv } from '@/lib/cv/store';
import { emailFromCv } from '@/lib/cv/cvEmail';
import type { TopResult } from '@/lib/cv/topMatches';

/** Must match Supabase → Authentication → Email → "Email OTP length". */
const OTP_LENGTH = Number(import.meta.env.VITE_OTP_LENGTH) || 6;
const RESEND_SECONDS = 45;

function friendly(message: string): string {
  if (/captcha/i.test(message)) return "The security check didn't go through. Please wait a moment and try again.";
  if (/rate limit|too many|security purposes|seconds/i.test(message)) return 'A code was sent a moment ago. Check your inbox (and spam), or try again in a minute.';
  if (/expired|invalid|token/i.test(message)) return "That code isn't right or has expired. Check the latest email, or send a new code.";
  if (/signups not allowed|not allowed/i.test(message)) return 'New sign-ups are paused right now. Please try again later.';
  return message;
}

/**
 * /cv-match for someone without an account: the results are ready but blurred.
 * One field — the email from their CV, already filled in — and a 6-digit code.
 * The code signs them in (a free account is made the first time), the CV they
 * uploaded is attached to it, and the page shows their matches like any account.
 */
export function GuestUnlock({ cv, result }: { cv: StoredCv; result: TopResult | null }) {
  const fromCv = useMemo(() => emailFromCv(cv.text), [cv.text]);
  const [email, setEmail] = useState(fromCv);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const captcha = useCaptcha({ invisible: true });
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!email && fromCv) setEmail(fromCv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCv]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);
  useEffect(() => {
    if (step === 'code') window.setTimeout(() => codeRef.current?.focus(), 50);
  }, [step]);

  const items = result?.items ?? [];
  const clean = email.trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);

  const send = async () => {
    if (!emailOk) return setError('Please check the email address.');
    if (!captcha.ready) return setError('One moment — finishing a quick security check. Try again in a second.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, captchaToken: captcha.token, emailRedirectTo: `${window.location.origin}/cv-match` },
    });
    captcha.reset();
    setBusy(false);
    if (err) return setError(friendly(err.message));
    setCode('');
    setStep('code');
    setResendIn(RESEND_SECONDS);
  };

  const verify = async (token = code) => {
    const digits = token.replace(/\D/g, '');
    if (digits.length < OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: clean, token: digits, type: 'email' });
    if (err) {
      setBusy(false);
      return setError(friendly(err.message));
    }
    await confirmEmailVerified().catch(() => undefined);
    // Signed in: the CV from this browser is attached to the account and the page shows the matches.
  };

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div className="rounded-3xl bg-white px-6 py-6 ring-2 ring-brand-200 sm:px-8">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
          <Lock className="h-3 w-3" aria-hidden /> Results ready
        </p>
        <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-tight text-ink-950">
          {items.length ? `${items.length} ${items.length === 1 ? 'job' : 'jobs'} found for your CV` : 'Your matches are ready'}
        </h2>
        <p className="mt-1 text-[14.5px] text-ink-600">{step === 'email' ? 'Get your code to see them.' : 'Enter your code to see them.'}</p>

        {step === 'email' ? (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="guest-email" className="text-[13px] font-semibold text-ink-700">
              {fromCv && email === fromCv ? 'Your email, from your CV' : 'Your email'}
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <span className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <input
                  id="guest-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </span>
              <button type="submit" disabled={busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Get my code <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            {captcha.element}
          </form>
        ) : (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <label htmlFor="guest-code" className="text-[13px] font-semibold text-ink-700">
              6-digit code sent to {clean}
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                id="guest-code"
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH + 2}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
                  setCode(v);
                  if (v.length === OTP_LENGTH) void verify(v);
                }}
                placeholder={'•'.repeat(OTP_LENGTH)}
                className="h-12 flex-1 rounded-xl border border-ink-200 bg-white px-4 text-center text-[20px] font-bold tracking-[0.4em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button type="submit" disabled={busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show results
              </button>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-500">
              Not there? Check spam, or{' '}
              <button type="button" disabled={resendIn > 0 || busy} onClick={() => void send()} className="font-semibold text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline">
                {resendIn > 0 ? `send a new code in ${resendIn}s` : 'send a new code'}
              </button>
              {' · '}
              <button type="button" onClick={() => setStep('email')} className="font-semibold text-brand-700 hover:underline">
                change email
              </button>
            </p>
            {captcha.element}
          </form>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </p>
        )}
        <p className="mt-4 text-[12px] leading-5 text-ink-500">
          The code also keeps your CV and results in a free MadeVisa account, so you can come back to them. No password. By continuing you accept the{' '}
          <a href="/terms" className="underline hover:text-ink-700">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline hover:text-ink-700">
            Privacy Policy
          </a>
          .
        </p>
      </div>
      {/* What's waiting: the scores, the rest blurred until the code is in. */}
      <div aria-hidden className="space-y-3">
        {(items.length ? items.slice(0, 3) : [null, null, null]).map((m, i) => (
          <div key={m?.id ?? i} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200 sm:p-5">
            <MatchRing score={m?.score ?? null} size={56} pending={!m} />
            <div className="pointer-events-none min-w-0 flex-1 select-none blur-[6px]">
              <span className="block h-3 w-1/3 rounded bg-ink-200" />
              <span className="mt-2 block h-4 w-3/4 rounded bg-ink-300" />
              <span className="mt-2 block h-3 w-1/2 rounded bg-ink-200" />
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}
