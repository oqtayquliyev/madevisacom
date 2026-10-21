// The gumroad function's logic (see index.ts for what it does and how to deploy it).
//
// Nothing here talks to Deno or Supabase directly: the database, sign-in
// check, network and secrets are handed in (Deps), so the same code runs in
// the tests against a pretend Gumroad.

import { isPaidPlanId, MEMBERSHIP_PLAN, PLANS, type PaidPlanId } from '../_shared/plans.ts';

// deno-lint-ignore no-explicit-any
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Deps = {
  /** A database function, called with the service role. */
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: Json; error: { message: string } | null }>;
  /** The signed-in person behind an Authorization header, or null. */
  getUser: (authorization: string) => Promise<{ id: string; email: string | null } | null>;
  fetch: typeof fetch;
  env: (name: string) => string | undefined;
  /** Work that may finish after the answer has been sent. */
  background: (work: Promise<unknown>) => void;
  /**
   * Creates a MadeVisa account (sign-in by email code) for a buyer who paid on
   * Gumroad without one. Absent in tests that don't need it.
   */
  createAccount?: (email: string) => Promise<{ id: string } | { error: string }>;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const API = 'https://api.gumroad.com/v2';
const SITE = 'https://madevisa.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Everything Gumroad can tell us about a membership. */
export const RESOURCES = ['sale', 'refund', 'dispute', 'dispute_won', 'cancellation', 'subscription_updated', 'subscription_ended', 'subscription_restarted'] as const;
const ALIVE = new Set(['alive', 'pending_cancellation', 'pending_failure', 'payment_method_update_required']);

/** One paid plan and the Gumroad product it is sold as (billing_plans). */
export type PlanProduct = {
  plan: PaidPlanId;
  /** The plan's price (cents) — what the site shows and what the product must cost. */
  price_cents: number;
  currency: string;
  product_id: string | null;
  product_url: string | null;
  product_name: string | null;
  provider_price_cents: number | null;
  connected_at: string | null;
  active: boolean;
};
export type Config = {
  enabled: boolean;
  /** The old single "MadeVisa Pro" product (PPP prices). Still read so its members keep Pro. */
  product_id: string | null;
  product_url: string | null;
  legacy_product_id?: string | null;
  monthly_cents: number | null;
  yearly_cents: number | null;
  can_discount: boolean;
  webhook_key: string;
  hooks: { id: string; resource_name: string }[];
  connected_at: string | null;
  plans?: PlanProduct[];
};

/** Which plan a Gumroad product is. The old Pro product is Pro. Anything else is not ours. */
export function planForProduct(cfg: Config, productId: unknown): PaidPlanId | null {
  const id = typeof productId === 'string' ? productId : productId == null ? '' : String(productId);
  if (!id) return null;
  const hit = (cfg.plans ?? []).find((p) => p.product_id && p.product_id === id);
  if (hit) return hit.plan;
  const legacy = cfg.legacy_product_id ?? cfg.product_id;
  return legacy && legacy === id ? 'pro' : null;
}
const knownProducts = (cfg: Config): string[] =>
  [...new Set([...(cfg.plans ?? []).map((p) => p.product_id), cfg.legacy_product_id ?? cfg.product_id].filter((x): x is string => Boolean(x)))];
const planProduct = (cfg: Config, plan: PaidPlanId): PlanProduct | null => (cfg.plans ?? []).find((p) => p.plan === plan) ?? null;

// ---------------------------------------------------------------------------
// Gumroad's API
// ---------------------------------------------------------------------------
type ApiResult = { ok: boolean; status: number; body: Json; message: string };

async function gumroad(deps: Deps, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, params: Record<string, string | number | boolean> = {}): Promise<ApiResult> {
  const token = deps.env('GUMROAD_ACCESS_TOKEN') ?? '';
  if (!token) return { ok: false, status: 0, body: null, message: 'The secret GUMROAD_ACCESS_TOKEN is not set on this function.' };
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.set(k, String(v));
  const query = method === 'GET' && [...form.keys()].length ? `?${form.toString()}` : '';
  try {
    const res = await deps.fetch(`${API}${path}${query}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
      body: method === 'GET' ? undefined : form.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const body = await res.json().catch(() => null);
    const ok = res.ok && body?.success === true;
    const message = ok ? '' : String(body?.message ?? (res.status === 401 ? 'Gumroad did not accept the access token.' : `Gumroad answered ${res.status}.`)).slice(0, 240);
    return { ok, status: res.status, body, message };
  } catch (e) {
    return { ok: false, status: 0, body: null, message: `Gumroad could not be reached (${e instanceof Error ? e.name : 'error'}).` };
  }
}

// ---------------------------------------------------------------------------
// One membership, as Gumroad's API describes it now → the database
// ---------------------------------------------------------------------------
type SyncInput = { subscriptionId?: string | null; saleId?: string | null; checkoutId?: string | null; test?: boolean; claimUser?: string | null };
type SyncResult = { ok: boolean; note: string; active?: boolean; linked?: boolean; plan?: PaidPlanId };

const time = (v: unknown): number => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const iso = (v: unknown): string | null => (time(v) ? new Date(time(v)).toISOString() : null);

/**
 * Reads the membership and its latest payments from Gumroad and applies them.
 * A notification only says "look at this membership": what is true comes from
 * the API, so a made-up notification cannot switch Pro on.
 */
export async function syncSubscription(deps: Deps, cfg: Config, input: SyncInput): Promise<SyncResult> {
  if (!knownProducts(cfg).length) return { ok: true, note: 'No product is connected: ignored.' };
  let subscriptionId = input.subscriptionId || null;
  const sales = new Map<string, Json>();

  if (!subscriptionId) {
    if (!input.saleId) return { ok: true, note: 'Nothing to look up: ignored.' };
    const s = await gumroad(deps, 'GET', `/sales/${encodeURIComponent(input.saleId)}`);
    if (!s.ok) return { ok: false, note: `Gumroad does not confirm this sale. ${s.message}` };
    const sale = s.body.sale;
    if (!planForProduct(cfg, sale?.product_id)) return { ok: true, note: 'A sale of another product: ignored.' };
    if (!sale?.subscription_id) return { ok: true, note: 'Not a membership payment: ignored.' };
    subscriptionId = String(sale.subscription_id);
    sales.set(String(sale.id), sale);
  }

  const r = await gumroad(deps, 'GET', `/subscribers/${encodeURIComponent(subscriptionId)}`);
  if (!r.ok) return { ok: false, note: `Gumroad does not confirm this membership. ${r.message}` };
  const sub = r.body.subscriber;
  // The product decides the plan — never the checkout link or the notification.
  const plan = planForProduct(cfg, sub?.product_id);
  if (!plan) return { ok: true, note: 'A membership of another product: ignored.' };

  // The latest payments (a refund can leave an earlier one as the last that counts).
  const ids: string[] = Array.isArray(sub.purchase_ids) ? sub.purchase_ids.map(String) : [];
  if (input.saleId && !ids.includes(input.saleId)) ids.push(input.saleId);
  await Promise.all(
    ids.slice(-3).filter((id) => !sales.has(id)).map(async (id) => {
      const s = await gumroad(deps, 'GET', `/sales/${encodeURIComponent(id)}`);
      if (s.ok && s.body.sale?.product_id === sub.product_id) sales.set(id, s.body.sale);
    }),
  );
  const known = [...sales.values()].sort((a, b) => time(a.created_at) - time(b.created_at));
  const latest = known[known.length - 1] ?? null;
  // `chargedback` is false again once a dispute is won, so a won dispute still counts as paid.
  const paid = known.filter((s) => !s.refunded && !s.chargedback);
  const status = String(sub.status ?? 'alive');
  let lastPaidAt = paid.length ? iso(paid[paid.length - 1].created_at) : null;
  let guessed = false;
  // Gumroad lists no payment we could read, yet says the membership is alive and was charged: count from now.
  if (!lastPaidAt && !known.length && ALIVE.has(status) && Number(sub.charge_occurrence_count ?? 0) > 0) {
    lastPaidAt = new Date().toISOString();
    guessed = true;
  }

  const email = String(sub.email ?? latest?.purchase_email ?? latest?.email ?? sub.user_email ?? '').trim() || null;
  const ended = iso(sub.ended_at) ?? iso(sub.failed_at) ?? (ALIVE.has(status) ? null : (iso(sub.cancelled_at) ?? new Date().toISOString()));

  // Bought without a MadeVisa account (the paywall's guest checkout): the buyer's email decides
  // whose membership it is. A trusted account with that email gets it; with no account at all,
  // one is created for them. An account whose email was never verified is left alone.
  let claimUser = input.claimUser ?? null;
  let created = false;
  if (!claimUser && email && ALIVE.has(status) && !ended && (lastPaidAt || input.test)) {
    const who = (await deps.rpc('gumroad_buyer_account', { p_email: email, p_subscription: subscriptionId })).data as { state?: string; user_id?: string } | null;
    if (who?.state === 'match' && who.user_id) claimUser = who.user_id;
    else if (who?.state === 'none' && deps.createAccount && !(input.checkoutId && UUID.test(input.checkoutId))) {
      const made = await deps.createAccount(email.toLowerCase());
      if ('id' in made) {
        claimUser = made.id;
        created = true;
      }
    }
  }

  const applied = await deps.rpc('gumroad_apply', {
    p: {
      subscription_id: subscriptionId,
      plan,
      product_id: String(sub.product_id),
      status,
      recurrence: sub.recurrence ?? null,
      email,
      last_sale_id: latest ? String(latest.id) : null,
      last_paid_at: lastPaidAt,
      cancel_at: status === 'pending_cancellation' ? iso(sub.cancelled_at) : null,
      ended_at: ended,
      price_cents: Number.isFinite(Number(latest?.price)) ? Math.round(Number(latest.price)) : null,
      card_country: typeof latest?.country_iso2 === 'string' ? latest.country_iso2 : null,
      test: Boolean(input.test),
      checkout_id: input.checkoutId && UUID.test(input.checkoutId) ? input.checkoutId : null,
      claim_user: claimUser,
    },
  });
  if (applied.error) return { ok: false, note: `Could not save the membership: ${applied.error.message}` };
  const out = applied.data ?? {};
  // The emails (Admin → Emails → Templates): "your account is ready" for an account made just now,
  // then "you now have access to every job" whenever someone goes from free to paid. Each goes once.
  if (out.linked && out.user_id) {
    if (created) await deps.rpc('member_emails', { p_user: out.user_id, p_kind: 'account', p_ref: subscriptionId });
    if (out.before === 'free' && out.after && out.after !== 'free') await deps.rpc('member_emails', { p_user: out.user_id, p_kind: 'welcome', p_ref: subscriptionId });
  }
  const who = email ?? 'A buyer';
  const until = iso(out.until)?.slice(0, 10);
  const name = PLANS[plan].name;
  const note = !out.linked
    ? `${who}: ${name} ${status}, no MadeVisa account matched yet.`
    : created
      ? `${who}: ${name} on until ${until}. Paid without an account: one was created for this email and the welcome emails were sent.`
    : out.kept_other_plan
      ? `${who}: ${name} ${status}. A plan an admin switched on is higher or runs longer, so it was left as it is.`
      : out.active
        ? `${who}: ${name} on until ${until}${status === 'pending_cancellation' ? ' (cancelled, runs out then)' : ''}${guessed ? ' (payment date not readable, counted from now)' : ''}.`
        : `${who}: ${name} off (${status}).`;
  return { ok: true, note, active: Boolean(out.active), linked: Boolean(out.linked), plan };
}

// ---------------------------------------------------------------------------
// Notifications from Gumroad
// ---------------------------------------------------------------------------
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Form or JSON body → flat keys ("url_params[mv]"), without card details and licence keys. */
async function readPing(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const text = await req.text();
  const put = (k: string, v: unknown) => {
    if (/^card(\[|$)|license_key|^full_name$|street|zip|^city$|^state$/i.test(k)) return;
    if (v == null) return;
    if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).forEach(([kk, vv]) => put(`${k}[${kk}]`, vv));
    if (out[k] === undefined) out[k] = String(v).slice(0, 500);
  };
  if ((req.headers.get('content-type') ?? '').includes('json')) {
    const body = JSON.parse(text || '{}') as Record<string, unknown>;
    Object.entries(body).forEach(([k, v]) => put(k, v));
  } else {
    new URLSearchParams(text).forEach((v, k) => put(k, v));
  }
  return out;
}

async function webhook(deps: Deps, req: Request, key: string): Promise<Response> {
  const cfgRes = await deps.rpc('gumroad_config');
  const cfg = cfgRes.data as Config | null;
  if (!cfg) return new Response('not set up', { status: 503 });
  if (!sameText(key, cfg.webhook_key)) return new Response('forbidden', { status: 403 });
  let ping: Record<string, string>;
  try {
    ping = await readPing(req);
  } catch {
    return new Response('bad request', { status: 400 });
  }
  // Gumroad sends notifications for every product of the account. Another product's
  // sale is none of this site's business: nothing about it is kept.
  if (ping.product_id && knownProducts(cfg).length && !planForProduct(cfg, ping.product_id)) return new Response('ok', { status: 200 });
  const resource = (RESOURCES as readonly string[]).includes(ping.resource_name) ? ping.resource_name : 'sale';
  const saleId = ping.sale_id || null;
  const subscriptionId = ping.subscription_id || null;
  const logged = await deps.rpc('gumroad_log_event', { p_resource: resource, p_sale: saleId, p_subscription: subscriptionId, p_email: ping.email || ping.user_email || null, p_payload: ping });
  // A database problem: answer 500 so Gumroad sends it again later.
  if (logged.error) return new Response('try again', { status: 500 });
  const eventId = logged.data as number;
  // Gumroad waits 5 seconds for an answer, so the lookups happen after it.
  deps.background(
    syncSubscription(deps, cfg, { subscriptionId, saleId, checkoutId: ping['url_params[mv]'] || null, test: ping.test === 'true' })
      .catch((e): SyncResult => ({ ok: false, note: e instanceof Error ? e.message : 'Unexpected error.' }))
      .then((r) => deps.rpc('gumroad_finish_event', { p_id: eventId, p_ok: r.ok, p_note: r.note })),
  );
  return new Response('ok', { status: 200 });
}

// ---------------------------------------------------------------------------
// The product as Gumroad sells it right now: is it safe to send a buyer there?
// ---------------------------------------------------------------------------
/** What a buyer would actually be charged, read from the product itself. */
export type ProductCheck =
  | { ok: true; product: Json; monthlyCents: number; url: string }
  | { ok: false; reason: string };

/**
 * The amount shown on MadeVisa must be the amount Gumroad charges (before tax). So a product
 * qualifies only when it is a published membership with ONE tier, a monthly price equal to the
 * plan's price, no other billing periods a buyer could pick instead, and no Gumroad
 * purchasing-power discount that would change the price by country.
 */
export function checkProduct(product: Json, plan: PaidPlanId): ProductCheck {
  const want = PLANS[plan].priceCents;
  const name = `“${product?.name ?? 'This product'}”`;
  if (!product?.is_tiered_membership) return { ok: false, reason: `${name} is not a membership. Create it in Gumroad with the type Membership.` };
  const tiers = ((product.variants ?? []) as Json[]).flatMap((v) => (v.options ?? []) as Json[]);
  if (tiers.length !== 1) return { ok: false, reason: `${name} has ${tiers.length} tiers. Keep exactly one tier, so buyers can't pick a different price on Gumroad.` };
  const prices = (tiers[0].recurrence_prices ?? {}) as Record<string, Json>;
  const monthly = Number(prices.monthly?.price_cents ?? 0);
  if (!monthly) return { ok: false, reason: `${name} has no monthly price. Switch on monthly billing for its tier.` };
  const others = Object.keys(prices).filter((k) => k !== 'monthly' && Number(prices[k]?.price_cents ?? 0) > 0);
  if (others.length) return { ok: false, reason: `${name} can also be bought ${others.join(', ')}. MadeVisa sells monthly only: switch the other billing periods off for its tier.` };
  if (monthly !== want) return { ok: false, reason: `${name} costs $${(monthly / 100).toFixed(2)} a month on Gumroad, but ${PLANS[plan].name} is $${(want / 100).toFixed(2)}. Make them the same.` };
  if (prices.monthly?.purchasing_power_parity_prices) {
    return { ok: false, reason: `Gumroad’s “purchasing power parity” discount is on for ${name}. Switch it off (Gumroad → Settings → Payments, or exclude this product): MadeVisa charges the same price everywhere.` };
  }
  if (product.published === false) return { ok: false, reason: `${name} is not published yet. Publish it in Gumroad.` };
  const url = String(product.short_url ?? '');
  if (!/^https:\/\/([a-z0-9-]+\.)*gumroad\.com\//i.test(url)) return { ok: false, reason: `${name} has no Gumroad link.` };
  return { ok: true, product, monthlyCents: monthly, url };
}

const manageLink = (subscriptionId: string) => `https://gumroad.com/subscriptions/${encodeURIComponent(subscriptionId)}/manage`;

// ---------------------------------------------------------------------------
// Checkout: the plan, at its price, for this account
// ---------------------------------------------------------------------------
async function checkout(deps: Deps, cfg: Config, user: { id: string; email: string | null }, body: Json): Promise<Response> {
  // One plan is sold: the membership. Old links that still say "pro" get the membership too.
  if (body?.plan != null && !isPaidPlanId(body.plan)) return json({ error: 'Choose the MadeVisa Membership.' }, 400);
  const plan: PaidPlanId = MEMBERSHIP_PLAN;
  if (body?.billing && body.billing !== 'monthly') return json({ error: 'The membership is billed monthly. Reload the page and try again.' }, 400);
  const source = typeof body?.source === 'string' && /^[a-z0-9_]{1,40}$/.test(body.source) ? body.source : null;

  const state = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
  const pp = planProduct(cfg, plan);
  if (!pp?.product_id || !pp.connected_at || (!cfg.enabled && !state.is_admin)) return json({ error: 'off' });

  // A membership that is still being billed (the membership, or the retired Pro): never start a second one.
  const alive = ((state.alive ?? []) as { subscription_id: string; plan: PaidPlanId; status: string }[]).filter((a) => a?.subscription_id);
  if (alive.length) return json({ already: true, plan, manage_url: manageLink(alive[0].subscription_id) });

  // Read the product now: the price shown must be the price charged.
  const live = await gumroad(deps, 'GET', `/products/${encodeURIComponent(pp.product_id)}`);
  if (!live.ok) return json({ error: 'The payment page could not be prepared. Please try again in a minute.' });
  const checked = checkProduct(live.body.product, plan);
  if (!checked.ok) {
    await deps.rpc('gumroad_save', { p: { last_error: `${new Date().toISOString().slice(0, 16)} ${PLANS[plan].name} checkout refused: ${checked.reason}` } });
    return json({ error: `${PLANS[plan].name} can’t be bought right now. Please try again later, or write to hello@madevisa.com.` });
  }
  if (pp.provider_price_cents !== checked.monthlyCents) await deps.rpc('gumroad_plan_save', { p_plan: plan, p: { price_cents: checked.monthlyCents } });

  const begun = await deps.rpc('gumroad_checkout_begin', { p_user: user.id, p_plan: plan, p_source: source });
  if (begun.error) {
    const m = begun.error.message;
    return json({ error: /today/i.test(m) ? m : /can't be bought|unavailable/i.test(m) ? 'off' : 'The checkout could not be prepared. Please try again.' });
  }
  const c = begun.data as { id: string; price_cents: number; currency: string };
  // Belt and braces: the amount the database priced must be what Gumroad charges.
  if (c.price_cents !== checked.monthlyCents) return json({ error: 'The price could not be confirmed. Please try again later.' });

  const url = new URL(checked.url);
  url.searchParams.set('wanted', 'true');
  url.searchParams.set('recurrence', 'monthly');
  if (user.email) url.searchParams.set('email', user.email);
  // Comes back with the payment and says which account it is for (never which plan: the product says that).
  url.searchParams.set('mv', c.id);
  url.searchParams.set('referrer', `${SITE}/checkout`);

  // Tidy up discount codes the old Pro checkout made and nobody used.
  const legacy = cfg.legacy_product_id ?? cfg.product_id;
  if (legacy) {
    deps.background(
      (async () => {
        const stale = ((await deps.rpc('gumroad_checkout_stale', { p_limit: 5 })).data ?? []) as { id: string; offer_code_id: string }[];
        for (const s of stale) {
          const gone = await gumroad(deps, 'DELETE', `/products/${encodeURIComponent(legacy)}/offer_codes/${encodeURIComponent(s.offer_code_id)}`);
          if (gone.ok || gone.status === 404 || /not found/i.test(gone.message)) await deps.rpc('gumroad_checkout_code_gone', { p_id: s.id });
        }
      })().catch(() => undefined),
    );
  }

  return json({ url: url.toString(), checkout_id: c.id, plan, billing: 'monthly', price_cents: c.price_cents, currency: c.currency ?? 'USD', email: user.email });
}

// ---------------------------------------------------------------------------
// Guest checkout: the membership's Gumroad page, for someone without an account
// ---------------------------------------------------------------------------
/** The checked product link, kept for a few minutes so a busy paywall doesn't ask Gumroad on every press. */
let guestLink: { url: string; cents: number; at: number; product: string } | null = null;
const GUEST_LINK_MS = 5 * 60_000;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/;

/**
 * Anyone may open the membership's checkout. Nothing is recorded here: the
 * payment itself (Gumroad's notification, re-read from Gumroad's API) decides
 * whose membership it is — an existing account with that email, or a new one
 * made for it (syncSubscription).
 */
async function guestCheckout(deps: Deps, cfg: Config, body: Json): Promise<Response> {
  const plan = MEMBERSHIP_PLAN;
  const pp = planProduct(cfg, plan);
  if (!cfg.enabled || !pp?.product_id || !pp.connected_at) return json({ error: 'off' });
  const source = typeof body?.source === 'string' && /^[a-z0-9_]{1,40}$/.test(body.source) ? body.source : null;

  if (!guestLink || guestLink.product !== pp.product_id || Date.now() - guestLink.at > GUEST_LINK_MS) {
    const live = await gumroad(deps, 'GET', `/products/${encodeURIComponent(pp.product_id)}`);
    if (!live.ok) return json({ error: 'The payment page could not be prepared. Please try again in a minute.' });
    const checked = checkProduct(live.body.product, plan);
    if (!checked.ok) {
      await deps.rpc('gumroad_save', { p: { last_error: `${new Date().toISOString().slice(0, 16)} ${PLANS[plan].name} guest checkout refused: ${checked.reason}` } });
      return json({ error: `${PLANS[plan].name} can’t be bought right now. Please try again later, or write to hello@madevisa.com.` });
    }
    guestLink = { url: checked.url, cents: checked.monthlyCents, at: Date.now(), product: pp.product_id };
  }

  const url = new URL(guestLink.url);
  url.searchParams.set('wanted', 'true');
  url.searchParams.set('recurrence', 'monthly');
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (EMAIL.test(email)) url.searchParams.set('email', email);
  if (source) url.searchParams.set('mvs', source);
  url.searchParams.set('referrer', `${SITE}/checkout`);
  return json({ url: url.toString(), plan, billing: 'monthly', price_cents: guestLink.cents, currency: 'USD', guest: true });
}

// ---------------------------------------------------------------------------
// "Check my payment": the person's memberships, read again from Gumroad
// ---------------------------------------------------------------------------
async function refresh(deps: Deps, cfg: Config, user: { id: string; email: string | null }): Promise<Response> {
  const products = knownProducts(cfg);
  if (!products.length) return json({ ok: true, active: false, plan: 'free' });
  const allowed = await deps.rpc('gumroad_refresh_allowed', { p_user: user.id });
  if (allowed.data === false) return json({ ok: true, throttled: true });
  const state = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
  const ids = new Map<string, boolean>(); // id → found by this person's verified email
  for (const id of ((state.subscription_ids ?? []) as string[]).slice(0, 4)) ids.set(id, false);
  // Only a verified email may claim a membership bought with it (sign-up alone proves nothing).
  if (state.email && state.email_verified) {
    for (const productId of products) {
      const found = await gumroad(deps, 'GET', `/products/${encodeURIComponent(productId)}/subscribers`, { email: state.email });
      if (found.ok) for (const s of ((found.body.subscribers ?? []) as Json[]).slice(0, 3)) if (!ids.has(String(s.id))) ids.set(String(s.id), true);
    }
  }
  for (const [id, byEmail] of ids) {
    const r = await syncSubscription(deps, cfg, { subscriptionId: id, claimUser: byEmail ? user.id : null }).catch((): SyncResult => ({ ok: false, note: 'Unexpected error.' }));
    if (byEmail || !r.ok) {
      const logged = await deps.rpc('gumroad_log_event', { p_resource: 'check', p_sale: null, p_subscription: id, p_email: state.email ?? null, p_payload: { asked_by: user.id } });
      if (!logged.error) await deps.rpc('gumroad_finish_event', { p_id: logged.data, p_ok: r.ok, p_note: r.note });
    }
  }
  // What the person has now, from the one resolver.
  const after = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
  const plan = typeof after.plan === 'string' ? after.plan : 'free';
  return json({ ok: true, active: plan !== 'free', plan });
}

// ---------------------------------------------------------------------------
// Admin: connect the Gumroad product of a plan
// ---------------------------------------------------------------------------
async function findProduct(deps: Deps, slug: string): Promise<ApiResult> {
  const direct = await gumroad(deps, 'GET', `/products/${encodeURIComponent(slug)}`);
  if (direct.ok || direct.status === 401 || direct.status === 0) return direct;
  // The link may use a custom name: look through the account's products.
  let pageKey: string | null = null;
  for (let page = 0; page < 20; page++) {
    const list: ApiResult = await gumroad(deps, 'GET', '/products', pageKey ? { page_key: pageKey } : {});
    if (!list.ok) return list;
    const hit = ((list.body.products ?? []) as Json[]).find((p) => p.custom_permalink === slug || String(p.short_url ?? '').toLowerCase().endsWith(`/l/${slug.toLowerCase()}`));
    if (hit) return gumroad(deps, 'GET', `/products/${encodeURIComponent(String(hit.id))}`);
    pageKey = list.body.next_page_key ?? null;
    if (!pageKey) break;
  }
  return { ok: false, status: 404, body: null, message: 'That product was not found in the Gumroad account this access token belongs to.' };
}

/** Ask Gumroad to post every payment and change to this function (one set of notifications for the whole account). */
async function ensureHooks(deps: Deps, cfg: Config): Promise<{ hooks: { id: string; resource_name: string }[] } | { error: string }> {
  const base = `${(deps.env('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/gumroad`;
  const postUrl = `${base}?k=${cfg.webhook_key}`;
  const hooks: { id: string; resource_name: string }[] = [];
  for (const name of RESOURCES) {
    const existing = await gumroad(deps, 'GET', '/resource_subscriptions', { resource_name: name });
    if (!existing.ok) return { error: `Gumroad would not list its notifications for this access token. ${existing.message}` };
    let kept: string | null = null;
    for (const h of (existing.body.resource_subscriptions ?? []) as { id: string; post_url: string }[]) {
      if (h.post_url === postUrl && !kept) kept = h.id;
      else if (String(h.post_url ?? '').startsWith(base)) await gumroad(deps, 'DELETE', `/resource_subscriptions/${encodeURIComponent(h.id)}`);
    }
    if (!kept) {
      const made = await gumroad(deps, 'PUT', '/resource_subscriptions', { resource_name: name, post_url: postUrl });
      if (!made.ok) return { error: `Gumroad would not set up the "${name}" notification. ${made.message}` };
      kept = String(made.body.resource_subscription?.id ?? '');
    }
    hooks.push({ id: kept, resource_name: name });
  }
  return { hooks };
}

async function connect(deps: Deps, cfg: Config, body: Json): Promise<Response> {
  const plan = body?.plan;
  if (!isPaidPlanId(plan)) return json({ error: 'Choose which plan this product is: Starter or Pro.' });
  if (!deps.env('GUMROAD_ACCESS_TOKEN')) return json({ error: 'Add the secret GUMROAD_ACCESS_TOKEN to this function first (Supabase → Edge Functions → Secrets), then press Connect again.' });
  let link: URL;
  try {
    link = new URL(String(body?.product_url ?? '').trim());
  } catch {
    return json({ error: 'Paste the product link from Gumroad, for example https://yourname.gumroad.com/l/abcde' });
  }
  const slug = /^\/l\/([^/?#]+)/.exec(link.pathname)?.[1];
  if (link.protocol !== 'https:' || !/(^|\.)gumroad\.com$/i.test(link.hostname) || !slug) {
    return json({ error: 'That is not a Gumroad product link. It looks like https://yourname.gumroad.com/l/abcde' });
  }
  const me = await gumroad(deps, 'GET', '/user');
  if (!me.ok) return json({ error: `Gumroad did not accept the access token. ${me.message}` });
  const found = await findProduct(deps, decodeURIComponent(slug));
  if (!found.ok) return json({ error: found.message });
  const product = found.body.product;
  const other = (cfg.plans ?? []).find((p) => p.plan !== plan && p.product_id && p.product_id === String(product?.id));
  if (other) return json({ error: `That product is already connected as ${PLANS[other.plan].name}. Starter and Pro need a product each.` });
  const checked = checkProduct(product, plan);
  if (!checked.ok) return json({ error: checked.reason });

  const hooks = await ensureHooks(deps, cfg);
  if ('error' in hooks) return json({ error: hooks.error });
  await deps.rpc('gumroad_save', { p: { hooks: hooks.hooks, seller_id: String(me.body.user?.user_id ?? me.body.user?.id ?? ''), last_error: null } });
  const saved = await deps.rpc('gumroad_plan_save', {
    p_plan: plan,
    p: { product_id: String(product.id), product_url: checked.url, product_name: String(product.name ?? ''), price_cents: checked.monthlyCents, connected: true },
  });
  if (saved.error) return json({ error: `Connected to Gumroad, but the settings could not be saved: ${saved.error.message}` });
  const warnings: string[] = [];
  const legacy = cfg.legacy_product_id ?? cfg.product_id;
  if (legacy && legacy === String(product.id)) warnings.push('This is the product the old Pro plan was sold as. Its existing members keep paying their old price on Gumroad and keep Pro.');
  return json({ ok: true, plan, product_name: product.name, monthly_cents: checked.monthlyCents, warnings });
}

async function disconnect(deps: Deps, cfg: Config, body: Json): Promise<Response> {
  const plan = body?.plan;
  if (!isPaidPlanId(plan)) return json({ error: 'Choose Starter or Pro.' });
  await deps.rpc('gumroad_plan_save', { p_plan: plan, p: { connected: false } });
  // Keep Gumroad's notifications while any product (or the old Pro product's members) still needs them.
  const stillNeeded = (cfg.plans ?? []).some((p) => p.plan !== plan && p.product_id && p.connected_at) || Boolean(cfg.legacy_product_id ?? cfg.product_id);
  if (!stillNeeded) {
    for (const h of cfg.hooks ?? []) if (h?.id) await gumroad(deps, 'DELETE', `/resource_subscriptions/${encodeURIComponent(h.id)}`);
    await deps.rpc('gumroad_save', { p: { hooks: [], last_error: null } });
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------
export function makeHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const key = new URL(req.url).searchParams.get('k');
    if (key !== null) return webhook(deps, req, key);

    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? '');
    // The paywall's "Subscribe" for someone without an account: no sign-in needed.
    if (action === 'guest_checkout') {
      const cfgRes = await deps.rpc('gumroad_config');
      const cfg = cfgRes.data as Config | null;
      if (cfgRes.error || !cfg) return json({ error: 'off' });
      return guestCheckout(deps, cfg, body);
    }
    const user = await deps.getUser(req.headers.get('Authorization') ?? '');
    if (!user) return json({ error: 'Sign in first.' }, 401);
    const cfgRes = await deps.rpc('gumroad_config');
    const cfg = cfgRes.data as Config | null;
    // The database part is missing: the site keeps its request form.
    if (cfgRes.error || !cfg) return json({ error: 'off' });

    if (action === 'checkout') return checkout(deps, cfg, user, body);
    if (action === 'refresh') return refresh(deps, cfg, user);
    if (action === 'connect' || action === 'disconnect') {
      const state = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
      if (!state.is_admin) return json({ error: 'Only admins.' }, 403);
      return action === 'connect' ? connect(deps, cfg, body) : disconnect(deps, cfg, body);
    }
    return json({ error: 'Unknown action.' }, 400);
  };
}
