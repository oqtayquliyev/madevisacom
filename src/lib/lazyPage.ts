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

/**
 * A missing page file can be answered "not found" while a deploy is going
 * out, and the browser may keep that answer (files under /assets/ are cached
 * for a long time). Re-fetching the exact files named in the error, skipping
 * the browser cache, replaces the stored answer — otherwise that browser kept
 * failing on the page while other browsers were fine.
 */
export async function refreshFailedAssets(e: unknown): Promise<void> {
  const text = e instanceof Error ? `${e.message} ${(e as Error & { cause?: unknown }).cause ?? ''}` : String(e ?? '');
  const urls = new Set<string>();
  for (const m of text.matchAll(/(?:https?:\/\/[^\s'"()]+)?\/assets\/[^\s'"()]+?\.(?:js|css)/g)) urls.add(m[0]);
  // The page itself too, so the reload gets the current list of files.
  urls.add('/index.html');
  await Promise.all(
    [...urls].map((u) =>
      Promise.race([fetch(u, { cache: 'reload', credentials: 'same-origin' }).catch(() => undefined), new Promise((r) => window.setTimeout(r, 4000))]),
    ),
  );
}

function freshAddress(): string {
  const u = new URL(window.location.href);
  u.searchParams.set('_r', String(Date.now()));
  return u.toString();
}

/** Reload once (never in a loop), after refreshing the files that failed. */
export function reloadForNewVersion(error?: unknown): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 20_000) return false; // just tried — don't loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  void refreshFailedAssets(error).finally(() => window.location.replace(freshAddress()));
  return true;
}

/** The "Load again" button: always allowed, also refreshes the failed files first. */
export async function loadAgain(error?: unknown): Promise<void> {
  await refreshFailedAssets(error);
  window.location.replace(freshAddress());
}

export const isChunkLoadError = (e: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(
    e instanceof Error ? e.message : String(e),
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((e: unknown) => {
      if (isChunkLoadError(e) && reloadForNewVersion(e)) {
        // The page is reloading; render nothing until it does.
        return new Promise<{ default: T }>(() => undefined);
      }
      throw e;
    }),
  );
}
