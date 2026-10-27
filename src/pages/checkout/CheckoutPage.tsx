import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Lock } from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { nav } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { MEMBERSHIP_PRICE, useMyPlan } from '@/lib/plans';
import { goToMembershipCheckout } from '@/lib/gumroad';
import { cleanSource, trackBilling } from '@/lib/billing';
import { readReturn } from '@/lib/returnTo';

// /checkout?source=…
//
// No checkout page of our own any more: this address only shows "Opening
// secure payment…" and moves straight on to Gumroad's payment page — with a
// MadeVisa account (the checkout is linked to it) or without one (the payment
// is matched to the account with that email, or a new account is made for it
// by the gumroad function). Every old "Get Starter / Get Pro" link lands here.

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

type State = { at: 'opening' } | { at: 'member' } | { at: 'already'; manageUrl: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CheckoutPage(_props: Props) {
  const { user, loading: authLoading } = useAuth();
  const my = useMyPlan();
  const source = useMemo(() => cleanSource(new URLSearchParams(window.location.search).get('source')) ?? 'checkout', []);
  const [state, setState] = useState<State>({ at: 'opening' });
  const started = useRef(false);

  // Back from Gumroad, or the payment form closed: offer the way back instead of a spinner.
  const [back, setBack] = useState(false);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setBack(true);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  useSeo({ title: 'Opening secure payment', description: `MadeVisa Membership, ${MEMBERSHIP_PRICE} a month. Secure payment by Gumroad.`, path: '/checkout', noindex: true });

  useEffect(() => {
    if (authLoading || (user && my.loading) || started.current) return;
    started.current = true;
    trackBilling('checkout_viewed', { source });
    if (my.isPaid) {
      setState({ at: 'member' });
      return;
    }
    void goToMembershipCheckout({ signedIn: Boolean(user), email: user?.email ?? null, source }).then((r) => {
      if (r.kind === 'already') setState({ at: 'already', manageUrl: r.manageUrl });
      // The payment form opens over this page now: once it's closed, offer the way on instead of a spinner.
      else window.setTimeout(() => setBack(true), 2500);
    });
  }, [authLoading, user, my.loading, my.isPaid, source]);


  const leave = () => nav(readReturn() ?? '/jobs');

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#f8fafc] px-5 text-ink-900">
      <div className="w-full max-w-sm text-center">
        {state.at === 'opening' && !back && (
          <div role="status" aria-live="polite">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-brand-600" aria-hidden />
            <h1 className="mt-5 font-title text-2xl font-bold tracking-tight text-ink-950">Opening secure payment…</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              MadeVisa Membership · <strong className="text-ink-900">{MEMBERSHIP_PRICE}/month</strong>. Cancel anytime.
            </p>
            <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-500">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Secure payment by Gumroad
            </p>
          </div>
        )}
        {state.at === 'opening' && back && (
          <div>
            <h1 className="font-title text-2xl font-bold tracking-tight text-ink-950">Payment not finished yet?</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">Open the payment again, or keep browsing jobs. Paid already? Your membership switches on within a minute.</p>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
                Continue to payment
              </button>
              <button type="button" onClick={leave} className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-100">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back to jobs
              </button>
            </div>
          </div>
        )}
        {state.at === 'member' && (
          <div>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h1 className="mt-4 font-title text-2xl font-bold tracking-tight text-ink-950">You’re already a member</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">Every job and every benefit is unlocked on your account.</p>
            <button type="button" onClick={leave} className="mt-6 w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
              Browse jobs
            </button>
          </div>
        )}
        {state.at === 'already' && (
          <div>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h1 className="mt-4 font-title text-2xl font-bold tracking-tight text-ink-950">Your membership is already running</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">Gumroad is still billing a MadeVisa membership for this account, so there’s nothing to buy.</p>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={leave} className="rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
                Browse jobs
              </button>
              <a href={state.manageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-100">
                Manage on Gumroad <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
