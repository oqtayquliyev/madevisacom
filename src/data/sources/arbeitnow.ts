import type { Job } from '@/data/jobs';

/**
 * Arbeitnow (https://arbeitnow.com) publishes a free, public, no-auth,
 * CORS-enabled job board API. It's a good first real source to wire up
 * because it needs zero setup — no API key, no backend proxy — so the
 * board can show genuinely live listings alongside the curated ones.
 *
 * Docs: https://arbeitnow.com/api/job-board-api
 *
 * For providers that DO require a key (Adzuna, Jooble, Reed, etc.), see
 * OPPORTUNITIES.md — those need a small server-side proxy so the key
 * isn't exposed in the browser bundle.
 */

const ARBEITNOW_ENDPOINT = 'https://arbeitnow.com/api/job-board-api';

type ArbeitnowJob = {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
};

type ArbeitnowResponse = {
  data: ArbeitnowJob[];
};

// Minimal name → ISO code lookup for the countries this API most
// commonly returns. Extend as you notice new locations coming through.
const COUNTRY_CODES: Record<string, string> = {
  germany: 'DE',
  'united kingdom': 'GB',
  uk: 'GB',
  france: 'FR',
  netherlands: 'NL',
  spain: 'ES',
  portugal: 'PT',
  poland: 'PL',
  austria: 'AT',
  switzerland: 'CH',
  ireland: 'IE',
  italy: 'IT',
  belgium: 'BE',
  sweden: 'SE',
  denmark: 'DK',
  'united states': 'US',
  usa: 'US',
  canada: 'CA',
  australia: 'AU',
  india: 'IN',
  'czech republic': 'CZ',
  romania: 'RO',
  greece: 'GR',
  finland: 'FI',
  norway: 'NO',
};

function guessCountry(location: string): { country: string; countryCode: string } {
  const normalized = location.toLowerCase();

  for (const [name, code] of Object.entries(COUNTRY_CODES)) {
    if (normalized.includes(name)) {
      const label = name
        .split(' ')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' ');
      return { country: label === 'Uk' ? 'United Kingdom' : label, countryCode: code };
    }
  }

  return { country: location || 'Remote / Various', countryCode: '' };
}

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const hours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function normalize(raw: ArbeitnowJob): Job {
  const { country, countryCode } = guessCountry(raw.location);

  return {
    id: `arbeitnow-${raw.slug}`,
    title: raw.title,
    company: raw.company_name,
    country,
    countryCode,
    city: raw.remote ? 'Remote' : raw.location,
    type: raw.job_types?.[0] ?? 'Full time',
    remote: raw.remote,
    category: raw.tags?.[0] ?? 'General',
    source: 'Arbeitnow (live)',
    published: timeAgo(raw.created_at),
    postedDate: new Date(raw.created_at * 1000).toISOString(),
    sourceType: 'live_feed',
    url: raw.url,
    verified: false,
    eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
  };
}

/**
 * Fetches current listings from Arbeitnow and normalizes them into the
 * board's `Job` shape. Resolves to an empty array (rather than
 * throwing) on any network/parse failure so the board still renders
 * fine with curated listings if the live fetch fails.
 */
export async function fetchArbeitnowJobs(limit = 20): Promise<Job[]> {
  try {
    const res = await fetch(ARBEITNOW_ENDPOINT);
    if (!res.ok) return [];
    const body = (await res.json()) as ArbeitnowResponse;
    return (body.data ?? []).slice(0, limit).map(normalize);
  } catch {
    return [];
  }
}
