// Helpers for the auto-pipeline function. Ported from the website code so a
// server sync behaves exactly like "Update all jobs" in the admin panel:
//   src/lib/atsImport.ts   → fetchGreenhouseJobs, isJunkJob
//   src/lib/admin.ts       → normalizeJobUrl, importJobToRow, isTooOldToImport
//   src/lib/importSync.ts  → fetchWholeSource (with a time/batch cap)
// The detector and the country resolver are the job-facts function's own
// files, imported directly — one copy of that logic.

// deno-lint-ignore-file no-explicit-any
import { detectJobFacts, cleanJobDescriptionHtml, stripPageChrome, isPlaceholderValue, splitSourceLocation } from '../job-facts/detector.ts';
import { sanitizeJobHtml } from '../job-facts/sanitize.ts';
import { createPlaceResolver } from '../job-facts/placeResolver.ts';
import { allCountries } from '../job-facts/countries.ts';

export type Service = any;

/** Must match FACTS_VERSION in job-facts/index.ts and src/lib/jobFactsClient.ts. */
export const FACTS_VERSION = 3;
const MAX_DESCRIPTION_HTML = 100_000;

export type Facts = ReturnType<typeof detectJobFacts>;
export type FactsPayload = { v: number; facts: Facts; html: string; contact: Record<string, string> };

/** Same as analyse() in job-facts/index.ts. */
export function analyse(title: string, rawDescription: string | null): FactsPayload {
  try {
    const description = rawDescription && rawDescription.length > MAX_DESCRIPTION_HTML ? rawDescription.slice(0, MAX_DESCRIPTION_HTML) : rawDescription;
    const base = description ? stripPageChrome(sanitizeJobHtml(description), title) : '';
    const facts = detectJobFacts(base || description, title);
    const cleaned = base ? cleanJobDescriptionHtml(base, title) : { html: '', contact: {} };
    return { v: FACTS_VERSION, facts, html: cleaned.html, contact: cleaned.contact as Record<string, string> };
  } catch {
    return { v: FACTS_VERSION, facts: detectJobFacts(null, title), html: rawDescription ?? '', contact: {} };
  }
}

export { sanitizeJobHtml };

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

export function plainText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const JUNK_PHRASES = [
  'javascript is disabled', 'enable javascript', 'javascript is required', 'requires javascript', 'please turn javascript on',
  'not a robot', 'checking your browser', 'verify you are human', 'are you a human', 'attention required', 'access denied', 'request unsuccessful',
];
const JUNK_RE = new RegExp(JUNK_PHRASES.map((p) => p.replace(/ /g, '\\s+')).join('|'), 'i');
const JUNK_TITLE_RE = /^\s*(just a moment\.*|access denied|attention required.*|page not found|not found|40[134]\b.*|error|forbidden|security check|captcha|javascript is disabled)\s*$/i;

/** Bot-check / error pages that aren't jobs (same rule as the website). */
export function isJunkJob(title: string | null | undefined, descriptionHtml?: string | null): boolean {
  const t = String(title ?? '');
  if (JUNK_TITLE_RE.test(t) || JUNK_RE.test(t)) return true;
  const text = plainText(descriptionHtml);
  return text.length > 0 && text.length < 600 && JUNK_RE.test(text);
}

export function normalizeJobUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return raw.trim().replace(/\/+$/, '');
  }
}

export const DAY_MS = 86_400_000;
export const MAX_JOB_AGE_DAYS = 30;

export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isTooOld(postedIso: string | null | undefined, days = MAX_JOB_AGE_DAYS): boolean {
  if (!postedIso) return false;
  const t = Date.parse(postedIso);
  return Number.isFinite(t) && Date.now() - t > days * DAY_MS;
}

const isMeaningfulSalary = (t: string | null | undefined) => {
  const v = (t ?? '').trim();
  return Boolean(v) && v !== '[object Object]' && !/^(n\/?a|none|null|undefined|tbd|-+|—)$/i.test(v) && /[1-9]/.test(v);
};

const JOB_CATEGORIES = ['Full time', 'Part time', 'Internship', 'Seasonal work', 'Contract / Freelance', 'Volunteer', 'Apprenticeship', 'Sponsored job', 'Other'];

function normalizeJobCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const s = raw.toLowerCase();
  if (s.includes('intern')) return 'Internship';
  if (s.includes('apprentice')) return 'Apprenticeship';
  if (s.includes('volunteer')) return 'Volunteer';
  if (s.includes('season')) return 'Seasonal work';
  if (s.includes('contract') || s.includes('freelance') || s.includes('temp')) return 'Contract / Freelance';
  if (s.includes('part')) return 'Part time';
  if (s.includes('full')) return 'Full time';
  return JOB_CATEGORIES.includes(raw) ? raw : 'Other';
}

const resolvePlace = createPlaceResolver(allCountries);

/** One clear country from the office list → its code; several / none → null ("Various"). */
function countryCodeFromOffices(offices: string[] | undefined, locationText: string | undefined): string | null {
  const candidates = offices && offices.length ? offices : locationText ? [locationText] : [];
  const found = new Set<string>();
  for (const o of candidates) {
    const hit = resolvePlace(o);
    if (hit) found.add(hit.code);
  }
  return found.size === 1 ? [...found][0] : null;
}

// ---------------------------------------------------------------------------
// Fetched job → sponsored_jobs row (same as importJobToRow in src/lib/admin.ts)
// ---------------------------------------------------------------------------

export type SourceJob = {
  externalId: string;
  title: string;
  locationText: string;
  offices: string[];
  descriptionHtml: string;
  url: string;
  category?: string | null;
  employmentTypeRaw?: string | null;
  postedAt?: string | null;
  remote?: boolean | null;
  salaryText?: string | null;
  workArrangement?: 'onsite' | 'hybrid' | 'remote' | null;
};

export function jobToRow(
  j: SourceJob,
  description: string,
  payload: FactsPayload,
  opts: { publisherId: string; importSourceId: string; status: 'published' | 'pending'; countryIdByIso: Map<string, string> }
): Record<string, unknown> {
  const facts = payload.facts;
  const category = normalizeJobCategory(j.employmentTypeRaw || facts.employmentType);
  const arrangement = j.workArrangement ?? facts.workArrangement;
  const salaryText = [j.salaryText, facts.compensation].find((v) => isMeaningfulSalary(v)) ?? null;
  const srcLoc = splitSourceLocation(facts.location);
  const listedCity = (j.offices?.[0] ?? j.locationText)?.split(',')[0]?.trim() || null;
  const code = countryCodeFromOffices(j.offices, j.locationText) ?? srcLoc?.countryCode ?? null;
  return {
    publisher_id: opts.publisherId,
    title: j.title,
    description,
    category,
    employment_type: category,
    job_function: (!isPlaceholderValue(j.category) ? j.category : null) ?? facts.department,
    remote: j.remote ?? arrangement === 'remote',
    country_id: code ? opts.countryIdByIso.get(code) ?? null : null,
    city: (!isPlaceholderValue(listedCity) ? listedCity : null) ?? srcLoc?.city ?? null,
    official_url: j.url,
    additional_locations: j.offices && j.offices.length > 1 ? j.offices : null,
    contact_email: 'hello@madevisa.com',
    status: opts.status,
    source_posted_at: parseDate(j.postedAt) ?? facts.postedAt,
    origin: 'imported',
    import_source_id: opts.importSourceId,
    external_id: j.externalId ? String(j.externalId) : null,
    last_seen_at: new Date().toISOString(),
    experience_level: facts.experience,
    visa_sponsorship: facts.visa === 'offered',
    work_arrangement: arrangement,
    visa_status: facts.visa,
    compensation_text: salaryText || null,
    salary_status: salaryText ? 'disclosed' : 'not_disclosed',
    facts: payload,
  };
}

// ---------------------------------------------------------------------------
// Reading career sources
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Greenhouse's public board API (same mapping as src/lib/atsImport.ts). */
export async function fetchGreenhouse(boardToken: string): Promise<{ ok: true; jobs: SourceJob[] } | { ok: false; error: string }> {
  const token = boardToken.trim().toLowerCase();
  if (!token) return { ok: false, error: 'No board token.' };
  const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, {}, 45_000);
  if (!res) return { ok: false, error: 'Greenhouse didn’t answer.' };
  if (!res.ok) return { ok: false, error: `Greenhouse returned ${res.status}.` };
  const data = await res.json().catch(() => null);
  if (!data) return { ok: false, error: 'Greenhouse sent something unreadable.' };
  const jobs: SourceJob[] = ((data.jobs ?? []) as Record<string, any>[]).map((j) => {
    const offices = ((j.offices ?? []) as { name?: string }[]).map((o) => o.name ?? '').filter(Boolean);
    const locationText = String(j.location?.name ?? '');
    const metadata = (j.metadata ?? []) as { name?: string; value?: unknown }[];
    const metaValue = (pattern: RegExp): string | null => {
      const field = metadata.find((m) => m.name && pattern.test(m.name));
      return field?.value != null && field.value !== '' ? String(field.value) : null;
    };
    return {
      externalId: String(j.id),
      title: String(j.title ?? 'Untitled role'),
      locationText,
      offices,
      descriptionHtml: String(j.content ?? ''),
      url: String(j.absolute_url ?? ''),
      category: ((j.departments ?? []) as { name?: string }[])[0]?.name ?? null,
      employmentTypeRaw: metaValue(/employment.?type|job.?type/i),
      postedAt: j.updated_at ? String(j.updated_at) : null,
      remote: [locationText, ...offices].some((s) => /\bremote\b/i.test(s)) || null,
      salaryText: metaValue(/salary|pay.?range|compensation/i),
    };
  });
  return { ok: true, jobs };
}

let secretCache: string | null = null;
export async function pipelineSecret(service: Service): Promise<string | null> {
  if (secretCache) return secretCache;
  const { data } = await service.from('app_secrets').select('value').eq('name', 'cron_secret').maybeSingle();
  secretCache = (data as { value?: string } | null)?.value ?? null;
  return secretCache;
}

/** One call to the import-ats-jobs function (the careers-page reader). */
export async function callImporter(service: Service, body: Record<string, unknown>, timeoutMs = 125_000): Promise<any> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/import-ats-jobs`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const secret = await pipelineSecret(service);
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key, 'x-madevisa-cron': secret ?? '' },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  if (!res) return { ok: false, error: 'The careers-page reader didn’t answer in time.' };
  const data = await res.json().catch(() => null);
  if (!data) return { ok: false, error: `The careers-page reader answered ${res.status}.` };
  return data;
}

export type FetchedSource =
  | { ok: true; jobs: SourceJob[]; complete: boolean; resolvedUrl?: string | null; strategy?: string | null; platform?: string | null }
  | { ok: false; error: string };

/**
 * All jobs of a source — like fetchWholeSource in src/lib/importSync.ts,
 * but capped (batches + time) so one huge careers site can't hold up the
 * pipeline. complete = false → the caller must not remove anything.
 */
export async function fetchSource(
  service: Service,
  src: { kind: string; source_url: string; resolved_url: string | null; strategy: string | null },
  limits: { maxBatches: number; deadline: number }
): Promise<FetchedSource> {
  const looksLikeUrl = /^https?:\/\//i.test(src.source_url.trim());
  const isGreenhouse = src.kind === 'greenhouse' || !looksLikeUrl || /greenhouse\.io/i.test(src.source_url);
  if (isGreenhouse) {
    let token = src.source_url.trim();
    if (looksLikeUrl) {
      try {
        token = new URL(token).pathname.split('/').filter(Boolean)[0] ?? token;
      } catch {
        /* keep */
      }
    }
    const gh = await fetchGreenhouse(token);
    if (!gh.ok) return gh;
    return { ok: true, jobs: gh.jobs.filter((j) => !isJunkJob(j.title, j.descriptionHtml)), complete: true, platform: 'Greenhouse' };
  }

  const all: SourceJob[] = [];
  const seen = new Set<string>();
  let from = 0;
  let cont: { resolvedUrl?: string | null; strategy?: string | null } | undefined = src.strategy ? { resolvedUrl: src.resolved_url, strategy: src.strategy } : undefined;
  let retriedFresh = !cont;
  let platform: string | null = null;
  let emptyBatches = 0;
  for (let batch = 0; batch < limits.maxBatches; batch++) {
    if (Date.now() > limits.deadline) return { ok: true, jobs: all, complete: false, resolvedUrl: cont?.resolvedUrl ?? null, strategy: cont?.strategy ?? null, platform };
    const res = await callImporter(service, { url: cont?.resolvedUrl || src.source_url.trim(), from, ...(cont?.strategy ? { strategy: cont.strategy } : {}) });
    if (!res?.ok) {
      if (!retriedFresh && batch === 0) {
        retriedFresh = true;
        cont = undefined;
        batch = -1;
        continue;
      }
      if (all.length) return { ok: true, jobs: all, complete: false, resolvedUrl: cont?.resolvedUrl ?? null, strategy: cont?.strategy ?? null, platform };
      return { ok: false, error: String(res?.error ?? 'Import failed.') };
    }
    if (res.strategy) cont = { resolvedUrl: res.resolvedUrl, strategy: res.strategy };
    if (res.source) platform = res.source;
    let fresh = 0;
    for (const j of (res.jobs ?? []) as SourceJob[]) {
      if (isJunkJob(j.title, j.descriptionHtml)) continue;
      const key = j.externalId || normalizeJobUrl(j.url);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(j);
      fresh++;
    }
    const done = { ok: true as const, jobs: all, complete: true, resolvedUrl: cont?.resolvedUrl ?? null, strategy: cont?.strategy ?? null, platform };
    if (!res.nextFrom) return done;
    emptyBatches = fresh === 0 ? emptyBatches + 1 : 0;
    if (emptyBatches >= 2 || res.nextFrom <= from) return done;
    from = res.nextFrom;
  }
  return { ok: true, jobs: all, complete: false, resolvedUrl: cont?.resolvedUrl ?? null, strategy: cont?.strategy ?? null, platform };
}

let countryCache: { byIso: Map<string, string>; at: number } | null = null;
export async function countryIds(service: Service): Promise<Map<string, string>> {
  if (countryCache && Date.now() - countryCache.at < 60 * 60_000) return countryCache.byIso;
  const { data } = await service.from('countries').select('id, iso_code');
  const byIso = new Map(((data ?? []) as { id: string; iso_code: string }[]).map((c) => [c.iso_code, c.id]));
  countryCache = { byIso, at: Date.now() };
  return byIso;
}

/** Every row of a query, 1,000 at a time. */
export async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, cap = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
