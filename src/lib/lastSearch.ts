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
