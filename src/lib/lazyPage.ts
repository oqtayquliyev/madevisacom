import { lazy, type ComponentType } from 'react';

/**
 * React.lazy for pages, safe across deploys.
 *
 * After a deploy, a page opened from an older copy of the site (a cached
 * page or a tab left open) asks for page files that no longer exist, and
 * the import fails — which used to leave a blank white page. Here the
 * first failure reloads the page once with a fresh ?_r= address (that
 * skips every cache and fetches the new files; main.tsx removes it again).
 * If it still fails, the error goes to the error screen instead.
 */
const KEY = 'mv-page-reload-at';

export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 20_000) return false; // just tried — don't loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  const u = new URL(window.location.href);
  u.searchParams.set('_r', String(Date.now()));
  window.location.replace(u.toString());
  return true;
}

export const isChunkLoadError = (e: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(
    e instanceof Error ? e.message : String(e),
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((e: unknown) => {
      if (isChunkLoadError(e) && reloadForNewVersion()) {
        // The page is reloading; render nothing until it does.
        return new Promise<{ default: T }>(() => undefined);
      }
      throw e;
    }),
  );
}
