import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  Bookmark,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  ListChecks,
  Loader2,
  Lock,
  Mail,
  Rocket,
  ScanSearch,
  ShieldCheck,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { View } from '@/types';
import { useSeo } from '@/lib/seo';
import { WRAP } from '@/lib/pageLayout';
import { useAuth } from '@/lib/auth';
import { rememberAuthIntent } from '@/lib/authIntent';
import { PLANS, useMyPlan, type PaidPlanId } from '@/lib/plans';
import { checkPayment, startCheckout, useCardPayments, type CheckoutResult } from '@/lib/gumroad';
import { catalogPlan, cleanSource, formatMoney, limitRows, longDate, orderSummary, readPlanParam, trackBilling, useBillingCatalog } from '@/lib/billing';
import { AppLink } from '@/pages/info/InfoPage';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';

// /checkout?plan=starter|pro&source=…
//
// MadeVisa's own checkout step: which plan, what it includes, what it costs
// today and every month, how cancelling works — then the payment itself on
// Gumroad. The page never decides an amount: prices come from the server's
// catalogue (billing_catalog()), and the checkout the server prepares is
// priced and verified against the Gumroad product on the server.

type Props = { go: (view: View) => void; onAuth?: (page: 'login' | 'register') => void };

const ICONS: Record<PaidPlanId, LucideIcon[]> = {
  starter: [ScanSearch, ListChecks, FileText, Building2, BellRing, Bookmark],
  pro: [Star, ScanSearch, ListChecks, FileText, Building2, BellRing, Bookmark, Mail],
};

/** The plans' own Gumroad pages: used when the prepared checkout isn't available, so a click always ends on Gumroad. */
const GUMROAD_PAGE: Record<PaidPlanId, string> = {
  starter: 'https://madevisa.gumroad.com/l/starter',
  pro: 'https://madevisa.gumroad.com/l/pro',
};
const gumroadPage = (plan: PaidPlanId, email: string | null | undefined) => {
  const u = new URL(GUMROAD_PAGE[plan]);
  u.searchParams.set('wanted', 'true');
  u.searchParams.set('recurrence', 'monthly');
  if (email) u.searchParams.set('email', email);
  return u.toString();
};

const PLAN_PITCH: Record<PaidPlanId, string> = {
  starter: 'Full CV reports on every job, sponsorship documents and an organised search.',
  pro: 'Auto Apply prepares applications for you, plus 50 documents a month.',
};

type Step = { at: 'idle' } | { at: 'preparing' } | { at: 'result'; result: CheckoutResult };

export function CheckoutPage({ go, onAuth }: Props) {
  const { user, profile } = useAuth();
  const my = useMyPlan();
  const card = useCardPayments();
  const catalog = useBillingCatalog();
  const [plan, setPlan] = useState<PaidPlanId>(() => readPlanParam(window.location.search));
  const source = useMemo(() => cleanSource(new URLSearchParams(window.location.search).get('source')) ?? 'checkout', []);
  const [step, setStep] = useState<Step>({ at: 'idle' });
  // Full-screen "Opening Gumroad…" while the payment page loads.
  const [leaving, setLeaving] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

  useSeo({
    title: `Checkout: MadeVisa ${PLANS[plan].name}`,
    description: `MadeVisa ${PLANS[plan].name}: ${PLANS[plan].tagline} Billed monthly in US dollars, cancel any time.`,
    path: '/checkout',
    noindex: true,
  });

  useEffect(() => {
    trackBilling('checkout_viewed', { plan, source });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The address follows the chosen plan, so a reload or a shared link keeps it.
  const choose = (p: PaidPlanId) => {
    if (p === plan) return;
    setPlan(p);
    setStep({ at: 'idle' });
    const q = new URLSearchParams(window.location.search);
    q.set('plan', p);
    window.history.replaceState({}, '', `/checkout?${q.toString()}`);
    trackBilling('plan_selected', { plan: p, source });
  };

  const info = PLANS[plan];
  const cp = catalogPlan(catalog, plan);
  const summary = cp ? orderSummary(cp, now, step.at === 'result' && step.result.kind === 'ready' ? step.result.checkout.price_cents : null) : null;
  const current = my.plan;
  const onThisPlan = current === plan;
  const higherAlready = current === 'pro' && plan === 'starter';
  // Buyable by card now: the server says so (product connected, price matches, payments on) — admins may try before it's on.
  const buyable = Boolean(cp && catalog?.source === 'server' && (cp.available || (card.on && profile?.role === 'admin')));

  // One click → Gumroad, in this tab, behind a loading screen. The prepared checkout (exact price, linked to
  // this account) when it's available; otherwise the plan's own Gumroad page with the account's email filled in.
  const pay = useCallback(async (refreshFirst = false) => {
    if (!user) return;
    trackBilling('checkout_started', { plan, source });
    setLeaving(true);
    setStep({ at: 'preparing' });
    if (!buyable) {
      window.location.assign(gumroadPage(plan, user.email));
      return;
    }
    // After cancelling the other plan on Gumroad: read the memberships again first, so the cancellation counts.
    if (refreshFirst) await checkPayment();
    const result = await startCheckout(plan, source);
    if (result.kind === 'ready') {
      window.location.assign(result.checkout.url);
      return;
    }
    if (result.kind === 'off' || result.kind === 'error') {
      trackBilling('checkout_unavailable', { plan, source });
      window.location.assign(gumroadPage(plan, user.email));
      return;
    }
    setLeaving(false);
    setStep({ at: 'result', result });
  }, [user, plan, source, buyable]);

  // Back from Gumroad (the browser may restore this page as it was): no loading screen.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setLeaving(false);
        setStep({ at: 'idle' });
      }
    };
    window.addEventListener('pageshow', back);
    return () => window.removeEventListener('pageshow', back);
  }, []);

  // From a "Get Starter / Get Pro" button: straight on to Gumroad.
  const auto = useRef(new URLSearchParams(window.location.search).get('go') === '1');
  useEffect(() => {
    if (!auto.current || !user || my.loading || !catalog) return;
    auto.current = false;
    // Once only: coming back from Gumroad with the Back button doesn't send you there again.
    const q = new URLSearchParams(window.location.search);
    q.delete('go');
    window.history.replaceState({}, '', `/checkout?${q.toString()}`);
    if (my.plan === plan || (my.plan === 'pro' && plan === 'starter')) return;
    void pay();
  }, [user, my.loading, my.plan, catalog, plan, pay]);

  const signIn = (page: 'login' | 'register') => {
    rememberAuthIntent({ next: `/checkout?plan=${plan}&source=${source}` });
    onAuth?.(page);
  };

  const result = step.at === 'result' ? step.result : null;
  const price = summary ? formatMoney(summary.dueToday, summary.currency) : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} />

      <main className={`${WRAP} pb-28 pt-6 sm:pt-10 lg:pb-16`}>
        <AppLink href="/pricing" className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-ink-600 hover:text-ink-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All plans
        </AppLink>

        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-12">
          {/* LEFT — the plan and why it's worth it */}
          <section aria-labelledby="checkout-title" className="min-w-0">
            <p className="text-sm font-semibold text-brand-700">MadeVisa checkout</p>
            <h1 id="checkout-title" className="mt-1.5 text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">
              Get noticed. Get hired. Keep growing.
            </h1>
            <p className="mt-3 max-w-2xl text-[16px] leading-7 text-ink-600">Find jobs that fit your experience, prepare stronger applications, and reach the people behind the opportunities.</p>

            <fieldset className="mt-7">
              <legend className="text-sm font-bold text-ink-900">Choose your plan</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(['starter', 'pro'] as const).map((p) => {
                  const c = catalogPlan(catalog, p);
                  const selected = plan === p;
                  return (
                    <label
                      key={p}
                      className={`relative flex cursor-pointer flex-col rounded-2xl border bg-white p-4 transition focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 ${
                        selected ? 'border-brand-600 shadow-[0_0_0_1px_#2563eb]' : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <input type="radio" name="plan" value={p} checked={selected} onChange={() => choose(p)} className="sr-only" />
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block text-[15px] font-bold text-ink-950">{PLANS[p].name}</span>
                          <span className="mt-0.5 block text-[13px] leading-5 text-ink-500">{PLAN_PITCH[p]}</span>
                        </span>
                        <span
                          aria-hidden
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-white'}`}
                        >
                          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="mt-3 text-2xl font-bold tracking-tight text-ink-950">
                        {c ? formatMoney(c.price_amount, c.currency) : <span className="inline-block h-6 w-16 animate-pulse rounded bg-ink-100 align-middle" />}
                        <span className="text-sm font-medium text-ink-500"> / month</span>
                      </span>
                      {current === p && <span className="mt-2 inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Your plan</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" aria-live="polite">
              <h2 className="text-lg font-bold text-ink-950">What you get with {info.name}</h2>
              <p className="mt-1 text-sm leading-6 text-ink-600">{info.worth}</p>

              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {info.benefits.slice(0, 2).map((b, i) => {
                  const Icon = ICONS[plan][i] ?? Check;
                  return (
                    <li key={b.title} className={`rounded-xl p-4 ${b.star ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-brand-50/70'}`}>
                      <Icon className={`h-5 w-5 ${b.star ? 'fill-amber-400 text-amber-500' : 'text-brand-700'}`} aria-hidden />
                      <p className="mt-2 text-[15px] font-bold text-ink-950">{b.title}</p>
                      <p className="mt-1 text-[13px] leading-5 text-ink-600">{b.text}</p>
                    </li>
                  );
                })}
              </ul>
              <ul className="mt-4 space-y-3">
                {info.benefits.slice(2).map((b, i) => {
                  const Icon = ICONS[plan][i + 2] ?? Check;
                  return (
                    <li key={b.title} className="flex gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                      <p className="text-sm leading-6 text-ink-700">
                        <strong className="font-semibold text-ink-950">{b.title}.</strong> {b.text}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {info.coming.length > 0 && (
                <div className="mt-5 rounded-xl border border-dashed border-ink-200 p-4">
                  <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink-700">
                    <Rocket className="h-4 w-4 text-ink-400" aria-hidden /> Coming to Pro — not included yet
                  </p>
                  <ul className="mt-2 space-y-1">
                    {info.coming.map((c) => (
                      <li key={c} className="text-[13px] leading-5 text-ink-500">
                        {c}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12px] leading-5 text-ink-400">They’ll be added to Pro at no extra cost when they’re ready. Choose Pro for what it includes today.</p>
                </div>
              )}
            </div>

            {catalog && cp && (
              <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="limits-title">
                <h2 id="limits-title" className="text-sm font-bold text-ink-950">
                  {info.name} limits, upfront
                </h2>
                <dl className="mt-3 divide-y divide-ink-100">
                  {limitRows(catalog, cp).map((r) => (
                    <div key={r.label} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:justify-between sm:gap-6">
                      <dt className="text-ink-500">{r.label}</dt>
                      <dd className="font-semibold text-ink-900 sm:text-right">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] leading-5 text-ink-500">
                  MadeVisa helps you find and apply for jobs. It can’t promise interviews, a job offer, visa sponsorship or a visa decision.
                </p>
              </section>
            )}

            <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Plans and policies">
              <AppLink href="/pricing" className="font-semibold text-brand-700 hover:underline">
                Compare all plans
              </AppLink>
              <AppLink href="/subscription-terms" className="text-ink-600 hover:text-ink-950 hover:underline">
                Subscription & refund terms
              </AppLink>
              <AppLink href="/terms" className="text-ink-600 hover:text-ink-950 hover:underline">
                Terms
              </AppLink>
              <AppLink href="/privacy" className="text-ink-600 hover:text-ink-950 hover:underline">
                Privacy
              </AppLink>
            </nav>
          </section>

          {/* RIGHT — the order summary and the payment step */}
          <aside ref={summaryRef} id="summary" className="min-w-0 scroll-mt-24 lg:sticky lg:top-24" aria-labelledby="summary-title">
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
              <div className="border-b border-ink-100 px-5 py-4 sm:px-6">
                <h2 id="summary-title" className="text-base font-bold text-ink-950">
                  Order summary
                </h2>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Plan</dt>
                    <dd className="font-semibold text-ink-950">MadeVisa {info.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Billing</dt>
                    <dd className="font-semibold text-ink-950">Monthly</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Price</dt>
                    <dd className="font-semibold text-ink-950">{price ? `${price} / month` : '…'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Tax</dt>
                    <dd className="max-w-[60%] text-right text-[13px] leading-5 text-ink-600">Added by Gumroad at checkout if it applies where you live</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-end justify-between gap-4 border-t border-ink-100 pt-4">
                  <p className="text-sm font-bold text-ink-950">Due today</p>
                  <p className="text-right">
                    <span className="text-3xl font-bold tracking-tight text-ink-950" data-due-today>
                      {price ?? '…'}
                    </span>
                    <span className="ml-1 text-xs font-semibold text-ink-500">{summary?.currency ?? 'USD'}</span>
                  </p>
                </div>
                {summary && (
                  <p className="mt-2 flex gap-2 text-[13px] leading-5 text-ink-600">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                    <span>
                      Then {formatMoney(summary.renewalAmount, summary.currency)} every month. Subscribing today, it renews on <strong className="font-semibold text-ink-800">{longDate(summary.renewsOn)}</strong>.
                    </span>
                  </p>
                )}

                <div className="mt-5">
                  <PayButton
                    plan={plan}
                    signedIn={Boolean(user)}
                    loadingPlan={my.loading}
                    onThisPlan={onThisPlan}
                    higherAlready={higherAlready}
                    catalogReady={Boolean(catalog)}
                    step={step}
                    price={price}
                    onPay={(refreshFirst) => void pay(refreshFirst)}
                    onSignIn={signIn}
                  />
                </div>

                {result?.kind === 'error' && (
                  <p role="alert" className="mt-3 flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {result.message}
                  </p>
                )}

                <div className="mt-5 space-y-2.5 border-t border-ink-100 pt-4 text-[13px] leading-5 text-ink-600">
                  <p className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>
                      You pay on <strong className="font-semibold text-ink-800">Gumroad</strong>, MadeVisa’s payment partner and the seller on your receipt. Gumroad shows the payment methods
                      available where you are. MadeVisa never sees your card.
                    </span>
                  </p>
                  <p className="flex gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                    <span>
                      Cancel any time on Gumroad or from Settings → Billing. You keep {info.name} until the end of the month you paid for, and it isn’t renewed. Refunds:{' '}
                      <AppLink href="/subscription-terms" className="font-semibold text-brand-700 hover:underline">
                        see the terms
                      </AppLink>
                      .
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Phones: the price and the next step stay in view while reading the plan. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <p className="min-w-0 text-sm leading-tight">
            <span className="block truncate font-semibold text-ink-950">MadeVisa {info.name}</span>
            <span className="text-ink-600">
              <strong className="text-ink-950">{price ?? '…'}</strong> due today · monthly
            </span>
          </p>
          <button
            type="button"
            onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Checkout <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {leaving && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-white/95 backdrop-blur" role="status" aria-live="polite">
          <div className="text-center">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-brand-600" aria-hidden />
            <p className="mt-4 text-lg font-bold text-ink-950">Opening Gumroad’s secure checkout…</p>
            <p className="mt-1 text-sm text-ink-600">MadeVisa {info.name} · {price ?? ''} / month</p>
          </div>
        </div>
      )}
      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

const PRIMARY =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY =
  'flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

function PayButton({
  plan,
  signedIn,
  loadingPlan,
  onThisPlan,
  higherAlready,
  catalogReady,
  step,
  price,
  onPay,
  onSignIn,
}: {
  plan: PaidPlanId;
  signedIn: boolean;
  loadingPlan: boolean;
  onThisPlan: boolean;
  higherAlready: boolean;
  catalogReady: boolean;
  step: Step;
  price: string | null;
  onPay: (refreshFirst?: boolean) => void;
  onSignIn: (p: 'login' | 'register') => void;
}) {
  const name = PLANS[plan].name;
  if (!signedIn) {
    return (
      <div className="space-y-2.5">
        <button type="button" onClick={() => onSignIn('register')} className={PRIMARY}>
          Create a free account to continue
        </button>
        <button type="button" onClick={() => onSignIn('login')} className={SECONDARY}>
          I have an account — sign in
        </button>
        <p className="text-center text-[12px] leading-5 text-ink-500">Your plan is linked to your MadeVisa account, so it works on every device.</p>
      </div>
    );
  }
  if (loadingPlan || !catalogReady) {
    return (
      <button type="button" disabled className={PRIMARY}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </button>
    );
  }
  if (onThisPlan || higherAlready) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {onThisPlan ? `You’re on ${name}` : 'You’re on Pro, which includes everything in Starter'}
        </p>
        <AppLink href="/profile?tab=settings#billing" className="mt-1 inline-block text-[13px] font-semibold text-emerald-900 underline">
          Manage your plan
        </AppLink>
      </div>
    );
  }
  const r = step.at === 'result' ? step.result : null;
  if (r?.kind === 'already') {
    return (
      <div className="space-y-2.5">
        <p className="text-sm leading-6 text-ink-700">A {name} membership is already running for this account on Gumroad, so a second one isn’t started.</p>
        <AppLink href="/checkout/complete" className={PRIMARY}>
          Check my payment
        </AppLink>
        <a href={r.manageUrl} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
          Open it on Gumroad <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    );
  }
  if (r?.kind === 'switch') {
    const from = PLANS[r.currentPlan].name;
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-ink-700">
          You’re paying for <strong>{from}</strong>. To move to {name}, first cancel {from} on Gumroad — you keep it until the end of the month you paid for, and you won’t be charged for it again. Then come back
          here and start {name}.
        </p>
        <a href={r.manageUrl} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
          Cancel {from} on Gumroad <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <button type="button" onClick={() => onPay(true)} className={PRIMARY}>
          I’ve cancelled {from} — start {name}
        </button>
        <p className="text-[12px] leading-5 text-ink-500">Gumroad can’t move a membership between plans, so there is no automatic upgrade or pro-rated price.</p>
      </div>
    );
  }
  if (step.at === 'preparing') {
    return (
      <button type="button" disabled className={PRIMARY} aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing secure checkout…
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => onPay()} className={PRIMARY}>
        <Lock className="h-4 w-4" aria-hidden /> Continue to secure payment{price ? ` · ${price}` : ''}
      </button>
      <p className="text-center text-[12px] leading-5 text-ink-500">You pay on Gumroad’s secure checkout; your plan starts as soon as the payment is confirmed.</p>
    </div>
  );
}
