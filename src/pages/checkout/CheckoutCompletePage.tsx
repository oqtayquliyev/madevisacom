import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP, nav } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { supabase } from '@/lib/supabase';
import { PLANS, refreshMyPlan, useMyPlan, type PaidPlanId } from '@/lib/plans';
import { checkPayment, manageUrl } from '@/lib/gumroad';
import { confirmedFor, formatMoney, longDate, trackBilling } from '@/lib/billing';
import { AppLink } from '@/pages/info/InfoPage';
import { clearReturn, readReturn } from '@/lib/returnTo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

// /checkout/complete?c=<checkout id>&plan=starter|pro
//
// Where the checkout page sends the person while they pay on Gumroad (and
// where Gumroad's receipt links back to). It shows success ONLY when the
// server has verified the payment with Gumroad and the plan is on — never
// because this address was opened. Until then it waits, and "Check again"
// asks the server to read the payment again; nothing here can start another
// purchase.

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

/** How long the page keeps looking by itself. */
const WAIT_MS = 10 * 60_000;

const readParams = () => {
  const q = new URLSearchParams(window.location.search);
  const plan = q.get('plan');
  const c = q.get('c');
  return {
    plan: plan === 'starter' || plan === 'pro' ? (plan as PaidPlanId) : null,
    checkout: c && /^[0-9a-f-]{36}$/i.test(c) ? c : null,
  };
};

export function CheckoutCompletePage({ go, onAuth }: Props) {
  const { user } = useAuth();
  const my = useMyPlan();
  const [{ plan: wanted, checkout }] = useState(readParams);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlanId | null>(null);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const since = useRef(Date.now());
  // The checkout's own plan (from the server) wins over the address.
  const expected = checkoutPlan ?? wanted;
  const confirmed = !my.loading && confirmedFor(expected, my.plan);

  useSeo({ title: 'Your MadeVisa plan', description: 'Payment confirmation for your MadeVisa plan.', path: '/checkout/complete', noindex: true });

  useEffect(() => {
    if (!user || !checkout) return;
    void supabase.rpc('my_checkout', { p_id: checkout }).then(({ data }) => {
      const p = (data as { plan?: string } | null)?.plan;
      if (p === 'starter' || p === 'pro') setCheckoutPlan(p);
    });
  }, [user, checkout]);

  // Told once per checkout.
  useEffect(() => {
    if (!confirmed) return;
    const key = `mv:confirmed:${checkout ?? my.plan}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      /* fine */
    }
    trackBilling('payment_confirmed', { plan: my.plan });
  }, [confirmed, checkout, my.plan]);
  // Paid from a job (or any page): back there by itself a few seconds after the confirmation.
  useEffect(() => {
    if (!confirmed) return;
    const back = readReturn();
    if (!back) return;
    const t = window.setTimeout(() => {
      clearReturn();
      nav(back);
    }, 3500);
    return () => window.clearTimeout(t);
  }, [confirmed]);

  // While waiting: read the plan every few seconds, ask the server to look at Gumroad now
  // and then, and straight away when the person comes back to this tab.
  const waiting = Boolean(user) && !my.loading && !confirmed && !timedOut;
  useEffect(() => {
    if (!waiting) return;
    trackBilling('payment_pending', { plan: expected ?? 'unknown' });
    since.current = Date.now();
    let n = 0;
    const t = window.setInterval(() => {
      if (Date.now() - since.current > WAIT_MS) {
        window.clearInterval(t);
        setTimedOut(true);
        return;
      }
      n += 1;
      // Seconds 16, 44, 88, then every 2 minutes.
      if (n === 4 || n === 11 || n === 22 || (n > 22 && n % 30 === 0)) void checkPayment();
      else refreshMyPlan();
    }, 4000);
    const onBack = () => document.visibilityState === 'visible' && void checkPayment();
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onBack);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  const checkNow = async () => {
    setChecking(true);
    setNotYet(false);
    const r = await checkPayment();
    setChecking(false);
    if (!confirmedFor(expected, r.plan)) setNotYet(true);
    if (timedOut) {
      setTimedOut(false);
      since.current = Date.now();
    }
  };

  const signIn = (page: 'login' | 'register') => {
    rememberAuthIntent({ next: window.location.pathname + window.location.search });
    onAuth?.(page);
  };

  const sub = my.sub;
  const info = PLANS[my.plan === 'free' ? (expected ?? 'starter') : my.plan];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />
      <main className={`${WRAP} py-10 sm:py-16`}>
        <div className="mx-auto max-w-xl">
          {!user ? (
            <Card>
              <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-950">Thank you! Check your inbox</h1>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Your membership is linked to the <strong>email you used on Gumroad</strong>. If you didn’t have a MadeVisa account, we’ve created one with that email and sent you
                “Your MadeVisa account is ready”. Sign in with that email: we send you a one-time code, no password needed.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => signIn('login')} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
                  Sign in
                </button>
                <button type="button" onClick={() => nav('/jobs')} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
                  Browse jobs
                </button>
              </div>
            </Card>
          ) : my.loading ? (
            <Card>
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your plan…
              </p>
            </Card>
          ) : confirmed ? (
            <Card>
              <div role="status">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-950">You’re a {info.name} member</h1>
                <p className="mt-1 text-sm text-ink-600">Payment confirmed with Gumroad. Your receipt is in your email.</p>
              </div>
              <dl className="mt-5 divide-y divide-ink-100 rounded-xl border border-ink-200 text-sm">
                <Row label="Plan" value={info.name} />
                {sub?.price_cents ? <Row label="Amount paid" value={`${formatMoney(sub.price_cents)} (before any tax)`} /> : null}
                <Row label="Billing" value={info.recurrence === 'quarterly' ? 'Every 3 months' : 'Monthly'} />
                {sub?.renews_at && !sub.cancel_at_period_end ? <Row label="Next renewal" value={longDate(sub.renews_at)} /> : null}
                {sub?.cancel_at_period_end && sub.current_period_end ? <Row label="Ends" value={longDate(sub.current_period_end)} /> : null}
              </dl>
              <h2 className="mt-6 text-sm font-bold text-ink-950">Now available</h2>
              <ul className="mt-2 space-y-2">
                {info.benefits.map((b) => (
                  <li key={b.title} className="flex gap-2 text-sm leading-6 text-ink-700">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> {b.title}
                  </li>
                ))}
              </ul>
              {my.others.length > 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
                  Your {PLANS[my.others[0].plan].name} membership is still running{my.others[0].until ? ` until ${longDate(my.others[0].until)}` : ''}.{' '}
                  {my.others[0].status === 'pending_cancellation' ? 'It is cancelled and won’t renew.' : 'Cancel it on Gumroad so you aren’t billed for both.'}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const back = readReturn();
                    clearReturn();
                    nav(back ?? (my.plan === 'pro' ? '/cv-match' : '/jobs'));
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {readReturn() ? 'Back to where you were (taking you there…)' : 'Continue to MadeVisa'} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <AppLink href="/profile?tab=settings#billing" className="inline-flex items-center rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                  Billing settings
                </AppLink>
              </div>
            </Card>
          ) : (
            <Card>
              <div role="status" aria-live="polite">
                {timedOut ? <Clock className="h-9 w-9 text-amber-600" aria-hidden /> : <Loader2 className="h-9 w-9 animate-spin text-brand-600" aria-hidden />}
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-950">{timedOut ? 'We haven’t received your payment yet' : 'Waiting for your payment…'}</h1>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  {timedOut
                    ? 'If you finished paying, Gumroad may still be processing it. Check again in a minute. Please don’t pay a second time.'
                    : `Finish paying in the Gumroad tab. ${expected ? PLANS[expected].name : 'Your plan'} switches on here once Gumroad confirms the payment to MadeVisa, usually within a minute. You can close this page; it switches on either way.`}
                </p>
              </div>
              {notYet && (
                <p className="mt-4 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  No confirmed payment yet. If you were charged and it still doesn’t show after a few minutes, write to hello@madevisa.com with your Gumroad receipt — we’ll match it to your account.
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void checkNow()}
                  disabled={checking}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Check again
                </button>
                <AppLink href={`/checkout?plan=${expected ?? 'starter'}`} className="inline-flex items-center rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                  Back to checkout
                </AppLink>
                {readReturn() && (
                  <button type="button" onClick={() => nav(readReturn() ?? '/cv-match')} className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold text-brand-700 hover:underline">
                    Back to where you were
                  </button>
                )}
              </div>
              {sub?.payment_issue && sub.provider_ref && (
                <a href={manageUrl(sub.provider_ref)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                  Update your payment method on Gumroad <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
              <p className="mt-5 text-[12px] leading-5 text-ink-500">Checking again never charges you. Payments are only confirmed by Gumroad, not by opening this page.</p>
            </Card>
          )}
        </div>
      </main>
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft sm:p-8">{children}</section>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold text-ink-950">{value}</dd>
    </div>
  );
}
