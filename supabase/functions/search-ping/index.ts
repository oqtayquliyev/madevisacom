// supabase/functions/search-ping/index.ts
//
// Every 30 minutes (pg_cron → search_ping_tick → here): tells Google (Indexing API, made for job
// postings) and IndexNow (Bing, Yandex and the engines that use them) which job pages are new,
// changed or gone. The queue lives in the database (migration 20261227090000_search_ping.sql).
//
// Secret (Supabase → Edge Functions → Secrets):
//   GOOGLE_INDEXING_KEY   the whole JSON key of a Google Cloud service account with the
//                         "Web Search Indexing API" enabled, added as an Owner in Search Console.
//                         Without it only IndexNow is sent.
//
// Deploy: supabase functions deploy search-ping --no-verify-jwt
// (The cron sends the x-madevisa-cron header, which must match app_secrets.cron_secret.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { run } from './core.ts';

const service = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ ok: false, error: 'POST only.' }, 405);
  const { data: secret } = await service.from('app_secrets').select('value').eq('name', 'cron_secret').maybeSingle();
  const given = req.headers.get('x-madevisa-cron') ?? '';
  if (!given || !secret?.value || given !== secret.value) return reply({ ok: false, error: 'Forbidden.' }, 403);
  try {
    const result = await run({
      rpc: async (name, args) => {
        const { data, error } = await service.rpc(name, args);
        return { data, error: error ? { message: error.message } : null };
      },
      fetch: (input, init) => fetch(input, init),
      googleKey: Deno.env.get('GOOGLE_INDEXING_KEY'),
    });
    return reply({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await service.rpc('search_ping_note', { p_note: `Crashed: ${msg}` });
    return reply({ ok: false, error: msg }, 500);
  }
});
