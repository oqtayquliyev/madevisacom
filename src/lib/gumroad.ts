// Card payments for MadeVisa Pro, through Gumroad.
//
// The browser only ever does three things here: ask whether card payment is
// on, ask the `gumroad` function for a checkout link, and ask it to look at
// the person's payment again. The price, the discount code and switching Pro
// on all happen on the server (supabase/functions/gumroad, migration
// 20261203090000). Until that is set up, everything here says "off" and the
// site keeps its request form.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { refreshMyPlan } from '@/lib/plans';

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
 * admins can try the checkout as soon as the product is connected.
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

export type Checkout = {
  /** Gumroad's checkout, with the email, the billing period and the price already set. */
  url: string;
  billing: 'monthly' | 'yearly';
  /** Country the price is for, as the server saw it (null = could not tell). */
  country: string | null;
  price_cents: number;
  list_cents: number;
  email: string | null;
};
export type CheckoutResult =
  | { kind: 'ready'; checkout: Checkout }
  /** A membership is already running on Gumroad for this account. */
  | { kind: 'already'; manageUrl: string }
  /** Card payment is not available (not set up, or switched off): use the request form. */
  | { kind: 'off' }
  | { kind: 'error'; message: string };

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.functions.invoke('gumroad', { body });
    if (error || !data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function startCheckout(billing: 'monthly' | 'yearly'): Promise<CheckoutResult> {
  const data = await invoke({ action: 'checkout', billing });
  if (!data) return { kind: 'error', message: 'The payment page could not be prepared. Check your connection and try again.' };
  if (data.error === 'off') return { kind: 'off' };
  if (typeof data.error === 'string') return { kind: 'error', message: data.error };
  if (data.already && typeof data.manage_url === 'string') return { kind: 'already', manageUrl: data.manage_url };
  if (typeof data.url === 'string' && /^https:\/\/([a-z0-9-]+\.)*gumroad\.com\//i.test(data.url)) return { kind: 'ready', checkout: data as unknown as Checkout };
  return { kind: 'error', message: 'The payment page could not be prepared. Please try again.' };
}

/**
 * Looks at the person's payment again on Gumroad (the server allows it once
 * every 10 seconds) and reloads their plan. True when Pro is on.
 */
export async function checkPayment(): Promise<boolean> {
  const data = await invoke({ action: 'refresh' });
  refreshMyPlan();
  return Boolean(data?.active);
}

/** Where a member changes their card, or cancels. */
export const manageUrl = (subscriptionId: string) => `https://gumroad.com/subscriptions/${encodeURIComponent(subscriptionId)}/manage`;

/** "$12" / "$94.50". */
export const dollars = (cents: number) => `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
