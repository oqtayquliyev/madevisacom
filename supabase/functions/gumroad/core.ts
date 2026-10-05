// The gumroad function's logic (see index.ts for what it does and how to deploy it).
//
// Nothing here talks to Deno or Supabase directly: the database, sign-in
// check, network and secrets are handed in (Deps), so the same code runs in
// the tests against a pretend Gumroad.

import { PLAN_USD, planUsd, yearlyUsd } from '../_shared/planPrice.ts';

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

type Config = {
  enabled: boolean;
  product_url: string | null;
  product_id: string | null;
  monthly_cents: number | null;
  yearly_cents: number | null;
  can_discount: boolean;
  webhook_key: string;
  hooks: { id: string; resource_name: string }[];
  connected_at: string | null;
};

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
type SyncResult = { ok: boolean; note: string; active?: boolean; linked?: boolean };

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
  if (!cfg.product_id) return { ok: true, note: 'No product is connected: ignored.' };
  let subscriptionId = input.subscriptionId || null;
  const sales = new Map<string, Json>();

  if (!subscriptionId) {
    if (!input.saleId) return { ok: true, note: 'Nothing to look up: ignored.' };
    const s = await gumroad(deps, 'GET', `/sales/${encodeURIComponent(input.saleId)}`);
    if (!s.ok) return { ok: false, note: `Gumroad does not confirm this sale. ${s.message}` };
    const sale = s.body.sale;
    if (sale?.product_id !== cfg.product_id) return { ok: true, note: 'A sale of another product: ignored.' };
    if (!sale?.subscription_id) return { ok: true, note: 'Not a membership payment: ignored.' };
    subscriptionId = String(sale.subscription_id);
    sales.set(String(sale.id), sale);
  }

  const r = await gumroad(deps, 'GET', `/subscribers/${encodeURIComponent(subscriptionId)}`);
  if (!r.ok) return { ok: false, note: `Gumroad does not confirm this membership. ${r.message}` };
  const sub = r.body.subscriber;
  if (sub?.product_id !== cfg.product_id) return { ok: true, note: 'A membership of another product: ignored.' };

  // The latest payments (a refund can leave an earlier one as the last that counts).
  const ids: string[] = Array.isArray(sub.purchase_ids) ? sub.purchase_ids.map(String) : [];
  if (input.saleId && !ids.includes(input.saleId)) ids.push(input.saleId);
  await Promise.all(
    ids.slice(-3).filter((id) => !sales.has(id)).map(async (id) => {
      const s = await gumroad(deps, 'GET', `/sales/${encodeURIComponent(id)}`);
      if (s.ok && s.body.sale?.product_id === cfg.product_id) sales.set(id, s.body.sale);
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
  const applied = await deps.rpc('gumroad_apply', {
    p: {
      subscription_id: subscriptionId,
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
      claim_user: input.claimUser ?? null,
    },
  });
  if (applied.error) return { ok: false, note: `Could not save the membership: ${applied.error.message}` };
  const out = applied.data ?? {};
  const who = email ?? 'A buyer';
  const until = iso(out.until)?.slice(0, 10);
  const note = !out.linked
    ? `${who}: ${status}, no MadeVisa account matched yet.`
    : out.kept_other_plan
      ? `${who}: ${status}. Their other plan runs longer, so it was left as it is.`
      : out.active
        ? `${who}: Pro on until ${until}${status === 'pending_cancellation' ? ' (cancelled, runs out then)' : ''}${guessed ? ' (payment date not readable, counted from now)' : ''}.`
        : `${who}: Pro off (${status}).`;
  return { ok: true, note, active: Boolean(out.active), linked: Boolean(out.linked) };
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
  if (ping.product_id && cfg.product_id && ping.product_id !== cfg.product_id) return new Response('ok', { status: 200 });
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
// "Get Pro": the checkout link, at this buyer's price
// ---------------------------------------------------------------------------
/** Country of the person asking, as the server sees it (never what the browser says). */
async function buyerCountry(deps: Deps, req: Request): Promise<string | null> {
  const valid = (c: string | null | undefined) => (c && /^[A-Za-z]{2}$/.test(c) && !/^(XX|T1|ZZ)$/i.test(c) ? c.toUpperCase() : null);
  const header = valid(req.headers.get('cf-ipcountry')) ?? valid(req.headers.get('x-vercel-ip-country')) ?? valid(req.headers.get('x-country-code'));
  if (header) return header;
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? (req.headers.get('x-forwarded-for') ?? '').split(',')[0] ?? '').trim();
  if (!ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd])/i.test(ip)) return null;
  try {
    // The same lookup the pricing page uses, so both give the same country.
    const res = await deps.fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, { signal: AbortSignal.timeout(2500) });
    const body = await res.json().catch(() => null);
    return body?.success ? valid(body.country_code) : null;
  } catch {
    return null;
  }
}

const newCode = () => `mv-${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

async function checkout(deps: Deps, req: Request, cfg: Config, user: { id: string; email: string | null }, body: Json): Promise<Response> {
  const state = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
  const connected = Boolean(cfg.product_id && cfg.product_url && cfg.connected_at && cfg.monthly_cents);
  if (!connected || (!cfg.enabled && !state.is_admin)) return json({ error: 'off' });
  if (state.alive_subscription) {
    return json({ already: true, manage_url: `https://gumroad.com/subscriptions/${encodeURIComponent(state.alive_subscription)}/manage` });
  }
  const billing: 'monthly' | 'yearly' = body?.billing === 'yearly' ? 'yearly' : 'monthly';
  const listCents = billing === 'yearly' ? cfg.yearly_cents : cfg.monthly_cents;
  if (!listCents) return json({ error: `The ${billing} price is not switched on in Gumroad.` });

  // The price for the buyer's country: the same list the pricing page prints.
  const country = await buyerCountry(deps, req);
  const monthlyUsd = planUsd(country);
  const wantCents = Math.min(listCents, (billing === 'yearly' ? yearlyUsd(monthlyUsd) : monthlyUsd) * 100);
  const discount = listCents - wantCents;
  if (discount > 0 && !cfg.can_discount) {
    await deps.rpc('gumroad_save', { p: { last_error: `${new Date().toISOString().slice(0, 16)} A checkout needed a discount code, but the access token cannot create them. Press Connect again.` } });
    return json({ error: 'Card payment is not available right now. Please try again later, or write to hello@madevisa.com.' });
  }

  const started = await deps.rpc('gumroad_checkout_start', { p_user: user.id, p_billing: billing, p_country: country, p_price_cents: wantCents, p_list_cents: listCents });
  if (started.error) return json({ error: /today/i.test(started.error.message) ? started.error.message : 'The checkout could not be prepared. Please try again.' });
  const checkoutId = String(started.data.id);
  let code: string | null = started.data.offer_code ?? null;

  if (discount > 0 && !code) {
    code = newCode();
    const made = await gumroad(deps, 'POST', `/products/${encodeURIComponent(cfg.product_id!)}/offer_codes`, {
      name: code,
      offer_type: 'cents',
      amount_off: discount,
      amount_cents: discount,
      max_purchase_count: 1,
      // Only for this billing period: a yearly discount must never land on a monthly price.
      minimum_amount_cents: listCents,
      universal: false,
    });
    if (!made.ok) {
      await deps.rpc('gumroad_save', { p: { last_error: `${new Date().toISOString().slice(0, 16)} A discount code could not be created: ${made.message}` } });
      return json({ error: 'Card payment is not available right now. Please try again later, or write to hello@madevisa.com.' });
    }
    await deps.rpc('gumroad_checkout_code', { p_id: checkoutId, p_code: code, p_code_id: String(made.body.offer_code?.id ?? '') || null });
  }

  // Tidy up: codes nobody used.
  deps.background(
    (async () => {
      const stale = ((await deps.rpc('gumroad_checkout_stale', { p_limit: 5 })).data ?? []) as { id: string; offer_code_id: string }[];
      for (const s of stale) {
        const gone = await gumroad(deps, 'DELETE', `/products/${encodeURIComponent(cfg.product_id!)}/offer_codes/${encodeURIComponent(s.offer_code_id)}`);
        if (gone.ok || gone.status === 404 || /not found/i.test(gone.message)) await deps.rpc('gumroad_checkout_code_gone', { p_id: s.id });
      }
    })().catch(() => undefined),
  );

  const url = new URL(cfg.product_url!);
  url.searchParams.set('wanted', 'true');
  url.searchParams.set('recurrence', billing);
  if (user.email) url.searchParams.set('email', user.email);
  // Comes back with the payment, and says which account it is for.
  url.searchParams.set('mv', checkoutId);
  if (code) url.searchParams.set('code', code);
  url.searchParams.set('referrer', `${SITE}/pricing`);
  return json({ url: url.toString(), billing, country, price_cents: wantCents, list_cents: listCents, email: user.email });
}

// ---------------------------------------------------------------------------
// "Check my payment": the person's memberships, read again from Gumroad
// ---------------------------------------------------------------------------
async function refresh(deps: Deps, cfg: Config, user: { id: string; email: string | null }): Promise<Response> {
  if (!cfg.product_id) return json({ ok: true, active: false });
  const allowed = await deps.rpc('gumroad_refresh_allowed', { p_user: user.id });
  if (allowed.data === false) return json({ ok: true, throttled: true });
  const state = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
  const ids = new Map<string, boolean>(); // id → found by this person's verified email
  for (const id of ((state.subscription_ids ?? []) as string[]).slice(0, 3)) ids.set(id, false);
  // Only a verified email may claim a membership bought with it (sign-up alone proves nothing).
  if (state.email && state.email_verified) {
    const found = await gumroad(deps, 'GET', `/products/${encodeURIComponent(cfg.product_id)}/subscribers`, { email: state.email });
    if (found.ok) for (const s of ((found.body.subscribers ?? []) as Json[]).slice(0, 3)) if (!ids.has(String(s.id))) ids.set(String(s.id), true);
  }
  let active = false;
  for (const [id, byEmail] of ids) {
    const r = await syncSubscription(deps, cfg, { subscriptionId: id, claimUser: byEmail ? user.id : null }).catch((): SyncResult => ({ ok: false, note: 'Unexpected error.' }));
    if (byEmail || !r.ok) {
      const logged = await deps.rpc('gumroad_log_event', { p_resource: 'check', p_sale: null, p_subscription: id, p_email: state.email ?? null, p_payload: { asked_by: user.id } });
      if (!logged.error) await deps.rpc('gumroad_finish_event', { p_id: logged.data, p_ok: r.ok, p_note: r.note });
    }
    active = active || Boolean(r.active);
  }
  return json({ ok: true, active });
}

// ---------------------------------------------------------------------------
// Admin: connect the Gumroad product
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

async function connect(deps: Deps, cfg: Config, body: Json): Promise<Response> {
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
  if (!product?.is_tiered_membership) return json({ error: `"${product?.name ?? 'This product'}" is not a membership. Create it with the type Membership.` });
  const tiers = ((product.variants ?? []) as Json[]).flatMap((v) => (v.options ?? []) as Json[]);
  if (!tiers.length) return json({ error: 'The membership has no tier. Add one tier in Gumroad.' });
  const monthly = Number(tiers[0].recurrence_prices?.monthly?.price_cents ?? 0);
  const yearly = Number(tiers[0].recurrence_prices?.yearly?.price_cents ?? 0);
  if (!monthly || !yearly) return json({ error: 'Switch on both a monthly and a yearly price for the tier in Gumroad (Product → Content → tier → pricing).' });

  const warnings: string[] = [];
  if (tiers.length > 1) warnings.push(`The membership has ${tiers.length} tiers. Gumroad puts the first one in the checkout; keep one tier.`);
  if (!product.published) warnings.push('The product is not published yet. Publish it in Gumroad before switching card payments on.');
  const wantMonthly = PLAN_USD.top * 100;
  const wantYearly = yearlyUsd(PLAN_USD.top) * 100;
  // Gumroad lists its own per-country prices on the tier only when its purchasing-power discount is on for this product.
  if (tiers[0].recurrence_prices?.monthly?.purchasing_power_parity_prices) {
    warnings.push('Gumroad’s own “purchasing power parity” discount is on for this product. Switch it off in Gumroad (Settings → Payments), or exclude this product there: MadeVisa already applies the country price, and both together would discount twice.');
  }
  if (monthly !== wantMonthly || yearly !== wantYearly) {
    warnings.push(`Gumroad has $${monthly / 100} a month and $${yearly / 100} a year; the site's list price is $${wantMonthly / 100} and $${wantYearly / 100}. Make them the same.`);
  }

  // Can this token create discount codes? (Needed for the country prices.)
  const probe = await gumroad(deps, 'POST', `/products/${encodeURIComponent(String(product.id))}/offer_codes`, {
    name: `mv-check-${newCode().slice(3, 11)}`, offer_type: 'cents', amount_off: 1, amount_cents: 1, max_purchase_count: 1, universal: false,
  });
  if (probe.ok && probe.body.offer_code?.id) await gumroad(deps, 'DELETE', `/products/${encodeURIComponent(String(product.id))}/offer_codes/${encodeURIComponent(String(probe.body.offer_code.id))}`);
  if (!probe.ok) {
    return json({ error: `The access token cannot create discount codes, which the country prices need. In Gumroad → Settings → Advanced, create a new application, generate its access token and put that in the secret GUMROAD_ACCESS_TOKEN. (Gumroad said: ${probe.message})` });
  }

  // Ask Gumroad to tell this function about payments and changes.
  const base = `${(deps.env('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/gumroad`;
  const postUrl = `${base}?k=${cfg.webhook_key}`;
  const hooks: { id: string; resource_name: string }[] = [];
  for (const name of RESOURCES) {
    const existing = await gumroad(deps, 'GET', '/resource_subscriptions', { resource_name: name });
    if (!existing.ok) return json({ error: `Gumroad would not list its notifications for this access token. ${existing.message}` });
    let kept: string | null = null;
    for (const h of (existing.body.resource_subscriptions ?? []) as { id: string; post_url: string }[]) {
      if (h.post_url === postUrl && !kept) kept = h.id;
      else if (String(h.post_url ?? '').startsWith(base)) await gumroad(deps, 'DELETE', `/resource_subscriptions/${encodeURIComponent(h.id)}`);
    }
    if (!kept) {
      const made = await gumroad(deps, 'PUT', '/resource_subscriptions', { resource_name: name, post_url: postUrl });
      if (!made.ok) return json({ error: `Gumroad would not set up the "${name}" notification. ${made.message}` });
      kept = String(made.body.resource_subscription?.id ?? '');
    }
    hooks.push({ id: kept, resource_name: name });
  }

  const productUrl = String(product.short_url || `${link.origin}/l/${slug}`);
  const saved = await deps.rpc('gumroad_save', {
    p: { product_url: productUrl, product_id: String(product.id), product_name: String(product.name ?? ''), seller_id: String(me.body.user?.user_id ?? me.body.user?.id ?? ''), monthly_cents: monthly, yearly_cents: yearly, can_discount: true, hooks, connected: true, last_error: null },
  });
  if (saved.error) return json({ error: `Connected to Gumroad, but the settings could not be saved: ${saved.error.message}` });
  return json({ ok: true, product_name: product.name, monthly_cents: monthly, yearly_cents: yearly, warnings });
}

async function disconnect(deps: Deps, cfg: Config): Promise<Response> {
  for (const h of cfg.hooks ?? []) if (h?.id) await gumroad(deps, 'DELETE', `/resource_subscriptions/${encodeURIComponent(h.id)}`);
  await deps.rpc('gumroad_save', { p: { hooks: [], connected: false, last_error: null } });
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
    const user = await deps.getUser(req.headers.get('Authorization') ?? '');
    if (!user) return json({ error: 'Sign in first.' }, 401);
    const cfgRes = await deps.rpc('gumroad_config');
    const cfg = cfgRes.data as Config | null;
    // The database part is missing: the site keeps its request form.
    if (cfgRes.error || !cfg) return json({ error: 'off' });

    if (action === 'checkout') return checkout(deps, req, cfg, user, body);
    if (action === 'refresh') return refresh(deps, cfg, user);
    if (action === 'connect' || action === 'disconnect') {
      const state = (await deps.rpc('gumroad_user', { p_user: user.id })).data ?? {};
      if (!state.is_admin) return json({ error: 'Only admins.' }, 403);
      return action === 'connect' ? connect(deps, cfg, body) : disconnect(deps, cfg);
    }
    return json({ error: 'Unknown action.' }, 400);
  };
}
