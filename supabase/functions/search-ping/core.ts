// Pure part of search-ping (no Supabase client), shared with the tests:
// job addresses, the Google service-account sign-in, and the two senders.

export const SITE = 'https://madevisa.com';
export const HOST = 'madevisa.com';
/** IndexNow key: the same text is served at https://madevisa.com/<key>.txt (public/<key>.txt). */
export const INDEXNOW_KEY = '84e9f4b90e7c61edfddd15291d004d6c';

// ---------------------------------------------------------------------------
// Job addresses — the same rules as src/lib/jobUrl.ts (a test checks they agree).
// ---------------------------------------------------------------------------
export function slugify(input: string, maxLength = 80): string {
  const slug = (input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, '') || slug.slice(0, maxLength);
}

export function jobUrl(job: { job_id: string; title: string; company: string }): string {
  const company = slugify(job.company) || 'company';
  const title = slugify(job.title) || 'job';
  return `${SITE}/jobs/${company}/${title}-${job.job_id.slice(0, 8).toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Google: service account → access token (JWT signed with RS256)
// ---------------------------------------------------------------------------
export type ServiceKey = { client_email: string; private_key: string; token_uri?: string };

export function parseServiceKey(raw: string | undefined): ServiceKey | null {
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as ServiceKey;
    return k.client_email && k.private_key ? k : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signedJwt(key: ServiceKey, nowSec: number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/indexing',
      aud: key.token_uri || 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToDer(key.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function googleToken(key: ServiceKey, fetcher: Fetch, nowSec: number): Promise<string> {
  const res = await fetcher(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signedJwt(key, nowSec) }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed (${res.status}): ${body.error_description || body.error || 'no token'}`);
  return body.access_token;
}

export type Item = { id: number; job_id: string; action: 'update' | 'delete'; title: string; company: string };

/** One job to Google. Returns 'ok', or a short error. 'quota' stops the run for today. */
export async function googlePublish(item: Item, token: string, fetcher: Fetch): Promise<'ok' | 'quota' | string> {
  const res = await fetcher('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: jobUrl(item), type: item.action === 'delete' ? 'URL_DELETED' : 'URL_UPDATED' }),
  });
  if (res.ok) return 'ok';
  if (res.status === 429) return 'quota';
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return `${res.status} ${body.error?.message ?? res.statusText}`.slice(0, 200);
}

/** Many jobs to IndexNow at once (up to 10,000). */
export async function indexNow(items: Item[], fetcher: Fetch): Promise<{ ok: boolean; status: number }> {
  if (!items.length) return { ok: true, status: 200 };
  const res = await fetcher('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: items.map(jobUrl) }),
  });
  // 200 OK, 202 Accepted (key being checked) both mean "received".
  return { ok: res.status === 200 || res.status === 202, status: res.status };
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function run(deps: { rpc: Rpc; fetch: Fetch; googleKey: string | undefined; nowSec?: number }): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const swept = await deps.rpc('search_ping_sweep', {});
  out.expired_queued = swept.data ?? 0;

  // IndexNow: everything waiting, in batches of 5,000.
  let inSent = 0;
  for (let round = 0; round < 4; round++) {
    const b = await deps.rpc('search_ping_batch', { p_engine: 'indexnow', p_limit: 5000 });
    const items = ((b.data as { items?: Item[] })?.items ?? []) as Item[];
    if (!items.length) break;
    const r = await indexNow(items, deps.fetch);
    if (!r.ok) {
      out.indexnow_error = r.status;
      break;
    }
    await deps.rpc('search_ping_done', { p_engine: 'indexnow', p_ids: items.map((i) => i.id), p_status: 'ok' });
    inSent += items.length;
    if (items.length < 5000) break;
  }
  out.indexnow_sent = inSent;

  // Google: what is left of today's quota.
  const key = parseServiceKey(deps.googleKey);
  if (!key) {
    out.google = 'GOOGLE_INDEXING_KEY not set: only IndexNow sent.';
  } else {
    const b = await deps.rpc('search_ping_batch', { p_engine: 'google', p_limit: 200 });
    const items = ((b.data as { items?: Item[] })?.items ?? []) as Item[];
    let ok = 0;
    let lastError: string | null = null;
    if (b.error) lastError = `queue: ${b.error.message}`;
    else if (!items.length) lastError = `nothing to send (quota left today: ${(b.data as { left?: number })?.left ?? '?'})`;
    if (items.length) {
      try {
        const token = await googleToken(key, deps.fetch, deps.nowSec ?? Math.floor(Date.now() / 1000));
        const okIds: number[] = [];
        for (const it of items) {
          const r = await googlePublish(it, token, deps.fetch);
          if (r === 'ok') {
            okIds.push(it.id);
            ok++;
          } else if (r === 'quota') {
            lastError = 'Daily quota reached';
            break;
          } else {
            lastError = r;
            await deps.rpc('search_ping_done', { p_engine: 'google', p_ids: [it.id], p_status: r });
            // Permission problems hit every job the same way: stop and say so.
            if (/^40[13]/.test(r)) break;
          }
        }
        if (okIds.length) await deps.rpc('search_ping_done', { p_engine: 'google', p_ids: okIds, p_status: 'ok' });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    out.google_sent = ok;
    if (lastError) out.google_error = lastError;
  }
  await deps.rpc('search_ping_note', {
    p_note: `IndexNow ${inSent} · Google ${out.google_sent ?? 0}${out.google_error ? ` · Google: ${out.google_error}` : ''}${out.google && !key ? ' · no Google key' : ''}`,
  });
  return out;
}
