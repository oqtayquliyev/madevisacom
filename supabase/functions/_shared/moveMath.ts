// Shared by the site (src/lib/moveMath.ts, /destinations) and the social pipeline (reel_movemath).
// Move Math numbers per country — ROUGH ESTIMATES (2025), in US dollars a month.
// Edit freely; every number shown on the site is labelled "estimate".
//
//   tax   what an employee pays in income tax + employee social contributions, as a
//         % of gross, at a typical professional salary (not the top rate)
//   rent  a 1-bedroom flat outside the centre of the main city
//   net   average take-home pay (after tax) — the "at home" comparison
//
// Sources to refresh them from: OECD Taxing Wages (tax), Numbeo / national
// statistics offices (rent, net pay). Countries not listed: no Move Math.

export type MoveCountry = { tax: number; rent: number; net: number };

export const MOVE_MATH_UPDATED = '2025';

export const MOVE: Record<string, MoveCountry> = {
  // Europe
  GB: { tax: 28, rent: 1600, net: 2900 },
  IE: { tax: 32, rent: 1900, net: 3300 },
  DE: { tax: 40, rent: 1000, net: 2900 },
  NL: { tax: 37, rent: 1500, net: 3200 },
  BE: { tax: 42, rent: 1000, net: 2900 },
  LU: { tax: 33, rent: 1700, net: 4400 },
  FR: { tax: 30, rent: 900, net: 2500 },
  ES: { tax: 26, rent: 900, net: 1800 },
  PT: { tax: 30, rent: 900, net: 1200 },
  IT: { tax: 32, rent: 800, net: 1800 },
  AT: { tax: 38, rent: 900, net: 2700 },
  CH: { tax: 22, rent: 1900, net: 6500 },
  SE: { tax: 32, rent: 900, net: 2700 },
  NO: { tax: 32, rent: 1100, net: 3700 },
  DK: { tax: 40, rent: 1200, net: 3700 },
  FI: { tax: 32, rent: 850, net: 2700 },
  PL: { tax: 28, rent: 750, net: 1500 },
  CZ: { tax: 23, rent: 700, net: 1500 },
  HU: { tax: 33, rent: 500, net: 1000 },
  RO: { tax: 41, rent: 450, net: 1000 },
  GR: { tax: 27, rent: 450, net: 1000 },
  EE: { tax: 22, rent: 550, net: 1700 },
  LT: { tax: 30, rent: 550, net: 1500 },
  LV: { tax: 30, rent: 450, net: 1300 },
  HR: { tax: 30, rent: 550, net: 1300 },
  MT: { tax: 25, rent: 1000, net: 1600 },
  CY: { tax: 20, rent: 900, net: 1700 },
  // Americas, Oceania
  US: { tax: 28, rent: 1700, net: 4500 },
  CA: { tax: 27, rent: 1500, net: 3300 },
  AU: { tax: 27, rent: 1600, net: 3700 },
  NZ: { tax: 25, rent: 1300, net: 3100 },
  BR: { tax: 22, rent: 250, net: 450 },
  MX: { tax: 18, rent: 400, net: 550 },
  AR: { tax: 22, rent: 300, net: 500 },
  CO: { tax: 10, rent: 250, net: 400 },
  // Middle East, Asia
  AE: { tax: 0, rent: 1500, net: 3700 },
  SA: { tax: 0, rent: 700, net: 2100 },
  QA: { tax: 0, rent: 1500, net: 3500 },
  IL: { tax: 25, rent: 1200, net: 3200 },
  TR: { tax: 25, rent: 300, net: 600 },
  JP: { tax: 22, rent: 600, net: 2200 },
  KR: { tax: 16, rent: 500, net: 2400 },
  SG: { tax: 8, rent: 2300, net: 4300 },
  HK: { tax: 12, rent: 1600, net: 2900 },
  CN: { tax: 15, rent: 400, net: 1100 },
  MY: { tax: 15, rent: 300, net: 700 },
  TH: { tax: 10, rent: 250, net: 500 },
  VN: { tax: 12, rent: 250, net: 330 },
  ID: { tax: 10, rent: 200, net: 300 },
  PH: { tax: 15, rent: 200, net: 300 },
  IN: { tax: 15, rent: 150, net: 400 },
  PK: { tax: 10, rent: 80, net: 180 },
  BD: { tax: 8, rent: 90, net: 230 },
  LK: { tax: 10, rent: 120, net: 200 },
  NP: { tax: 10, rent: 100, net: 200 },
  IR: { tax: 10, rent: 150, net: 250 },
  // Caucasus, Central Asia, Eastern Europe
  AZ: { tax: 17, rent: 350, net: 450 },
  GE: { tax: 20, rent: 400, net: 450 },
  AM: { tax: 25, rent: 400, net: 500 },
  UA: { tax: 23, rent: 300, net: 450 },
  RU: { tax: 13, rent: 350, net: 800 },
  KZ: { tax: 12, rent: 350, net: 550 },
  UZ: { tax: 12, rent: 250, net: 300 },
  // Africa
  EG: { tax: 15, rent: 150, net: 150 },
  NG: { tax: 15, rent: 300, net: 150 },
  KE: { tax: 25, rent: 200, net: 250 },
  ZA: { tax: 22, rent: 450, net: 1300 },
  MA: { tax: 25, rent: 250, net: 350 },
  GH: { tax: 20, rent: 250, net: 250 },
};

/** US dollars per unit — rough, for turning a posted salary into dollars. */
export const USD_PER: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.12, CAD: 0.73, AUD: 0.66, NZD: 0.6, SEK: 0.095, NOK: 0.093, DKK: 0.145,
  PLN: 0.25, CZK: 0.043, HUF: 0.0027, RON: 0.22, JPY: 0.0067, SGD: 0.74, AED: 0.272, SAR: 0.267, QAR: 0.275,
  ILS: 0.27, KRW: 0.00073, HKD: 0.128, CNY: 0.138, INR: 0.012, TRY: 0.03, BRL: 0.18, MXN: 0.055, ZAR: 0.055,
  MYR: 0.22, THB: 0.028, PHP: 0.018, IDR: 0.000063, VND: 0.00004,
};
