// Admin → "Find new companies". The searching happens in the
// company-finder Supabase function; this file calls it, proves each
// career page with the real importer, and adds the chosen companies.
// Existing companies are never changed — they're only used to skip
// duplicates.

import { supabase } from '@/lib/supabase';
import { fetchGreenhouseJobs, fetchJobsFromCareersUrl } from '@/lib/atsImport';
import { registerImportSource, type ImportSource } from '@/lib/importSync';

export type FoundCompany = {
  qid: string;
  name: string;
  wikiTitle: string | null;
  website: string;
  domain: string;
  employees: number | null;
  industry: string | null;
  country: string | null;
};

export type CareerCandidate = {
  kind: 'greenhouse' | 'careers_url';
  url: string;
  token?: string;
  platform: string | null;
  evidence: 'website' | 'name' | 'guess';
  jobs: number | null;
};

export type Confidence = 'high' | 'medium' | 'low';

export type ProvenSource = {
  kind: 'greenhouse' | 'careers_url';
  url: string;
  token?: string;
  platform: string | null;
  jobs: number;
  /** More jobs exist beyond the first page the importer read. */
  more: boolean;
  resolvedUrl?: string | null;
  strategy?: string | null;
  confidence: Confidence;
};

export const WAVES: { label: string; countries: { code: string; name: string; flag: string }[] }[] = [
  {
    label: 'Wave 1',
    countries: [
      { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
      { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
      { code: 'DE', name: 'Germany', flag: '🇩🇪' },
      { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
    ],
  },
  {
    label: 'Wave 2',
    countries: [
      { code: 'CA', name: 'Canada', flag: '🇨🇦' },
      { code: 'US', name: 'United States', flag: '🇺🇸' },
      { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    ],
  },
  {
    label: 'Wave 3',
    countries: [
      { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
      { code: 'NO', name: 'Norway', flag: '🇳🇴' },
      { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
      { code: 'FI', name: 'Finland', flag: '🇫🇮' },
      { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
      { code: 'AT', name: 'Austria', flag: '🇦🇹' },
      { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
      { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' },
      { code: 'FR', name: 'France', flag: '🇫🇷' },
      { code: 'ES', name: 'Spain', flag: '🇪🇸' },
      { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
      { code: 'IT', name: 'Italy', flag: '🇮🇹' },
      { code: 'PL', name: 'Poland', flag: '🇵🇱' },
      { code: 'CZ', name: 'Czechia', flag: '🇨🇿' },
    ],
  },
  {
    label: 'Wave 4',
    countries: [
      { code: 'AE', name: 'UAE', flag: '🇦🇪' },
      { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
      { code: 'JP', name: 'Japan', flag: '🇯🇵' },
      { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
    ],
  },
];

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('company-finder', { body });
  if (error) {
    if (/Failed to send a request/i.test(error.message)) throw new Error('The company-finder function isn’t deployed yet.');
    // The function explains what went wrong in its reply — show that, not "non-2xx status code".
    const res = (error as { context?: Response }).context;
    let detail: string | null = null;
    try {
      const j = res && typeof res.json === 'function' ? await res.clone().json() : null;
      detail = j?.error ?? null;
    } catch {
      /* not JSON */
    }
    const status = res?.status;
    if (detail) throw new Error(detail);
    if (status === 546 || status === 504) throw new Error('That took too long (the search is limited to about 2 minutes). Try again, or use fewer companies.');
    throw new Error(status ? `company-finder answered ${status}. Try again in a minute.` : error.message);
  }
  if (!data?.ok) throw new Error(data?.error ?? 'company-finder failed');
  return data as T;
}

export type RankedCompany = { qid: string; employees: number | null };

/** Every company in the country with a website, biggest first (ids only). */
export const listCountryCompanies = (country: string) => call<{ companies: RankedCompany[] }>({ action: 'list', country }).then((r) => r.companies);

/** Names, websites and details for up to 100 of those ids. */
export const companyDetails = (qids: string[]) => call<{ companies: FoundCompany[] }>({ action: 'details', qids }).then((r) => r.companies);

export const findTopCompanies = (country: string, limit: number, offset: number) =>
  call<{ companies: FoundCompany[] }>({ action: 'top', country, limit, offset }).then((r) => r.companies);

export const lookupCompanies = (names: string[]) =>
  call<{ results: { query: string; match: FoundCompany | null }[] }>({ action: 'lookup', names }).then((r) => r.results);

export const probeCompany = (name: string, website: string, deep = false) =>
  call<{ domain: string; websiteReachable: boolean; candidates: CareerCandidate[]; icons: string[] }>({ action: 'probe', name, website, deep });

export const makeCompanyLogo = (icons: string[], name: string) => call<{ logoUrl: string | null }>({ action: 'logo', icons, name }).then((r) => r.logoUrl);

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);

/**
 * Tries candidates in order (company's own website first) and returns the
 * first one the real importer reads jobs from. Nothing is "found" unless
 * it produced at least one job.
 */
export async function proveCareerSource(candidates: CareerCandidate[], onTry?: (c: CareerCandidate) => void): Promise<ProvenSource | null> {
  for (const c of candidates) {
    onTry?.(c);
    const confidence: Confidence = c.evidence === 'website' ? 'high' : c.evidence === 'name' ? 'medium' : 'low';
    if (c.kind === 'greenhouse' && c.token) {
      const gh = await withTimeout(fetchGreenhouseJobs(c.token), 30_000, { ok: false, jobs: [] });
      if (gh.ok && gh.jobs.length) return { kind: 'greenhouse', url: c.url, token: c.token, platform: 'Greenhouse', jobs: gh.jobs.length, more: false, confidence };
      continue;
    }
    const res = await withTimeout(fetchJobsFromCareersUrl(c.url), 90_000, { ok: false as const, error: 'timeout' });
    if (res.ok && res.jobs.length) {
      const jobs = Math.max(res.jobs.length, res.totalHits ?? 0);
      // A handful of links scraped from a page (not a real job board) is
      // often not the company's full list — leave it unticked to check.
      const weak = jobs < 5 && /job links|sitemap|generic/i.test(`${res.source ?? ''} ${res.strategy ?? ''}`);
      return {
        kind: 'careers_url',
        url: c.url,
        platform: res.source ?? c.platform,
        jobs,
        more: res.nextFrom != null,
        resolvedUrl: res.resolvedUrl ?? null,
        strategy: res.strategy ?? null,
        confidence: weak ? 'low' : confidence,
      };
    }
  }
  return null;
}

/** "Deutsche Bank AG" → "deutsche bank" — same rules as the server, for spotting duplicates. */
export function coreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/(^|\s)(n\.\s?v|b\.\s?v|s\.\s?a|s\.\s?e|a\.\s?g|p\.\s?l\.\s?c|s\.\s?p\.\s?a|k\.\s?k)\.?(?=\s|,|$)/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|ag|se|sa|nv|bv|gmbh|kg|kgaa|mbh|spa|ab|asa|as|oyj|oy|group|holding|holdings|international|the)\b\.?/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

/** Creates the company (never touches existing ones) and saves its proven source. */
export async function addFoundCompany(
  c: { name: string; website: string; countryId: string | null; logoUrl: string | null },
  src: ProvenSource
): Promise<{ ok: true; source: ImportSource } | { ok: false; error: string }> {
  const { data: pub, error } = await supabase
    .from('program_publishers')
    .insert({
      owner_id: null,
      org_type: 'company',
      name: c.name.trim(),
      website: c.website,
      logo_url: c.logoUrl,
      country_id: c.countryId,
      verification_status: 'verified',
      contact_email: 'hello@madevisa.com',
    })
    .select('id')
    .single();
  if (error || !pub) return { ok: false, error: error?.message ?? 'Could not create the company.' };
  const sourceUrl = src.kind === 'greenhouse' ? src.token! : src.url;
  const reg = await registerImportSource({
    publisherId: pub.id,
    kind: src.kind,
    sourceUrl,
    resolvedUrl: src.resolvedUrl ?? null,
    strategy: src.strategy ?? null,
    platform: src.platform,
  });
  if (!reg.ok || !reg.id) return { ok: false, error: reg.error ?? 'Could not save the career page.' };
  return {
    ok: true,
    source: {
      id: reg.id,
      publisher_id: pub.id,
      kind: src.kind,
      source_url: sourceUrl,
      resolved_url: src.resolvedUrl ?? null,
      strategy: src.strategy ?? null,
      detected_platform: src.platform,
      auto_publish: false,
      last_synced_at: null,
      last_sync_status: null,
      last_sync_summary: null,
      created_at: new Date().toISOString(),
      publisher: { id: pub.id, name: c.name.trim(), logo_url: c.logoUrl },
    },
  };
}
