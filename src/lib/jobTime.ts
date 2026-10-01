// How old a job is — honest about where the date comes from.
//
// A job has two dates:
//   - source date: when the company published it on its own careers page
//     (sponsored_jobs.source_posted_at) — only when the source shows one;
//   - synced date: when MadeVisa picked it up (approved_at / created_at).
//
// Rules:
//   1. Source date is TODAY → "12 min ago" / "3 hours ago". The job really
//      is brand new, so the minutes since it reached MadeVisa are fair
//      (or the source's own time, when it gives a time of day).
//   2. Source date is older → that date ("1 day ago", "28/09/2026") —
//      never "x min ago" just because the sync ran a moment ago.
//   3. No date on the source → the day MadeVisa added it: "Added today",
//      "Added yesterday", "Added 28/09/2026" — never minutes/hours, since
//      we don't know when the company really posted it.

export type JobTimeTier = 'fresh' | 'recent' | 'older' | 'added';

export type JobTime = {
  /** Short text for badges: "12 min ago", "1 day ago", "28/09/2026", "Added today". */
  text: string;
  /** Longer words for sentences: "12 minutes ago", "3 days ago", "2 weeks ago", "today". */
  words: string;
  tier: JobTimeTier;
  /** The date shown comes from the company's own careers page. */
  fromSource: boolean;
  /** Published on the source today — the only case that counts as "new" / early applicant. */
  postedToday: boolean;
  /** The moment the text is based on (ISO). */
  iso: string;
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** Stored as a bare date ("2026-10-01" → midnight UTC): the source gave no time of day. */
function isDateOnly(iso: string | null | undefined, t: number): boolean {
  if (!iso) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return true;
  const d = new Date(t);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/** Calendar day number — a bare date is read as that date wherever the visitor is. */
function dayNumber(t: number, dateOnly: boolean): number {
  const d = new Date(t);
  return dateOnly
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY
    : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
}

function shortDate(t: number, dateOnly: boolean): string {
  const d = new Date(t);
  const day = dateOnly ? d.getUTCDate() : d.getDate();
  const month = (dateOnly ? d.getUTCMonth() : d.getMonth()) + 1;
  const year = dateOnly ? d.getUTCFullYear() : d.getFullYear();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function sinceWords(diffMs: number): { text: string; words: string } {
  const mins = Math.max(1, Math.floor(diffMs / MIN));
  if (diffMs < 2 * MIN) return { text: 'Just now', words: 'just now' };
  if (diffMs < HOUR) return { text: `${mins} min ago`, words: `${mins} minutes ago` };
  const h = Math.floor(diffMs / HOUR);
  const hours = `${h} hour${h === 1 ? '' : 's'} ago`;
  return { text: hours, words: hours };
}

function daysWords(days: number): string {
  if (days <= 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 35) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * @param sourcePostedAt the date on the company's careers page (null when it shows none)
 * @param syncedAt       when the job went live on MadeVisa
 */
export function jobTime(sourcePostedAt: string | null | undefined, syncedAt: string | null | undefined, now = Date.now()): JobTime | null {
  let src = ms(sourcePostedAt);
  const synced = ms(syncedAt);
  const today = dayNumber(now, false);

  if (Number.isFinite(src)) {
    if (src > now) src = now; // future-dated source (time zones / bad data) → treat as now
    const dateOnly = isDateOnly(sourcePostedAt, src);
    const srcDay = dayNumber(src, dateOnly);

    // 1. Published on the source today.
    if (srcDay >= today) {
      // A bare date has no time of day — use the moment it reached MadeVisa (if that was today too).
      let base = src;
      if (dateOnly) base = Number.isFinite(synced) && synced <= now && dayNumber(synced, false) === today ? synced : now;
      const w = sinceWords(now - base);
      return { ...w, tier: 'fresh', fromSource: true, postedToday: true, iso: new Date(base).toISOString() };
    }

    // 2. Published on the source on an earlier day — that day, not the sync time.
    const days = Math.max(1, today - srcDay);
    const words = daysWords(days);
    return {
      text: days <= 1 ? '1 day ago' : shortDate(src, dateOnly),
      words,
      tier: days <= 1 ? 'recent' : 'older',
      fromSource: true,
      postedToday: false,
      iso: new Date(src).toISOString(),
    };
  }

  // 3. The source shows no date — the day MadeVisa added it, nothing finer.
  if (Number.isFinite(synced)) {
    const days = Math.max(0, today - dayNumber(Math.min(synced, now), false));
    const text = days === 0 ? 'Added today' : days === 1 ? 'Added yesterday' : `Added ${shortDate(synced, false)}`;
    const words = days === 0 ? 'today' : days === 1 ? 'yesterday' : `on ${shortDate(synced, false)}`;
    return { text, words, tier: days <= 1 ? 'added' : 'older', fromSource: false, postedToday: false, iso: new Date(synced).toISOString() };
  }
  return null;
}

type BoardJobDates = {
  sourcePostedAt?: string | null;
  postedDate?: string | null;
  sharedAt?: string | null;
  sourceType?: 'company_submitted' | 'company_careers' | 'live_feed';
};

/**
 * The two dates of a board job. A job the company posted on MadeVisa
 * itself was published the moment it went live here, so that IS its
 * source date; live-feed jobs carry the feed's own date.
 */
export function boardJobDates(job: BoardJobDates): { source: string | null; synced: string | null } {
  const synced = job.sharedAt ?? job.postedDate ?? null;
  const source =
    job.sourceType === 'company_submitted' ? synced : job.sourceType === 'live_feed' ? job.postedDate ?? null : job.sourcePostedAt ?? null;
  return { source, synced };
}

export function boardJobTime(job: BoardJobDates, now = Date.now()): JobTime | null {
  const { source, synced } = boardJobDates(job);
  return jobTime(source, synced, now);
}
