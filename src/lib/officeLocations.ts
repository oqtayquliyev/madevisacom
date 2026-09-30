import { allCountries } from '@/data/allCountries';
import { createPlaceResolver, type PlaceHint } from '@/lib/placeResolver';

const resolve = createPlaceResolver(allCountries);

/**
 * Office / location strings → the countries they're in, e.g. "US",
 * "Germany Locations", "Phoenix, AZ", "Goodyear, AZ, US, 85395".
 * US states, Canadian provinces and Australian states are never mistaken
 * for countries (AZ = Arizona unless the city is Azerbaijani) — see
 * placeResolver.ts. Used by the importer and the multi-country badge.
 */
export function matchCountriesFromOfficeNames(officeNames: string[], hint?: PlaceHint): { code: string; name: string }[] {
  const found = new Map<string, { code: string; name: string }>();
  for (const raw of officeNames) {
    const hit = resolve(raw, hint);
    if (hit) found.set(hit.code, hit);
  }
  return Array.from(found.values());
}

/**
 * The country most of a company's listed jobs are clearly in — only
 * readings backed by real evidence count (a named country, a ZIP code, a
 * known city), never a guess. Used as a hint for its unclear ones:
 * a US company's "Mettawa, IL" is Illinois. Null when there's no clear
 * majority (at least 60% and 2 jobs).
 */
export function dominantCountry(locations: (string | null | undefined)[]): string | null {
  const n = new Map<string, number>();
  let total = 0;
  for (const raw of locations) {
    if (!raw) continue;
    const d = resolve.detail(raw);
    if (!d.country || d.guessed) continue;
    total++;
    n.set(d.country.code, (n.get(d.country.code) ?? 0) + 1);
  }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 && top[1] / total >= 0.6 ? top[0] : null;
}
