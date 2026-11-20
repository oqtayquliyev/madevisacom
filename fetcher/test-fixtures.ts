// For testing the job cycle without the internet: `npm run jobs:local -- --fixtures=fetcher/fixtures`
// answers each feed URL from a JSON/XML file in that folder (missing file = "404 not found").

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fixtureName = (url: string) => url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 150);

export function fixtureFetcher(dir: string) {
  return async (url: string): Promise<Response | null> => {
    for (const ext of ['.json', '.xml']) {
      const f = join(dir, fixtureName(url) + ext);
      if (existsSync(f)) return new Response(readFileSync(f));
    }
    return null;
  };
}
