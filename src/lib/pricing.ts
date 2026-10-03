// MadeVisa pricing — one place for every price a job seeker sees.
//
// How it works
//   • One plan for job seekers: MadeVisa Pro, monthly or yearly. It includes
//     the full CV match report on every job and 50 sponsorship documents a
//     month. Checking your match score is free for everyone.
//   • The price follows each country's purchasing power. It is anchored on
//     $19 a month in high-income countries and goes down with income per
//     person, country by country (not in three steps) to $5 in the
//     lowest-income countries. Yearly costs about 35% less than 12 months.
//   • Where you are is read from your IP address, checked once a day — not
//     the country picked on the site, so it can't be switched by hand.
//   • Prices are set in USD and shown in your local currency when we have a
//     stable rate for it (rounded to a clean price), otherwise in USD.
//   • Employer products are priced in USD for everyone.

import { useEffect, useState } from 'react';
import { detectCountryByIp, getStoredCountry } from '@/lib/geolocation';
import { money, PLAN_USD, planUsd, tierFor, YEARLY_MONTHS, type Money, type PriceTier } from '@/lib/planPrice';

// The price list itself (what the plan costs in each country) lives in planPrice.ts, without any browser code,
// so the server-rendered pricing page (api/seo.ts) prints exactly the same numbers.
export * from '@/lib/planPrice';

// ---------------------------------------------------------------------------
// Where the visitor is, for prices
// ---------------------------------------------------------------------------

const PRICE_KEY = 'madevisa:priceCountry';
const PRICE_TTL = 24 * 60 * 60 * 1000;
let priceCountryMemo: string | null | undefined;
let priceCountryInflight: Promise<string | null> | null = null;

function readCached(): string | null | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(PRICE_KEY) ?? 'null') as { c: string | null; at: number } | null;
    if (v && Date.now() - v.at < PRICE_TTL) return v.c;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** The country prices are based on: the IP address (cached a day), else the site's detected country. */
export function detectPriceCountry(): Promise<string | null> {
  if (priceCountryMemo !== undefined) return Promise.resolve(priceCountryMemo);
  const cached = readCached();
  if (cached !== undefined) {
    priceCountryMemo = cached;
    return Promise.resolve(cached);
  }
  priceCountryInflight ??= detectCountryByIp().then((r) => {
    const c = r?.code ?? getStoredCountry();
    priceCountryMemo = c;
    try {
      localStorage.setItem(PRICE_KEY, JSON.stringify({ c, at: Date.now() }));
    } catch {
      /* ignore */
    }
    return c;
  });
  return priceCountryInflight;
}

export type PlanPrices = {
  monthly: Money;
  yearly: Money;
  /** The yearly price spread over 12 months. */
  yearlyPerMonth: Money;
  /** Percent saved by paying yearly, from the prices actually shown. */
  saving: number;
};

export type Prices = {
  /** Country the prices are for (null = unknown → the middle price in USD). */
  country: string | null;
  tier: PriceTier;
  ready: boolean;
  /** Price of a USD amount for this visitor. */
  m: (usd: number) => Money;
  /** MadeVisa Pro — the one plan. */
  pro: PlanPrices;
  /** Monthly price in USD before conversion (for requests and reports). */
  usd: number;
  /** True when the price is below the top price. */
  reduced: boolean;
};

export function pricesFor(country: string | null, ready = true): Prices {
  const tier = tierFor(country);
  const m = (usd: number) => money(usd, country);
  const usd = planUsd(country);
  const monthly = m(usd);
  const yearly = m(Math.round(usd * YEARLY_MONTHS));
  return {
    country,
    tier,
    ready,
    m,
    usd,
    reduced: usd < PLAN_USD.top,
    pro: {
      monthly,
      yearly,
      yearlyPerMonth: m(Math.round((yearly.usd / 12) * 100) / 100),
      saving: Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100),
    },
  };
}

/** Prices for this visitor (IP-based country). Shows the middle price in USD until the lookup finishes. */
export function usePrices(): Prices {
  const [country, setCountry] = useState<string | null | undefined>(() => (priceCountryMemo !== undefined ? priceCountryMemo : readCached()));
  useEffect(() => {
    if (country !== undefined) return;
    let alive = true;
    detectPriceCountry().then((c) => alive && setCountry(c));
    return () => {
      alive = false;
    };
  }, [country]);
  return pricesFor(country ?? null, country !== undefined);
}

/** "Price for Azerbaijan, set to match local incomes." */
export function priceNote(p: Prices, countryName: (c: string) => string | null): string {
  if (!p.country) return 'Price in USD.';
  const name = countryName(p.country) ?? p.country;
  return p.reduced ? `Price for ${name}, set to match local incomes.` : `Price for ${name}.`;
}

/** What the admin sees on a plan request: "Pro yearly · AZN 160 ($94) · AZ". */
export function priceRequestLabel(p: Prices, what: string, price: Money): string {
  const shown = price.local ? `${price.label} (${price.usdLabel})` : price.usdLabel;
  return `${what} · ${shown}${p.country ? ` · ${p.country}` : ''}`.slice(0, 60);
}
