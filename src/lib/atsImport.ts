import DOMPurify from 'dompurify';

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
    const jobs: FetchedJob[] = (data.jobs ?? []).map((j: Record<string, unknown>) => ({
      externalId: String(j.id),
      title: String(j.title ?? 'Untitled role'),
      locationText: String((j.location as { name?: string } | undefined)?.name ?? ''),
      offices: ((j.offices as { name?: string }[] | undefined) ?? []).map((o) => o.name ?? '').filter(Boolean),
      descriptionHtml: String(j.content ?? ''),
      url: String(j.absolute_url ?? ''),
      updatedAt: String(j.updated_at ?? ''),
    }));
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
export async function fetchJobsFromCareersUrl(input: string, from: number = 0): Promise<FetchJobsResult> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Enter a Greenhouse token or a careers page URL.' };

  const looksLikeUrl = /^https?:\/\//i.test(trimmed);

  if (!looksLikeUrl || isGreenhouseUrl(trimmed)) {
    const token = looksLikeUrl ? extractGreenhouseToken(trimmed) : trimmed;
    return fetchGreenhouseJobs(token); // Greenhouse's API always returns the full board in one shot — no paging needed.
  }

  const { data, error } = await supabase.functions.invoke('import-ats-jobs', {
    body: { url: trimmed, from },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'Import failed.' };
  return { ok: true, jobs: data.jobs, nextFrom: data.nextFrom ?? null, totalHits: data.totalHits ?? null };
}
