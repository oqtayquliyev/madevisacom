import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BOOK, BOOK_ONLY_PRICE, MEMBERSHIP_PRICE, useMembership } from '@/lib/plans';
import { goToBookCheckout, goToMembershipCheckout } from '@/lib/gumroad';
import { trackPaywall } from '@/lib/paywallStats';
import { searchesThisVisit } from '@/lib/lastSearch';
import { loadBookPromo } from '@/lib/bookPromo';
import { BookCover } from './LaunchOffer';

// The book popup, bottom right (bottom on a phone): the cover, "How to Survive in the 2026–2027
// Job Market", and two buttons — Book + 1 Year Membership ($27.40, best value) and Book Only ($17).
// For people who aren't members. It turns up at a RANDOM moment: on about 2 visits in 3, somewhere
// between 25 s and 2 min into the visit (time with the tab visible), or after a few searches.
// At most once a day; closing it means not again today.

const SEARCHES = 3;
const MIN_MS = 25_000;
const MAX_MS = 120_000;
const CHANCE = 0.65;
const SHOWN_KEY = 'madevisa:offerNudgeAt';
const ACTIVE_KEY = 'madevisa:activeMs';
const ROLL_KEY = 'madevisa:bookRoll';
const DAY = 24 * 60 * 60 * 1000;
/** Pages where the card would be in the way. */
const QUIET = /^\/(pricing|checkout|admin|login|register|reset-password|auth)/;

const store = {
  get: (s: Storage, k: string) => {
    try {
      return Number(s.getItem(k) ?? '0') || 0;
    } catch {
      return 0;
    }
  },
  set: (s: Storage, k: string, v: number) => {
    try {
      s.setItem(k, String(v));
    } catch {
      /* private mode */
    }
  },
};

/** This visit's random moment (ms of visible time), or 0 = not this visit. Rolled once per visit. */
function visitMoment(): number {
  const had = store.get(sessionStorage, ROLL_KEY);
  if (had) return had;
  const at = Math.random() < CHANCE ? Math.round(MIN_MS + Math.random() * (MAX_MS - MIN_MS)) : -1;
  store.set(sessionStorage, ROLL_KEY, at);
  return at;
}

export function OfferNudge() {
  const { user } = useAuth();
  const { member, ready } = useMembership();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'bundle' | 'book' | null>(null);

  useEffect(() => {
    if (!ready || member) return;
    if (Date.now() - store.get(localStorage, SHOWN_KEY) < DAY) return;
    let off = false;
    void loadBookPromo().then((c) => (off = !c.placements.popup));
    const moment = visitMoment();
    const show = () => {
      if (off || QUIET.test(window.location.pathname) || /^\/book/.test(window.location.pathname)) return false;
      // Not over another popup (the paywall, a sign-in box).
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
      store.set(localStorage, SHOWN_KEY, Date.now());
      trackPaywall('shown', 'book_nudge');
      setOpen(true);
      return true;
    };
    const onSearch = () => searchesThisVisit() >= SEARCHES && show() && cleanup();
    // Time actually on the site this visit (tab visible), counted every 5 s.
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ms = store.get(sessionStorage, ACTIVE_KEY) + 5_000;
      store.set(sessionStorage, ACTIVE_KEY, ms);
      if (moment > 0 && ms >= moment && show()) cleanup();
    }, 5_000);
    window.addEventListener('mv:search', onSearch);
    const cleanup = () => {
      window.clearInterval(tick);
      window.removeEventListener('mv:search', onSearch);
    };
    onSearch();
    return cleanup;
  }, [ready, member]);

  if (!open || member) return null;

  const buy = async (what: 'bundle' | 'book') => {
    if (busy) return;
    setBusy(what);
    trackPaywall('click', what === 'book' ? 'book_nudge_book' : 'book_nudge');
    if (what === 'book') await goToBookCheckout({ email: user?.email ?? null, source: 'book_nudge' });
    else await goToMembershipCheckout({ signedIn: Boolean(user), email: user?.email ?? null, source: 'book_nudge' });
    window.setTimeout(() => setBusy(null), 1500);
  };

  return (
    <aside
      aria-label="The book: How to Survive in the 2026–2027 Job Market"
      className="fixed inset-x-3 bottom-3 z-[80] rounded-2xl bg-white px-5 pb-5 pt-5 text-ink-950 shadow-[0_8px_40px_rgba(15,23,42,0.18)] ring-1 ring-ink-200 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[400px] sm:px-6 sm:pt-6"
    >
      <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
        <X className="h-4 w-4" />
      </button>
      <a href="/book" className="mx-auto block w-[170px]" aria-label={BOOK.title}>
        <BookCover className="w-full -rotate-2 shadow-xl" />
      </a>
      <button
        type="button"
        onClick={() => void buy('bundle')}
        disabled={busy != null}
        className="relative mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-950 text-[14.5px] font-bold text-white hover:bg-ink-800 disabled:opacity-80"
      >
        <span className="absolute -top-2.5 right-4 rounded-full bg-[#FFD60A] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">Best value</span>
        {busy === 'bundle' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Book + 1 Year Membership · {MEMBERSHIP_PRICE} <ArrowRight className="h-4 w-4" aria-hidden /></>}
      </button>
      <button
        type="button"
        onClick={() => void buy('book')}
        disabled={busy != null}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[14px] font-bold text-ink-950 ring-1 ring-ink-300 hover:ring-ink-600 disabled:opacity-80"
      >
        {busy === 'book' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Book only · {BOOK_ONLY_PRICE}</>}
      </button>
    </aside>
  );
}
