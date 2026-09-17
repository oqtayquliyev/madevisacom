/**
 * Local "applications" tracker — no backend table needed yet. Stores
 * what the visitor has applied to / saved directly in their browser,
 * keyed by a stable id per job/program, so the Dashboard has something
 * real to show without requiring a database migration first.
 *
 * When you're ready to make this durable across devices, swap the
 * localStorage calls here for a Supabase table
 * (e.g. `applications(id, user_id, kind, ref_id, title, ...)`) — the
 * function signatures below are written so callers won't need to
 * change when you do.
 */

export type ApplicationKind = 'job' | 'program' | 'agency' | 'expert' | 'destination';

export type SavedApplication = {
  id: string; // `${kind}:${refId}`
  kind: ApplicationKind;
  refId: string;
  title: string;
  organization: string;
  country: string;
  countryCode: string;
  url?: string;
  savedAt: string; // ISO date
};

const STORAGE_KEY = 'madevisa.applications.v1';

function readAll(): SavedApplication[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedApplication[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedApplication[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors (private browsing, quota, etc.)
  }
}

export function getApplications(kind?: ApplicationKind): SavedApplication[] {
  const all = readAll().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return kind ? all.filter((a) => a.kind === kind) : all;
}

export function isApplied(kind: ApplicationKind, refId: string): boolean {
  return readAll().some((a) => a.kind === kind && a.refId === refId);
}

export function markApplied(entry: Omit<SavedApplication, 'id' | 'savedAt'>): void {
  const id = `${entry.kind}:${entry.refId}`;
  const all = readAll();
  if (all.some((a) => a.id === id)) return; // already saved
  all.push({ ...entry, id, savedAt: new Date().toISOString() });
  writeAll(all);
}

export function removeApplication(kind: ApplicationKind, refId: string): void {
  const id = `${kind}:${refId}`;
  writeAll(readAll().filter((a) => a.id !== id));
}
