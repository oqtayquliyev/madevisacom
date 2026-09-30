import { TrendingUp } from 'lucide-react';

/** Offer multiplier shown on the landing page and /offers. */
export const OFFER_HIRE_MULTIPLIER = '2.3×';

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
