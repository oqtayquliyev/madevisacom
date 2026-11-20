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

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'madevisa';
const MAX_STATEMENTS = 45;

type Jwk = JsonWebKey & { kid: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function githubKeys(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`${ISSUER}/.well-known/jwks`, { headers: { 'User-Agent': 'madevisa-sync' } });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys };
  return keys;
}

/** Returns null when the token is valid for this site, otherwise the reason it isn't. */
export async function checkGithubToken(token: string, env: Env): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return 'not a token';
  let header: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; repository?: string; ref?: string };
  try {
    header = b64urlJson(parts[0]);
    claims = b64urlJson(parts[1]);
  } catch {
    return 'unreadable token';
  }
  if (header.alg !== 'RS256') return 'wrong algorithm';
  let key = (await githubKeys()).find((k) => k.kid === header.kid);
  if (!key) key = (await githubKeys(true)).find((k) => k.kid === header.kid);
  if (!key) return 'unknown signing key';
  const pub = await crypto.subtle.importKey('jwk', { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return 'bad signature';
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) return 'wrong issuer';
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(AUDIENCE)) return 'wrong audience';
  if (!claims.exp || claims.exp < now - 30) return 'expired';
  if (claims.nbf && claims.nbf > now + 60) return 'not yet valid';
  if (!env.GITHUB_REPO || claims.repository?.toLowerCase() !== env.GITHUB_REPO.toLowerCase()) return 'wrong repository';
  if (claims.ref !== 'refs/heads/main') return 'only the main branch may sync';
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
