// Talks to the Cloudflare D1 database through Wrangler (the same tool that deploys the site).
// On GitHub it uses the CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID secrets; with --local it
// uses the copy on this computer that `npm run dev` uses.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DB = 'madevisa';

export class D1 {
  constructor(private local: boolean, private outDir: string) {
    mkdirSync(outDir, { recursive: true });
  }

  private wrangler(args: string[]): string {
    const res = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, this.local ? '--local' : '--remote', ...args], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
    });
    if (res.status !== 0) {
      throw new Error(`wrangler failed:\n${(res.stderr || res.stdout || '').slice(-3000)}`);
    }
    return res.stdout;
  }

  /** Runs one SELECT and returns its rows. */
  query<T = Record<string, unknown>>(sql: string): T[] {
    const out = this.wrangler(['--json', '--command', sql]);
    const start = out.indexOf('[');
    const parsed = JSON.parse(out.slice(start));
    return (parsed?.[0]?.results ?? []) as T[];
  }

  /** Runs many statements from a file, a few MB at a time. */
  execMany(statements: string[], label: string): void {
    if (!statements.length) return;
    const MAX = 8 * 1024 * 1024;
    let buf: string[] = [];
    let size = 0;
    let n = 0;
    const flush = () => {
      if (!buf.length) return;
      const file = join(this.outDir, `${label}-${++n}.sql`);
      writeFileSync(file, buf.join('\n') + '\n');
      this.wrangler(['--yes', `--file=${file}`]);
      buf = [];
      size = 0;
    };
    for (const s of statements) {
      if (size + s.length > MAX) flush();
      buf.push(s);
      size += s.length + 1;
    }
    flush();
  }
}

/** A value written into SQL text. */
export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
}
