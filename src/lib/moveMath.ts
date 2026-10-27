// Move Math: one number per job — what's left each month after tax and rent there,
// compared with average take-home pay where the visitor lives now.
//   "≈ $2,140 a month left after tax and rent · vs ≈ $100 at home (Azerbaijan)"
// Only when the job states a salary and both countries are in src/data/moveMath.ts.
// Every number is a rough estimate, and the page says so.

import { MOVE, USD_PER } from '@/data/moveMath';

export type SalaryFacts = { min: number | null; max: number | null; currency: string | null; period: string | null };

export type MoveMath = {
  /** Gross per month in USD (the middle of the range). */
  gross: number;
  /** Left after tax and rent there, per month, USD. */
  left: number;
  /** Left at home: average take-home pay minus rent, per month, USD. */
  home: number;
  /** left − home */
  delta: number;
  tax: number;
  rent: number;
};

const PER_MONTH: Record<string, number> = { hour: 160, day: 21, week: 4.33, month: 1, year: 1 / 12 };

/** Gross monthly salary in USD from a job's stated pay, or null when it can't be read. */
export function monthlyUsd(s: SalaryFacts): number | null {
  const lo = s.min ?? s.max;
  const hi = s.max ?? s.min;
  if (lo == null || hi == null || lo <= 0) return null;
  const rate = USD_PER[(s.currency ?? 'USD').toUpperCase()];
  const per = PER_MONTH[(s.period ?? 'year').toLowerCase()];
  if (!rate || !per) return null;
  const v = ((lo + hi) / 2) * per * rate;
  // Nonsense guards: under $200 or over $60k a month is a parsing problem, not a salary.
  return v >= 200 && v <= 60_000 ? Math.round(v) : null;
}

export function moveMath(salary: SalaryFacts, dest: string | null | undefined, home: string | null | undefined): MoveMath | null {
  const d = dest ? MOVE[dest.toUpperCase()] : undefined;
  const h = home ? MOVE[home.toUpperCase()] : undefined;
  const gross = monthlyUsd(salary);
  if (!d || !h || gross == null || dest?.toUpperCase() === home?.toUpperCase()) return null;
  const left = Math.round(gross * (1 - d.tax / 100) - d.rent);
  const homeLeft = Math.round(h.net - h.rent);
  return { gross, left, home: homeLeft, delta: left - homeLeft, tax: d.tax, rent: d.rent };
}

/** "$2,140" / "−$300" */
export const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n / 10) * 10).toLocaleString('en-US')}`;
