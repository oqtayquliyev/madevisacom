/**
 * Public URLs for job detail pages.
 *
 * Public format:  /jobs/<company-slug>/<title-slug>-<shortId>
 *   e.g.          /jobs/chime/software-engineer-support-foundations-900ca000
 *
 * The internal id (`sponsored-<uuid>`) is unchanged everywhere else in the
 * app (saved jobs, viewed jobs, admin). Only the public URL changed, so the
 * internal "sponsored" classification no longer leaks into links.
 *
 * `<shortId>` is the first 8 hex characters of the job's UUID. It is kept
 * because many companies post several jobs with the exact same title
 * (e.g. "Senior Software Engineer" in two offices), so company + title
 * alone can't identify one job reliably.
 *
 * Legacy URLs (/jobs/sponsored-<uuid>) keep working: JobDetailPage loads
 * the job and swaps the address bar to the new URL, and the canonical tag
 * always points at the new URL.
 */

const SPONSORED_PREFIX = 'sponsored-';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function slugify(input: string, maxLength = 80): string {
  const slug = (input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, '') || slug.slice(0, maxLength);
}

/** Builds the public path for a job. Accepts the board `Job` id (`sponsored-<uuid>`). */
export function jobPath(job: { id: string; title: string; company: string }): string {
  if (job.id.startsWith(SPONSORED_PREFIX)) {
    const uuid = job.id.slice(SPONSORED_PREFIX.length);
    const company = slugify(job.company) || 'company';
    const title = slugify(job.title) || 'job';
    return `/jobs/${company}/${title}-${uuid.slice(0, 8).toLowerCase()}`;
  }
  // Non-database jobs (none currently render a detail page) keep their id.
  return `/jobs/${job.id}`;
}

export type ParsedJobPath =
  | { kind: 'legacy'; uuid: string }
  | { kind: 'slug'; companySlug: string; titleSlug: string; shortId: string }
  | { kind: 'other'; id: string };

/** Parses whatever comes after "/jobs/" in the URL. */
export function parseJobPath(rest: string): ParsedJobPath {
  const clean = decodeURIComponent(rest).replace(/\/+$/, '');

  if (clean.startsWith(SPONSORED_PREFIX) && UUID_RE.test(clean.slice(SPONSORED_PREFIX.length))) {
    return { kind: 'legacy', uuid: clean.slice(SPONSORED_PREFIX.length).toLowerCase() };
  }

  const parts = clean.split('/');
  if (parts.length === 2) {
    const match = parts[1].match(/^(.*?)-?([0-9a-f]{8})$/i);
    if (match) {
      return { kind: 'slug', companySlug: parts[0], titleSlug: match[1], shortId: match[2].toLowerCase() };
    }
  }

  return { kind: 'other', id: clean };
}
