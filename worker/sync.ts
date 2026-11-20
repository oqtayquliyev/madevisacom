// The door the daily job cycle uses to write into the database — without any stored key.
//
// GitHub Actions gives every run a short-lived signed token (OIDC) that says which repository
// and branch it comes from. This endpoint checks GitHub's signature and accepts only runs of
// GITHUB_REPO on the main branch. So nothing secret has to be copied into GitHub or Cloudflare.
//
// POST /api/sync   Authorization: Bearer <GitHub OIDC token, audience "madevisa">
//   body: { statements: [{ sql, params? }, …] }   (at most 45 — the free plan allows 50 queries per request)
//   reply: { results: [rows[] for each statement] }

import type { Env } from './db';
import { audIncludes, verifyRs256 } from './jwt';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'madevisa';
const MAX_STATEMENTS = 45;

/** Returns null when the token is valid for this site, otherwise the reason it isn't. */
export async function checkGithubToken(token: string, env: Env): Promise<string | null> {
  const c = await verifyRs256(token, `${ISSUER}/.well-known/jwks`);
  if (typeof c === 'string') return c;
  if (c.iss !== ISSUER) return 'wrong issuer';
  if (!audIncludes(c, AUDIENCE)) return 'wrong audience';
  if (!env.GITHUB_REPO || String(c.repository ?? '').toLowerCase() !== env.GITHUB_REPO.toLowerCase()) return 'wrong repository';
  if (c.ref !== 'refs/heads/main') return 'only the main branch may sync';
  return null;
}

export async function sync(req: Request, env: Env): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Local testing only (`npm run dev` with DEV_SYNC_KEY in .dev.vars). Never set it on Cloudflare.
  const devOk = Boolean(env.DEV_SYNC_KEY) && token === env.DEV_SYNC_KEY;
  if (!devOk) {
    const why = token ? await checkGithubToken(token, env).catch((e) => `check failed: ${e instanceof Error ? e.message : e}`) : 'missing token';
    if (why) return json({ error: `not allowed: ${why}` }, 401);
  }

  let body: { statements?: { sql: string; params?: unknown[] }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad JSON' }, 400);
  }
  const list = body.statements ?? [];
  if (!list.length || list.length > MAX_STATEMENTS) return json({ error: `send 1–${MAX_STATEMENTS} statements` }, 400);
  try {
    const out = await env.DB.batch(list.map((s) => env.DB.prepare(s.sql).bind(...(s.params ?? []))));
    return json({ results: out.map((r) => r.results ?? []) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
