// supabase/functions/job-facts/index.ts
//
// MadeVisa's job description detector, running on the server so its code
// never reaches the browser. It reads a job's description and returns:
//   facts   — salary, experience, remote/hybrid/on-site, employment type,
//             visa sponsorship, schedule, contract term, department,
//             location and posting date (null when the text doesn't say)
//   html    — the description with noise removed (facts block, repeats,
//             "Apply now", contact lines)
//   contact — email / phone / website / name pulled out of the text
// Results are saved on the job (sponsored_jobs.facts) so each job is
// analysed once; editing the description clears them (database trigger).
//
// Requests (POST, JSON):
//   { ids: ["<job uuid>", ...] }            → results for those jobs
//       Anyone: up to 3 published jobs, computed only if not stored yet.
//       Admins: up to 50 jobs, any status; add "force": true to recompute.
//   { items: [{ title, description }, ...] } → facts only, nothing stored
//       Admins only (used by the importer before inserting new jobs).
//
// Deploy: supabase functions deploy job-facts

import { createClient } from 'npm:@supabase/supabase-js@2';
import { detectJobFacts, cleanJobDescriptionHtml } from './detector.ts';
import { sanitizeJobHtml } from './sanitize.ts';

/** Bump when the detector changes, so stored results are recomputed. */
const FACTS_VERSION = 2;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Payload = { v: number; facts: ReturnType<typeof detectJobFacts>; html: string; contact: Record<string, string> };

function analyse(title: string, description: string | null): Payload {
  const facts = detectJobFacts(description, title);
  const cleaned = description ? cleanJobDescriptionHtml(sanitizeJobHtml(description), title) : { html: '', contact: {} };
  return { v: FACTS_VERSION, facts, html: cleaned.html, contact: cleaned.contact as Record<string, string> };
}

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply({ ok: false, error: 'POST only.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Admin = is_admin() for the caller's own session (includes the
    // two-step login requirement). Anonymous visitors are never admin.
    const authHeader = req.headers.get('Authorization') ?? '';
    let isAdmin = false;
    if (authHeader) {
      const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data } = await asCaller.rpc('is_admin');
      isAdmin = data === true;
    }

    const body = await req.json().catch(() => ({}));

    // --- Admin: analyse raw descriptions (importer) --------------------
    if (Array.isArray(body?.items)) {
      if (!isAdmin) return reply({ ok: false, error: 'Admin access required.' }, 403);
      const items = (body.items as { title?: string; description?: string | null }[]).slice(0, 500);
      return reply({ ok: true, facts: items.map((it) => detectJobFacts(it?.description ?? null, it?.title ?? '')) });
    }

    // --- Jobs by id -----------------------------------------------------
    if (!Array.isArray(body?.ids)) return reply({ ok: false, error: 'Send { ids: [...] } or { items: [...] }.' }, 400);
    const ids = (body.ids as unknown[])
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
      .slice(0, isAdmin ? 50 : 3);
    if (!ids.length) return reply({ ok: true, results: {} });
    const force = isAdmin && body?.force === true;

    let q = service.from('sponsored_jobs').select('id, title, description, facts, status, updated_at').in('id', ids);
    if (!isAdmin) q = q.eq('status', 'published');
    const { data: rows, error } = await q;
    if (error) return reply({ ok: false, error: error.message }, 500);

    const results: Record<string, Payload> = {};
    const saves: PromiseLike<unknown>[] = [];
    for (const r of (rows ?? []) as { id: string; title: string; description: string | null; facts: Payload | null; updated_at: string }[]) {
      if (!force && r.facts && r.facts.v === FACTS_VERSION) {
        results[r.id] = r.facts;
        continue;
      }
      let payload: Payload;
      try {
        payload = analyse(r.title ?? '', r.description);
      } catch {
        // One odd description must not fail the whole batch.
        payload = { v: FACTS_VERSION, facts: detectJobFacts(null, r.title ?? ''), html: r.description ?? '', contact: {} };
      }
      results[r.id] = payload;
      // Save for next time — only if the job wasn't edited in the meantime
      // (saving results alone doesn't change updated_at; see migration).
      saves.push(service.from('sponsored_jobs').update({ facts: payload }).eq('id', r.id).eq('updated_at', r.updated_at));
    }
    await Promise.all(saves);
    return reply({ ok: true, results });
  } catch (e) {
    return reply({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
