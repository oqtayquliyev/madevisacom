// How the daily job cycle reaches the database.
//
//   On GitHub (default): through the website's /api/sync door (worker/sync.ts), proving who it
//   is with GitHub's own short-lived OIDC token — no API key stored anywhere.
//   --local: the copy on this computer that `npm run dev` uses, through Wrangler.
//   SYNC_URL + SYNC_KEY env vars: any other address, e.g. a local `wrangler dev` with DEV_SYNC_KEY.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DB = 'madevisa';
const MAX_PER_REQUEST = 40; // the free plan allows 50 queries per Worker request
const MAX_BYTES_PER_REQUEST = 300_000; // keeps each request quick for the Worker
const PAGE = 2000; // rows per read

export interface Database {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** Reads a whole table page by page, ordered by `id`. `select` must not have WHERE/ORDER/LIMIT. */
  queryAll<T extends { id: string }>(select: string): Promise<T[]>;
  execMany(statements: string[], label: string): Promise<void>;
}

/** A value written into SQL text. */
export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
}

async function readAll<T extends { id: string }>(db: Pick<Database, 'query'>, select: string): Promise<T[]> {
  const out: T[] = [];
  let after = '';
  for (;;) {
    const rows = await db.query<T>(`${select} WHERE id > ${lit(after)} ORDER BY id LIMIT ${PAGE}`);
    out.push(...rows);
    if (rows.length < PAGE) return out;
    after = rows[rows.length - 1].id;
  }
}

// ---------------------------------------------------------------------------

export class LocalD1 implements Database {
  constructor(private outDir: string) {
    mkdirSync(outDir, { recursive: true });
  }

  private wrangler(args: string[]): string {
    const res = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, '--local', ...args], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
    });
    if (res.status !== 0) throw new Error(`wrangler failed:\n${(res.stderr || res.stdout || '').slice(-3000)}`);
    return res.stdout;
  }

  async query<T>(sql: string): Promise<T[]> {
    const out = this.wrangler(['--json', '--command', sql]);
    return (JSON.parse(out.slice(out.indexOf('[')))?.[0]?.results ?? []) as T[];
  }

  queryAll<T extends { id: string }>(select: string) {
    return readAll<T>(this, select);
  }

  async execMany(statements: string[], label: string): Promise<void> {
    if (!statements.length) return;
    const file = join(this.outDir, `${label}.sql`);
    writeFileSync(file, statements.join('\n') + '\n');
    this.wrangler(['--yes', `--file=${file}`]);
  }
}

// ---------------------------------------------------------------------------

export class SyncD1 implements Database {
  private token = '';
  private tokenAt = 0;

  constructor(private url: string, private staticKey?: string) {}

  /** A fresh GitHub OIDC token (they live a few minutes, so get a new one every 4). */
  private async bearer(): Promise<string> {
    if (this.staticKey) return this.staticKey;
    if (this.token && Date.now() - this.tokenAt < 4 * 60_000) return this.token;
    const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!reqUrl || !reqToken) {
      throw new Error('No GitHub OIDC token available. Run this on GitHub Actions (the workflow needs "permissions: id-token: write"), or use --local.');
    }
    const res = await fetch(`${reqUrl}&audience=madevisa`, { headers: { Authorization: `Bearer ${reqToken}` } });
    if (!res.ok) throw new Error(`GitHub OIDC token request failed: ${res.status}`);
    this.token = ((await res.json()) as { value: string }).value;
    this.tokenAt = Date.now();
    return this.token;
  }

  private async send(statements: { sql: string; params?: unknown[] }[]): Promise<unknown[][]> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this.bearer()}`, 'User-Agent': 'madevisa-jobs' },
        body: JSON.stringify({ statements }),
      });
      const text = await res.text();
      if (res.ok) return (JSON.parse(text) as { results: unknown[][] }).results;
      // Retry hiccups (rate limits, deploys in progress); fail fast on real errors.
      if (attempt < 4 && (res.status === 429 || res.status >= 502)) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error(`sync ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    return ((await this.send([{ sql }]))[0] ?? []) as T[];
  }

  queryAll<T extends { id: string }>(select: string) {
    return readAll<T>(this, select);
  }

  async execMany(statements: string[], label: string): Promise<void> {
    let batch: { sql: string }[] = [];
    let size = 0;
    let sent = 0;
    const flush = async () => {
      if (!batch.length) return;
      await this.send(batch);
      sent += batch.length;
      batch = [];
      size = 0;
    };
    for (const sql of statements) {
      if (batch.length >= MAX_PER_REQUEST || (batch.length && size + sql.length > MAX_BYTES_PER_REQUEST)) await flush();
      batch.push({ sql });
      size += sql.length;
    }
    await flush();
    if (sent) console.log(`  ${label}: ${sent} statements written`);
  }
}
