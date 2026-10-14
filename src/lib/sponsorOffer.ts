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
// The document these terms go into is a CANDIDATE PROPOSAL: it starts a
// conversation about sponsorship. It is not an employment offer, a visa
// application or a promise of either. Everything in it is one of:
//   known     — taken from a source we can point to (the job ad, an official page)
//   proposed  — a term the candidate suggests
//   unknown   — needs the employer, the authority or a professional to confirm
// `ProposalFacts` records which is which, with the source, when the document
// is made. Nothing is inferred: a salary the ad doesn't state is "not stated".
//
// Legal guard-rails (applied whatever the slider says):
// - Only costs the route allows a candidate to pay can move
//   (VisaRoute.employer.candidateMayCover). Costs the law puts on the
//   employer (e.g. UK Immigration Skills Charge) are listed as fixed.
// - Salary is never part of the offer: visa salary thresholds exist to
//   stop undercutting.
// - Repayment is never added by itself. The candidate may propose it; the
//   document then says that whether it is permitted depends on the country
//   and route and has not been determined by MadeVisa.
// - No recruitment fees are charged to the candidate (ILO C181 and the ILO
//   General Principles for Fair Recruitment).

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { visaGuideByCode, type CandidateCover } from '@/data/visa';
import { PRO_MONTHLY_DOCS } from '@/lib/pricing';

export type Payer = 'employer' | 'shared' | 'candidate';

export type OfferItem = { key: CandidateCover; payer: Payer };

export type OfferTerms = {
  v: 1;
  split: number;
  items: OfferItem[];
  /**
   * Months after start during which the candidate proposes to repay employer-paid costs pro rata if they
   * resign. 0 = no repayment term. Only ever set by the candidate's own choice; documents made before
   * October 2026 had it set from the slider (12 or 24).
   */
  repayMonths: number;
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
  /** What is known, proposed and unknown, with sources — captured when the document is made. */
  facts?: ProposalFacts;
  /** How many times the owner has saved changes since it was made (version 1.<rev>). */
  rev?: number;
};

/**
 * How far a piece of the proposal can be relied on. Plain words, no scores:
 *   checked    the candidate compared it with the original job ad
 *   source     taken from a source we can point to; nobody compared it by hand
 *   candidate  the candidate's own information
 *   proposed   a term the candidate suggests
 *   confirm    needs the employer (or the authority) to confirm
 *   missing    not stated anywhere we can point to
 *   conflict   differs from what the job ad says
 *   review     depends on law MadeVisa has not checked — professional review recommended
 */
export type FactStatus = 'checked' | 'source' | 'candidate' | 'proposed' | 'confirm' | 'missing' | 'conflict' | 'review';

export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  checked: 'Checked by the candidate against the job ad',
  source: 'Source found',
  candidate: 'Provided by the candidate',
  proposed: 'Candidate proposal',
  confirm: 'Needs employer confirmation',
  missing: 'Not stated',
  conflict: 'Differs from the job ad',
  review: 'Professional review recommended',
};

/** Known (supported by a source), proposed (the candidate suggests it) or unknown (someone has to confirm it). */
export type FactGroup = 'known' | 'proposed' | 'unknown';
export const FACT_GROUP: Record<FactStatus, FactGroup> = {
  checked: 'known',
  source: 'known',
  candidate: 'proposed',
  proposed: 'proposed',
  confirm: 'unknown',
  missing: 'unknown',
  conflict: 'unknown',
  review: 'unknown',
};

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote';
export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = { onsite: 'On site', hybrid: 'Hybrid', remote: 'Remote' };

/**
 * A snapshot of what the document rests on, taken when it is made. Kept
 * small: it lives inside `terms` (under 4 kB in the database).
 */
export type ProposalFacts = {
  v: 1;
  /** The original job ad, and when its details were captured for this document. */
  sourceUrl: string | null;
  capturedAt: string;
  /** When the employer published the ad, if the ad says. */
  postedAt: string | null;
  /** The company and role were typed in by the candidate (no job ad on MadeVisa). */
  custom: boolean;
  /** Lines the candidate ticked after comparing them with the original ad. */
  checked: string[];
  /** As the ad states it; null = the ad doesn't say. */
  arrangement: WorkArrangement | null;
  employmentType: string | null;
  /** Pay exactly as the ad shows it ("EUR 60,000–75,000/year"); null = the ad shows none. */
  adPay: string | null;
  /** Where the annual salary in the terms comes from. */
  salarySource: 'job_ad' | 'candidate' | 'missing';
  /** What the ad says about visa sponsorship. */
  sponsorship: 'offered' | 'not_offered' | 'not_stated';
  /** Kept only when the candidate chose the country themselves: the ad's own country (ISO code), or '-' when the ad names none. */
  adCountry?: string;
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

/** The longest repayment window the builder lets a candidate propose. */
export const MAX_REPAY_MONTHS = 36;

/**
 * `repay` is the candidate's own choice (0 = no repayment term). It is never
 * derived from the slider: whether such a term is allowed depends on the
 * country and the route.
 */
export function buildTerms(split: number, allowed: CandidateCover[], overrides?: Partial<Record<CandidateCover, Payer>>, repay = 0): OfferTerms {
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
    repayMonths: employerPaysSomething ? Math.max(0, Math.min(MAX_REPAY_MONTHS, Math.round(repay) || 0)) : 0,
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
// Sponsorship documents each calendar month: Free 1, Starter 20, Pro 50.
// They are no longer sold one by one and new accounts get none for free.
// Documents bought or earned before that change (`docs`) are kept and can
// still be used — see migration 20261126090000 and src/lib/pricing.ts.
// ---------------------------------------------------------------------------

export { PRO_MONTHLY_DOCS, SIGNUP_DOCS } from '@/lib/pricing';

export type OfferCredits = {
  /** Documents kept from before the plan (bought, earned or the old free one) − used. */
  docs: number;
  /** Documents you can make right now (plan allowance this month + kept documents). */
  left: number;
  pro: boolean;
  /** Plan documents left this calendar month. */
  proLeft: number;
  /** The plan's monthly allowance (Starter 10, Pro 50; 0 on Free). */
  quota: number;
  used: number;
};

/** "1 document" / "5 documents". */
export const docsLabel = (n: number) => `${n} document${n === 1 ? '' : 's'}`;
/** "1 credit" / "5 credits". */
export const creditsLabel = (n: number) => `${n} credit${n === 1 ? '' : 's'}`;

export async function fetchOfferCredits(): Promise<OfferCredits | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.rpc('brief_credits');
  if (!error && data) {
    const d = data as { unit?: string; docs?: number; balance?: number; left: number; pro?: boolean; pro_left?: number; quota?: number; used: number };
    // 'pro' = the plan includes documents (Starter or Pro); quota = how many a month.
    const pro = Boolean(d.pro);
    const proLeft = d.pro_left ?? 0;
    const quota = d.quota ?? (pro ? PRO_MONTHLY_DOCS : 0);
    // Current database: counted in documents.
    if (d.unit === 'documents' && typeof d.docs === 'number') return { docs: d.docs, left: d.left, pro, proLeft, quota, used: d.used };
    // Before migration 20261113090000: dollars, $15 a document.
    if (typeof d.balance === 'number') return { docs: Math.floor(Number(d.balance) / 15), left: d.left, pro, proLeft, quota, used: d.used };
  }
  const { count } = await supabase.from('hiring_briefs').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
  return { docs: 0, left: 0, pro: false, proLeft: 0, quota: 0, used: count ?? 0 };
}

/** Can this person prepare a document right now? */
/** This month's allowance (Free 1, Starter 20, Pro 50) or older kept documents. */
export const canMakeDocument = (c: OfferCredits | null) => Boolean(c && (c.proLeft > 0 || c.docs >= 1));

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

/** "47 of 50 left this month" / "2 documents left" — what a person can still make. */
export function allowanceLabel(c: OfferCredits): string {
  if (c.quota > 0) return `${c.proLeft} of ${c.quota} left this month${c.docs > 0 ? ` + ${c.docs} kept` : ''}`;
  return `${docsLabel(c.docs)} left`;
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
 * offers to carry the smaller costs (their own paperwork and adviser,
 * part of recognition) and proposes that the employer keeps the visa fee
 * and the move. It is a starting point for the conversation, not a rule:
 * worked out per visa route from the costs that route lets a candidate
 * pay, and never a statement about what the law requires.
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
