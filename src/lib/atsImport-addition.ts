// --- ADD THIS TO THE BOTTOM OF YOUR EXISTING src/lib/atsImport.ts ---
// (Keep everything already in that file — fetchGreenhouseJobs, sanitizeJobHtml,
// etc. — untouched. This just adds a new unified entry point on top.)

// Adjust this import to wherever your Supabase client is already
// initialized in this project (it's likely imported inside src/lib/admin.ts
// already — reuse that same client rather than creating a second one).
import { supabase } from '@/lib/supabaseClient';

export type FetchJobsResult =
  | {
      ok: true;
      jobs: { externalId: string; title: string; locationText: string; offices: string[]; descriptionHtml: string; url: string }[];
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
    return value.trim(); // wasn't a URL at all — treat as a bare token, same as today
  }
}

/**
 * Unified entry point for "Import jobs from an ATS". Accepts either:
 *   - a bare Greenhouse board token (e.g. "stripe") — exactly like before
 *   - a full Greenhouse URL (e.g. "https://boards.greenhouse.io/stripe")
 *   - a full careers page URL for a Phenom-powered site (e.g. Roche) —
 *     proxied through the import-ats-jobs edge function, since those
 *     sites don't allow direct cross-origin browser fetches.
 *
 * Greenhouse continues to be fetched directly from the browser (no change
 * to that path) — only the new, non-Greenhouse case goes through the
 * edge function.
 */
export async function fetchJobsFromCareersUrl(input: string): Promise<FetchJobsResult> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Enter a Greenhouse token or a careers page URL.' };

  const looksLikeUrl = /^https?:\/\//i.test(trimmed);

  // Bare token, or a Greenhouse URL -> existing direct-fetch path, unchanged.
  if (!looksLikeUrl || isGreenhouseUrl(trimmed)) {
    const token = looksLikeUrl ? extractGreenhouseToken(trimmed) : trimmed;
    return fetchGreenhouseJobs(token);
  }

  // Anything else -> proxy through the edge function (currently handles
  // Phenom People sites; extend the function itself to add more ATS types).
  const { data, error } = await supabase.functions.invoke('import-ats-jobs', {
    body: { url: trimmed },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error ?? 'Import failed.' };
  return { ok: true, jobs: data.jobs };
}
