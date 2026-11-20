// Reading the D1 database. Written to stay far inside the free plan (5 million rows read a day):
// pages read ready-made "blobs" (a handful of rows) or a few indexed rows, never the whole table.

import type { Stats } from '../shared/jobs';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** owner/name of the GitHub repository whose daily job cycle may write (see worker/sync.ts). */
  GITHUB_REPO?: string;
  /** Cloudflare Access in front of /admin: team domain (xxx.cloudflareaccess.com) and the app's AUD tag. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Local testing only — never set on Cloudflare. */
  DEV_SYNC_KEY?: string;
}

export type JobRow = {
  id: string;
  source: string;
  title: string;
  company: string;
  country: string | null;
  city: string | null;
  location: string | null;
  remote: number;
  arrangement: string | null;
  visa: string | null;
  employment: string | null;
  experience: string | null;
  salary: string | null;
  department: string | null;
  url: string;
  posted_at: string;
  first_seen: string;
  description: string | null;
};

export type ListRow = Pick<JobRow, 'id' | 'title' | 'company' | 'country' | 'city' | 'remote' | 'visa' | 'posted_at' | 'arrangement'>;

/** The parts of a blob, joined, as text (not parsed — parsing 1 MB costs more CPU than the free plan allows). */
export async function blobText(env: Env, key: string): Promise<{ body: string; updated: string } | null> {
  try {
    const r = await env.DB.prepare('SELECT body, updated_at FROM blobs WHERE key = ? ORDER BY part').bind(key).all<{ body: string; updated_at: string }>();
    if (!r.results.length) return null;
    return { body: r.results.map((x) => x.body).join(''), updated: r.results[0].updated_at };
  } catch {
    return null;
  }
}

const EMPTY_STATS: Stats = {
  updated: '', total: 0, visa: 0, notVisa: 0, remote: 0, salary: 0, new24h: 0, companies: 0, windowDays: 14,
  byCountry: [], topCompanies: [], topVisaCompanies: [], perDay: [], byArrangement: [],
};

export async function stats(env: Env): Promise<Stats> {
  const b = await blobText(env, 'stats');
  if (!b) return EMPTY_STATS;
  try {
    return { ...EMPTY_STATS, ...(JSON.parse(b.body) as Stats) };
  } catch {
    return EMPTY_STATS;
  }
}

export async function job(env: Env, id: string): Promise<JobRow | null> {
  try {
    return await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<JobRow>();
  } catch {
    return null;
  }
}

const LIST_COLS = 'id, title, company, country, city, remote, visa, posted_at, arrangement';

/** Newest jobs, optionally in one country and/or with visa sponsorship. Uses the indexes. */
export async function newest(env: Env, o: { country?: string; visa?: boolean; remote?: boolean; limit?: number } = {}): Promise<ListRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (o.country) {
    where.push('country = ?');
    binds.push(o.country);
  }
  if (o.visa) where.push("visa = 'offered'");
  if (o.remote) where.push('remote = 1');
  const sql = `SELECT ${LIST_COLS} FROM jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY posted_at DESC LIMIT ?`;
  binds.push(Math.min(o.limit ?? 50, 100));
  try {
    return (await env.DB.prepare(sql).bind(...binds).all<ListRow>()).results;
  } catch {
    return [];
  }
}

/** A few other jobs at the same company (shown when a job has closed or under a job). */
export async function sameCompany(env: Env, company: string, notId: string, limit = 6): Promise<ListRow[]> {
  try {
    return (
      await env.DB.prepare(`SELECT ${LIST_COLS} FROM jobs WHERE company = ? AND id != ? ORDER BY posted_at DESC LIMIT ?`).bind(company, notId, limit).all<ListRow>()
    ).results;
  } catch {
    return [];
  }
}

export type RunRow = { id: number; started_at: string; finished_at: string | null; added: number; removed: number; total: number; sources_ok: number; sources_failed: number; failed_list: string | null; note: string | null };

export async function runs(env: Env, limit = 10): Promise<RunRow[]> {
  try {
    return (await env.DB.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').bind(limit).all<RunRow>()).results;
  } catch {
    return [];
  }
}
