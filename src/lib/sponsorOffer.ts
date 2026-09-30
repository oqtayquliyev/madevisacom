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
import type { CandidateCover } from '@/data/visa';

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
};

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

export function buildTerms(split: number, allowed: CandidateCover[]): OfferTerms {
  const s = Math.max(0, Math.min(100, Math.round(split)));
  const keys = ORDER.filter((k) => allowed.includes(k));
  const n = keys.length;
  // Map 5–95 onto the items; each item spends one "slot" going employer → shared → candidate.
  const t = n ? Math.max(0, Math.min(n, ((s - 5) / 90) * n)) : 0;
  const items: OfferItem[] = keys.map((key, i) => {
    const f = Math.max(0, Math.min(1, t - i));
    return { key, payer: f < 0.34 ? 'employer' : f < 0.67 ? 'shared' : 'candidate' };
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
// Credits: 5 free sponsor offers per account, more from packs, unlimited on Pro.
// ---------------------------------------------------------------------------

export const FREE_OFFER_CREDITS = 5;
export const CREDIT_PACK_SIZE = 10;

export type OfferCredits = { total: number; used: number; left: number; unlimited: boolean };

export async function fetchOfferCredits(): Promise<OfferCredits | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.rpc('brief_credits');
  if (!error && data) {
    const d = data as { total: number; used: number; left: number; unlimited: boolean };
    return { total: d.total, used: d.used, left: d.left, unlimited: d.unlimited };
  }
  // Before the credits migration: count briefs against the free allowance.
  const { count } = await supabase.from('hiring_briefs').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
  const used = count ?? 0;
  return { total: FREE_OFFER_CREDITS, used, left: Math.max(0, FREE_OFFER_CREDITS - used), unlimited: false };
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

/** "3 left", "Unlimited", or "5 free" for guests — the menu / button badge. */
export function creditsBadge(c: OfferCredits | null): string {
  if (!c) return `${FREE_OFFER_CREDITS} free`;
  if (c.unlimited) return 'Unlimited';
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
