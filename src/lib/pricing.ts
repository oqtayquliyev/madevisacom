// MadeVisa pricing — one place for every price a job seeker sees.
//
// How it works
//   • Sponsorship documents are counted in CREDITS: 1 credit = 1 document,
//     the same everywhere. What changes by country is only what a credit
//     pack or Pro costs to buy (fair prices by local incomes).
//   • Three price tiers by where you are (IP address, checked once a day —
//     not the country picked on the site, so it can't be switched by hand):
//       A  high-income countries        (US, Western/Northern Europe, Gulf…)
//       B  upper-middle-income countries (Eastern Europe, Türkiye, Azerbaijan,
//          China, Latin America…) — also used when the location is unknown
//       C  lower-income countries        (South Asia, most of Africa, Central
//          Asia, South-East Asia…)
//   • Prices are set in USD and shown in your local currency when we have a
//     stable rate for it (rounded to a clean price), otherwise in USD.
//   • Employer products are priced in USD for everyone.

import { useEffect, useState } from 'react';
import { detectCountryByIp, getStoredCountry } from '@/lib/geolocation';

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

export const TIER_LABEL: Record<PriceTier, string> = { A: 'Standard', B: 'Reduced', C: 'Lowest' };

// ---------------------------------------------------------------------------
// The price list (USD)
// ---------------------------------------------------------------------------

/** Document credit packs: credits → price per tier. */
export const DOC_PACKS: { docs: number; price: Record<PriceTier, number> }[] = [
  { docs: 1, price: { A: 9, B: 5, C: 3 } },
  { docs: 5, price: { A: 35, B: 20, C: 12 } },
  { docs: 15, price: { A: 89, B: 49, C: 29 } },
];
/** The pack we point people to first. */
export const DEFAULT_PACK = 5;

export const PRO_PRICE: Record<PriceTier, { monthly: number; yearly: number }> = {
  A: { monthly: 19, yearly: 149 },
  B: { monthly: 12, yearly: 95 },
  C: { monthly: 7, yearly: 55 },
};
/** Documents included in Pro each calendar month. */
export const PRO_MONTHLY_DOCS = 10;
/** Free document for every new account. */
export const SIGNUP_DOCS = 1;

/** Pro Relocation: 3 months of Pro (30 documents) + a personal plan for one country. */
export const RELOCATION_PRICE: Record<PriceTier, number> = { A: 49, B: 29, C: 19 };

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

export type Prices = {
  /** Country the prices are for (null = unknown → tier B in USD). */
  country: string | null;
  tier: PriceTier;
  ready: boolean;
  /** Price of a USD amount for this visitor. */
  m: (usd: number) => Money;
  packs: { docs: number; price: Money; perDoc: Money; saving: number }[];
  pro: { monthly: Money; yearly: Money; yearlyPerMonth: Money; saving: number; perDoc: Money };
  relocation: Money;
  /** Cheapest single document, for "from …" labels. */
  single: Money;
};

export function pricesFor(country: string | null, ready = true): Prices {
  const tier = tierFor(country);
  const m = (usd: number) => money(usd, country);
  const single = DOC_PACKS[0].price[tier];
  const pro = PRO_PRICE[tier];
  return {
    country,
    tier,
    ready,
    m,
    packs: DOC_PACKS.map((p) => ({
      docs: p.docs,
      price: m(p.price[tier]),
      perDoc: m(Math.round((p.price[tier] / p.docs) * 100) / 100),
      saving: Math.round((1 - p.price[tier] / (single * p.docs)) * 100),
    })),
    pro: {
      monthly: m(pro.monthly),
      yearly: m(pro.yearly),
      yearlyPerMonth: m(Math.round((pro.yearly / 12) * 100) / 100),
      saving: Math.round((1 - pro.yearly / (pro.monthly * 12)) * 100),
      perDoc: m(Math.round((pro.monthly / PRO_MONTHLY_DOCS) * 100) / 100),
    },
    relocation: m(RELOCATION_PRICE[tier]),
    single: m(single),
  };
}

/** Prices for this visitor (IP-based country). Shows tier B in USD until the lookup finishes. */
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

/** "Standard prices" / "Prices for Azerbaijan, reduced to match local incomes". */
export function priceNote(p: Prices, countryName: (c: string) => string | null): string {
  if (!p.country) return 'Prices in USD.';
  const name = countryName(p.country) ?? p.country;
  return p.tier === 'A' ? `Prices for ${name}.` : `Prices for ${name} — reduced to match local incomes.`;
}
