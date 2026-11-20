// Shared by the website (worker/), the browser scripts (client/) and the daily job cycle (fetcher/).
// Anything that must give the same answer in all three — job URLs, the board list format — lives here.

/** Same rules the old site used, so job URLs keep the same shape. */
export function slugify(input: string, maxLength = 80): string {
  const slug = (input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, '') || slug.slice(0, maxLength);
}

/** /jobs/<company>/<title>-<id> — the id after the last "-" is what finds the job. */
export const jobPath = (j: { id: string; title: string; company: string }) =>
  `/jobs/${slugify(j.company) || 'company'}/${slugify(j.title) || 'job'}-${j.id}`;

/** Ids are 10 lowercase letters/digits, so they never contain "-". */
export const JOB_ID_RE = /^[a-z0-9]{10}$/;

/**
 * One row of the board list (blob "jobs"). Arrays instead of objects keep the download
 * small: ~10,000 jobs ≈ 1.3 MB, ~250 KB compressed.
 */
export type BoardRow = [
  id: string,
  title: string,
  company: string,
  country: string, // ISO code or ''
  city: string,
  remote: 0 | 1,
  visa: 0 | 1 | 2, // 1 offered, 2 not offered, 0 not stated
  posted: number, // unix seconds
  arrangement: '' | 'onsite' | 'hybrid' | 'remote',
  salary: 0 | 1, // salary shown in the ad
];

export type BoardList = { v: 1; updated: string; jobs: BoardRow[] };

export type Stats = {
  updated: string;
  total: number;
  visa: number;
  notVisa: number;
  remote: number;
  salary: number;
  new24h: number;
  companies: number;
  windowDays: number;
  byCountry: [code: string, jobs: number, visa: number][];
  topCompanies: [name: string, jobs: number, visa: number][];
  topVisaCompanies: [name: string, visa: number][];
  perDay: [date: string, jobs: number][];
  byArrangement: [kind: string, jobs: number][];
};

export const DAY_MS = 86_400_000;
