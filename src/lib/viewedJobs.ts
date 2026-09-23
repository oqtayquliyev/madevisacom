// Tracks which jobs the person has already opened, so listing cards can
// show a small "Viewed" note and the profile page can show a "Recently
// viewed" list. Entries expire after 48 hours — deliberately short-
// lived (this is "did I already look at this one" scanning aid, not a
// permanent history), and pruned lazily on read rather than needing any
// background job.

const STORAGE_KEY = 'madevisa:viewedJobs';
const VIEWED_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export type ViewedJobSnapshot = {
  id: string;
  title: string;
  organization: string;
  country?: string;
  countryCode?: string;
  url?: string;
};

type ViewedEntry = { ts: number; snapshot?: ViewedJobSnapshot };
type ViewedMap = Record<string, ViewedEntry>; // job id -> entry

function readAll(): ViewedMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ViewedMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: ViewedMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage can throw (private browsing, quota) — viewed tracking
    // is a nice-to-have, so fail silently rather than breaking the page.
  }
}

/** Removes any entry older than the 48-hour window, returning what's left. */
function pruneExpired(map: ViewedMap): ViewedMap {
  const cutoff = Date.now() - VIEWED_TTL_MS;
  const kept: ViewedMap = {};
  for (const [id, entry] of Object.entries(map)) {
    if (entry.ts >= cutoff) kept[id] = entry;
  }
  return kept;
}

/** `snapshot` is optional and, when given, is stored alongside the
 *  timestamp so the profile page's "Recently viewed" list can render
 *  title/company/etc. without a second fetch — same lightweight,
 *  client-only pattern the existing "Saved" lists already use. Safe to
 *  call repeatedly with or without a snapshot; a later call updates
 *  the timestamp (and snapshot, if provided) rather than duplicating. */
export function markJobViewed(jobId: string, snapshot?: ViewedJobSnapshot) {
  const map = pruneExpired(readAll());
  const existing = map[jobId];
  map[jobId] = { ts: Date.now(), snapshot: snapshot ?? existing?.snapshot };
  writeAll(map);
}

export function isJobViewed(jobId: string): boolean {
  const map = pruneExpired(readAll());
  return jobId in map;
}

/** Returns viewed job ids ordered most-recently-viewed first — for the
 *  profile page's "Recently viewed" list. Also prunes+persists expired
 *  entries as a side effect, so the stored list stays small over time. */
export function getRecentlyViewedJobIds(): string[] {
  const map = pruneExpired(readAll());
  writeAll(map);
  return Object.entries(map)
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([id]) => id);
}

/** Same ordering as getRecentlyViewedJobIds, but returns the stored
 *  snapshots directly (skipping any entry that has none — e.g. viewed
 *  before this snapshot feature shipped) for rendering a list without
 *  a database round-trip. */
export function getRecentlyViewedJobs(): ViewedJobSnapshot[] {
  const map = pruneExpired(readAll());
  writeAll(map);
  return Object.values(map)
    .sort((a, b) => b.ts - a.ts)
    .map((entry) => entry.snapshot)
    .filter((s): s is ViewedJobSnapshot => Boolean(s));
}
