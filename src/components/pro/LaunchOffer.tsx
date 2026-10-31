import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LAUNCH_OFFER, MEMBERSHIP_PRICE, MEMBERSHIP_REGULAR_PRICE } from '@/lib/plans';

// The launch offer, one box: "95% off for the first 200 customers", ~~$250~~ $12.50,
// the places really left, one black button, "Pay once, use it forever".
// Used by the paywall and the pricing page.

/** The fact under the price: why these jobs are early. */
export const EARLY_JOBS_FACT =
  'Companies post new vacancies on their own careers page first — MadeVisa fetches them for you early. Jobs that aren’t on LinkedIn or Indeed.';

let cached: { n: number; at: number } | null = null;

/**
 * Launch places left: 200 minus the real one-time buyers (membership_places_left()).
 * null while loading or when the count can't be read (then no number is shown — never a made-up one).
 */
export function useLaunchPlaces(): number | null {
  const [n, setN] = useState<number | null>(cached && Date.now() - cached.at < 60_000 ? cached.n : null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('membership_places_left');
        if (error || typeof data !== 'number') return;
        cached = { n: data, at: Date.now() };
        if (live) setN(data);
      } catch {
        /* no number */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return n;
}

type Props = {
  busy?: boolean;
  onBuy: () => void;
  /** Replaces the button (e.g. "already a member"). */
  children?: React.ReactNode;
  className?: string;
};

export function LaunchOfferBox({ busy = false, onBuy, children, className = '' }: Props) {
  const left = useLaunchPlaces();
  const soldOut = left === 0;
  return (
    <div className={`rounded-2xl border border-ink-200 bg-white px-5 pb-5 pt-5 text-center ${className}`}>
      <p className="text-[13.5px] font-semibold text-ink-600">
        <span className="font-bold text-emerald-700">{LAUNCH_OFFER.percentOff}% off</span> for the first {LAUNCH_OFFER.places} customers
      </p>
      <p className="mt-2 flex items-baseline justify-center gap-2.5">
        <s className="text-[22px] font-semibold text-ink-400 decoration-2">{MEMBERSHIP_REGULAR_PRICE}</s>
        <span className="text-[44px] font-bold leading-none tracking-tight text-ink-950">{MEMBERSHIP_PRICE}</span>
      </p>
      <p className="mt-1.5 text-[14px] font-semibold text-ink-800">Ultimate access to everything</p>
      {left != null && !soldOut && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[12.5px] font-bold text-amber-800 ring-1 ring-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
          {left} of {LAUNCH_OFFER.places} left
        </p>
      )}

      {children ?? (
        <button
          type="button"
          onClick={onBuy}
          disabled={busy}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink-950 text-[15.5px] font-bold text-white transition hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950 focus-visible:ring-offset-2 disabled:opacity-80"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening secure payment…
            </>
          ) : (
            <>
              Get it for {MEMBERSHIP_PRICE} <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      )}
      <p className="mt-2.5 text-[12.5px] font-medium text-ink-500">Pay once, use it forever · your account · no subscription</p>
      <p className="mt-3 rounded-xl bg-brand-50 px-3.5 py-2.5 text-left text-[12.5px] leading-[1.45] text-brand-900">
        <strong className="font-bold">Early access:</strong> {EARLY_JOBS_FACT}
      </p>
    </div>
  );
}
