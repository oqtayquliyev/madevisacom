// Card payments for the MadeVisa Membership, through Gumroad.
//
// The browser only ever does four things here: ask whether card payment is
// on, ask the `gumroad` function to prepare a checkout (for an account, or —
// without one — the membership's Gumroad page), go there, and ask it to look
// at the person's payment again. The price, the product and switching
// the plan on all happen on the server (supabase/functions/gumroad, migrations
// 20261203090000 and 20261219090000). The page never sends an amount.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { MEMBERSHIP_PLAN, MEMBERSHIP_URL, PLANS, refreshMyPlan, type PaidPlanId, type PlanId } from '@/lib/plans';
import { trackBilling } from '@/lib/billing';
import { readCheckout, type CheckoutResult } from '@/lib/billingCore';
import { startGuestClaim } from '@/lib/guestClaim';
import { openGumroadCheckout } from '@/lib/gumroadOverlay';
import { rememberReturn } from '@/lib/returnTo';

export { readCheckout, type Checkout, type CheckoutResult } from '@/lib/billingCore';

type Status = { enabled: boolean; connected: boolean };
const OFF: Status = { enabled: false, connected: false };
let statusMemo: Status | null = null;
let statusInflight: Promise<Status> | null = null;

function loadStatus(): Promise<Status> {
  if (statusMemo) return Promise.resolve(statusMemo);
  statusInflight ??= Promise.resolve(supabase.rpc('gumroad_public'))
    .then(({ data, error }) => {
      const s = !error && data ? (data as Status) : OFF;
      statusMemo = s;
      return s;
    })
    .catch(() => OFF);
  return statusInflight;
}

/** Forget what we know (after an admin connects or switches it). */
export function resetCardPayments(): void {
  statusMemo = null;
  statusInflight = null;
}

/**
 * Can this person pay by card? On for everyone once an admin switches it on;
 * admins can try the checkout as soon as a product is connected.
 */
export function useCardPayments(): { on: boolean; ready: boolean } {
  const { profile } = useAuth();
  const [status, setStatus] = useState<Status | null>(statusMemo);
  useEffect(() => {
    let alive = true;
    void loadStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  const on = Boolean(status && (status.enabled || (status.connected && profile?.role === 'admin')));
  return { on, ready: status !== null };
}

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.functions.invoke('gumroad', { body });
    if (error || !data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Prepare a checkout for the signed-in person. `source` says which button led here (for the funnel in Admin → Plans). */
export async function startCheckout(_plan: PaidPlanId, source: string | null): Promise<CheckoutResult> {
  return readCheckout(MEMBERSHIP_PLAN, await invoke({ action: 'checkout', plan: MEMBERSHIP_PLAN, billing: RECURRENCE, source }));
}

/** The membership's Gumroad page (MEMBERSHIP_URL), with the email filled in when we know it. */
/** The membership's one billing period: every 3 months. */
const RECURRENCE = PLANS[MEMBERSHIP_PLAN].recurrence ?? 'quarterly';

function membershipPage(email: string | null | undefined): string {
  const u = new URL(MEMBERSHIP_URL);
  u.searchParams.set('recurrence', RECURRENCE);
  if (email) u.searchParams.set('email', email);
  return u.toString();
}

export type PayOutcome =
  /** The browser is on its way to Gumroad, or Gumroad's payment form is open over the page. */
  | { kind: 'leaving' }
  /** This account already has a membership running on Gumroad. */
  | { kind: 'already'; manageUrl: string };

/**
 * Adds a Gumroad offer code to a product link: /l/membership → /l/membership/CODE
 * (Gumroad's own way of applying a discount from a link). Anything else is left alone.
 */
export function withOfferCode(url: string, code: string | null | undefined): string {
  if (!code || !/^[A-Za-z0-9_-]{2,40}$/.test(code)) return url;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/l\/([^/]+)\/?$/);
    if (!m) return url;
    u.pathname = `/l/${m[1]}/${code}`;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * "Subscribe": Gumroad's payment form, opened over the page (the overlay), with or without
 * a MadeVisa account. When the overlay can't load, Gumroad's page opens instead, as before.
 * Signed in → a checkout linked to the account. Signed out → the membership's page; the
 * payment then lands on the account with that email, or a new account is made for it.
 * `offerCode`: a Gumroad offer code (the "first month for less" offer), when one is set.
 */
export async function goToMembershipCheckout(opts: { signedIn: boolean; email?: string | null; source: string; offerCode?: string | null }): Promise<PayOutcome> {
  trackBilling('checkout_started', { plan: MEMBERSHIP_PLAN, source: opts.source, guest: !opts.signedIn, offer: Boolean(opts.offerCode) });
  // After paying, the confirmation page brings them back to this exact page (the job they were on).
  rememberReturn(`${window.location.pathname}${window.location.search}`);
  if (opts.signedIn) {
    const r = await startCheckout(MEMBERSHIP_PLAN, opts.source);
    if (r.kind === 'ready') {
      const done = `/checkout/complete?c=${encodeURIComponent(r.checkout.checkout_id)}&plan=${MEMBERSHIP_PLAN}`;
      const how = await openGumroadCheckout(withOfferCode(r.checkout.url, opts.offerCode), {
        // Paid: the page that waits for the server's confirmation (it never trusts the click alone).
        onSale: () => window.location.assign(done),
        // While the form is open: ask the server to read the payment; the page unlocks by itself.
        onTick: () => void checkPayment().then((p) => p.plan !== 'free' && window.location.assign(done)),
      });
      trackBilling('checkout_viewed', { mode: how, source: opts.source });
      return { kind: 'leaving' };
    }
    if (r.kind === 'already' || r.kind === 'switch') return { kind: 'already', manageUrl: r.manageUrl };
    trackBilling('checkout_unavailable', { plan: MEMBERSHIP_PLAN, source: opts.source });
    window.location.assign(withOfferCode(membershipPage(opts.email), opts.offerCode));
    return { kind: 'leaving' };
  }
  // No account: the membership's page. The payment is matched to an account by its email (or one is made).
  // The token (?mvg=) comes back with the sale, so this browser can sign them in and return them here
  // (GuestReturn watches for it — it starts looking the moment the claim is made).
  const u = new URL(withOfferCode(membershipPage(opts.email), opts.offerCode));
  u.searchParams.set('mvg', startGuestClaim(window.location.pathname + window.location.search));
  const how = await openGumroadCheckout(u.toString());
  trackBilling('checkout_viewed', { mode: how, source: opts.source, guest: true });
  return { kind: 'leaving' };
}

/**
 * Looks at the person's payment again on Gumroad (the server allows it once
 * every 10 seconds) and reloads their plan. Answers the plan they have now.
 */
export async function checkPayment(): Promise<{ plan: PlanId; throttled: boolean }> {
  const data = await invoke({ action: 'refresh' });
  refreshMyPlan();
  const plan = data?.plan === 'starter' || data?.plan === 'pro' ? data.plan : 'free';
  return { plan, throttled: Boolean(data?.throttled) };
}

/** Where a member changes their card, or cancels. */
export const manageUrl = (subscriptionId: string) => `https://gumroad.com/subscriptions/${encodeURIComponent(subscriptionId)}/manage`;

/** "$12" / "$94.50". */
export const dollars = (cents: number) => `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
