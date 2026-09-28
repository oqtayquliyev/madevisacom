/**
 * "Where is this visitor from" detection, remembered in a cookie so it
 * only happens once per visitor (manual picks are remembered too).
 *
 * Order:
 * 1. `madevisa_country` cookie → use it (no prompt, no network).
 * 2. Otherwise a silent guess from the network address (ipwho.is). The
 *    browser's location prompt is never shown on page load — only if a
 *    page explicitly calls detectCountryByBrowserLocation() after the
 *    visitor asks for it.
 * 3. Whatever we land on is saved to the cookie for 180 days, so the
 *    prompt never repeats. Picking a country manually overwrites it.
 */

const COOKIE_NAME = 'madevisa_country';
const COOKIE_MAX_AGE_DAYS = 180;

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, maxAgeDays = COOKIE_MAX_AGE_DAYS): void {
  if (typeof document === 'undefined') return;
  const maxAgeSeconds = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/; samesite=lax`;
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; max-age=0; path=/`;
}

export function getStoredCountry(): string | null {
  return getCookie(COOKIE_NAME);
}

export function setStoredCountry(countryCode: string): void {
  setCookie(COOKIE_NAME, countryCode.toUpperCase());
}

export function clearStoredCountry(): void {
  deleteCookie(COOKIE_NAME);
}

type IpWhoIsResponse = {
  success: boolean;
  country_code?: string;
  country?: string;
};

/**
 * Detects the visitor's country from their IP address via ipwho.is —
 * free, no API key, CORS-enabled, ~1,000 requests/day on the free tier.
 * Resolves to null (never throws) if the lookup fails for any reason,
 * so callers can fall back to a sensible default.
 */
export async function detectCountryByIp(): Promise<{ code: string; name: string } | null> {
  try {
    const res = await fetch('https://ipwho.is/');
    if (!res.ok) return null;
    const data = (await res.json()) as IpWhoIsResponse;
    if (!data.success || !data.country_code) return null;
    return { code: data.country_code.toUpperCase(), name: data.country ?? data.country_code };
  } catch {
    return null;
  }
}

/**
 * Resolves the visitor's country for this session:
 * 1. Use the cookie if we already have one (no network call at all).
 * 2. Otherwise detect by IP, then persist the result to the cookie.
 * Returns null only if we have no cookie AND the IP lookup failed.
 */
const PROMPT_WAIT_MS = 12_000;

/** Browser location → country code. Resolves null if denied, unsupported, ignored or failed. */
export async function detectCountryByBrowserLocation(): Promise<{ code: string; name: string } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  try {
    // Don't re-prompt someone who already blocked it for this site.
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (perm?.state === 'denied') return null;
  } catch {
    /* Permissions API unsupported (older Safari) — just try */
  }
  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), PROMPT_WAIT_MS); // prompt ignored → don't wait forever
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve(pos);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: PROMPT_WAIT_MS, maximumAge: 24 * 60 * 60 * 1000 }
    );
  });
  if (!position) return null;
  try {
    const { latitude, longitude } = position.coords;
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&localityLanguage=en`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { countryCode?: string; countryName?: string };
    return data.countryCode ? { code: data.countryCode.toUpperCase(), name: data.countryName ?? data.countryCode } : null;
  } catch {
    return null;
  }
}

let inflight: Promise<string | null> | null = null;

/**
 * Resolves the visitor's country for this session (see the order at the
 * top of this file). Concurrent callers share one prompt/lookup.
 */
export async function resolveCountry(): Promise<string | null> {
  const stored = getStoredCountry();
  if (stored) return stored;
  if (inflight) return inflight;

  inflight = (async () => {
    // No browser location prompt on page load (bad for privacy and flagged by
    // Google's page checks). The network-based guess is enough to pick a
    // country, and anyone can change it by hand.
    const detected = await detectCountryByIp();
    if (detected) {
      setStoredCountry(detected.code);
      return detected.code;
    }
    return null;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
