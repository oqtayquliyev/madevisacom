// The visitor's last job search on this device — what they typed on /jobs, or
// the job title they gave on /cv-match — and how many jobs matched it. The
// paywall's headline uses it: "1,240 more hotel jobs". Nothing leaves the
// browser; a stale or missing search just means a general headline.

const KEY = 'mv:lastSearch';
const MAX_AGE_MS = 30 * 86_400_000;

export type LastSearch = { q: string; n: number; at: number };

/** Remember a search the visitor typed (ignored when empty or nothing matched). */
export function rememberSearch(q: string, n: number): void {
  const clean = q.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (clean.length < 2 || !Number.isFinite(n) || n < 1) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ q: clean, n: Math.round(n), at: Date.now() } satisfies LastSearch));
  } catch {
    /* private mode: the paywall uses its general headline */
  }
}

export function readLastSearch(): LastSearch | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as LastSearch | null;
    if (!v || typeof v.q !== 'string' || typeof v.n !== 'number' || Date.now() - (v.at ?? 0) > MAX_AGE_MS) return null;
    return v;
  } catch {
    return null;
  }
}

/** "1,240 more hotel jobs" from a search, else "12,400 more jobs" from the site's live count, else null. */
export function moreJobsHeadline(last: LastSearch | null, liveJobs: number | null | undefined): string | null {
  const fmt = (n: number) => n.toLocaleString('en-US');
  if (last && last.n > 1) {
    const words = last.q.toLowerCase().replace(/\bjobs?$/, '').trim();
    return `${fmt(last.n - 1)} more ${words} ${last.n - 1 === 1 ? 'job' : 'jobs'}`;
  }
  if (liveJobs && liveJobs > 1) return `${fmt(liveJobs - 1)} more jobs`;
  return null;
}

/**
 * The popup headline for a specific job: "2,431 more engineering jobs" from the job's own field
 * (same classifier and daily counts as /jobs). The visitor's last search only when this job
 * actually fits it ("graphic designer" → a Graphic Designer job), so the headline never
 * talks about one field while the visitor looks at another. Else the site's live count.
 */
export function headlineForJob(
  job: { title: string },
  field: { label: string; n: number } | null,
  last: LastSearch | null,
  liveJobs: number | null | undefined,
): string | null {
  const fmt = (n: number) => n.toLocaleString('en-US');
  const words = (last?.q ?? '').toLowerCase().replace(/\bjobs?$/, '').split(/\s+/).filter((w) => w.length > 2);
  const title = job.title.toLowerCase();
  if (last && last.n > 1 && words.length && words.every((w) => title.includes(w))) return moreJobsHeadline(last, liveJobs);
  if (field && field.n > 1) return `${fmt(field.n - 1)} more ${field.label.toLowerCase().replace(/\bjobs?$/, '').trim()} jobs`;
  return moreJobsHeadline(null, liveJobs);
}

// ---------------------------------------------------------------------------
// Recent searches on /jobs (this device only): offered as one-tap chips above the list.

const RECENT_KEY = 'mv:recentSearches';
export type RecentSearch = { q: string; country: string | null; at: number };

export function rememberRecent(q: string, country: string | null): void {
  const clean = q.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (clean.length < 2) return;
  try {
    const list = readRecent().filter((r) => !(r.q.toLowerCase() === clean.toLowerCase() && r.country === country));
    list.unshift({ q: clean, country, at: Date.now() });
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* private mode */
  }
  // Searches this visit (the launch-offer card shows after a few: OfferNudge.tsx).
  try {
    const n = Number(window.sessionStorage.getItem(SEARCHES_KEY) ?? '0') + 1;
    window.sessionStorage.setItem(SEARCHES_KEY, String(n));
    window.dispatchEvent(new CustomEvent('mv:search', { detail: n }));
  } catch {
    /* private mode */
  }
}

/** How many searches this visit. */
export const SEARCHES_KEY = 'madevisa:searchesThisVisit';
export function searchesThisVisit(): number {
  try {
    return Number(window.sessionStorage.getItem(SEARCHES_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

export function readRecent(): RecentSearch[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as RecentSearch[];
    return Array.isArray(v) ? v.filter((r) => r && typeof r.q === 'string' && Date.now() - (r.at ?? 0) < MAX_AGE_MS).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function forgetRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
