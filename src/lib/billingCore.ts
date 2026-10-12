// The pure part of billing: types, the order summary, reading the checkout
// answer, and the view of a person's plan. No network, no browser storage —
// so it is shared by the pages and tested on its own (src/lib/__tests__/billing.test.ts).

import { ENTITLEMENTS, PLAN_ORDER, PLAN_RANK, PLANS, type Entitlement, type FeatureId, type PaidPlanId, type PlanId } from '../../supabase/functions/_shared/plans';

// ---------------------------------------------------------------------------
// The person's plan
// ---------------------------------------------------------------------------
/** The plan that gives the person access right now, as the server resolved it. */
export type Subscription = {
  plan: PlanId;
  status: string;
  /** When access ends (paid period + a short grace while the membership is alive). */
  current_period_end: string | null;
  /** 'gumroad' when paid by card; absent when an admin switched it on. */
  provider?: string | null;
  /** The membership's id at the payment provider (for "Manage or cancel"). */
  provider_ref?: string | null;
  billing?: string | null;
  /** Cancelled: the plan runs until current_period_end and is not renewed. */
  cancel_at_period_end?: boolean;
  /** Gumroad's own status: alive, pending_cancellation, pending_failure, … */
  provider_status?: string | null;
  /** Last amount Gumroad charged, in cents. */
  price_cents?: number | null;
  last_paid_at?: string | null;
  /** When the next charge is due, for a membership that renews. */
  renews_at?: string | null;
  /** A renewal failed: the card needs updating on Gumroad. */
  payment_issue?: boolean;
};

export type Usage = { saved_jobs: number; job_alerts: number; documents_this_month: number; cv_checks_today: number };
export type OtherMembership = { plan: PlanId; status: string; until: string | null; provider_ref: string | null };

export type MyPlan = {
  plan: PlanId;
  /** Starter or Pro. */
  isPaid: boolean;
  /** The Pro plan (not Starter). */
  isPro: boolean;
  sub: Subscription | null;
  /** Other memberships still running (e.g. Starter running out after a switch to Pro). */
  others: OtherMembership[];
  /** The plan that ended most recently, when there is none now. */
  last: { plan: PlanId; ended_at: string | null; provider_status: string | null } | null;
  usage: Usage | null;
  loading: boolean;
  /** May this person use the feature? (Display only — the server decides.) */
  has: (f: FeatureId) => boolean;
  /** The plan's limit for a feature: null = no limit, 0 = not included. */
  limit: (f: FeatureId) => number | null;
};

export type Loaded = {
  plan: PlanId;
  sub: Subscription | null;
  others: OtherMembership[];
  last: MyPlan['last'];
  usage: Usage | null;
  features: Partial<Record<FeatureId, Entitlement>>;
};

/** The view of a loaded plan (exported for tests). */
export function planView(d: Loaded, loading = false): MyPlan {
  const get = (f: FeatureId): Entitlement => d.features[f] ?? ENTITLEMENTS[d.plan][f] ?? { allowed: false, limit: 0, period: null };
  return {
    plan: d.plan,
    isPaid: PLAN_RANK[d.plan] > 0,
    isPro: d.plan === 'pro',
    sub: d.sub,
    others: d.others,
    last: d.last,
    usage: d.usage,
    loading,
    has: (f) => get(f).allowed,
    limit: (f) => (get(f).allowed ? get(f).limit : 0),
  };
}


// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export type CatalogPlan = {
  id: PlanId;
  name: string;
  rank: number;
  interval: 'monthly' | null;
  /** Cents. */
  price_amount: number;
  currency: string;
  /** Can be bought by card right now. */
  available: boolean;
  features: Partial<Record<FeatureId, Entitlement>>;
};
export type Catalog = {
  card_payments: boolean;
  plans: CatalogPlan[];
  auto_apply: { enabled: boolean; free_monthly: number; pro_monthly: number } | null;
  documents_per_week: number;
  /** 'server' = read from the database; 'fallback' = the database could not be reached (nothing can be bought). */
  source: 'server' | 'fallback';
};

/** The catalogue from the code, used only when the server can't be reached: nothing is purchasable from it. */
export function fallbackCatalog(): Catalog {
  return {
    card_payments: false,
    source: 'fallback',
    auto_apply: null,
    documents_per_week: 30,
    plans: PLAN_ORDER.map((id, rank) => ({
      id,
      name: PLANS[id].name,
      rank,
      interval: PLANS[id].interval ? 'monthly' : null,
      price_amount: PLANS[id].priceCents,
      currency: PLANS[id].currency,
      available: false,
      features: ENTITLEMENTS[id],
    })),
  };
}

export const catalogPlan = (c: Catalog | null, id: PlanId): CatalogPlan | null => c?.plans.find((p) => p.id === id) ?? null;

// ---------------------------------------------------------------------------
// Money and the order summary
// ---------------------------------------------------------------------------
/** "$2.99" in the plan's currency (USD today). */
export function formatMoney(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** The same day next month (31 Jan → 28/29 Feb). */
export function nextMonth(d: Date): Date {
  const n = new Date(d.getTime());
  const day = n.getDate();
  n.setDate(1);
  n.setMonth(n.getMonth() + 1);
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  n.setDate(Math.min(day, last));
  return n;
}

export const longDate = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export type OrderSummary = {
  plan: PaidPlanId;
  name: string;
  billing: 'Monthly';
  currency: string;
  /** Cents due today, before any tax Gumroad adds. */
  dueToday: number;
  /** Charged every month until cancelled. */
  renewalAmount: number;
  /** If bought today. */
  renewsOn: Date;
  /** The server confirmed this exact amount for this checkout. */
  confirmed: boolean;
};

/**
 * What the person pays: the catalogue price (from the server), replaced by the amount the
 * server priced the actual checkout at once it is prepared. No discounts exist, so none is shown.
 */
export function orderSummary(plan: CatalogPlan, now: Date, confirmedCents?: number | null): OrderSummary {
  const cents = confirmedCents ?? plan.price_amount;
  return {
    plan: plan.id === 'starter' ? 'starter' : 'pro',
    name: plan.name,
    billing: 'Monthly',
    currency: plan.currency,
    dueToday: cents,
    renewalAmount: cents,
    renewsOn: nextMonth(now),
    confirmed: confirmedCents != null,
  };
}

/** Which button led to the checkout: lower-case letters, digits and _ only (the server checks the same). */
export const cleanSource = (v: string | null | undefined): string | null => (v && /^[a-z0-9_]{1,40}$/.test(v) ? v : null);

/** /checkout?plan=…&source=… */
export const checkoutHref = (plan: PaidPlanId, source?: string) => `/checkout?plan=${plan}${source ? `&source=${encodeURIComponent(source)}` : ''}`;


// ---------------------------------------------------------------------------
// The checkout function's answer
// ---------------------------------------------------------------------------
export type Checkout = {
  /** Gumroad's checkout, with the email and the account reference already set. */
  url: string;
  checkout_id: string;
  plan: PaidPlanId;
  billing: 'monthly';
  /** What Gumroad will charge (before any tax it adds), as the server confirmed it. */
  price_cents: number;
  currency: string;
  email: string | null;
};
export type CheckoutResult =
  | { kind: 'ready'; checkout: Checkout }
  /** A membership for this plan is already running on Gumroad for this account. */
  | { kind: 'already'; manageUrl: string }
  /** Another plan is running: cancel it on Gumroad first, then start this one. */
  | { kind: 'switch'; currentPlan: PaidPlanId; manageUrl: string }
  /** Card payment is not available (not set up, or switched off): use the request form. */
  | { kind: 'off' }
  | { kind: 'error'; message: string };

const GUMROAD = /^https:\/\/([a-z0-9-]+\.)*gumroad\.com\//i;

/** Turns the function's answer into what the page shows (exported for tests). */
export function readCheckout(plan: PaidPlanId, data: Record<string, unknown> | null): CheckoutResult {
  if (!data) return { kind: 'error', message: 'The payment page could not be prepared. Check your connection and try again.' };
  if (data.error === 'off') return { kind: 'off' };
  if (typeof data.error === 'string') return { kind: 'error', message: data.error };
  if (data.already && typeof data.manage_url === 'string' && GUMROAD.test(data.manage_url)) return { kind: 'already', manageUrl: data.manage_url };
  if (data.switch && typeof data.manage_url === 'string' && GUMROAD.test(data.manage_url)) {
    return { kind: 'switch', currentPlan: data.current_plan === 'starter' ? 'starter' : 'pro', manageUrl: data.manage_url };
  }
  if (typeof data.url === 'string' && GUMROAD.test(data.url) && data.plan === plan && Number.isInteger(data.price_cents) && typeof data.checkout_id === 'string') {
    return { kind: 'ready', checkout: data as unknown as Checkout };
  }
  return { kind: 'error', message: 'The payment page could not be prepared. Please try again.' };
}

// ---------------------------------------------------------------------------
// Checkout pages
// ---------------------------------------------------------------------------
export const readPlanParam = (search: string): PaidPlanId => (new URLSearchParams(search).get('plan') === 'pro' ? 'pro' : 'starter');

/** What the plan allows, from the server's catalogue — the limits a buyer sees before paying. */
export function limitRows(c: Catalog, plan: CatalogPlan): { label: string; value: string }[] {
  const f = plan.features;
  const lim = (n: number | null | undefined, unit: string) => (n == null ? `No limit` : `${n} ${unit}`);
  const rows = [
    { label: 'Full CV match report', value: f.cv_full_report?.allowed ? 'Every job' : `Missing skills on ${f.cv_missing_skills?.limit ?? 3} jobs a day` },
    {
      label: 'Sponsorship documents',
      value: f.sponsorship_documents?.allowed ? `${lim(f.sponsorship_documents.limit, 'a month')}, at most ${c.documents_per_week} in any 7 days` : 'Not included',
    },
    { label: 'Job alerts', value: lim(f.job_alerts?.limit, f.job_alerts?.limit === 1 ? 'alert' : 'alerts at a time') },
    { label: 'Saved jobs', value: f.saved_jobs?.limit == null ? 'No limit' : `${f.saved_jobs.limit} jobs` },
  ];
  if (c.auto_apply?.enabled) {
    rows.push({
      label: 'Auto Apply',
      value: f.auto_apply?.allowed ? `Up to ${c.auto_apply.pro_monthly} applications a month` : `${c.auto_apply.free_monthly} applications a month to try it`,
    });
  }
  return rows;
}


/** Is the plan the person paid for (or a higher one) on? */
export function confirmedFor(expected: PaidPlanId | null, current: PlanId): boolean {
  return expected ? PLAN_RANK[current] >= PLAN_RANK[expected] : current !== 'free';
}

