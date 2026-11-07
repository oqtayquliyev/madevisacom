import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { BOOK, BOOK_ONLY_PRICE, LAUNCH_OFFER, MEMBERSHIP_PRICE } from '@/lib/plans';
import { goToBookCheckout } from '@/lib/gumroad';
import { trackPaywall } from '@/lib/paywallStats';
import { GUARANTEE } from '@/lib/conversion';
import { CardMarks } from './CardMarks';

// The offer, one card, like the Gumroad page: two options —
//   Book Only                              $17     one-time payment
//   BEST VALUE  Book + 1 Year Membership   $27.40  (picked by default)
// then the button, and the trust line (secure checkout · pay once · no subscription, the cards,
// the refund guarantee). Used by the payment popup and the pricing page.

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
  /** "Book + 1 Year MadeVisa Membership": the membership checkout (linked to the account). */
  onBuy: () => void;
  /** Replaces the button (e.g. "already a member"). */
  children?: React.ReactNode;
  className?: string;
  /** Which screen showed it (Admin → Paywall), for the "Book Only" button. */
  source?: string;
};

/** The book's cover, small. */
export function BookCover({ className = '' }: { className?: string }) {
  return <img src={BOOK.cover} alt={`${BOOK.title} — the book`} width={600} height={778} loading="lazy" decoding="async" className={`h-auto rounded-[3px] shadow-md ring-1 ring-ink-200 ${className}`} />;
}

export function LaunchOfferBox({ busy = false, onBuy, children, className = '', source = 'offer' }: Props) {
  const { user } = useAuth();
  const [bookBusy, setBookBusy] = useState(false);
  const buyBook = async () => {
    if (bookBusy) return;
    setBookBusy(true);
    trackPaywall('click', `book_${source}`.slice(0, 40));
    await goToBookCheckout({ email: user?.email ?? null, source: `book_${source}`.slice(0, 40) });
    window.setTimeout(() => setBookBusy(false), 1500);
  };
  return (
    <div className={`rounded-2xl bg-white px-5 pb-5 pt-5 ring-1 ring-ink-200 ${className}`}>
      <div className="flex items-center gap-4 sm:gap-5">
        <a href="/book" className="block w-[104px] shrink-0 sm:w-[124px]" aria-label={BOOK.title}>
          <BookCover className="w-full -rotate-2 shadow-xl" />
        </a>
        <div className="min-w-0 flex-1">
          {children ?? (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onBuy}
                disabled={busy}
                className="relative flex min-h-[56px] w-full flex-col items-center justify-center rounded-xl bg-ink-950 px-3 py-2 text-white transition hover:bg-ink-800 disabled:opacity-80"
              >
                <span className="absolute -top-2.5 right-3 rounded-full bg-[#FFD60A] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">Best value</span>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-[15px] font-bold leading-5">
                      Book + 1 Year Membership · {MEMBERSHIP_PRICE} <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-[11.5px] font-medium text-white/70">The book included · nothing renews</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void buyBook()}
                disabled={bookBusy}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white text-[14px] font-bold text-ink-950 ring-1 ring-ink-300 transition hover:ring-ink-700 disabled:opacity-80"
              >
                {bookBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Just the Book · {BOOK_ONLY_PRICE}</>}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 text-[12.5px] font-medium text-ink-500">
        <Lock className="h-3.5 w-3.5" aria-hidden /> Secure checkout <span aria-hidden>·</span> Pay once <span aria-hidden>·</span> No subscription
      </p>
      <CardMarks className="mt-2.5 justify-center" />
      {!children && (
        <p className="mx-auto mt-2.5 max-w-[320px] text-balance text-center text-[12px] font-semibold leading-[1.45] text-emerald-700">
          <ShieldCheck className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" aria-hidden />
          {GUARANTEE}
        </p>
      )}
    </div>
  );
}
