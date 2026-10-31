import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { LAUNCH_OFFER, MEMBERSHIP_PRICE, useMembership } from '@/lib/plans';
import { goToMembershipCheckout } from '@/lib/gumroad';
import { trackPaywall } from '@/lib/paywallStats';
import { searchesThisVisit } from '@/lib/lastSearch';
import { Underlined, useLaunchPlaces } from './LaunchOffer';

// The small launch-offer card, bottom right (bottom on a phone):
//   "4 of the first 200 left / One-time payment, no subscription. / Get it for $12.50 →"
// For people who aren't members, once they've searched a few times or spent a few minutes on
// MadeVisa this visit. At most once a day; closing it means not again today.

const SEARCHES = 3;
const ACTIVE_MS = 3 * 60 * 1000;
const SHOWN_KEY = 'madevisa:offerNudgeAt';
const ACTIVE_KEY = 'madevisa:activeMs';
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

export function OfferNudge() {
  const { user } = useAuth();
  const { member, ready } = useMembership();
  const left = useLaunchPlaces();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || member) return;
    if (Date.now() - store.get(localStorage, SHOWN_KEY) < DAY) return;
    const show = () => {
      if (QUIET.test(window.location.pathname)) return false;
      // Not over another popup (the paywall, a sign-in box).
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
      store.set(localStorage, SHOWN_KEY, Date.now());
      trackPaywall('shown', 'nudge');
      setOpen(true);
      return true;
    };
    const onSearch = () => searchesThisVisit() >= SEARCHES && show() && cleanup();
    // Time actually on the site this visit (tab visible), counted every 10 s.
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ms = store.get(sessionStorage, ACTIVE_KEY) + 10_000;
      store.set(sessionStorage, ACTIVE_KEY, ms);
      if (ms >= ACTIVE_MS && show()) cleanup();
    }, 10_000);
    window.addEventListener('mv:search', onSearch);
    const cleanup = () => {
      window.clearInterval(tick);
      window.removeEventListener('mv:search', onSearch);
    };
    onSearch();
    return cleanup;
  }, [ready, member]);

  if (!open || member || left == null || left <= 0) return null;

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    trackPaywall('click', 'nudge');
    await goToMembershipCheckout({ signedIn: Boolean(user), email: user?.email ?? null, source: 'nudge' });
    window.setTimeout(() => setBusy(false), 1500);
  };

  return (
    <aside
      aria-label="Launch offer"
      className="fixed inset-x-3 bottom-3 z-[80] rounded-2xl bg-white px-5 pb-5 pt-5 text-ink-950 shadow-[0_8px_40px_rgba(15,23,42,0.18)] ring-1 ring-ink-200 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px] sm:px-6 sm:pt-6"
    >
      <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-[19px] font-medium text-ink-600">
        <span className="text-[24px] font-bold text-ink-950">
          <Underlined>{left}</Underlined>
        </span>{' '}
        of the first {LAUNCH_OFFER.places} left
      </p>
      <p className="mt-2 text-[16px] text-ink-900">One-time payment, no subscription.</p>
      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-950 text-[15.5px] font-bold text-white hover:bg-ink-800 disabled:opacity-80"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Get it for {MEMBERSHIP_PRICE} <ArrowRight className="h-4 w-4" aria-hidden /></>}
      </button>
    </aside>
  );
}
