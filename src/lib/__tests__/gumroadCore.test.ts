import { beforeEach, describe, expect, it } from 'vitest';
import { checkProduct, makeHandler, planForProduct, type Config, type Deps } from '../../../supabase/functions/gumroad/core.ts';

// The gumroad function against a pretend Gumroad and a pretend database. No real charges, no network.

const USER = { id: '22222222-2222-4222-8222-222222222222', email: 'leyla@example.com' };
const CHECKOUT_ID = '33333333-3333-4333-8333-333333333333';
const KEY = 'secret-webhook-key';

type Calls = { name: string; args: Record<string, unknown> | undefined }[];

const tier = (monthly: number, extra: Record<string, unknown> = {}) => ({
  is_tiered_membership: true,
  published: true,
  variants: [{ options: [{ name: 'Tier', recurrence_prices: { monthly: { price_cents: monthly }, ...extra } }] }],
});

function world() {
  const products: Record<string, Record<string, unknown>> = {
    prod_starter: { id: 'prod_starter', name: 'MadeVisa Membership', short_url: 'https://madevisa.gumroad.com/l/starter', ...tier(229) },
    prod_pro: { id: 'prod_pro', name: 'MadeVisa Pro', short_url: 'https://madevisa.gumroad.com/l/pro', ...tier(899) },
  };
  const subscribers: Record<string, Record<string, unknown>> = {};
  const sales: Record<string, Record<string, unknown>> = {};
  const cfg: Config = {
    enabled: true,
    product_id: 'prod_legacy',
    product_url: 'https://madevisa.gumroad.com/l/old',
    legacy_product_id: 'prod_legacy',
    monthly_cents: 1900,
    yearly_cents: 14900,
    can_discount: true,
    webhook_key: KEY,
    hooks: [],
    connected_at: '2026-10-01T00:00:00Z',
    plans: [
      { plan: 'starter', price_cents: 229, currency: 'USD', product_id: 'prod_starter', product_url: 'https://madevisa.gumroad.com/l/starter', product_name: 'MadeVisa Membership', provider_price_cents: 229, connected_at: '2026-10-10T00:00:00Z', active: true },
      { plan: 'pro', price_cents: 899, currency: 'USD', product_id: 'prod_pro', product_url: 'https://madevisa.gumroad.com/l/pro', product_name: 'MadeVisa Pro', provider_price_cents: 899, connected_at: '2026-10-10T00:00:00Z', active: true },
    ],
  };
  const state: Record<string, unknown> = { email: USER.email, email_verified: true, is_admin: false, plan: 'free', subscription_ids: [], alive: [] };
  // Who a Gumroad buyer's email belongs to (gumroad_buyer_account), and the accounts the function made.
  const buyer: { state: string; user_id?: string } = { state: 'linked', user_id: USER.id };
  const made: string[] = [];
  // guest_claim_take's answer (a guest's browser asking for its sign-in code).
  const claim: Record<string, unknown> = { state: 'send', email: 'new.buyer@example.com', user_id: '44444444-4444-4444-8444-444444444444' };
  const calls: Calls = [];
  const background: Promise<unknown>[] = [];
  const deps: Deps = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      switch (name) {
        case 'gumroad_config':
          return { data: cfg, error: null };
        case 'gumroad_user':
          return { data: state, error: null };
        case 'gumroad_checkout_begin': {
          const plan = String(args?.p_plan);
          // The database prices it from billing_plans, never from the caller.
          return { data: { id: CHECKOUT_ID, plan, price_cents: plan === 'starter' ? 229 : 899, currency: 'USD' }, error: null };
        }
        case 'gumroad_apply': {
          const p = args?.p as Record<string, unknown>;
          // Linked: an existing owner (buyer.state 'linked'), a checkout, or an account to claim it.
          const owner = buyer.state === 'linked' ? buyer.user_id : (p.claim_user as string | null) ?? (p.checkout_id ? USER.id : null);
          if (!owner) return { data: { linked: false, active: false, until: '2026-11-15T00:00:00Z', plan: p.plan }, error: null };
          return { data: { linked: true, user_id: owner, active: true, until: '2026-11-15T00:00:00Z', plan: p.plan, before: buyer.state === 'linked' ? 'starter' : 'free', after: 'starter' }, error: null };
        }
        case 'gumroad_buyer_account':
          return { data: buyer, error: null };
        case 'gumroad_log_event':
          return { data: 7, error: null };
        case 'guest_claim_take':
          return { data: claim, error: null };
        case 'gumroad_refresh_allowed':
          return { data: true, error: null };
        default:
          return { data: null, error: null };
      }
    },
    getUser: async (auth) => (auth === 'Bearer good' ? USER : null),
    fetch: (async (input: string | URL | Request) => {
      const u = new URL(String(input));
      const path = u.pathname.replace('/v2', '');
      const ok = (body: Record<string, unknown>) => new Response(JSON.stringify({ success: true, ...body }), { status: 200 });
      const missing = () => new Response(JSON.stringify({ success: false, message: 'Not found' }), { status: 404 });
      let m: RegExpExecArray | null;
      if ((m = /^\/products\/([^/]+)$/.exec(path))) return products[m[1]] ? ok({ product: products[m[1]] }) : missing();
      if ((m = /^\/subscribers\/([^/]+)$/.exec(path))) return subscribers[m[1]] ? ok({ subscriber: subscribers[m[1]] }) : missing();
      if ((m = /^\/sales\/([^/]+)$/.exec(path))) return sales[m[1]] ? ok({ sale: sales[m[1]] }) : missing();
      if ((m = /^\/products\/([^/]+)\/subscribers$/.exec(path))) return ok({ subscribers: Object.values(subscribers).filter((s) => s.product_id === m![1] && s.email === u.searchParams.get('email')) });
      if (path === '/user') return ok({ user: { user_id: 'seller' } });
      if (path === '/resource_subscriptions') return ok({ resource_subscriptions: [], resource_subscription: { id: 'hook' } });
      return missing();
    }) as typeof fetch,
    env: (name) => (name === 'GUMROAD_ACCESS_TOKEN' ? 'token' : name === 'SUPABASE_URL' ? 'https://x.supabase.co' : undefined),
    background: (work) => void background.push(work),
    createAccount: async (email) => {
      made.push(email);
      return { id: '44444444-4444-4444-8444-444444444444' };
    },
    signInCode: async () => ({ code: '123456' }),
  };
  const handler = makeHandler(deps);
  const call = async (body: Record<string, unknown>, auth = 'Bearer good') => {
    const res = await handler(new Request('https://x.supabase.co/functions/v1/gumroad', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const ping = async (fields: Record<string, string>, key = KEY) => {
    const res = await handler(new Request(`https://x.supabase.co/functions/v1/gumroad?k=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }));
    await Promise.all(background.splice(0));
    return res.status;
  };
  const applied = () => calls.filter((c) => c.name === 'gumroad_apply').map((c) => c.args?.p as Record<string, unknown>);
  const emails = () => calls.filter((c) => c.name === 'member_emails').map((c) => c.args);
  return { cfg, state, buyer, made, claim, products, subscribers, sales, calls, call, ping, applied, emails };
}

let w: ReturnType<typeof world>;
beforeEach(() => {
  w = world();
});

describe('checkout', () => {
  it('needs a signed-in person', async () => {
    expect((await w.call({ action: 'checkout', plan: 'starter' }, 'Bearer nope')).status).toBe(401);
  });

  it('prepares the membership checkout at $2.29, for this account', async () => {
    const r = await w.call({ action: 'checkout', plan: 'starter', source: 'paywall' });
    expect(r.body.price_cents).toBe(229);
    expect(r.body.plan).toBe('starter');
    const url = new URL(String(r.body.url));
    expect(url.origin + url.pathname).toBe('https://madevisa.gumroad.com/l/membership');
    expect(url.searchParams.get('wanted')).toBe('true');
    expect(url.searchParams.get('mv')).toBe(CHECKOUT_ID);
    expect(url.searchParams.get('email')).toBe(USER.email);
    expect(url.searchParams.get('recurrence')).toBe('monthly');
    // Flat prices: never a discount code.
    expect(url.searchParams.has('code')).toBe(false);
    const begun = w.calls.find((c) => c.name === 'gumroad_checkout_begin');
    expect(begun?.args).toEqual({ p_user: USER.id, p_plan: 'starter', p_source: 'paywall' });
  });

  it('sells only the membership: an old "pro" link gets the membership too', async () => {
    const r = await w.call({ action: 'checkout', plan: 'pro' });
    expect(r.body.plan).toBe('starter');
    expect(r.body.price_cents).toBe(229);
    expect(String(r.body.url)).toContain('/l/membership');
  });

  it('ignores any amount the page sends', async () => {
    const r = await w.call({ action: 'checkout', plan: 'starter', price_cents: 1, amount: 1 });
    expect(r.body.price_cents).toBe(229);
    expect(w.calls.find((c) => c.name === 'gumroad_checkout_begin')?.args).not.toHaveProperty('p_price_cents');
  });

  it('refuses unknown plans and other billing periods', async () => {
    expect((await w.call({ action: 'checkout', plan: 'enterprise' })).status).toBe(400);
    expect((await w.call({ action: 'checkout', plan: 'free' })).status).toBe(400);
    expect((await w.call({ action: 'checkout', plan: 'starter', billing: 'yearly' })).status).toBe(400);
  });

  it('opens the 3-month plan only at the 3-month price set on Gumroad', async () => {
    // No quarterly price on the product: refused, monthly still works.
    expect((await w.call({ action: 'checkout', plan: 'starter', billing: 'quarterly' })).body.error).toMatch(/3-month/);
    Object.assign(w.products.prod_starter, tier(229, { quarterly: { price_cents: 499 } }));
    const r = await w.call({ action: 'checkout', plan: 'starter', billing: 'quarterly' });
    expect(r.body.billing).toBe('quarterly');
    expect(r.body.price_cents).toBe(499);
    expect(new URL(String(r.body.url)).searchParams.get('recurrence')).toBe('quarterly');
    // A different quarterly price on Gumroad: refused.
    Object.assign(w.products.prod_starter, tier(229, { quarterly: { price_cents: 599 } }));
    expect((await w.call({ action: 'checkout', plan: 'starter', billing: 'quarterly' })).body.error).toMatch(/3-month/);
  });

  it('is off until the membership is connected, and until card payments are switched on (admins can try it)', async () => {
    w.cfg.plans![0].connected_at = null;
    expect((await w.call({ action: 'checkout' })).body.error).toBe('off');
    w.cfg.plans![0].connected_at = '2026-10-10T00:00:00Z';
    w.cfg.enabled = false;
    expect((await w.call({ action: 'checkout' })).body.error).toBe('off');
    w.state.is_admin = true;
    expect((await w.call({ action: 'checkout' })).body.url).toBeTruthy();
  });

  it('refuses when Gumroad would charge something else than the price shown', async () => {
    Object.assign(w.products.prod_starter, tier(299));
    const r = await w.call({ action: 'checkout' });
    expect(r.body.url).toBeUndefined();
    expect(String(r.body.error)).toMatch(/can’t be bought right now/);
    expect(w.calls.some((c) => c.name === 'gumroad_checkout_begin')).toBe(false);
    expect(JSON.stringify(w.calls.find((c) => c.name === 'gumroad_save')?.args)).toMatch(/costs \$2.99 a month on Gumroad, but MadeVisa Membership is \$2.29/);
  });

  it('allows a yearly option on the product (the link opens on monthly), but refuses Gumroad discounts by country', async () => {
    Object.assign(w.products.prod_starter, tier(229, { yearly: { price_cents: 2200 } }));
    expect(new URL(String((await w.call({ action: 'checkout' })).body.url)).searchParams.get('recurrence')).toBe('monthly');
    Object.assign(w.products.prod_starter, tier(229));
    (w.products.prod_starter.variants as { options: { recurrence_prices: { monthly: Record<string, unknown> } }[] }[])[0].options[0].recurrence_prices.monthly.purchasing_power_parity_prices = { IN: 100 };
    expect((await w.call({ action: 'checkout' })).body.url).toBeUndefined();
  });

  it('never starts a second membership (the membership or the retired Pro)', async () => {
    w.state.alive = [{ subscription_id: 'sub_p', plan: 'pro', status: 'alive' }];
    const r = await w.call({ action: 'checkout' });
    expect(r.body.already).toBe(true);
    expect(r.body.manage_url).toBe('https://gumroad.com/subscriptions/sub_p/manage');
    expect(w.calls.some((c) => c.name === 'gumroad_checkout_begin')).toBe(false);
  });
});

describe('guest checkout (no account)', () => {
  it('needs no sign-in and returns THE membership link', async () => {
    const r = await w.call({ action: 'guest_checkout', source: 'job_page', email: 'New@Example.com' }, '');
    expect(r.status).toBe(200);
    const url = new URL(String(r.body.url));
    expect(url.origin + url.pathname).toBe('https://madevisa.gumroad.com/l/membership');
    expect(url.searchParams.get('wanted')).toBe('true');
    expect(url.searchParams.get('recurrence')).toBe('monthly');
    expect(url.searchParams.get('email')).toBe('new@example.com');
    expect(url.searchParams.has('mv')).toBe(false);
    expect(r.body.price_cents).toBe(229);
    // Nothing is recorded for a guest: the payment itself decides whose membership it is.
    expect(w.calls.some((c) => c.name === 'gumroad_checkout_begin' || c.name === 'gumroad_user')).toBe(false);
  });

  it('drops an email that isn’t one', async () => {
    const r = await w.call({ action: 'guest_checkout', email: 'not an email' }, '');
    expect(new URL(String(r.body.url)).searchParams.has('email')).toBe(false);
  });

  it('is off until card payments are on', async () => {
    w.cfg.enabled = false;
    expect((await w.call({ action: 'guest_checkout' }, '')).body.error).toBe('off');
  });
});

describe('notifications from Gumroad', () => {
  const sale = (id: string, product: string, sub: string, extra: Record<string, unknown> = {}) => ({ id, product_id: product, subscription_id: sub, created_at: '2026-10-12T10:00:00Z', price: product === 'prod_starter' ? 229 : 899, refunded: false, chargedback: false, ...extra });
  const member = (id: string, product: string, extra: Record<string, unknown> = {}) => ({ id, product_id: product, status: 'alive', recurrence: 'monthly', email: USER.email, purchase_ids: [], charge_occurrence_count: 1, ...extra });

  it('refuses a wrong key', async () => {
    expect(await w.ping({ sale_id: 's1' }, 'nope')).toBe(403);
    expect(w.applied()).toHaveLength(0);
  });

  it('applies a verified Starter payment as Starter — the product decides, not the ping', async () => {
    w.sales.s1 = sale('s1', 'prod_starter', 'sub_s');
    w.subscribers.sub_s = member('sub_s', 'prod_starter', { purchase_ids: ['s1'] });
    // A forged extra field asking for Pro changes nothing.
    expect(await w.ping({ sale_id: 's1', product_id: 'prod_starter', 'url_params[mv]': CHECKOUT_ID, 'url_params[plan]': 'pro' })).toBe(200);
    const [p] = w.applied();
    expect(p.plan).toBe('starter');
    expect(p.product_id).toBe('prod_starter');
    expect(p.checkout_id).toBe(CHECKOUT_ID);
    expect(p.last_paid_at).toBe('2026-10-12T10:00:00.000Z');
  });

  it('applies the old Pro product as Pro', async () => {
    w.subscribers.sub_old = member('sub_old', 'prod_legacy');
    await w.ping({ subscription_id: 'sub_old', resource_name: 'subscription_updated' });
    expect(w.applied()[0].plan).toBe('pro');
  });

  it('ignores products that are not MadeVisa plans, without keeping anything', async () => {
    expect(await w.ping({ sale_id: 's9', product_id: 'prod_ebook' })).toBe(200);
    expect(w.calls.some((c) => c.name === 'gumroad_log_event')).toBe(false);
  });

  it('does not believe a ping Gumroad cannot confirm', async () => {
    await w.ping({ sale_id: 'made_up', product_id: 'prod_pro' });
    expect(w.applied()).toHaveLength(0);
    const finished = w.calls.find((c) => c.name === 'gumroad_finish_event');
    expect(finished?.args?.p_ok).toBe(false);
  });

  it('a refunded payment counts as not paid', async () => {
    w.sales.s2 = sale('s2', 'prod_pro', 'sub_p', { refunded: true });
    w.subscribers.sub_p = member('sub_p', 'prod_pro', { purchase_ids: ['s2'], status: 'cancelled', ended_at: '2026-10-12T11:00:00Z' });
    await w.ping({ sale_id: 's2', resource_name: 'refund' });
    const [p] = w.applied();
    expect(p.last_paid_at).toBeNull();
    expect(p.ended_at).toBe('2026-10-12T11:00:00.000Z');
  });

  it('a repeated ping is applied with the same state (the database makes it a no-op)', async () => {
    w.sales.s1 = sale('s1', 'prod_starter', 'sub_s');
    w.subscribers.sub_s = member('sub_s', 'prod_starter', { purchase_ids: ['s1'] });
    await w.ping({ sale_id: 's1' });
    await w.ping({ sale_id: 's1' });
    const [a, b] = w.applied();
    expect(b).toEqual(a);
  });
});

describe('a purchase made without an account', () => {
  const sale = (id: string, sub: string) => ({ id, product_id: 'prod_starter', subscription_id: sub, created_at: '2026-10-12T10:00:00Z', price: 229, refunded: false, chargedback: false });
  const member = (id: string, email: string) => ({ id, product_id: 'prod_starter', status: 'alive', recurrence: 'monthly', email, purchase_ids: ['g1'], charge_occurrence_count: 1 });

  it('no account with that email: one is made, the membership goes on it, and both emails are sent', async () => {
    w.buyer.state = 'none';
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = member('sub_g', 'New.Buyer@Example.com');
    await w.ping({ sale_id: 'g1', product_id: 'prod_starter' });
    expect(w.made).toEqual(['new.buyer@example.com']);
    expect(w.applied()[0].claim_user).toBe('44444444-4444-4444-8444-444444444444');
    expect(w.emails()).toEqual([
      { p_user: '44444444-4444-4444-8444-444444444444', p_kind: 'account', p_ref: 'sub_g' },
      { p_user: '44444444-4444-4444-8444-444444444444', p_kind: 'welcome', p_ref: 'sub_g' },
    ]);
    const note = String(w.calls.find((c) => c.name === 'gumroad_finish_event')?.args?.p_note);
    expect(note).toMatch(/one was created for this email/);
  });

  it('the guest browser token (?mvg=) is remembered for the account, so that browser can sign in with a code', async () => {
    w.buyer.state = 'none';
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = member('sub_g', 'New.Buyer@Example.com');
    await w.ping({ sale_id: 'g1', product_id: 'prod_starter', 'url_params[mvg]': '99999999-9999-4999-8999-999999999999' });
    expect(w.calls.find((c) => c.name === 'guest_claim_mark')?.args).toEqual({
      p_token: '99999999-9999-4999-8999-999999999999',
      p_user: '44444444-4444-4444-8444-444444444444',
      p_email: 'New.Buyer@Example.com',
      p_subscription: 'sub_g',
    });
  });

  it('no token, or a bad one: nothing is remembered', async () => {
    w.buyer.state = 'none';
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = member('sub_g', 'x@example.com');
    await w.ping({ sale_id: 'g1', product_id: 'prod_starter', 'url_params[mvg]': 'not-a-token' });
    expect(w.calls.some((c) => c.name === 'guest_claim_mark')).toBe(false);
  });

  it('guest_claim emails a sign-in code once the payment is on an account (no sign-in needed to ask)', async () => {
    const r = await w.call({ action: 'guest_claim', token: '99999999-9999-4999-8999-999999999999' }, '');
    expect(r.body).toEqual({ state: 'sent', email: 'new.buyer@example.com', wait: 60 });
    expect(w.calls.find((c) => c.name === 'guest_claim_code')?.args).toEqual({ p_email: 'new.buyer@example.com', p_user: '44444444-4444-4444-8444-444444444444', p_code: '123456' });
    // The code never goes back to the browser.
    expect(JSON.stringify(r.body)).not.toContain('123456');
  });

  it('guest_claim: too soon again → no new code; unknown token → nothing', async () => {
    w.claim.state = 'wait';
    w.claim.seconds = 40;
    expect((await w.call({ action: 'guest_claim', token: '99999999-9999-4999-8999-999999999999' }, '')).body).toEqual({ state: 'sent', email: 'new.buyer@example.com', wait: 40 });
    expect(w.calls.some((c) => c.name === 'guest_claim_code')).toBe(false);
    w.claim.state = 'none';
    expect((await w.call({ action: 'guest_claim', token: '99999999-9999-4999-8999-999999999999' }, '')).body).toEqual({ state: 'none' });
    expect((await w.call({ action: 'guest_claim', token: 'nope' }, '')).body).toEqual({ state: 'none' });
  });

  it('a trusted account with that email gets it (no new account; welcome email only)', async () => {
    w.buyer.state = 'match';
    w.buyer.user_id = USER.id;
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = member('sub_g', USER.email);
    await w.ping({ sale_id: 'g1' });
    expect(w.made).toHaveLength(0);
    expect(w.applied()[0].claim_user).toBe(USER.id);
    expect(w.emails()).toEqual([{ p_user: USER.id, p_kind: 'welcome', p_ref: 'sub_g' }]);
  });

  it('an account whose email was never verified is not claimed, and none is made', async () => {
    w.buyer.state = 'unverified';
    w.buyer.user_id = USER.id;
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = member('sub_g', USER.email);
    await w.ping({ sale_id: 'g1' });
    expect(w.made).toHaveLength(0);
    expect(w.applied()[0].claim_user).toBeNull();
    expect(w.emails()).toHaveLength(0);
  });

  it('a renewal of a linked membership makes nothing and sends nothing', async () => {
    w.buyer.state = 'linked';
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = member('sub_g', USER.email);
    await w.ping({ sale_id: 'g1' });
    expect(w.made).toHaveLength(0);
    expect(w.emails()).toHaveLength(0);
  });

  it('an ended membership never creates an account', async () => {
    w.buyer.state = 'none';
    w.sales.g1 = sale('g1', 'sub_g');
    w.subscribers.sub_g = { ...member('sub_g', 'x@example.com'), status: 'cancelled', ended_at: '2026-10-12T11:00:00Z' };
    await w.ping({ sale_id: 'g1' });
    expect(w.made).toHaveLength(0);
  });
});

describe('check my payment', () => {
  it('reads the memberships again and answers with the resolved plan', async () => {
    w.subscribers.sub_s = member2('sub_s', 'prod_starter');
    w.state.plan = 'starter';
    const r = await w.call({ action: 'refresh' });
    expect(r.body).toMatchObject({ ok: true, active: true, plan: 'starter' });
    expect(w.applied()[0].claim_user).toBe(USER.id);
  });

  it('only claims a purchase by email when the email is verified', async () => {
    w.subscribers.sub_s = member2('sub_s', 'prod_starter');
    w.state.email_verified = false;
    await w.call({ action: 'refresh' });
    expect(w.applied()).toHaveLength(0);
  });
});

function member2(id: string, product: string) {
  return { id, product_id: product, status: 'alive', recurrence: 'monthly', email: USER.email, purchase_ids: [], charge_occurrence_count: 1 };
}

describe('admin connect', () => {
  beforeEach(() => {
    w.state.is_admin = true;
  });
  it('needs a plan', async () => {
    expect(String((await w.call({ action: 'connect', product_url: 'https://madevisa.gumroad.com/l/starter' })).body.error)).toMatch(/Starter or Pro/);
  });
  it('connects a correctly priced product and saves its price', async () => {
    const r = await w.call({ action: 'connect', plan: 'starter', product_url: 'https://madevisa.gumroad.com/l/prod_starter' });
    expect(r.body.ok).toBe(true);
    const saved = w.calls.find((c) => c.name === 'gumroad_plan_save');
    expect(saved?.args).toMatchObject({ p_plan: 'starter', p: { product_id: 'prod_starter', price_cents: 229, connected: true } });
  });
  it('refuses a product at the wrong price, with two tiers, or already used by the other plan', async () => {
    expect(String((await w.call({ action: 'connect', plan: 'starter', product_url: 'https://madevisa.gumroad.com/l/prod_pro' })).body.error)).toMatch(/already connected as MadeVisa Pro/);
    w.cfg.plans![1].product_id = null;
    expect(String((await w.call({ action: 'connect', plan: 'starter', product_url: 'https://madevisa.gumroad.com/l/prod_pro' })).body.error)).toMatch(/costs \$8.99 a month on Gumroad, but MadeVisa Membership is \$2.29/);
    w.products.prod_starter.variants = [{ options: [{ recurrence_prices: { monthly: { price_cents: 229 } } }, { recurrence_prices: { monthly: { price_cents: 899 } } }] }];
    expect(String((await w.call({ action: 'connect', plan: 'starter', product_url: 'https://madevisa.gumroad.com/l/prod_starter' })).body.error)).toMatch(/2 tiers/);
  });
  it('is admins only', async () => {
    w.state.is_admin = false;
    expect((await w.call({ action: 'connect', plan: 'pro', product_url: 'https://madevisa.gumroad.com/l/prod_pro' })).status).toBe(403);
  });
});

describe('helpers', () => {
  it('maps products to plans', () => {
    const { cfg } = world();
    expect(planForProduct(cfg, 'prod_starter')).toBe('starter');
    expect(planForProduct(cfg, 'prod_pro')).toBe('pro');
    expect(planForProduct(cfg, 'prod_legacy')).toBe('pro');
    expect(planForProduct(cfg, 'other')).toBeNull();
    expect(planForProduct(cfg, null)).toBeNull();
  });
  it('checks products', () => {
    expect(checkProduct({ ...tier(229), name: 'S', short_url: 'https://a.gumroad.com/l/s' }, 'starter').ok).toBe(true);
    expect(checkProduct({ ...tier(299), name: 'S', short_url: 'https://a.gumroad.com/l/s' }, 'starter').ok).toBe(false);
    expect(checkProduct({ ...tier(229), name: 'S', short_url: 'https://a.gumroad.com/l/s', is_tiered_membership: false }, 'starter').ok).toBe(false);
    expect(checkProduct({ ...tier(229), name: 'S', short_url: 'https://a.gumroad.com/l/s', published: false }, 'starter').ok).toBe(false);
    expect(checkProduct({ ...tier(229), name: 'S', short_url: 'https://evil.example/l/s' }, 'starter').ok).toBe(false);
  });
});
