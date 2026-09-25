// Small, non-sensitive job text helpers used by the website. (The job
// description detector itself runs on the server — see jobFactsClient.ts.)

import { allCountries } from '@/data/allCountries';

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

const PLACEHOLDER_VALUE_RE = /^(?:all|any|various|multiple(?: locations)?|n\/?a|none|other|-|–)$/i;

/** True for importer placeholders like "All" / "Various" that aren't real data. */
export function isPlaceholderValue(value: string | null | undefined): boolean {
  return !value || PLACEHOLDER_VALUE_RE.test(value.trim());
}

/** "Osnabrück, DE" / "Berlin, Germany" → { city: "Osnabrück", countryCode: "DE" }. */
export function splitSourceLocation(raw: string | null | undefined): { city: string | null; countryCode: string | null } | null {
  if (!raw || isPlaceholderValue(raw)) return null;
  // Drop postal codes ("843 02", "70173") so the country segment is last.
  const parts = raw.split(',').map((p) => p.trim()).filter((p) => p && !/^[\d\s-]{3,10}$/.test(p));
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const country =
    (last.length === 2 ? allCountries.find((c) => c.code === last.toUpperCase()) : undefined) ??
    allCountries.find((c) => c.name.toLowerCase() === last.toLowerCase());
  const city = country ? (parts.length > 1 ? parts[0] : null) : parts[0];
  return { city: city && !isPlaceholderValue(city) ? city : null, countryCode: country?.code ?? null };
}
