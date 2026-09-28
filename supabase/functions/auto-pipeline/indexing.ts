// Google Indexing API — tells Google about new job pages the moment they go
// live (Google supports this API for JobPosting pages). Optional:
//   1. Google Cloud → create a service account, enable "Web Search Indexing API",
//      download its JSON key.
//   2. Search Console → Settings → Users → add the service account's email as Owner.
//   3. supabase secrets set GOOGLE_INDEXING_SA="$(cat key.json)"
//   4. Admin → Articles → Google Indexing → switch on.
// The daily cap (seo_settings.google_daily_cap) keeps within Google's quota.

import type { Service } from './shared.ts';

type ServiceAccount = { client_email: string; private_key: string };
let tokenCache: { token: string; exp: number } | null = null;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/indexing', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${b64url(sig)}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google token: ${data.error_description ?? data.error ?? res.status}`);
  tokenCache = { token: data.access_token, exp: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

/** Sends up to the daily cap; returns how many Google accepted. Never throws. */
export async function notifyGoogle(service: Service, urls: string[]): Promise<{ sent: number; error?: string }> {
  const raw = Deno.env.get('GOOGLE_INDEXING_SA');
  if (!raw || !urls.length) return { sent: 0 };
  try {
    const { data: allowed } = await service.rpc('google_indexing_take', { p_n: urls.length });
    const n = Number(allowed ?? 0);
    if (!n) return { sent: 0 };
    const token = await accessToken(JSON.parse(raw) as ServiceAccount);
    let sent = 0;
    for (const url of urls.slice(0, n)) {
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
      });
      if (res.ok) sent++;
      else if (res.status === 429) break; // quota — stop for today
    }
    return { sent };
  } catch (e) {
    return { sent: 0, error: e instanceof Error ? e.message : 'failed' };
  }
}
