import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Lock, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useMyPlan, refreshMyPlan } from '@/lib/plans';
import { checkPayment, dollars, startCheckout, type Checkout } from '@/lib/gumroad';
import { countryName } from '@/lib/visaFit';

// "Get Pro" when card payments are on.
//
// 1. The server prepares the checkout: the price for the person's country
//    (the one the pricing page shows) and a link to Gumroad's payment page
//    with their email and the monthly / yearly choice filled in.
// 2. They pay on Gumroad, in a new tab.
// 3. This dialog waits: Gumroad tells the server, the server switches Pro on,
//    and the dialog sees it. "I've paid" asks the server to look right now.

type Step =
  | { at: 'preparing' }
  | { at: 'ready'; checkout: Checkout }
  | { at: 'waiting'; checkout: Checkout }
  | { at: 'already'; manageUrl: string }
  | { at: 'error'; message: string };

/** How long the dialog keeps looking for the payment by itself. */
const WAIT_MS = 10 * 60_000;

export function PlanCheckoutDialog({
  billing,
  onClose,
  onAuth,
  onUnavailable,
}: {
  billing: 'monthly' | 'yearly';
  onClose: () => void;
  onAuth?: (page: 'login' | 'register') => void;
  /** Card payment turned out to be off: the caller shows the request form instead. */
  onUnavailable: () => void;
}) {
  const { user } = useAuth();
  const { isPro } = useMyPlan();
  const [step, setStep] = useState<Step>({ at: 'preparing' });
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const started = useRef(false);
  const waitingSince = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const prepare = useCallback(async () => {
    setStep({ at: 'preparing' });
    const res = await startCheckout(billing);
    if (res.kind === 'off') return onUnavailable();
    if (res.kind === 'ready') setStep({ at: 'ready', checkout: res.checkout });
    else if (res.kind === 'already') setStep({ at: 'already', manageUrl: res.manageUrl });
    else setStep({ at: 'error', message: res.message });
  }, [billing, onUnavailable]);
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    void prepare();
  }, [user, prepare]);

  // While waiting: read the plan every few seconds, ask the server to look at
  // Gumroad now and then, and straight away when the person comes back to this tab.
  const waiting = step.at === 'waiting' && !isPro;
  useEffect(() => {
    if (!waiting) return;
    waitingSince.current = Date.now();
    let n = 0;
    const t = window.setInterval(() => {
      if (Date.now() - waitingSince.current > WAIT_MS) return window.clearInterval(t);
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
  }, [waiting]);

  const checkNow = async () => {
    setChecking(true);
    setNotYet(false);
    const on = await checkPayment();
    setChecking(false);
    if (!on) setNotYet(true);
  };

  const period = billing === 'monthly' ? 'month' : 'year';
  const checkout = step.at === 'ready' || step.at === 'waiting' ? step.checkout : null;
  const reduced = checkout ? checkout.price_cents < checkout.list_cents : false;
  const place = checkout?.country ? (countryName(checkout.country) ?? checkout.country) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Get MadeVisa Pro">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-ink-950">MadeVisa Pro</p>
            <p className="text-sm text-ink-500">{billing === 'monthly' ? 'Billed monthly' : 'Billed yearly'} · cancel any time</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isPro ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 text-lg font-bold text-ink-950">Pro is on</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-ink-600">Full CV match reports, 50 sponsorship documents a month, instant job alerts and full company data are unlocked. Your receipt is in your email.</p>
            <button onClick={onClose} className="mt-5 rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white">
              Done
            </button>
          </div>
        ) : !user ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm leading-6 text-ink-700">Pro is linked to your MadeVisa account, so it works on every device. Create a free account first; it takes a minute.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => onAuth?.('register')} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Create account
              </button>
              <button onClick={() => onAuth?.('login')} className="rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Sign in
              </button>
            </div>
          </div>
        ) : step.at === 'preparing' ? (
          <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing your payment page…
          </p>
        ) : step.at === 'error' ? (
          <div className="px-5 py-6">
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{step.message}</p>
            <button onClick={() => void prepare()} className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              Try again
            </button>
          </div>
        ) : step.at === 'already' ? (
          <div className="px-5 py-6">
            <p className="text-sm leading-6 text-ink-700">A MadeVisa Pro membership is already running for this account on Gumroad, so a second one is not started. If Pro is not showing here, check your payment.</p>
            {notYet && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">No paid period was found. Open the membership on Gumroad to see its payments, or write to hello@madevisa.com.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => void checkNow()} disabled={checking} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {checking && <Loader2 className="h-4 w-4 animate-spin" />} Check my payment
              </button>
              <a href={step.manageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Open it on Gumroad <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ) : checkout ? (
          <div className="px-5 py-5">
            <p className="text-3xl font-bold tracking-tight text-ink-950" data-checkout-price>
              {dollars(checkout.price_cents)}
              <span className="text-base font-medium text-ink-500"> / {period}</span>
              {reduced && <span className="ml-2 text-base font-medium text-ink-400 line-through">{dollars(checkout.list_cents)}</span>}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              {reduced && place ? `The price for ${place}. ` : ''}Charged in US dollars; your bank converts it. It renews every {period} at this price until you cancel.
            </p>

            {step.at === 'ready' ? (
              <>
                <a
                  href={checkout.url}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setStep({ at: 'waiting', checkout })}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <Lock className="h-4 w-4" /> Continue to payment
                </a>
                <p className="mt-3 text-xs leading-5 text-ink-500">
                  You pay by card on Gumroad, our payment partner, which opens in a new tab{checkout.email ? (
                    <>
                      {' '}
                      with <strong className="font-semibold text-ink-700">{checkout.email}</strong> filled in
                    </>
                  ) : null}
                  . MadeVisa never sees your card. Pro switches on here by itself a moment after you pay.
                </p>
              </>
            ) : (
              <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> Waiting for your payment…
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-600">Finish paying in the Gumroad tab. This turns to “Pro is on” by itself, usually within a minute. You can also close this; Pro switches on either way.</p>
                {notYet && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">We don’t see a payment yet. If you have just paid, give it a minute and check again. If you were charged and it still doesn’t show, write to hello@madevisa.com with your receipt.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => void checkNow()} disabled={checking} className="inline-flex items-center gap-2 rounded-lg bg-ink-950 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60">
                    {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />} I’ve paid — check now
                  </button>
                  <a href={checkout.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 hover:bg-ink-50">
                    Open the payment page again <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
