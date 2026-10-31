import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LAUNCH_OFFER, MEMBERSHIP_PRICE, MEMBERSHIP_REGULAR_PRICE } from '@/lib/plans';
import { GUARANTEE } from '@/lib/conversion';
import { CardMarks } from './CardMarks';

// The launch offer, one card: ~~$250~~ $12.50 once, how many of the 200 launch places are left
// (a bar), "Get Lifetime Access", and the trust line (secure checkout · pay once · no subscription,
// the cards, the refund guarantee). Used by the payment popup and the pricing page.

/** "4 left" with a thick yellow marker line under it. */
export function Underlined({ children }: { children: React.ReactNode }) {
  return <span className="underline decoration-[#FFD60A] decoration-[5px] underline-offset-[3px]">{children}</span>;
}

/** Why buying matters beyond the buyer (shown with a small heart). */
export const MISSION_LINE = 'Your purchase helps us connect more companies, unlock more opportunities and build one search platform for the entire career web.';

export function MissionNote({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-3 text-[13px] leading-[1.5] text-ink-700 ${className}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50 ring-1 ring-rose-100" aria-hidden>
        <Heart className="h-5 w-5 fill-rose-500 text-rose-500" strokeWidth={2.5} />
      </span>
      <span className="max-w-[330px]">{MISSION_LINE}</span>
    </p>
  );
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

/** "196 of 200 claimed · 4 left" over a bar that is nearly full. */
export function PlacesBar({ left, className = '' }: { left: number; className?: string }) {
  const total = LAUNCH_OFFER.places;
  const taken = Math.min(total, Math.max(0, total - left));
  const pct = Math.max(4, Math.round((taken / total) * 100));
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-[12.5px] font-semibold">
        <span className="text-ink-600">
          <span className="text-ink-950">{taken}</span> of {total} launch places claimed
        </span>
        <span className="text-amber-700">{left} left</span>
      </div>
      <div
        className="relative mt-2 h-3.5 rounded-full bg-ink-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={taken}
        aria-label={`${taken} of ${total} launch places claimed`}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[#FFD60A]" style={{ width: `${pct}%` }} />
        {/* A heart riding on the end of the bar. */}
        <span
          className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-sm ring-1 ring-rose-100"
          style={{ left: `clamp(12px, ${pct}%, calc(100% - 12px))` }}
          aria-hidden
        >
          <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
        </span>
      </div>
    </div>
  );
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
  const open = left != null && left > 0;
  return (
    <div className={`rounded-2xl bg-white px-5 pb-5 pt-5 ring-1 ring-ink-200 ${className}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">Lifetime access</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[40px] font-bold leading-none tracking-tight text-ink-950">{MEMBERSHIP_PRICE}</span>
            <s className="text-[17px] font-semibold text-ink-400 decoration-2">{MEMBERSHIP_REGULAR_PRICE}</s>
          </p>
        </div>
        <span className="mb-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700 ring-1 ring-emerald-200">
          {LAUNCH_OFFER.percentOff}% off · launch
        </span>
      </div>

      {open && <PlacesBar left={left} className="mt-4" />}

      {children ?? (
        <button
          type="button"
          onClick={onBuy}
          disabled={busy}
          className="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-ink-950 text-[16px] font-bold text-white transition hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950 focus-visible:ring-offset-2 disabled:opacity-80"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening secure payment…
            </>
          ) : (
            <>
              Get Lifetime Access <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      )}

      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 text-[12.5px] font-medium text-ink-500">
        <Lock className="h-3.5 w-3.5" aria-hidden /> Secure checkout <span aria-hidden>·</span> Pay once <span aria-hidden>·</span> No subscription
      </p>
      <CardMarks className="mt-2.5 justify-center" />
      <p className="mx-auto mt-2.5 max-w-[320px] text-balance text-center text-[12px] font-semibold leading-[1.45] text-emerald-700">
        <ShieldCheck className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" aria-hidden />
        {GUARANTEE}
      </p>
    </div>
  );
}
