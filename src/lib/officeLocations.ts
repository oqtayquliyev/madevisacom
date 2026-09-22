import { allCountries } from '@/data/allCountries';

const ALIASES: Record<string, string> = {
  US: 'United States',
  USA: 'United States',
  UK: 'United Kingdom',
  UAE: 'United Arab Emirates',
  DACH: 'Germany',
};

/**
 * Greenhouse office names are free text like "US", "United Kingdom
 * Locations", "Germany Locations", "SF, NYC, SEA, CHI". This tries a
 * few matching strategies and returns the country codes it can
 * confidently identify — purely for a "hiring in multiple countries"
 * visual hint, not a hard data guarantee.
 */
export function matchCountriesFromOfficeNames(officeNames: string[]): { code: string; name: string }[] {
  const found = new Map<string, { code: string; name: string }>();

  for (const raw of officeNames) {
    const cleaned = raw.replace(/\bLocations?\b/gi, '').trim();
    if (!cleaned) continue;

    const alias = ALIASES[cleaned.toUpperCase()];
    if (alias) {
      const match = allCountries.find((c) => c.name === alias);
      if (match) { found.set(match.code, match); continue; }
    }

    const exact = allCountries.find((c) => c.name.toLowerCase() === cleaned.toLowerCase());
    if (exact) { found.set(exact.code, exact); continue; }

    const contains = allCountries.find(
      (c) => cleaned.toLowerCase().includes(c.name.toLowerCase()) && c.name.length > 3
    );
    if (contains) { found.set(contains.code, contains); continue; }

    // schema.org's JobPosting.address.addressCountry is very commonly
    // just the bare ISO alpha-2 code ("SI", "DE", ...) rather than the
    // spelled-out name, and it often arrives already joined with
    // locality/region into one string like "Ljubljana, SI" — so none of
    // the checks above match it. Check each comma-separated segment for
    // an exact 2-letter code instead.
    const segments = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      if (/^[A-Za-z]{2}$/.test(seg)) {
        const byCode = allCountries.find((c) => c.code.toUpperCase() === seg.toUpperCase());
        if (byCode) { found.set(byCode.code, byCode); break; }
      }
    }
  }

  return Array.from(found.values());
}
