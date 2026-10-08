// Bundles the worker into dist/worker.mjs: its own code plus the shared rules from the site
// (src/lib/apply — the question engine, the Word file) and the apply function (the email).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
await build({
  entryPoints: [here('./src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: here('./dist/worker.mjs'),
  alias: { '@': here('../src') },
  // Shared files outside worker/ resolve their packages (fflate) from here.
  nodePaths: [here('./node_modules')],
  external: ['playwright-core', '@supabase/supabase-js'],
  logLevel: 'info',
});
