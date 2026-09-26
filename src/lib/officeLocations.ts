import { allCountries } from '@/data/allCountries';
import { createPlaceResolver } from '@/lib/placeResolver';

const resolve = createPlaceResolver(allCountries);

/**
 * Office / location strings → the countries they're in, e.g. "US",
 * "Germany Locations", "Phoenix, AZ", "Goodyear, AZ, US, 85395".
 * US states, Canadian provinces and Australian states are never mistaken
 * for countries (AZ = Arizona unless the city is Azerbaijani) — see
 * placeResolver.ts. Used by the importer and the multi-country badge.
 */
export function matchCountriesFromOfficeNames(officeNames: string[]): { code: string; name: string }[] {
  const found = new Map<string, { code: string; name: string }>();
  for (const raw of officeNames) {
    const hit = resolve(raw);
    if (hit) found.set(hit.code, hit);
  }
  return Array.from(found.values());
}
