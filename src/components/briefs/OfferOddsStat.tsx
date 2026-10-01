import { TrendingUp } from 'lucide-react';

/** Offer multiplier shown on the landing page and /offers. */
export const OFFER_HIRE_MULTIPLIER = '2.3×';

// ---------------------------------------------------------------------------
// Odds by plan size.
//
// A per-application multiplier is the same for 1 document or 15 — so showing
// "2.3×" on every plan says nothing about why a bigger plan is better. What
// DOES grow with more documents is the chance of at least one employer reply:
//     P(≥1 reply from n applications) = 1 − (1 − p)^n
//
// ⚠ BASELINE_REPLY_RATE and OFFER_LIFT must come from your own tracking data
// (application statuses with vs. without a document attached). Replace these
// two numbers as soon as you have ~200 tracked applications in each group.
// Publishing odds you can't back up is a consumer-protection risk (FTC / EU
// unfair-commercial-practices rules).
// ---------------------------------------------------------------------------

/** Share of cold applications from visa-needing candidates that get any employer reply. */
export const BASELINE_REPLY_RATE = 0.05;
/** How much a sponsorship document lifts that rate (matches OFFER_HIRE_MULTIPLIER). */
export const OFFER_LIFT = 2.3;

/** Chance (0–100, rounded) of at least one employer reply from `apps` applications. */
export function replyOdds(apps: number, withOffer = true): number {
  const p = Math.min(0.95, BASELINE_REPLY_RATE * (withOffer ? OFFER_LIFT : 1));
  return Math.round((1 - (1 - p) ** Math.max(0, apps)) * 100);
}

/**
 * "2.3× more likely to be hired and sponsored" — in green, next to the
 * sponsorship document pitch.
 */
export function OfferOddsStat({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <p className={`flex max-w-xl items-center gap-3 ${className}`}>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 font-slab text-[28px] font-bold leading-none tabular-nums sm:text-[34px] ${
          light ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/40' : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
        }`}
      >
        <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} aria-hidden />
        {OFFER_HIRE_MULTIPLIER}
      </span>
      <span className={`text-[15px] leading-snug sm:text-[16px] ${light ? 'text-white/85' : 'text-ink-700'}`}>
        With this document you have a{' '}
        <strong className={light ? 'font-bold text-emerald-300' : 'font-bold text-emerald-600'}>{OFFER_HIRE_MULTIPLIER} higher chance</strong> to be hired and sponsored.
      </span>
    </p>
  );
}
