// Visa salary minimums, checked against official sources.
//
// Every figure here is a legal threshold people rely on, so each country
// has its source and the date it was checked. Thresholds change (Germany
// and the Netherlands every 1 January; the UK when the Immigration Rules
// change). Re-check each country at least every January and update
// `checkedOn`. If a figure can't be verified, remove the country rather
// than guess — the job page then simply shows no check.
//
// What we check: only the GENERAL minimum for the main skilled-work route.
// Other rules (occupation "going rate" in the UK, "market-rate" salary in
// the Netherlands, degree recognition…) can't be judged from a job ad, so
// the UI always says so.

export type SalaryTier = {
  /** Minimum gross pay per year, in the country's currency. */
  annual: number;
  /** Who this tier is for, in plain words. */
  who: string;
};

export type CountryThresholds = {
  code: string;
  currency: 'GBP' | 'EUR';
  route: string;
  /** The usual minimum. */
  standard: SalaryTier;
  /** Lower minimums that apply only in certain situations. */
  lower: SalaryTier[];
  /** Always shown: what this check can't see. */
  caveat: string;
  /**
   * Netherlands: the threshold excludes the 8% holiday allowance, but
   * annual salaries in ads often include it. 1.08 means "an annual figure
   * may include 8% holiday pay" — we then only say "clears" if it does even
   * without it.
   */
  annualMayIncludeHoliday?: number;
  source: { label: string; url: string };
  checkedOn: string;
};

export const SALARY_THRESHOLDS: Record<string, CountryThresholds> = {
  GB: {
    code: 'GB',
    currency: 'GBP',
    route: 'Skilled Worker visa',
    standard: { annual: 41_700, who: 'most applicants' },
    lower: [{ annual: 33_400, who: 'new entrants (for example under 26, or switching from a Student or Graduate visa) and jobs on the Immigration Salary List' }],
    caveat: 'The job must also pay its occupation’s “going rate”, which can be higher, and be an eligible occupation.',
    source: { label: 'GOV.UK — Skilled Worker visa', url: 'https://www.gov.uk/skilled-worker-visa' },
    checkedOn: '2026-10-01',
  },
  DE: {
    code: 'DE',
    currency: 'EUR',
    route: 'EU Blue Card',
    standard: { annual: 50_700, who: 'most applicants' },
    lower: [{ annual: 45_934.2, who: 'shortage occupations, people who graduated in the last 3 years, and experienced IT specialists' }],
    caveat: 'The Blue Card also needs a recognised degree (or IT experience) matching the job. Other German work permits have different rules.',
    source: { label: 'Bundesagentur für Arbeit — Blaue Karte EU 2026', url: 'https://www.arbeitsagentur.de/vor-ort/zav/working-and-living-in-germany/newsletter-iss/03-2026/blaue-karte' },
    checkedOn: '2026-10-01',
  },
  NL: {
    code: 'NL',
    currency: 'EUR',
    route: 'Highly skilled migrant permit',
    standard: { annual: 5_942 * 12, who: 'applicants aged 30 or over' },
    lower: [
      { annual: 4_357 * 12, who: 'applicants under 30' },
      { annual: 3_122 * 12, who: 'recent graduates applying during or right after their Dutch “search year”' },
    ],
    caveat: 'Amounts exclude the 8% holiday allowance. The employer must be an IND-recognised sponsor, and the salary must be normal for the job.',
    annualMayIncludeHoliday: 1.08,
    source: { label: 'IND — Required amounts 2026', url: 'https://ind.nl/en/news/fees-and-required-amounts-for-2026-known' },
    checkedOn: '2026-10-01',
  },
};

export type SalaryInput = {
  countryCode: string | null | undefined;
  min: number | null | undefined;
  max: number | null | undefined;
  currency: string | null | undefined;
  period: string | null | undefined;
  disclosed?: boolean;
};

export type SalaryVerdict =
  | { kind: 'clears'; t: CountryThresholds; annual: number }
  /** Clears only a lower tier — possible in some situations. */
  | { kind: 'lower'; t: CountryThresholds; annual: number; tier: SalaryTier }
  /** The range straddles the standard minimum: depends on the final offer. */
  | { kind: 'range'; t: CountryThresholds; annual: number; top: number }
  /** NL: clears only if the advertised yearly figure excludes holiday pay. */
  | { kind: 'holiday'; t: CountryThresholds; annual: number }
  | { kind: 'below'; t: CountryThresholds; annual: number; lowest: SalaryTier };

const toAnnual = (v: number, period: string): number | null => {
  const p = period.toLowerCase();
  if (p.startsWith('year') || p === 'annual') return v;
  if (p.startsWith('month')) return v * 12;
  // Hourly / daily / weekly pay needs an assumption about hours — too risky for a legal threshold.
  return null;
};

/**
 * Compares a job's advertised salary with the visa minimum for its country.
 * Returns null when we can't say anything reliable (unknown country,
 * no salary, other currency, hourly pay…). Uses the LOW end of a range.
 */
export function checkVisaSalary(s: SalaryInput): SalaryVerdict | null {
  const t = SALARY_THRESHOLDS[(s.countryCode ?? '').toUpperCase()];
  if (!t || s.disclosed === false) return null;
  if ((s.currency ?? '').toUpperCase() !== t.currency) return null;
  const period = s.period ?? 'year';
  const lowRaw = s.min ?? s.max;
  if (lowRaw == null || !(lowRaw > 0)) return null;
  const low = toAnnual(lowRaw, period);
  const high = s.max != null && s.max > (s.min ?? 0) ? toAnnual(s.max, period) : null;
  if (low == null) return null;
  // Silly values (typos, "1" placeholders) → say nothing.
  if (low < 1000 || low > 5_000_000) return null;

  // Yearly figures in NL ads may include holiday pay; monthly ones normally don't.
  const yearly = period.toLowerCase().startsWith('year') || period === 'annual';
  const factor = yearly && t.annualMayIncludeHoliday ? t.annualMayIncludeHoliday : 1;
  const strict = low / factor;

  if (strict >= t.standard.annual) return { kind: 'clears', t, annual: low };
  if (low >= t.standard.annual) return { kind: 'holiday', t, annual: low };
  if (high != null && high / factor >= t.standard.annual) return { kind: 'range', t, annual: low, top: high };
  const tiers = [...t.lower].sort((a, b) => b.annual - a.annual);
  const tier = tiers.find((x) => strict >= x.annual);
  if (tier) return { kind: 'lower', t, annual: low, tier };
  return { kind: 'below', t, annual: low, lowest: tiers[tiers.length - 1] ?? t.standard };
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}
