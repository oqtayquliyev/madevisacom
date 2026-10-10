// supabase/functions/email-finder/index.ts
//
// Admin tool behind Admin → Outreach → Find emails.
// Reads company websites (homepage + contact / imprint / about / careers pages)
// and returns the email addresses they publish. Runs on the server because
// browsers can't read other websites (CORS). Respects robots.txt.
//
//   POST { action: "scan", urls: ["https://acme.com", "beta.de", ...] }   (max 10)
//   → { ok: true, sites: [{ url, domain, pages, emails: [{email, page}], error?, blocked? }] }
//
// The admin page then saves the result with the admin_finder_save RPC.
// Admin only — same two-step rule as is_admin().
//
// Deploy: supabase functions deploy email-finder

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS_HEADERS, scanSites } from './finder.ts';

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: isAdmin } = await asCaller.rpc('is_admin');
    if (isAdmin !== true) return reply({ ok: false, error: 'Admin access (with your two-step code) required.' }, 403);

    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'scan') return reply({ ok: false, error: 'Unknown action.' }, 400);
    const urls = (Array.isArray(body.urls) ? body.urls : []).map(String).filter(Boolean).slice(0, 10);
    if (!urls.length) return reply({ ok: false, error: 'No websites given.' }, 400);
    return reply({ ok: true, sites: await scanSites(urls) });
  } catch (e) {
    return reply({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
