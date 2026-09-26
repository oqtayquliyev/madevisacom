// Small, non-sensitive job text helpers used by the website. (The job
// description detector itself runs on the server — see jobFactsClient.ts.)

import { allCountries } from '@/data/allCountries';
import { createPlaceResolver } from '@/lib/placeResolver';

const resolvePlace = createPlaceResolver(allCountries);

/** Groups experience text into the Jobs page filter buckets. */
export function experienceBucket(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const n = s.match(/(\d{1,2})/);
  if (n) {
    const years = Number(n[1]);
    if (years <= 1) return 'Entry level (0–1 yrs)';
    if (years <= 4) return 'Mid level (2–4 yrs)';
    if (years <= 7) return 'Senior (5–7 yrs)';
    return 'Lead / Principal (8+ yrs)';
  }
  if (/intern|entry|junior|graduate|trainee/.test(s)) return 'Entry level (0–1 yrs)';
  if (/mid|intermediate|associate/.test(s)) return 'Mid level (2–4 yrs)';
  if (/senior|sr\b|experienced/.test(s)) return 'Senior (5–7 yrs)';
  if (/lead|principal|staff|director|head|executive|manager/.test(s)) return 'Lead / Principal (8+ yrs)';
  return raw;
}

const PLACEHOLDER_VALUE_RE =
  /^(?:all|any|various|multiple(?: locations)?|n\/?a|none|other|-|–|tbd|tbc|location on source|(?:more |advanced )?search(?: options)?|more search options|filters?|select(?: a)? location|view all|see all|show more|apply(?: now)?|click here|loading\.*)$/i;

/** True for importer placeholders like "All" / "Various" that aren't real data. */
export function isPlaceholderValue(value: string | null | undefined): boolean {
  return !value || PLACEHOLDER_VALUE_RE.test(value.trim());
}

/** "Osnabrück, DE" / "Berlin, Germany" → { city: "Osnabrück", countryCode: "DE" }. "Phoenix, AZ" → Arizona (US), not Azerbaijan. */
export function splitSourceLocation(raw: string | null | undefined): { city: string | null; countryCode: string | null } | null {
  if (!raw || isPlaceholderValue(raw)) return null;
  // Drop postal codes ("843 02", "70173") and a leading "USA - " country prefix.
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^[\d\s-]{3,10}$/.test(p));
  if (!parts.length) return null;
  const country = resolvePlace(raw);
  const first = parts[0].replace(/^(?:USA|US|U\.S\.A?\.?|United States|UK|UAE)\s*[-–:]\s*/i, '').trim();
  const firstIsCountry = parts.length === 1 && country && (first.length <= 3 || first.toLowerCase() === country.name.toLowerCase());
  const city = firstIsCountry ? null : first;
  return { city: city && !isPlaceholderValue(city) ? city : null, countryCode: country?.code ?? null };
}
