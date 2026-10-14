import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENTITLEMENTS, PLANS, PLAN_ORDER, lowestPlanWith, priceLabel, usd, type FeatureId, type PlanId } from '../../../supabase/functions/_shared/plans';
import { checkoutHref, cleanSource, confirmedFor, fallbackCatalog, formatMoney, limitRows, nextMonth, orderSummary, planView, readCheckout, readPlanParam, type Catalog } from '@/lib/billingCore';

const MIGRATION = readFileSync(new URL('../../../supabase/migrations/20261219090000_starter_pro_plans.sql', import.meta.url), 'utf8');
/** Later changes to the seed: "UPDATE public.plan_entitlements SET allowed = false, usage_limit = 0 WHERE plan_id = 'free' AND feature IN (…)". */
const LATER = readFileSync(new URL('../../../supabase/migrations/20261220090000_emails_docs_cvmatch_social.sql', import.meta.url), 'utf8');

describe('the plans', () => {
  it('cost $0, $2.99 and $8.99 a month, in USD', () => {
    expect(PLANS.free.priceCents).toBe(0);
    expect(PLANS.starter.priceCents).toBe(299);
    expect(PLANS.pro.priceCents).toBe(899);
    expect(PLANS.starter.currency).toBe('USD');
    expect(PLANS.pro.interval).toBe('month');
    expect(priceLabel('starter')).toBe('$2.99 / month');
    expect(priceLabel('pro')).toBe('$8.99 / month');
    expect(usd(1900)).toBe('$19');
  });

  it('each higher plan includes everything below it', () => {
    const features = Object.keys(ENTITLEMENTS.free) as FeatureId[];
    for (const [low, high] of [['free', 'starter'], ['starter', 'pro']] as [PlanId, PlanId][]) {
      for (const f of features) {
        const a = ENTITLEMENTS[low][f];
        const b = ENTITLEMENTS[high][f];
        if (a.allowed) expect(b.allowed, `${high} has ${f}`).toBe(true);
        if (a.allowed && b.allowed && a.limit != null) expect(b.limit == null || b.limit >= a.limit, `${high} limit for ${f}`).toBe(true);
      }
    }
  });

  it('never promises what it should not', () => {
    const text = JSON.stringify(PLANS).toLowerCase();
    expect(text).not.toMatch(/unlimited ai|guarantee|credits?\b/);
    // Features still being built are listed as "coming", never as included.
    for (const c of PLANS.pro.coming) expect(PLANS.pro.benefits.some((b) => b.title === c)).toBe(false);
    expect(PLANS.pro.coming.join(' ')).toMatch(/Proof of Fit/);
  });

  it('knows which plan unlocks a feature', () => {
    expect(lowestPlanWith('cv_full_report')).toBe('starter');
    expect(lowestPlanWith('sponsorship_documents')).toBe('starter');
    expect(lowestPlanWith('auto_apply')).toBe('pro');
  });
});

describe('the database has the same numbers as the code', () => {
  it('prices', () => {
    for (const id of PLAN_ORDER) {
      const m = new RegExp(`\\('${id}', '\\w+', \\d, (?:NULL|'monthly'), (\\d+), 'USD'`).exec(MIGRATION);
      expect(m, `billing_plans row for ${id}`).not.toBeNull();
      expect(Number(m![1])).toBe(PLANS[id].priceCents);
    }
  });

  it('entitlements and limits', () => {
    const rows = [...MIGRATION.matchAll(/\('(free|starter|pro)',\s+'([a-z_]+)',\s+(true|false),\s+(NULL|\d+),\s+(NULL|'day'|'month')\)/g)];
    const seeded = new Map(rows.map((r) => [`${r[1]}:${r[2]}`, { allowed: r[3] === 'true', limit: r[4] === 'NULL' ? null : Number(r[4]), period: r[5] === 'NULL' ? null : r[5].replace(/'/g, '') }]));
    for (const m of LATER.matchAll(/UPDATE public\.plan_entitlements SET allowed = (true|false), usage_limit = (NULL|\d+)\s+WHERE plan_id = '(free|starter|pro)' AND feature IN \(([^)]*)\)/g)) {
      for (const f of m[4].split(',').map((x) => x.trim().replace(/'/g, ''))) {
        const row = seeded.get(`${m[3]}:${f}`);
        if (row) seeded.set(`${m[3]}:${f}`, { ...row, allowed: m[1] === 'true', limit: m[2] === 'NULL' ? null : Number(m[2]) });
      }
    }
    let n = 0;
    for (const plan of PLAN_ORDER) {
      for (const [f, e] of Object.entries(ENTITLEMENTS[plan])) {
        const db = seeded.get(`${plan}:${f}`);
        expect(db, `${plan}:${f} is seeded`).toBeDefined();
        expect(db!.allowed, `${plan}:${f} allowed`).toBe(e.allowed);
        expect(db!.allowed ? db!.limit : 0, `${plan}:${f} limit`).toBe(e.allowed ? e.limit : 0);
        expect(db!.period, `${plan}:${f} period`).toBe(e.period);
        n++;
      }
    }
    expect(seeded.size).toBe(n);
  });
});

describe('what a person has', () => {
  const view = (plan: PlanId) => planView({ plan, sub: null, others: [], last: null, usage: null, features: ENTITLEMENTS[plan] });
  it('free', () => {
    const v = view('free');
    expect(v.isPaid).toBe(false);
    expect(v.has('cv_full_report')).toBe(false);
    expect(v.limit('saved_jobs')).toBe(5);
    expect(v.limit('sponsorship_documents')).toBe(0);
  });
  it('starter is paid but not Pro', () => {
    const v = view('starter');
    expect(v.isPaid).toBe(true);
    expect(v.isPro).toBe(false);
    expect(v.has('cv_full_report')).toBe(true);
    expect(v.has('auto_apply')).toBe(false);
    expect(v.limit('sponsorship_documents')).toBe(10);
    expect(v.limit('saved_jobs')).toBeNull();
  });
  it('pro', () => {
    const v = view('pro');
    expect(v.isPro).toBe(true);
    expect(v.limit('sponsorship_documents')).toBe(50);
    expect(v.limit('job_alerts')).toBe(10);
  });
  it('the server’s features win over the code’s', () => {
    const v = planView({ plan: 'starter', sub: null, others: [], last: null, usage: null, features: { ...ENTITLEMENTS.starter, job_alerts: { allowed: true, limit: 7, period: null } } });
    expect(v.limit('job_alerts')).toBe(7);
  });
});

describe('order summary', () => {
  const cat = fallbackCatalog();
  const starter = cat.plans.find((p) => p.id === 'starter')!;
  it('due today and the renewal are the plan price, monthly', () => {
    const s = orderSummary(starter, new Date(2026, 9, 12));
    expect(s.dueToday).toBe(299);
    expect(s.renewalAmount).toBe(299);
    expect(s.billing).toBe('Monthly');
    expect(s.renewsOn.getMonth()).toBe(10);
    expect(s.renewsOn.getDate()).toBe(12);
    expect(s.confirmed).toBe(false);
  });
  it('uses the amount the server priced the checkout at once it exists', () => {
    const s = orderSummary(starter, new Date(2026, 9, 12), 299);
    expect(s.confirmed).toBe(true);
  });
  it('renews on the last day of a shorter month', () => {
    expect(nextMonth(new Date(2027, 0, 31)).getDate()).toBe(28);
    expect(nextMonth(new Date(2028, 0, 31)).getDate()).toBe(29);
    expect(nextMonth(new Date(2026, 11, 15)).getFullYear()).toBe(2027);
  });
  it('formats money', () => {
    expect(formatMoney(299)).toBe('$2.99');
    expect(formatMoney(900)).toBe('$9');
  });
  it('the fallback catalogue (server unreachable) can sell nothing', () => {
    expect(cat.source).toBe('fallback');
    expect(cat.plans.every((p) => !p.available)).toBe(true);
  });
  it('lists the limits before purchase', () => {
    const server: Catalog = { ...cat, source: 'server', auto_apply: { enabled: true, free_monthly: 3, pro_monthly: 150 } };
    const pro = server.plans.find((p) => p.id === 'pro')!;
    const rows = Object.fromEntries(limitRows(server, pro).map((r) => [r.label, r.value]));
    expect(rows['Sponsorship documents']).toBe('50 a month, at most 30 in any 7 days');
    expect(rows['Auto Apply']).toBe('Up to 150 applications a month');
    expect(rows['Saved jobs']).toBe('No limit');
    const rowsStarter = Object.fromEntries(limitRows(server, starter).map((r) => [r.label, r.value]));
    expect(rowsStarter['Job alerts']).toBe('5 alerts at a time');
    expect(rowsStarter['Auto Apply']).toBe('3 applications a month to try it');
  });
});

describe('checkout answers', () => {
  const ok = { url: 'https://madevisa.gumroad.com/l/starter?mv=x', checkout_id: 'c1', plan: 'starter', billing: 'monthly', price_cents: 299, currency: 'USD', email: null };
  it('accepts a Gumroad checkout for the plan asked for', () => {
    expect(readCheckout('starter', ok).kind).toBe('ready');
  });
  it('refuses a link that is not Gumroad, or for another plan', () => {
    expect(readCheckout('starter', { ...ok, url: 'https://evil.example/pay' }).kind).toBe('error');
    expect(readCheckout('pro', ok).kind).toBe('error');
    expect(readCheckout('starter', { ...ok, price_cents: '2.99' }).kind).toBe('error');
  });
  it('maps the other answers', () => {
    expect(readCheckout('pro', null).kind).toBe('error');
    expect(readCheckout('pro', { error: 'off' }).kind).toBe('off');
    expect(readCheckout('pro', { already: true, manage_url: 'https://gumroad.com/subscriptions/x/manage' })).toEqual({ kind: 'already', manageUrl: 'https://gumroad.com/subscriptions/x/manage' });
    expect(readCheckout('pro', { switch: true, current_plan: 'starter', manage_url: 'https://gumroad.com/subscriptions/x/manage' })).toMatchObject({ kind: 'switch', currentPlan: 'starter' });
  });
  it('reads the plan and source from the address safely', () => {
    expect(readPlanParam('?plan=pro')).toBe('pro');
    expect(readPlanParam('?plan=enterprise')).toBe('starter');
    expect(readPlanParam('')).toBe('starter');
    expect(cleanSource('job_page')).toBe('job_page');
    expect(cleanSource('<script>')).toBeNull();
    expect(checkoutHref('pro', 'auto_apply')).toBe('/checkout?plan=pro&source=auto_apply&go=1');
  });
  it('confirms only when the server says the plan (or a higher one) is on', () => {
    expect(confirmedFor('starter', 'free')).toBe(false);
    expect(confirmedFor('starter', 'starter')).toBe(true);
    expect(confirmedFor('starter', 'pro')).toBe(true);
    expect(confirmedFor('pro', 'starter')).toBe(false);
    expect(confirmedFor(null, 'free')).toBe(false);
  });
});
