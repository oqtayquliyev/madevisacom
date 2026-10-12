// Fixed numbers shared by the app, the server-rendered pages and the server
// functions. No browser code and no imports.
//
// Plan prices are NOT here any more: Starter and Pro have flat monthly USD
// prices, kept with what each plan includes in ./plans.ts (and in the
// database, billing_plans). The country-based price list that used to live
// here (MadeVisa Pro at $5–$19 by country, monthly or yearly, local-currency
// display) was retired in October 2026; its git history has it. Members who
// bought Pro at those prices keep them on Gumroad.

/** Sponsorship documents in Pro each calendar month (Starter: 10 — see ./plans.ts). */
export const PRO_MONTHLY_DOCS = 50;
/** New accounts no longer get a free document — it is part of the plans. */
export const SIGNUP_DOCS = 0;
/** Jobs a day on which a free account sees its missing skills. */
export const FREE_DAILY_CHECKS = 3;

/** Employer products (USD, same everywhere). */
export const EMPLOYER_PRICES = {
  sponsoredJob: 149,
  featuredSocial: 49,
  employerPlanFrom: 99,
  hiringBrief: 29,
} as const;

// ---------------------------------------------------------------------------
// Salaries in other currencies
// ---------------------------------------------------------------------------

/**
 * Units of local currency per 1 USD. Approximate, reviewed September 2026.
 * Used ONLY to compare job salaries in different currencies (Auto Apply's
 * salary floor, top matches) — never for plan prices, which are charged in
 * USD. Currencies that move a lot (ARS, NGN, TRY, EGP, RUB, IRR…) are left
 * out on purpose.
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

/** An amount in another currency as US dollars, or null when the rate isn't known. */
export function toUsd(amount: number, currency: string | null | undefined): number | null {
  const cur = (currency ?? '').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (cur === 'USD') return amount;
  const rate = USD_RATE[cur];
  return rate ? amount / rate : null;
}
