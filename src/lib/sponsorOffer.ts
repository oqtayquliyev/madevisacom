// Sponsor Offer — the terms a candidate proposes to an employer for sharing
// the cost and effort of a work visa.
//
// One number drives everything: `split` (0–100).
//   0   → best for the candidate: the employer carries the shareable costs.
//   100 → best for the employer: the candidate carries them, commits for
//         longer and can start sooner.
// Dragging moves costs one by one from employer → shared → candidate, in
// order of size, so small moves change small things.
//
// Legal guard-rails (applied whatever the slider says):
// - Only costs the route allows a candidate to pay can move
//   (VisaRoute.employer.candidateMayCover). Costs the law puts on the
//   employer (e.g. UK Immigration Skills Charge) are listed as fixed.
// - Salary is never part of the offer: visa salary thresholds exist to
//   stop undercutting.
// - A repayment clause only ever covers costs the employer actually paid,
//   tapers monthly, and never takes pay below the legal minimum.
// - No recruitment fees are charged to the candidate (ILO C181 and the ILO
//   General Principles for Fair Recruitment).

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { visaGuideByCode, type CandidateCover } from '@/data/visa';

export type Payer = 'employer' | 'shared' | 'candidate';

export type OfferItem = { key: CandidateCover; payer: Payer };

export type OfferTerms = {
  v: 1;
  split: number;
  items: OfferItem[];
  /** Months after start during which employer-paid costs are repaid pro rata if the candidate resigns. 0 = none. */
  repayMonths: 0 | 12 | 24;
  /** Candidate can start within this many weeks of the visa being granted. */
  startWeeks: number;
  /** Candidate offers to start remotely (contractor / Employer of Record) while the visa is processed. */
  remoteStart: boolean;
  /** Share (0–100) of the shareable costs the candidate carries, weighted by typical size. */
  candidateShare: number;
  /**
   * Optional salary offset: the candidate accepts up to this amount deducted
   * from first-year gross pay to cover costs the employer pays in clause 4.
   * Never below minimum wage or the visa salary threshold; never for
   * costs the law puts on the employer. 0 / missing = none.
   */
  salaryOffset?: number;
  currency?: string;
  /** Annual gross salary as the candidate understands the offer (editable; job data can be wrong). */
  salary?: number;
  /** Cost rows the candidate set by hand, overriding the slider. */
  overrides?: Partial<Record<CandidateCover, Payer>>;
  /** Who the offer is addressed to, filled from MadeVisa where we can. */
  employer?: OfferEmployer;
};

export type OfferEmployer = {
  name: string;
  publisherId?: string | null;
  website?: string | null;
  hq?: string | null;
  contact?: string | null;
  logo?: string | null;
};

/** Pay currency by country, for the salary-offset amount (and a sensible slider range). */
const RANGE: Record<string, { symbol: string; max: number; step: number }> = {
  EUR: { symbol: '€', max: 6000, step: 250 },
  GBP: { symbol: '£', max: 5000, step: 250 },
  USD: { symbol: '$', max: 6000, step: 250 },
  CAD: { symbol: 'CA$', max: 8000, step: 250 },
  AUD: { symbol: 'A$', max: 8000, step: 250 },
  NZD: { symbol: 'NZ$', max: 8000, step: 250 },
  CHF: { symbol: 'CHF ', max: 6000, step: 250 },
  SEK: { symbol: 'SEK ', max: 60000, step: 2500 },
  NOK: { symbol: 'NOK ', max: 60000, step: 2500 },
  DKK: { symbol: 'DKK ', max: 40000, step: 2000 },
  PLN: { symbol: 'PLN ', max: 25000, step: 1000 },
};
export function currencyFor(countryCode: string): { code: string; symbol: string; max: number; step: number } {
  const c = countryCode.toUpperCase();
  const iso = c === 'GB' ? 'GBP' : c === 'US' ? 'USD' : (visaGuideByCode.get(c)?.currency ?? 'EUR').toUpperCase();
  const r = RANGE[iso];
  return r ? { code: iso, ...r } : { code: iso, symbol: `${iso} `, max: 6000, step: 250 };
}

export const money = (amount: number, code: string) => `${currencyFor(code).symbol}${amount.toLocaleString('en-GB')}`;

/** Smallest costs move first. */
const ORDER: CandidateCover[] = ['translations', 'own-adviser', 'recognition', 'visa-fee', 'relocation'];
/** Rough relative size, for the "you carry X%" figure. */
const WEIGHT: Record<CandidateCover, number> = { translations: 1, 'own-adviser': 2, recognition: 2, 'visa-fee': 3, relocation: 6 };

export const OFFER_ITEM_LABEL: Record<CandidateCover, string> = {
  'visa-fee': 'Visa application fee',
  relocation: 'Flights and moving costs',
  translations: 'Translations and certified copies',
  recognition: 'Recognition of qualifications',
  'own-adviser': 'Immigration adviser for the candidate',
};

export const PAYER_LABEL: Record<Payer, string> = { employer: 'Employer', shared: 'Shared 50/50', candidate: 'Candidate' };

export function buildTerms(split: number, allowed: CandidateCover[], overrides?: Partial<Record<CandidateCover, Payer>>): OfferTerms {
  const s = Math.max(0, Math.min(100, Math.round(split)));
  const keys = ORDER.filter((k) => allowed.includes(k));
  const n = keys.length;
  // Map 5–95 onto the items; each item spends one "slot" going employer → shared → candidate.
  const t = n ? Math.max(0, Math.min(n, ((s - 5) / 90) * n)) : 0;
  const items: OfferItem[] = keys.map((key, i) => {
    const f = Math.max(0, Math.min(1, t - i));
    const auto: Payer = f < 0.34 ? 'employer' : f < 0.67 ? 'shared' : 'candidate';
    return { key, payer: overrides?.[key] ?? auto };
  });
  const total = keys.reduce((a, k) => a + WEIGHT[k], 0);
  const carried = items.reduce((a, it) => a + WEIGHT[it.key] * (it.payer === 'candidate' ? 1 : it.payer === 'shared' ? 0.5 : 0), 0);
  const employerPaysSomething = items.some((it) => it.payer !== 'candidate');
  return {
    v: 1,
    split: s,
    items,
    repayMonths: !employerPaysSomething || s < 30 ? 0 : s < 65 ? 12 : 24,
    startWeeks: Math.max(2, Math.round(8 - (s * 6) / 100)),
    remoteStart: s >= 55,
    candidateShare: total ? Math.round((100 * carried) / total) : 0,
  };
}

/** Short word for the bubble above the slider. */
export function splitWord(split: number): string {
  if (split <= 15) return 'Best for you';
  if (split <= 40) return 'Leaning your way';
  if (split < 60) return 'Balanced';
  if (split < 85) return 'Easy yes for them';
  return 'Best for the company';
}

// ---------------------------------------------------------------------------
// Pricing: every document costs $15 of account credit. New accounts start
// with $20 (one document). Pro includes 10 documents a month; after that,
// Pro members pay from credit like everyone else.
// ---------------------------------------------------------------------------

export const DOC_PRICE = 15;
export const SIGNUP_CREDIT = 20;
export const PRO_MONTHLY_DOCS = 10;
/** Top-up choices, in documents. */
export const TOP_UP_DOCS = [1, 3, 5] as const;

export type OfferCredits = {
  /** Account credit in USD. */
  balance: number;
  /** Documents you can make right now (Pro allowance + credit). */
  left: number;
  pro: boolean;
  /** Pro documents left this calendar month. */
  proLeft: number;
  used: number;
};

export const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export async function fetchOfferCredits(): Promise<OfferCredits | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.rpc('brief_credits');
  if (!error && data) {
    const d = data as { balance?: number; left: number; pro?: boolean; pro_left?: number; used: number };
    if (typeof d.balance === 'number') return { balance: Number(d.balance), left: d.left, pro: Boolean(d.pro), proLeft: d.pro_left ?? 0, used: d.used };
  }
  // Before the pricing migration: $20 minus $15 per document made.
  const { count } = await supabase.from('hiring_briefs').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
  const used = count ?? 0;
  const balance = Math.max(0, SIGNUP_CREDIT - DOC_PRICE * used);
  return { balance, left: Math.floor(balance / DOC_PRICE), pro: false, proLeft: 0, used };
}

/** Countries with checked employer data, for the flag row. */
export { briefCountries } from '@/data/visa';

/** Tell the notification bell to refresh now instead of on its next poll. */
export function pingNotifications() {
  window.dispatchEvent(new Event('madevisa:notifications'));
}

let creditsCache: { userId: string; at: number; value: OfferCredits | null } | null = null;

/** Credits left for the signed-in person (null for guests). Shared cache; refreshes after an offer is made. */
export function useOfferCredits(): OfferCredits | null {
  const { user } = useAuth();
  const fresh = user && creditsCache?.userId === user.id && Date.now() - creditsCache.at < 60_000 ? creditsCache.value : null;
  const [credits, setCredits] = useState<OfferCredits | null>(fresh);
  useEffect(() => {
    if (!user) return setCredits(null);
    let alive = true;
    const load = (force: boolean) => {
      if (!force && creditsCache?.userId === user.id && Date.now() - creditsCache.at < 60_000) return setCredits(creditsCache.value);
      fetchOfferCredits().then((c) => {
        creditsCache = { userId: user.id, at: Date.now(), value: c };
        if (alive) setCredits(c);
      });
    };
    load(false);
    const refresh = () => load(true);
    window.addEventListener('madevisa:notifications', refresh);
    return () => {
      alive = false;
      window.removeEventListener('madevisa:notifications', refresh);
    };
  }, [user]);
  return credits;
}

/** Menu / button badge: "1 left", or "$20 free" for guests. */
export function creditsBadge(c: OfferCredits | null): string {
  if (!c) return `${usd(SIGNUP_CREDIT)} free`;
  return `${c.left} left`;
}

/** Someone pressed "Save as PDF" on an offer (owner or company). For admin stats. */
export async function recordOfferPdf(shareId: string): Promise<void> {
  await supabase.rpc('record_offer_pdf', { p_share_id: shareId });
}

/** Signed-in person opened the offer builder for a job (created or not). For admin stats. */
export async function recordOfferDraft(jobId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.rpc('touch_offer_draft', { p_job_id: jobId });
}

/** Job id (uuid) from a board job id like "sponsored-<uuid>". */
export const uuidFromBoardId = (id: string) => (id.startsWith('sponsored-') ? id.slice('sponsored-'.length) : null);

/** What MadeVisa knows about a company, for the offer's Employer block. */
export async function employerFromPublisher(id: string, fallbackName: string): Promise<OfferEmployer> {
  const { data } = await supabase.from('program_publishers').select('id, name, website, logo_url, country:countries(name)').eq('id', id).maybeSingle();
  const p = data as { id: string; name: string; website: string | null; logo_url: string | null; country: { name: string } | null } | null;
  if (!p) return { name: fallbackName, publisherId: id };
  return { name: p.name, publisherId: p.id, website: p.website, hq: p.country?.name ?? null, logo: p.logo_url };
}

export const cleanWebsite = (w?: string | null) => (w ? w.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '') : null);

/**
 * Recommended starting point for every offer: balanced — the candidate
 * carries about 30% of the shareable costs (their own paperwork and
 * adviser, part of recognition), the employer keeps the visa fee and the
 * move. Most employers can say yes to it, and it stays within fair
 * recruitment rules. Worked out per visa route, since routes allow
 * different cost items.
 */
export const RECOMMENDED_SHARE = 30;
export function recommendedSplit(allowed: CandidateCover[]): number {
  let best = 50;
  let bestGap = Infinity;
  for (let s = 5; s <= 95; s += 5) {
    const gap = Math.abs(buildTerms(s, allowed).candidateShare - RECOMMENDED_SHARE);
    if (gap < bestGap - 0.001) {
      bestGap = gap;
      best = s;
    }
  }
  return best;
}
