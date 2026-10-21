// A guest's purchase, remembered in their browser: the random token added to the Gumroad
// link (?mvg=…) and the page they were on. Once Gumroad confirms the payment, the site
// emails a sign-in code for that account and brings them back to that page (GuestReturn).

const KEY = 'mv:guestClaim';
/** How long the browser keeps looking for the payment. */
export const CLAIM_TTL = 24 * 60 * 60 * 1000;

export type GuestClaim = { token: string; back: string; at: number };

const newToken = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Called right before a guest leaves for Gumroad. Answers the token for the link. */
export function startGuestClaim(back: string): string {
  const old = readGuestClaim();
  // Pressed Subscribe again shortly after: keep the same token, so an earlier payment still counts.
  const token = old && Date.now() - old.at < 60 * 60 * 1000 ? old.token : newToken();
  const safe = back.startsWith('/') && !back.startsWith('//') && !back.startsWith('/checkout') ? back : '/jobs';
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, back: safe, at: Date.now() } satisfies GuestClaim));
  } catch {
    /* private mode: the account still gets made, they sign in from the email */
  }
  return token;
}

export function readGuestClaim(): GuestClaim | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as GuestClaim | null;
    if (!v || typeof v.token !== 'string' || Date.now() - v.at > CLAIM_TTL) return null;
    return v;
  } catch {
    return null;
  }
}

export function clearGuestClaim(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
}
