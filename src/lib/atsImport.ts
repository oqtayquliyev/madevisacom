import DOMPurify from 'dompurify';

// ---------------------------------------------------------------------------
// Junk pages — bot checks, "JavaScript is disabled", error pages
// ---------------------------------------------------------------------------

/** Phrases that only appear on bot-check / blocked / error pages, never in a real job. */
export const JUNK_PHRASES = [
  'javascript is disabled',
  'enable javascript',
  'javascript is required',
  'requires javascript',
  'please turn javascript on',
  'not a robot',
  'checking your browser',
  'verify you are human',
  'are you a human',
  'attention required',
  'access denied',
  'request unsuccessful',
];
const JUNK_RE = new RegExp(JUNK_PHRASES.map((p) => p.replace(/ /g, '\\s+')).join('|'), 'i');
/** Titles that are an error page's title, not a job. */
const JUNK_TITLE_RE = /^\s*(just a moment\.*|access denied|attention required.*|page not found|not found|40[134]\b.*|error|forbidden|security check|captcha|javascript is disabled)\s*$/i;

function plainText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True for "jobs" that are really a blocked page: the title is an error
 * title, or the title/short description is a bot-check message like
 * "JavaScript is disabled … verify that you're not a robot".
 * A long real description that happens to mention JavaScript is kept.
 */
export function isJunkJob(title: string | null | undefined, descriptionHtml?: string | null): boolean {
  const t = String(title ?? '');
  if (JUNK_TITLE_RE.test(t) || JUNK_RE.test(t)) return true;
  const text = plainText(descriptionHtml);
  return text.length > 0 && text.length < 600 && JUNK_RE.test(text);
}

export type FetchedJob = {
  externalId: string;
  title: string;
  locationText: string;
  offices: string[];
  descriptionHtml: string;
  url: string;
  updatedAt: string;
  /** Best-effort metadata — present for careers-page (Phenom) imports,
   * always undefined for Greenhouse (whose public API doesn't expose
   * these in a normalized way). Undefined/null means "not found",
   * rendered downstream as "Not specified" rather than guessed at. */
  category?: string | null;
  employmentTypeRaw?: string | null;
  postedAt?: string | null;
  remote?: boolean | null;
  salaryText?: string | null;
  /** 'onsite' | 'hybrid' | 'remote' when the source states it. */
  workArrangement?: 'onsite' | 'hybrid' | 'remote' | null;
};

/**
 * Greenhouse's public Job Board API — no auth required for GET.
 * https://developers.greenhouse.io/job-board.html
 *
 * `boardToken` is the slug in the company's own board URL, e.g. for
 * https://boards.greenhouse.io/stripe the token is "stripe".
 */
export async function fetchGreenhouseJobs(boardToken: string): Promise<{ ok: boolean; jobs: FetchedJob[]; error?: string }> {
  const token = boardToken.trim().toLowerCase();
  if (!token) return { ok: false, jobs: [], error: 'Enter a board token.' };

  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
    );
    if (!res.ok) {
      return { ok: false, jobs: [], error: `Greenhouse returned ${res.status} — check the board token.` };
    }
    const data = await res.json();
    const jobs: FetchedJob[] = (data.jobs ?? []).map((j: Record<string, unknown>) => {
      const offices = ((j.offices as { name?: string }[] | undefined) ?? []).map((o) => o.name ?? '').filter(Boolean);
      const locationText = String((j.location as { name?: string } | undefined)?.name ?? '');
      const metadata = (j.metadata as { name?: string; value?: unknown }[] | undefined) ?? [];
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
        updatedAt: String(j.updated_at ?? ''),
        // Greenhouse's real job-function signal — e.g. Stripe's own
        // page shows this exact value as "Team: Design". Distinct from
        // employmentTypeRaw below; see job_function vs category/
        // employment_type in src/lib/admin.ts for why they're kept
        // separate rather than colliding on one field.
        category: ((j.departments as { name?: string }[] | undefined) ?? [])[0]?.name ?? null,
        // Not a standard Greenhouse field — only present when a company
        // configured a custom posting field with a matching name, so
        // this is best-effort and frequently null, same as the Phenom
        // strategies' equivalent lookups.
        employmentTypeRaw: metaValue(/employment.?type|job.?type/i),
        // Greenhouse's public API has no "originally posted" date, only
        // "last updated" — the closest real signal available, and
        // better than showing nothing.
        postedAt: j.updated_at ? String(j.updated_at) : null,
        // A "Remote" entry among a job's offices is Greenhouse's own
        // way of marking a role as remote-eligible (as distinct from
        // its physical office locations) — more reliable than pattern-
        // matching the primary location name alone.
        remote: [locationText, ...offices].some((s) => /\bremote\b/i.test(s)) || null,
        salaryText: metaValue(/salary|pay.?range|compensation/i),
      };
    });
    return { ok: true, jobs };
  } catch (err) {
    return { ok: false, jobs: [], error: err instanceof Error ? err.message : 'Fetch failed.' };
  }
}

/**
 * Greenhouse's `content` field comes back with its angle brackets
 * HTML-entity-encoded (e.g. the literal text "&lt;h2&gt;", not a real
 * tag) — decoding entities is what turns that into real markup.
 * Decoding must happen BEFORE sanitizing, not after, or the entities
 * decode into literal "<h2>" *text* once tags have already been
 * stripped, which is the "raw tags showing up" bug.
 */
function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const ALLOWED_TAGS = ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'a', 'span'];

/**
 * Decodes + sanitizes a job description down to a small safe set of
 * formatting tags (headers, paragraphs, lists, bold/italic, links) —
 * enough to preserve "Who we are" / "What you'll do" style section
 * structure, with everything else (scripts, styles, inline handlers,
 * unknown tags) stripped. Safe to render with dangerouslySetInnerHTML.
 */
export function sanitizeJobHtml(rawHtml: string): string {
  const decoded = decodeEntities(rawHtml);
  return DOMPurify.sanitize(decoded, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
  });
}

/**
 * Re-checks HTML that's already been cleaned on the server (job-facts
 * function) before rendering — same allowed tags, no entity decoding, so
 * text like "&lt;b&gt;" stays text.
 */
export function purifyJobHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ['href'] });
}

/** Plain-text fallback (e.g. for meta descriptions or previews). */
export function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Generic (non-Greenhouse) careers-page import — e.g. Phenom People sites
// like Roche's, which don't allow direct cross-origin browser fetches the
// way Greenhouse's public API does. Proxied through the import-ats-jobs
// Supabase edge function.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase';

export type FetchJobsResult =
  | {
      ok: true;
      jobs: { externalId: string; title: string; locationText: string; offices: string[]; descriptionHtml: string; url: string; category?: string | null; employmentTypeRaw?: string | null; postedAt?: string | null; remote?: boolean | null; salaryText?: string | null }[];
      /** Present (non-null) when there are more jobs beyond this batch —
       * pass it back as `from` on the next call to continue. Null means
       * this source is fully exhausted (or doesn't support paging at
       * all, e.g. Greenhouse, which always returns everything in one
       * shot). */
      nextFrom?: number | null;
      totalHits?: number | null;
      /** Where the jobs actually came from (e.g. the Workday board a
       * landing page linked to) plus the detected strategy — pass both
       * back via `cont` on the next batch so it skips re-detection. */
      resolvedUrl?: string | null;
      strategy?: string | null;
      /** Human label of the detected platform, e.g. "Workday". */
      source?: string | null;
    }
  | { ok: false; error: string };

function isGreenhouseUrl(value: string): boolean {
  try {
    return new URL(value).hostname.includes('greenhouse.io');
  } catch {
    return false;
  }
}

function extractGreenhouseToken(value: string): string {
  try {
    const u = new URL(value);
    return u.pathname.split('/').filter(Boolean)[0] ?? value.trim();
  } catch {
    return value.trim(); // wasn't a URL at all — treat as a bare token
  }
}

/**
 * Entry point for the "Import jobs from a careers page" admin section.
 * Accepts either:
 *   - a bare Greenhouse board token (e.g. "stripe")
 *   - a full Greenhouse URL (e.g. "https://boards.greenhouse.io/stripe")
 *   - a full careers page URL for a Phenom-powered site (e.g. Roche) —
 *     proxied through the import-ats-jobs edge function.
 */
export async function fetchJobsFromCareersUrl(
  input: string,
  from: number = 0,
  cont?: { resolvedUrl?: string | null; strategy?: string | null }
): Promise<FetchJobsResult> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Enter a Greenhouse token or a careers page URL.' };

  const looksLikeUrl = /^https?:\/\//i.test(trimmed);

  if (!looksLikeUrl || isGreenhouseUrl(trimmed)) {
    const token = looksLikeUrl ? extractGreenhouseToken(trimmed) : trimmed;
    // Greenhouse's API always returns the full board in one shot — no paging needed.
    const gh = await fetchGreenhouseJobs(token);
    return gh.ok ? { ok: true, jobs: gh.jobs, nextFrom: null, source: 'Greenhouse' } : { ok: false, error: gh.error ?? 'Greenhouse import failed.' };
  }

  const { data, error } = await supabase.functions.invoke('import-ats-jobs', {
    body: {
      url: cont?.resolvedUrl || trimmed,
      from,
      ...(cont?.strategy ? { strategy: cont.strategy } : {}),
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'Import failed.' };
  return {
    ok: true,
    jobs: data.jobs,
    nextFrom: data.nextFrom ?? null,
    totalHits: data.totalHits ?? null,
    resolvedUrl: data.resolvedUrl ?? null,
    strategy: data.strategy ?? null,
    source: data.source ?? null,
  };
}

export type FetchedJobDetail = {
  title: string;
  descriptionHtml: string;
  locationText: string;
  offices: string[];
  category?: string | null;
  employmentTypeRaw?: string | null;
  postedAt?: string | null;
  remote?: boolean | null;
  salaryText?: string | null;
};

/** Re-reads one job's own page (full description + side-column facts) through the import-ats-jobs edge function. */
export async function fetchJobDetail(url: string): Promise<{ ok: true; job: FetchedJobDetail } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('import-ats-jobs', { body: { url, mode: 'detail' } });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok || !data.job) return { ok: false, error: data?.error ?? 'Could not read that page.' };
  return { ok: true, job: data.job as FetchedJobDetail };
}
