// Card payments for Starter and Pro, through Gumroad.
//
// The browser only ever does three things here: ask whether card payment is
// on, ask the `gumroad` function to prepare a checkout for a plan, and ask it
// to look at the person's payment again. The price, the product and switching
// the plan on all happen on the server (supabase/functions/gumroad, migrations
// 20261203090000 and 20261219090000). The page never sends an amount.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { refreshMyPlan, type PaidPlanId, type PlanId } from '@/lib/plans';
import { readCheckout, type CheckoutResult } from '@/lib/billingCore';

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

/** Prepare a checkout. `source` says which button led here (for the funnel in Admin → Plans). */
export async function startCheckout(plan: PaidPlanId, source: string | null): Promise<CheckoutResult> {
  return readCheckout(plan, await invoke({ action: 'checkout', plan, billing: 'monthly', source }));
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
