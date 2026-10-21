import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Mail, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { refreshMyPlan, useMembership } from '@/lib/plans';
import { confirmEmailVerified } from '@/lib/emailVerification';
import { clearGuestClaim, readGuestClaim, type GuestClaim } from '@/lib/guestClaim';
import { nav } from '@/lib/pageLayout';

// Someone paid on Gumroad without a MadeVisa account. When they come back to the site
// (the Back button, Gumroad's receipt button, or just opening madevisa.com again in the
// same browser), this notices the payment, emails them a 6-digit sign-in code, signs them
// in with it and puts them back on the page they paid from — the job, with Apply unlocked.

const OTP_LENGTH = Number(import.meta.env.VITE_OTP_LENGTH) || 6;
/** Right after leaving for Gumroad, show that we're waiting for the payment. */
const FRESH_MS = 30 * 60_000;
const HIDE_KEY = 'mv:guestClaimHidden';

type Phase = { kind: 'waiting' } | { kind: 'code'; email: string; wait: number } | { kind: 'done' };

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => a + '•'.repeat(Math.min(6, Math.max(2, b.length))) + c);

export function GuestReturn() {
  const { user, loading } = useAuth();
  const { member, ready } = useMembership();
  const [claim, setClaim] = useState<GuestClaim | null>(readGuestClaim);
  const [phase, setPhase] = useState<Phase>({ kind: 'waiting' });
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const asking = useRef(false);

  // Signed in as a member already (on this or another tab): nothing left to do.
  useEffect(() => {
    if (claim && user && ready && member && phase.kind !== 'done') {
      clearGuestClaim();
      setClaim(null);
    }
  }, [claim, user, ready, member, phase.kind]);

  const sendCode = useCallback(async () => {
    if (!claim) return;
    const { data } = await supabase.functions.invoke('gumroad', { body: { action: 'guest_claim', token: claim.token } }).catch(() => ({ data: null }));
    const r = data as { state?: string; email?: string; wait?: number } | null;
    if (r?.email && (r.state === 'sent' || r.state === 'error')) setPhase({ kind: 'code', email: r.email, wait: r.wait ?? 60 });
  }, [claim]);

  // Has the payment arrived? On load, when the tab comes back, and every few seconds for a while.
  const check = useCallback(async () => {
    if (!claim || user || asking.current || phase.kind !== 'waiting') return;
    asking.current = true;
    try {
      const { data } = await supabase.rpc('guest_claim_status', { p_token: claim.token });
      if ((data as { ready?: boolean } | null)?.ready) await sendCode();
    } catch {
      /* try again on the next tick */
    } finally {
      asking.current = false;
    }
  }, [claim, user, phase.kind, sendCode]);

  useEffect(() => {
    if (!claim || loading || user || phase.kind !== 'waiting') return;
    void check();
    const onShow = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('pageshow', onShow);
    // Look often while the payment is fresh, then only when they come back to the tab.
    const t = Date.now() - claim.at < 2 * 60 * 60_000 ? window.setInterval(onShow, 5000) : 0;
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('pageshow', onShow);
      if (t) window.clearInterval(t);
    };
  }, [claim, loading, user, phase.kind, check]);

  if (!claim || loading) return null;
  if (phase.kind === 'code' || phase.kind === 'done') {
    return (
      <CodeDialog
        phase={phase}
        onResend={sendCode}
        onSignedIn={async () => {
          await supabase.rpc('guest_claim_done', { p_token: claim.token }).then(undefined, () => undefined);
          await confirmEmailVerified().catch(() => undefined);
          refreshMyPlan();
          setPhase({ kind: 'done' });
        }}
        onClose={() => {
          const back = claim.back;
          clearGuestClaim();
          setClaim(null);
          if (phase.kind === 'done' && window.location.pathname + window.location.search !== back) nav(back);
        }}
      />
    );
  }
  if (user || hidden || Date.now() - claim.at > FRESH_MS) return null;
  return createPortal(
    <div className="fixed inset-x-3 bottom-3 z-[95] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3 text-white shadow-2xl sm:bottom-5" role="status">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-300" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-5">
        <strong className="font-semibold">Paid on Gumroad?</strong> We’re confirming it. You’ll be signed in here in a few seconds.
      </p>
      <button
        type="button"
        aria-label="Hide"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem(HIDE_KEY, '1');
          } catch {
            /* fine */
          }
        }}
        className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>,
    document.body,
  );
}

function CodeDialog({ phase, onResend, onSignedIn, onClose }: { phase: Phase; onResend: () => Promise<void>; onSignedIn: () => Promise<void>; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(phase.kind === 'code' ? phase.wait : 0);
  const input = useRef<HTMLInputElement>(null);
  const email = phase.kind === 'code' ? phase.email : '';

  useEffect(() => {
    if (phase.kind === 'code') setLeft(phase.wait);
  }, [phase]);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  useEffect(() => {
    if (phase.kind === 'code') window.setTimeout(() => input.current?.focus(), 80);
  }, [phase.kind]);
  // Signed in: back to where they were by themselves.
  useEffect(() => {
    if (phase.kind !== 'done') return;
    const t = window.setTimeout(onClose, 1600);
    return () => window.clearTimeout(t);
  }, [phase.kind, onClose]);

  const verify = async (value = code) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length < OTP_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email, token: digits, type: 'email' });
    if (err) {
      setBusy(false);
      setError(/expired|invalid/i.test(err.message) ? 'That code didn’t work. Check the latest email, or send a new code.' : 'Something went wrong. Please try again.');
      return;
    }
    await onSignedIn();
    setBusy(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink-950/55 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="guest-return-title" className="w-full rounded-t-2xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:max-w-[420px] sm:rounded-2xl sm:px-7 sm:pb-7">
        {phase.kind === 'done' ? (
          <div className="py-4 text-center" role="status">
            <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" aria-hidden />
            <h2 id="guest-return-title" className="mt-3 text-[22px] font-bold tracking-tight text-ink-950">You’re in. Welcome!</h2>
            <p className="mt-1 text-[14px] text-ink-600">Taking you back to where you were…</p>
          </div>
        ) : (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
            </span>
            <h2 id="guest-return-title" className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-ink-950">
              Payment received. Your membership is on!
            </h2>
            <p className="mt-2 text-[14px] leading-6 text-ink-600">
              It’s on your MadeVisa account for the email you used on Gumroad. Enter the {OTP_LENGTH}-digit code we just sent to{' '}
              <strong className="font-semibold text-ink-900">{mask(email)}</strong> to sign in and carry on.
            </p>
            <input
              ref={input}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
                setCode(v);
                if (v.length === OTP_LENGTH) void verify(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Sign-in code"
              placeholder={'•'.repeat(OTP_LENGTH)}
              className="mt-4 h-14 w-full rounded-xl border border-ink-300 text-center text-[26px] font-bold tracking-[0.4em] text-ink-950 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {error && <p className="mt-2 text-[13px] font-medium text-red-700">{error}</p>}
            <button
              type="button"
              onClick={() => void verify()}
              disabled={busy || code.length < OTP_LENGTH}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-bold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Sign in and continue
            </button>
            <div className="mt-3 flex items-center justify-between text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-ink-500">
                <Mail className="h-3.5 w-3.5" aria-hidden /> Check spam too
              </span>
              <button type="button" disabled={left > 0} onClick={() => void onResend()} className="font-semibold text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline">
                {left > 0 ? `Send again in ${left}s` : 'Send a new code'}
              </button>
            </div>
            <button type="button" onClick={onClose} className="mt-4 w-full text-center text-[12.5px] font-medium text-ink-400 hover:text-ink-700">
              Later: I’ll sign in from the email
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
