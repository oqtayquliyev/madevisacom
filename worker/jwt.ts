// Checks RS256-signed tokens (JWTs) against a published key list (JWKS).
// Used for GitHub's OIDC tokens (worker/sync.ts) and Cloudflare Access passes (worker/admin.ts).

type Jwk = JsonWebKey & { kid: string };
const cache = new Map<string, { at: number; keys: Jwk[] }>();

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function keys(url: string, force = false): Promise<Jwk[]> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < 3600_000) return hit.keys;
  const res = await fetch(url, { headers: { 'User-Agent': 'madevisa' } });
  if (!res.ok) throw new Error(`keys ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const list = data.keys ?? [];
  cache.set(url, { at: Date.now(), keys: list });
  return list;
}

export type Claims = Record<string, unknown> & { iss?: string; aud?: string | string[]; exp?: number; nbf?: number };

/** Returns the token's claims if the signature is valid and it hasn't expired; otherwise a reason string. */
export async function verifyRs256(token: string, jwksUrl: string): Promise<Claims | string> {
  const parts = token.split('.');
  if (parts.length !== 3) return 'not a token';
  let header: { alg?: string; kid?: string };
  let claims: Claims;
  try {
    header = b64urlJson(parts[0]);
    claims = b64urlJson(parts[1]);
  } catch {
    return 'unreadable token';
  }
  if (header.alg !== 'RS256') return 'wrong algorithm';
  let key = (await keys(jwksUrl)).find((k) => k.kid === header.kid);
  if (!key) key = (await keys(jwksUrl, true)).find((k) => k.kid === header.kid);
  if (!key) return 'unknown signing key';
  const pub = await crypto.subtle.importKey('jwk', { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return 'bad signature';
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now - 30) return 'expired';
  if (claims.nbf && claims.nbf > now + 60) return 'not yet valid';
  return claims;
}

export const audIncludes = (c: Claims, aud: string) => (Array.isArray(c.aud) ? c.aud : [c.aud]).includes(aud);
