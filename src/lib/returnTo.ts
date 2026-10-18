// Where to bring someone back after checkout — paid or not.
// Remembered whenever the site sends them to /checkout (see nav in pageLayout), kept for 3 hours.

const KEY = 'mv:returnTo';
const TTL = 3 * 60 * 60 * 1000;

export function rememberReturn(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/checkout')) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** The page they came from, or null. */
export function readReturn(): string | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { path: string; at: number } | null;
    if (!v || Date.now() - v.at > TTL || !v.path.startsWith('/') || v.path.startsWith('//')) return null;
    return v.path;
  } catch {
    return null;
  }
}

export function clearReturn(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
