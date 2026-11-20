// Builds the small browser scripts (client/*.ts → public/js/*.js) and copies the PDF reader.
// Runs automatically before `wrangler deploy` and `wrangler dev` (see "build" in wrangler.jsonc).
import { build } from 'esbuild';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';

const id = Date.now().toString(36);
writeFileSync('worker/build-id.ts', `export const BUILD = '${id}';\n`);

mkdirSync('public/js/pdfjs', { recursive: true });
await build({
  entryPoints: { ui: 'client/ui.ts', board: 'client/board.ts', cv: 'client/cv.ts' },
  outdir: 'public/js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  legalComments: 'none',
  logLevel: 'warning',
});
for (const f of ['pdf.min.js', 'pdf.worker.min.js']) cpSync(`node_modules/pdfjs-dist/build/${f}`, `public/js/pdfjs/${f}`);
console.log(`built public/js (build ${id})`);
