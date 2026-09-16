/**
 * Real flight referral integration via Travelpayouts (the affiliate
 * network behind Aviasales, WayAway, Kiwi.com and others).
 *
 * This needs NO backend and NO paid API access to start earning: you
 * sign up for a free Travelpayouts account, get a "marker" (your
 * partner ID), and every search link below sends the visitor to
 * Aviasales with that marker attached. If they book, you earn a
 * commission — Aviasales/Travelpayouts pay out per completed booking,
 * not per click.
 *
 * Sign up: https://www.travelpayouts.com/
 * Docs used to build this:
 *   https://support.travelpayouts.com/hc/en-us/articles/5711895629714
 *
 * Once you have a marker, set it as an env var (see .env.example) —
 * VITE_TRAVELPAYOUTS_MARKER=123456
 *
 * Until then this falls back to a demo marker so the UI still works in
 * preview, but clicks won't be attributed to any account.
 */

const DEMO_MARKER = '000000';

export const affiliateConfig = {
  marker: import.meta.env.VITE_TRAVELPAYOUTS_MARKER || DEMO_MARKER,
  currency: import.meta.env.VITE_TRAVELPAYOUTS_CURRENCY || 'usd',
  isConfigured: Boolean(import.meta.env.VITE_TRAVELPAYOUTS_MARKER),
};

export type FlightSearchParams = {
  origin: string; // IATA code, e.g. "GYD"
  destination: string; // IATA code, e.g. "IST"
  departDate?: string; // "YYYY-MM-DD"
  returnDate?: string; // "YYYY-MM-DD", omit for one-way
  adults?: number; // 1-9
  children?: number;
  infants?: number;
};

function toDDMM(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${day}${month}`;
}

/**
 * Encodes a search into Aviasales' compact route string, e.g.
 * "GYD1712IST2012" + passenger digits, per their documented format:
 * ORIGIN + DDMM + DESTINATION + [DDMM return] + adults[children[infants]]
 */
export function encodeAviasalesRoute({
  origin,
  destination,
  departDate,
  returnDate,
  adults = 1,
  children = 0,
  infants = 0,
}: FlightSearchParams): string {
  let route = origin.toUpperCase();

  if (departDate) route += toDDMM(departDate);
  route += destination.toUpperCase();

  if (returnDate) route += toDDMM(returnDate);

  // Adult count is mandatory for the link to work at all.
  route += String(Math.min(9, Math.max(1, adults)));
  if (children > 0 || infants > 0) route += String(children);
  if (infants > 0) route += String(infants);

  return route;
}

/**
 * Builds a real, working Aviasales search-results deep link with your
 * affiliate marker attached. Open this in a new tab — MadeVisa earns a
 * commission on any resulting booking, at no extra cost to the traveler.
 */
export function buildFlightSearchUrl(params: FlightSearchParams): string {
  const route = encodeAviasalesRoute(params);
  const query = new URLSearchParams({
    marker: affiliateConfig.marker,
    currency: affiliateConfig.currency,
  });

  return `https://www.aviasales.com/search/${route}?${query.toString()}`;
}

/**
 * Builds a link to the pre-filled search FORM instead of results —
 * useful when you only know the route (not exact dates) and want the
 * visitor to pick dates themselves on Aviasales.
 */
export function buildFlightSearchFormUrl(params: Partial<FlightSearchParams>): string {
  const route = `${params.origin ?? ''}${params.destination ?? ''}`;
  const query = new URLSearchParams({
    marker: affiliateConfig.marker,
    currency: affiliateConfig.currency,
  });

  return `https://www.aviasales.com/?params=${route}&${query.toString()}`;
}
