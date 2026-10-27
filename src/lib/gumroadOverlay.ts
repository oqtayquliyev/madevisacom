// Gumroad's on-page checkout ("overlay"): the payment form opens over MadeVisa
// instead of sending the visitor to gumroad.com. Leaving the site is where most
// people dropped off (Admin → Paywall: 8 pressed "Subscribe now", 1 paid).
//
// How it works: gumroad.js (Gumroad's own script) turns any click on a link to a
// Gumroad product into the overlay. We load it once, in the background, as soon
// as the paywall appears, then "click" a hidden link to the checkout address.
// - Script loaded → the overlay opens over the page (with data-gumroad-overlay-checkout,
//   straight to the payment form, not the product page).
// - Script blocked (ad blocker, slow network, 2.5 s) → the same link simply opens
//   Gumroad's page in this tab, exactly as before. Nobody is ever stuck.
//
// After paying, nothing here grants anything: the server still waits for Gumroad's
// confirmation (webhook / refresh), as before. We only notice sooner:
// - signed in → we ask the server to read the payment every few seconds while the
//   overlay is open and reload the plan (the page unlocks by itself);
// - guest → GuestReturn already polls for the payment and signs them in.

const SRC = 'https://gumroad.com/js/gumroad.js';
const LOAD_TIMEOUT = 2500;

let loading: Promise<boolean> | null = null;

/** Starts loading gumroad.js (once). Answers whether it loaded in time. Safe to call often. */
export function preloadGumroad(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    if (document.querySelector(`script[src="${SRC}"]`)) return resolve(true);
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    const t = window.setTimeout(() => resolve(false), LOAD_TIMEOUT);
    s.onload = () => {
      window.clearTimeout(t);
      resolve(true);
    };
    s.onerror = () => {
      window.clearTimeout(t);
      loading = null; // try again next time
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type OverlayHandlers = {
  /** Gumroad said the sale went through (when its script tells us). */
  onSale?: () => void;
  /** Called every 5 s while the overlay is (probably) open — use it to look at the payment. */
  onTick?: () => void;
};

/** Is a Gumroad iframe on the page (the overlay is open)? */
const overlayOpen = () => Boolean(document.querySelector('iframe[src*="gumroad.com"], iframe[src*="gumroad"]'));

/** A message from Gumroad's overlay that means "purchase done". Gumroad doesn't document these, so we accept a few shapes. */
export function isSaleMessage(origin: string, data: unknown): boolean {
  if (!/(^|\.)gumroad\.com$/i.test(origin.replace(/^https?:\/\//, ''))) return false;
  let d: unknown = data;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      return /\b(sale|purchase(d)?|receipt)\b/i.test(d as string);
    }
  }
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  const name = String(o.post_message_name ?? o.type ?? o.event ?? o.name ?? '');
  return /sale|purchase|receipt|success/i.test(name);
}

/**
 * Opens `url` (a Gumroad checkout link) in the overlay, or — when the script isn't
 * there — as a normal page. Answers 'overlay' or 'page'.
 */
export async function openGumroadCheckout(url: string, handlers: OverlayHandlers = {}): Promise<'overlay' | 'page'> {
  const ok = await preloadGumroad();
  if (!ok) {
    window.location.assign(url);
    return 'page';
  }
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('data-gumroad-overlay-checkout', 'true');
  a.setAttribute('data-gumroad-single-product', 'true');
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);

  const onMessage = (e: MessageEvent) => {
    if (isSaleMessage(e.origin, e.data)) handlers.onSale?.();
  };
  window.addEventListener('message', onMessage);

  // While the overlay is open, look at the payment every 5 s (stop 10 minutes later, or when it closes).
  const started = Date.now();
  let seenOpen = false;
  const timer = window.setInterval(() => {
    const open = overlayOpen();
    if (open) seenOpen = true;
    if ((seenOpen && !open) || Date.now() - started > 10 * 60_000) {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      handlers.onTick?.(); // one last look after it closes
      return;
    }
    handlers.onTick?.();
  }, 5000);

  a.click();
  window.setTimeout(() => a.remove(), 1000);
  return 'overlay';
}
