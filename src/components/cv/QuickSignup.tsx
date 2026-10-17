import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { confirmEmailVerified } from '@/lib/emailVerification';
import { useCaptcha } from '@/components/auth/Turnstile';
import type { StoredCv } from '@/lib/cv/store';
import { emailFromCv } from '@/lib/cv/cvEmail';

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
 * Quick sign-up without feeling like one: the email from the visitor's CV is already filled in,
 * "Get my code", then the 6-digit code. The code signs them in (a free account is made the first
 * time) and the CV from this browser is attached to it. Used on /cv-match and on job pages.
 */
/** The webmail for an address, so "Open Gmail" takes them straight to the code. */
function inboxFor(email: string): { name: string; href: string } | null {
  const d = email.split('@')[1]?.toLowerCase() ?? '';
  if (/^(gmail|googlemail)\.com$/.test(d)) return { name: 'Gmail', href: 'https://mail.google.com/mail/u/0/#search/madevisa' };
  if (/^(outlook|hotmail|live|msn)\.[a-z.]+$/.test(d)) return { name: 'Outlook', href: 'https://outlook.live.com/mail/0/' };
  if (/^(yahoo|ymail)\.[a-z.]+$/.test(d)) return { name: 'Yahoo Mail', href: 'https://mail.yahoo.com/' };
  if (/^(icloud|me|mac)\.com$/.test(d)) return { name: 'iCloud Mail', href: 'https://www.icloud.com/mail' };
  if (/^(proton\.me|protonmail\.com)$/.test(d)) return { name: 'Proton Mail', href: 'https://mail.proton.me/' };
  if (/^(mail|bk|inbox|list)\.ru$|^yandex\.[a-z]+$/.test(d)) return { name: 'your mailbox', href: `https://${d.startsWith('yandex') ? 'mail.yandex.ru' : 'e.mail.ru'}/` };
  return null;
}

export function QuickSignup({
  cv,
  onStep,
  back = '/cv-match',
  beforeSend,
  sendLabel = 'Get my code',
}: {
  cv?: StoredCv | null;
  onStep?: (step: 'email' | 'code') => void;
  back?: string;
  /** Checked before the code is sent; a message stops it (e.g. "Choose your field"). */
  beforeSend?: () => string | null;
  sendLabel?: string;
}) {
  const fromCv = useMemo(() => (cv ? emailFromCv(cv.text) : ''), [cv]);
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
    onStep?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  useEffect(() => {
    if (step === 'code') window.setTimeout(() => codeRef.current?.focus(), 50);
  }, [step]);

  const clean = email.trim().toLowerCase();
  const inbox = inboxFor(clean);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);

  const send = async () => {
    const stop = beforeSend?.();
    if (stop) return setError(stop);
    if (!emailOk) return setError('Please check the email address.');
    if (!captcha.ready) return setError('One moment — finishing a quick security check. Try again in a second.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, captchaToken: captcha.token, emailRedirectTo: `${window.location.origin}${back}` },
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
    <div>
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
            <span className="relative block w-full sm:flex-1">
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {sendLabel} <ArrowRight className="h-4 w-4" />
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
              className="h-14 min-h-[56px] w-full shrink-0 rounded-xl border-2 border-brand-300 bg-white px-4 text-center text-[24px] font-bold tracking-[0.4em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:h-12 sm:min-h-[48px] sm:flex-1 sm:text-[20px]"
            />
            <button type="submit" disabled={busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-bold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show results
            </button>
          </div>
          {inbox && (
            <a
              href={inbox.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-ink-800"
            >
              <Mail className="h-4 w-4" aria-hidden /> Open {inbox.name}
            </a>
          )}
          <p className="mt-2 text-[12.5px] text-ink-500">
            Not there? Check spam and Promotions, or{' '}
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
      <p className="mt-3 text-[12px] leading-5 text-ink-500">
        Free account, no password. By continuing you accept the{' '}
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
  );
}
