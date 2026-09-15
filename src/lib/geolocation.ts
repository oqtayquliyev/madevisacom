/**
 * Automatic "where is this visitor from" detection, backed by a cookie
 * so it only runs once per visitor (and remembers manual overrides).
 *
 * How it works:
 * 1. On first visit, we check for a `madevisa_country` cookie.
 * 2. If it's missing, we call a free, keyless IP-geolocation API
 *    (ipwho.is) to guess the visitor's country from their IP address.
 *    This needs NO browser permission prompt — unlike
 *    navigator.geolocation, which asks for precise GPS location and
 *    requires an explicit "Allow" click. IP-based detection is
 *    less precise (country-level, not street-level) but works silently
 *    and instantly, which is what "automatically, when opened" needs.
 * 3. Whatever country we land on (detected OR manually picked by the
 *    visitor later) gets written back to the cookie, so it persists
 *    across visits and page loads.
 *
 * If you later want more precision, you can offer an opt-in "Use my
 * exact location" button that calls navigator.geolocation.getCurrentPosition
 * — see the commented helper at the bottom of this file.
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
export async function resolveCountry(): Promise<string | null> {
  const stored = getStoredCountry();
  if (stored) return stored;

  const detected = await detectCountryByIp();
  if (detected) {
    setStoredCountry(detected.code);
    return detected.code;
  }

  return null;
}

/*
 * Optional, more precise alternative (needs an explicit user click —
 * browsers require a user gesture and will show a permission prompt):
 *
 * export function detectByBrowserGeolocation(): Promise<GeolocationPosition> {
 *   return new Promise((resolve, reject) => {
 *     if (!navigator.geolocation) return reject(new Error('Unsupported'));
 *     navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
 *   });
 * }
 * // You'd then reverse-geocode the lat/lng into a country via a service
 * // like BigDataCloud's free reverse-geocode API.
 */
