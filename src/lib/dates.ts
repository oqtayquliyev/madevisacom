/** Short display date ("Jan 12, 2026"), or a clear fallback when the input isn't a real date — used wherever a possibly-missing date (e.g. a job's scraped posting date) needs to say "Not specified" rather than being silently hidden or showing "Invalid Date". */
export function formatShortDate(iso: string | null | undefined, fallback = 'Not specified'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * LinkedIn-style relative posting time ("3 weeks ago", "2 months ago",
 * "18 hours ago") — used wherever a job's posted date is shown (landing
 * page cards, the Jobs list, and the job detail page), so the format is
 * identical everywhere rather than each surface inventing its own.
 * Granularity matches LinkedIn's own buckets: minutes/hours within the
 * first day, days within the first week, weeks within the first month,
 * then months, then years.
 */
export function formatRelativeTime(iso: string | null | undefined, fallback = 'Not specified'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatShortDate(iso, fallback); // future-dated (clock skew, bad source data) — just show the date rather than a nonsensical "in the future" relative string

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
