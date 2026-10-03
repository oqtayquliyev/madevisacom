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

/** Coarse income band, kept for reports: A high · B upper-middle · C lower. */
export type PriceTier = 'A' | 'B' | 'C';

/** High income (tier A). */
const TIER_A = new Set(
  (
    'US CA GB IE IS NO SE FI DK DE NL BE LU FR CH LI AT IT ES PT MT MC AD SM ' +
    'AU NZ JP KR SG HK MO TW IL AE QA KW BH SA OM BN'
  ).split(' '),
);
/** Upper-middle income (tier B). Everything not in A or B is tier C. */
const TIER_B = new Set(
  (
    'PL CZ SK SI EE LV LT HU HR RO BG GR CY RS ME MK AL BA XK MD BY RU TR ' +
    'AZ GE AM KZ CN MY TH MV MU SC BW NA ZA GA GQ ' +
    'MX BR AR CL UY CO PE EC CR PA DO JM TT BB BS BZ GY SR PY GT SV ' +
    'JO LB IQ IR LY DZ TM FJ'
  ).split(' '),
);

export const tierFor = (country: string | null | undefined): PriceTier => {
  const c = (country ?? '').toUpperCase();
  if (TIER_A.has(c)) return 'A';
  if (TIER_B.has(c)) return 'B';
  return c ? 'C' : 'B';
};

// ---------------------------------------------------------------------------
// The price list (USD)
// ---------------------------------------------------------------------------

/** The plan's price where incomes are highest, and where they are lowest. */
export const PLAN_USD = { top: 19, floor: 5 } as const;
/** A year costs this many monthly payments (149 / 19 — the yearly price is about 35% off). */
export const YEARLY_MONTHS = 149 / 19;
/** Used when we don't know the country's income (tiers A / B / C). */
const TIER_PRICE: Record<PriceTier, number> = { A: 19, B: 12, C: 7 };

/** Sponsorship documents included in the plan each calendar month. */
export const PRO_MONTHLY_DOCS = 50;
/** New accounts no longer get a free document — it is part of the plan. */
export const SIGNUP_DOCS = 0;
/** Jobs a day on which a free account sees its missing skills. */
export const FREE_DAILY_CHECKS = 3;

/**
 * Income per person, in thousand USD a year (GDP per capita at market
 * rates, rounded; reviewed October 2026). Only used to place a country
 * between the top price and the floor — a few thousand dollars either way
 * moves the price by cents.
 */
const INCOME_K: Record<string, number> = {
  // North America, Western and Northern Europe
  US: 89, CA: 55, GB: 54, IE: 108, IS: 90, NO: 92, SE: 60, FI: 55, DK: 72, DE: 57, NL: 68, BE: 57, LU: 140, FR: 48, CH: 105, LI: 190, AT: 59,
  IT: 41, ES: 37, PT: 30, MT: 45, MC: 250, AD: 50, SM: 60, CY: 40, GR: 25,
  // Central and Eastern Europe, Caucasus, Central Asia
  PL: 27, CZ: 33, SK: 27, SI: 35, EE: 33, LV: 25, LT: 30, HU: 25, HR: 26, RO: 21, BG: 18, RS: 14, ME: 14, MK: 10, AL: 11, BA: 9.5, XK: 7.5,
  MD: 8, BY: 8.5, RU: 15, UA: 6, TR: 17, AZ: 7.6, GE: 9.5, AM: 9, KZ: 15, UZ: 3.5, KG: 2.7, TJ: 1.5, TM: 13, MN: 7,
  // Asia-Pacific
  AU: 65, NZ: 49, JP: 34, KR: 36, SG: 93, HK: 55, MO: 75, TW: 35, CN: 13.8, MY: 13.5, TH: 7.8, ID: 5.2, PH: 4.3, VN: 4.8, IN: 2.9, PK: 1.7,
  BD: 2.7, LK: 4.5, NP: 1.5, MM: 1.2, KH: 2.8, LA: 2.1, MV: 13, BT: 4, AF: 0.4, FJ: 6.5, PG: 3, BN: 34,
  // Middle East
  IL: 58, AE: 50, QA: 72, KW: 33, BH: 30, SA: 33, OM: 20, JO: 4.7, LB: 4, IQ: 6, IR: 4.5, SY: 0.8, YE: 0.6, PS: 3,
  // Latin America and the Caribbean
  MX: 14, BR: 10.5, AR: 14, CL: 17.5, UY: 23, CO: 8, PE: 8.5, EC: 6.8, BO: 4.3, PY: 6.8, VE: 4, CR: 18.5, PA: 19.5, DO: 11.5, GT: 6.3,
  SV: 5.7, HN: 3.5, NI: 2.9, CU: 7, JM: 7.5, TT: 19, BB: 26, BS: 37, BZ: 8, GY: 30, SR: 7,
  // Africa
  ZA: 6.5, NG: 1.1, EG: 3.3, MA: 4.4, DZ: 5.7, TN: 4.5, LY: 6.8, KE: 2.3, ET: 1.1, GH: 2.5, TZ: 1.3, UG: 1.2, RW: 1, SN: 1.9, CI: 2.9,
  CM: 1.9, AO: 3, ZM: 1.4, ZW: 2.4, MZ: 0.7, MG: 0.6, BW: 7.8, NA: 4.6, MU: 12.5, SC: 22, GA: 9, GQ: 6.5, SD: 0.6, CD: 0.7, BJ: 1.6,
  BF: 1, ML: 1, NE: 0.7, TG: 1.1, TD: 1, MW: 0.6, SL: 0.9, LR: 0.9, GM: 0.9, GN: 1.7, SO: 0.7,
};
/** Income at which the price reaches the top, and at which it reaches the floor. */
const INCOME_TOP = 50;
const INCOME_FLOOR = 1.2;

/**
 * The monthly price in USD for one country: $19 from $50k a year per person
 * upwards, sliding down on a log scale (each halving of income takes off the
 * same amount) to $5 at $1.2k and below. Whole dollars.
 */
export function planUsd(country: string | null | undefined): number {
  const c = (country ?? '').toUpperCase();
  const income = INCOME_K[c];
  if (income == null) return TIER_PRICE[tierFor(c)];
  const t = (Math.log(income) - Math.log(INCOME_FLOOR)) / (Math.log(INCOME_TOP) - Math.log(INCOME_FLOOR));
  return Math.round(PLAN_USD.floor + (PLAN_USD.top - PLAN_USD.floor) * Math.max(0, Math.min(1, t)));
}

/** Employer products (USD, same everywhere). */
export const EMPLOYER_PRICES = {
  sponsoredJob: 149,
  featuredSocial: 49,
  employerPlanFrom: 99,
  hiringBrief: 29,
} as const;

// ---------------------------------------------------------------------------
// Local currency
// ---------------------------------------------------------------------------

/**
 * Units of local currency per 1 USD. Approximate, reviewed September 2026;
 * used only to show a rounded local price. Currencies that move a lot
 * (ARS, NGN, TRY, EGP, RUB, IRR…) are left out on purpose — those
 * countries see USD.
 */
const USD_RATE: Record<string, number> = {
  EUR: 0.9, GBP: 0.77, CHF: 0.83, SEK: 10, NOK: 10.8, DKK: 6.7, ISK: 132, PLN: 3.85, CZK: 22.5, HUF: 355, RON: 4.5,
  CAD: 1.37, AUD: 1.5, NZD: 1.65, JPY: 145, KRW: 1350, SGD: 1.3, HKD: 7.8, TWD: 31, ILS: 3.6,
  AED: 3.67, SAR: 3.75, QAR: 3.64, KWD: 0.31, BHD: 0.38, OMR: 0.38,
  AZN: 1.7, GEL: 2.7, AMD: 390, KZT: 510, UZS: 12700, KGS: 87, MDL: 17.5, UAH: 41.5, RSD: 105, MKD: 55, ALL: 90, BAM: 1.76,
  CNY: 7.15, MYR: 4.3, THB: 34, IDR: 16000, PHP: 57, VND: 25500, INR: 85, PKR: 280, BDT: 120, LKR: 300, NPR: 136,
  MXN: 18.5, BRL: 5.5, CLP: 940, COP: 4000, PEN: 3.7, DOP: 60, CRC: 510, UYU: 40, GTQ: 7.7,
  ZAR: 18, KES: 129, MAD: 9.7, TND: 3, GHS: 12, JOD: 0.71, UGX: 3650, TZS: 2600, RWF: 1400, ETB: 130, XOF: 590, XAF: 590,
  MOP: 8.05, BND: 1.3, NAD: 18, TTD: 6.8, MUR: 46, DZD: 134, KHR: 4050, IQD: 1310,
};

/** Country → currency (only where we show a local price). */
const CURRENCY_OF: Record<string, string> = {
  // euro area
  AT: 'EUR', BE: 'EUR', BG: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR',
  LT: 'EUR', LU: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', ME: 'EUR', XK: 'EUR', MC: 'EUR', AD: 'EUR', SM: 'EUR',
  GB: 'GBP', CH: 'CHF', LI: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', SG: 'SGD', HK: 'HKD', TW: 'TWD', IL: 'ILS',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  AZ: 'AZN', GE: 'GEL', AM: 'AMD', KZ: 'KZT', UZ: 'UZS', KG: 'KGS', MD: 'MDL', UA: 'UAH', RS: 'RSD', MK: 'MKD', AL: 'ALL', BA: 'BAM',
  CN: 'CNY', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  MX: 'MXN', BR: 'BRL', CL: 'CLP', CO: 'COP', PE: 'PEN', DO: 'DOP', CR: 'CRC', UY: 'UYU', GT: 'GTQ',
  ZA: 'ZAR', KE: 'KES', MA: 'MAD', TN: 'TND', GH: 'GHS', JO: 'JOD', UG: 'UGX', TZ: 'TZS', RW: 'RWF', ET: 'ETB',
  MO: 'MOP', BN: 'BND', NA: 'NAD', TT: 'TTD', MU: 'MUR', DZ: 'DZD', KH: 'KHR', IQ: 'IQD',
  SN: 'XOF', CI: 'XOF', BJ: 'XOF', BF: 'XOF', ML: 'XOF', NE: 'XOF', TG: 'XOF', CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF',
};

/** A clean local price: 15.3 → 15, 25.5 → 25, 254 → 250, 16 320 → 16 000. Never below 90% of the exact amount. */
export function niceRound(x: number): number {
  if (x <= 0) return 0;
  if (x < 20) return Math.max(1, Math.round(x));
  const pow = 10 ** Math.floor(Math.log10(x));
  const step = (x / pow < 2.5 ? 1 : 5) * (pow / 10);
  const r = Math.round(x / step) * step;
  return r < x * 0.9 ? Math.ceil(x / step) * step : r;
}

export type Money = { amount: number; currency: string; label: string; usd: number; usdLabel: string; local: boolean };

const usdLabel = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** A USD price as the visitor should see it: local currency when we can, USD otherwise. */
export function money(usd: number, country: string | null | undefined): Money {
  const cur = CURRENCY_OF[(country ?? '').toUpperCase()];
  const rate = cur ? USD_RATE[cur] : undefined;
  if (!cur || !rate) return { amount: usd, currency: 'USD', label: usdLabel(usd), usd, usdLabel: usdLabel(usd), local: false };
  const amount = niceRound(usd * rate);
  let label: string;
  try {
    label = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount);
  } catch {
    label = `${amount.toLocaleString()} ${cur}`;
  }
  return { amount, currency: cur, label, usd, usdLabel: usdLabel(usd), local: true };
}

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
