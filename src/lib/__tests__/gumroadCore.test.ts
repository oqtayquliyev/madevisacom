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
    prod_starter: { id: 'prod_starter', name: 'MadeVisa Starter', short_url: 'https://madevisa.gumroad.com/l/starter', ...tier(299) },
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
      { plan: 'starter', price_cents: 299, currency: 'USD', product_id: 'prod_starter', product_url: 'https://madevisa.gumroad.com/l/starter', product_name: 'MadeVisa Starter', provider_price_cents: 299, connected_at: '2026-10-10T00:00:00Z', active: true },
      { plan: 'pro', price_cents: 899, currency: 'USD', product_id: 'prod_pro', product_url: 'https://madevisa.gumroad.com/l/pro', product_name: 'MadeVisa Pro', provider_price_cents: 899, connected_at: '2026-10-10T00:00:00Z', active: true },
    ],
  };
  const state: Record<string, unknown> = { email: USER.email, email_verified: true, is_admin: false, plan: 'free', subscription_ids: [], alive: [] };
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
          return { data: { id: CHECKOUT_ID, plan, price_cents: plan === 'starter' ? 299 : 899, currency: 'USD' }, error: null };
        }
        case 'gumroad_apply':
          return { data: { linked: true, active: true, until: '2026-11-15T00:00:00Z', plan: (args?.p as Record<string, unknown>).plan }, error: null };
        case 'gumroad_log_event':
          return { data: 7, error: null };
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
  return { cfg, state, products, subscribers, sales, calls, call, ping, applied };
}

let w: ReturnType<typeof world>;
beforeEach(() => {
  w = world();
});

describe('checkout', () => {
  it('needs a signed-in person', async () => {
    expect((await w.call({ action: 'checkout', plan: 'pro' }, 'Bearer nope')).status).toBe(401);
  });

  it('prepares the Starter checkout at the configured price, for this account', async () => {
    const r = await w.call({ action: 'checkout', plan: 'starter', source: 'pricing' });
    expect(r.body.price_cents).toBe(299);
    expect(r.body.plan).toBe('starter');
    const url = new URL(String(r.body.url));
    expect(url.origin + url.pathname).toBe('https://madevisa.gumroad.com/l/starter');
    expect(url.searchParams.get('mv')).toBe(CHECKOUT_ID);
    expect(url.searchParams.get('email')).toBe(USER.email);
    expect(url.searchParams.get('recurrence')).toBe('monthly');
    // Flat prices: never a discount code.
    expect(url.searchParams.has('code')).toBe(false);
    const begun = w.calls.find((c) => c.name === 'gumroad_checkout_begin');
    expect(begun?.args).toEqual({ p_user: USER.id, p_plan: 'starter', p_source: 'pricing' });
  });

  it('prepares Pro at $8.99', async () => {
    const r = await w.call({ action: 'checkout', plan: 'pro' });
    expect(r.body.price_cents).toBe(899);
    expect(String(r.body.url)).toContain('/l/pro');
  });

  it('ignores any amount the page sends', async () => {
    const r = await w.call({ action: 'checkout', plan: 'pro', price_cents: 1, amount: 1 });
    expect(r.body.price_cents).toBe(899);
    expect(w.calls.find((c) => c.name === 'gumroad_checkout_begin')?.args).not.toHaveProperty('p_price_cents');
  });

  it('refuses unknown plans and other billing periods', async () => {
    expect((await w.call({ action: 'checkout', plan: 'enterprise' })).status).toBe(400);
    expect((await w.call({ action: 'checkout', plan: 'free' })).status).toBe(400);
    expect((await w.call({ action: 'checkout', plan: 'pro', billing: 'yearly' })).status).toBe(400);
  });

  it('is off until the plan is connected, and until card payments are switched on (admins can try it)', async () => {
    w.cfg.plans![0].connected_at = null;
    expect((await w.call({ action: 'checkout', plan: 'starter' })).body.error).toBe('off');
    w.cfg.enabled = false;
    expect((await w.call({ action: 'checkout', plan: 'pro' })).body.error).toBe('off');
    w.state.is_admin = true;
    expect((await w.call({ action: 'checkout', plan: 'pro' })).body.url).toBeTruthy();
  });

  it('refuses when Gumroad would charge something else than the price shown', async () => {
    Object.assign(w.products.prod_pro, tier(999));
    const r = await w.call({ action: 'checkout', plan: 'pro' });
    expect(r.body.url).toBeUndefined();
    expect(String(r.body.error)).toMatch(/can’t be bought right now/);
    expect(w.calls.some((c) => c.name === 'gumroad_checkout_begin')).toBe(false);
    expect(JSON.stringify(w.calls.find((c) => c.name === 'gumroad_save')?.args)).toMatch(/costs \$9.99 a month on Gumroad, but Pro is \$8.99/);
  });

  it('refuses when buyers could pick a yearly price on Gumroad, or Gumroad discounts by country', async () => {
    Object.assign(w.products.prod_pro, tier(899, { yearly: { price_cents: 8900 } }));
    expect((await w.call({ action: 'checkout', plan: 'pro' })).body.url).toBeUndefined();
    Object.assign(w.products.prod_pro, tier(899));
    (w.products.prod_pro.variants as { options: { recurrence_prices: { monthly: Record<string, unknown> } }[] }[])[0].options[0].recurrence_prices.monthly.purchasing_power_parity_prices = { IN: 300 };
    expect((await w.call({ action: 'checkout', plan: 'pro' })).body.url).toBeUndefined();
  });

  it('never starts a second membership', async () => {
    w.state.alive = [{ subscription_id: 'sub_s', plan: 'starter', status: 'alive' }];
    const same = await w.call({ action: 'checkout', plan: 'starter' });
    expect(same.body.already).toBe(true);
    expect(same.body.manage_url).toBe('https://gumroad.com/subscriptions/sub_s/manage');
    const other = await w.call({ action: 'checkout', plan: 'pro' });
    expect(other.body.switch).toBe(true);
    expect(other.body.current_plan).toBe('starter');
    expect(w.calls.some((c) => c.name === 'gumroad_checkout_begin')).toBe(false);
  });
});

describe('notifications from Gumroad', () => {
  const sale = (id: string, product: string, sub: string, extra: Record<string, unknown> = {}) => ({ id, product_id: product, subscription_id: sub, created_at: '2026-10-12T10:00:00Z', price: product === 'prod_starter' ? 299 : 899, refunded: false, chargedback: false, ...extra });
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
    expect(saved?.args).toMatchObject({ p_plan: 'starter', p: { product_id: 'prod_starter', price_cents: 299, connected: true } });
  });
  it('refuses a product at the wrong price, with two tiers, or already used by the other plan', async () => {
    expect(String((await w.call({ action: 'connect', plan: 'starter', product_url: 'https://madevisa.gumroad.com/l/prod_pro' })).body.error)).toMatch(/already connected as Pro/);
    w.cfg.plans![1].product_id = null;
    expect(String((await w.call({ action: 'connect', plan: 'starter', product_url: 'https://madevisa.gumroad.com/l/prod_pro' })).body.error)).toMatch(/costs \$8.99 a month on Gumroad, but Starter is \$2.99/);
    w.products.prod_starter.variants = [{ options: [{ recurrence_prices: { monthly: { price_cents: 299 } } }, { recurrence_prices: { monthly: { price_cents: 899 } } }] }];
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
    expect(checkProduct({ ...tier(299), name: 'S', short_url: 'https://a.gumroad.com/l/s' }, 'starter').ok).toBe(true);
    expect(checkProduct({ ...tier(299), name: 'S', short_url: 'https://a.gumroad.com/l/s', is_tiered_membership: false }, 'starter').ok).toBe(false);
    expect(checkProduct({ ...tier(299), name: 'S', short_url: 'https://a.gumroad.com/l/s', published: false }, 'starter').ok).toBe(false);
    expect(checkProduct({ ...tier(299), name: 'S', short_url: 'https://evil.example/l/s' }, 'starter').ok).toBe(false);
  });
});
