import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LAUNCH_OFFER, MEMBERSHIP_PRICE, MEMBERSHIP_REGULAR_PRICE } from '@/lib/plans';

// The launch offer, one box: "95% off for the first 200 customers", ~~$250~~ $12.50,
// the places really left, one black button, "Pay once, use it forever".
// Used by the paywall and the pricing page.

/** The fact under the price: why these jobs are early. */
export const EARLY_JOBS_FACT = 'Early access to jobs straight from company career pages — apply before LinkedIn and Indeed, and your hiring chances go up.';

/** "4 left" with a thick yellow marker line under it. */
export function Underlined({ children }: { children: React.ReactNode }) {
  return <span className="underline decoration-[#FFD60A] decoration-[5px] underline-offset-[3px]">{children}</span>;
}

let cached: { n: number; at: number } | null = null;

/**
 * Launch places left (membership_places_left()): the number set in Admin → Plans → Gumroad,
 * or 200 minus the one-time buyers. null while loading or unreadable (then nothing is shown).
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
        <p className="mt-2.5 text-[15px] font-bold text-emerald-700">
          <Underlined>{left} left</Underlined>
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
      <p className="mx-auto mt-3 max-w-[340px] border-t border-ink-100 pt-3 text-center text-[13px] font-semibold leading-[1.45] text-ink-800">{EARLY_JOBS_FACT}</p>
    </div>
  );
}
