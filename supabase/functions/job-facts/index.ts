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
//   { cron: "detect", limit: 30 }            → server-run (pg_cron, every minute)
//       Detects jobs waiting for auto-publish, stores the results and fills
//       empty job fields (salary, experience, work type…) and corrects a
//       country read from a US state code ("North Chicago, IL" → US, not
//       Israel) — the same checks the admin "Check jobs" tool does. Needs the header
//       x-madevisa-cron = app_secrets.cron_secret (migration 20261031090000).
//
// Deploy: supabase functions deploy job-facts --no-verify-jwt
// (the function checks access itself: admins via their session, pg_cron
// via the secret header, everyone else only gets published jobs.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { detectJobFacts, cleanJobDescriptionHtml, stripPageChrome, isPlaceholderValue, splitSourceLocation } from './detector.ts';
import { createPlaceResolver, isAmbiguousRegionCode, recheckSavedCountry } from './placeResolver.ts';
import { allCountries } from './countries.ts';

const resolvePlace = createPlaceResolver(allCountries);
import { sanitizeJobHtml } from './sanitize.ts';

/** Bump when the detector changes, so stored results are recomputed. */
const FACTS_VERSION = 4; // 4: "50 € per hour", freelancers, more career-site buttons removed

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Payload = { v: number; facts: ReturnType<typeof detectJobFacts>; html: string; contact: Record<string, string> };

// Descriptions beyond this are almost always a whole saved web page. Parsing
// them in full is what ran past the Edge Function CPU limit (the browser
// then only sees "Failed to send a request to the Edge Function").
const MAX_DESCRIPTION_HTML = 100_000;

function analyse(title: string, rawDescription: string | null): Payload {
  const description = rawDescription && rawDescription.length > MAX_DESCRIPTION_HTML ? rawDescription.slice(0, MAX_DESCRIPTION_HTML) : rawDescription;
  // A description that is really a whole web page (menus, login, cookie
  // notices) is cut down to the job ad first, for both facts and display.
  const base = description ? stripPageChrome(sanitizeJobHtml(description), title) : '';
  const facts = detectJobFacts(base || description, title);
  const cleaned = base ? cleanJobDescriptionHtml(base, title) : { html: '', contact: {} };
  return { v: FACTS_VERSION, facts, html: cleaned.html, contact: cleaned.contact as Record<string, string> };
}

function safeAnalyse(title: string, description: string | null): Payload {
  try {
    return analyse(title, description);
  } catch {
    // One odd description must not fail the whole batch.
    return { v: FACTS_VERSION, facts: detectJobFacts(null, title), html: description ?? '', contact: {} };
  }
}

// The generated-types generics don't matter here.
// deno-lint-ignore no-explicit-any
type ServiceClient = any;

// --- Server-run detection (pg_cron) ------------------------------------------

let cronSecretCache: { value: string | null; at: number } | null = null;
async function cronSecret(service: ServiceClient): Promise<string | null> {
  if (cronSecretCache && Date.now() - cronSecretCache.at < 5 * 60_000) return cronSecretCache.value;
  const { data } = await service.from('app_secrets').select('value').eq('name', 'cron_secret').maybeSingle();
  const value = (data as { value?: string } | null)?.value ?? null;
  cronSecretCache = { value, at: Date.now() };
  return value;
}

let countryCache: { byIso: Map<string, string>; isoById: Map<string, string>; at: number } | null = null;
async function countryMaps(service: ServiceClient) {
  if (countryCache && Date.now() - countryCache.at < 60 * 60_000) return countryCache;
  const { data } = await service.from('countries').select('id, iso_code');
  const rows = (data ?? []) as { id: string; iso_code: string }[];
  countryCache = { byIso: new Map(rows.map((c) => [c.iso_code, c.id])), isoById: new Map(rows.map((c) => [c.id, c.iso_code])), at: Date.now() };
  return countryCache;
}

const isMeaningfulSalary = (t: string | null | undefined) => {
  const v = (t ?? '').trim();
  return Boolean(v) && v !== '[object Object]' && !/^(n\/?a|none|null|undefined|tbd|-+|—)$/i.test(v) && /[1-9]/.test(v);
};

type WaitingRow = {
  id: string;
  title: string | null;
  description: string | null;
  updated_at: string;
  compensation_text: string | null;
  salary_status: string | null;
  experience_level: string | null;
  employment_type: string | null;
  job_function: string | null;
  city: string | null;
  country_id: string | null;
  additional_locations: string[] | null;
  source_posted_at: string | null;
  remote: boolean | null;
  visa_sponsorship: boolean | null;
  work_arrangement: string | null;
  visa_status: string | null;
};

/** Same fill-in rules as the admin "Detect job details" run (src/lib/admin.ts backfillJobFacts). */
function fillInPatch(r: WaitingRow, f: Payload['facts'], maps: { byIso: Map<string, string>; isoById: Map<string, string> }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!isMeaningfulSalary(r.compensation_text) && f.compensation && r.salary_status !== 'volunteer') {
    patch.compensation_text = f.compensation;
    patch.salary_status = 'disclosed';
  }
  if (!r.experience_level && f.experience) patch.experience_level = f.experience;
  if ((!r.employment_type || r.employment_type === 'Other') && f.employmentType) {
    patch.employment_type = f.employmentType;
    patch.category = f.employmentType;
  }
  if (!r.work_arrangement && f.workArrangement) patch.work_arrangement = f.workArrangement;
  if (!r.remote && f.workArrangement === 'remote') patch.remote = true;
  if (r.remote && !r.work_arrangement && (f.workArrangement === 'hybrid' || f.workArrangement === 'onsite')) patch.remote = false;
  if (!r.visa_status && f.visa) patch.visa_status = f.visa;
  if (!r.visa_sponsorship && f.visa === 'offered') patch.visa_sponsorship = true;
  if (!r.source_posted_at && f.postedAt) patch.source_posted_at = f.postedAt;
  if (isPlaceholderValue(r.job_function) && f.department) patch.job_function = f.department;
  const loc = splitSourceLocation(f.location);
  if (loc) {
    if (isPlaceholderValue(r.city) && loc.city) patch.city = loc.city;
    const countryId = loc.countryCode ? maps.byIso.get(loc.countryCode) : undefined;
    if (!r.country_id && countryId) patch.country_id = countryId;
    const storedIso = r.country_id ? maps.isoById.get(r.country_id) : undefined;
    if (r.country_id && countryId && storedIso && storedIso !== loc.countryCode && isAmbiguousRegionCode(storedIso)) patch.country_id = countryId;
  }
  // Saved from a state code by the importer ("North Chicago, IL" as Israel):
  // read "<city>, <code>" and the office list again with the current rules.
  const storedIso = r.country_id ? maps.isoById.get(r.country_id) : undefined;
  if (storedIso && !patch.country_id) {
    const city = (typeof patch.city === 'string' ? patch.city : r.city) ?? null;
    const target = recheckSavedCountry(resolvePlace, storedIso, city, [...(r.additional_locations ?? []), f.location]);
    const id = target ? maps.byIso.get(target) : undefined;
    if (id) patch.country_id = id;
  }
  return patch;
}

/**
 * Jobs waiting for auto-publish that haven't been through the detector:
 * newest first, one at a time, each saved as soon as it's done — so if the
 * function is stopped midway, the finished ones are kept. Every job's
 * attempt is counted first; after 3 failed attempts the auto-publisher
 * stops waiting for it (see auto_release in the migration).
 */
async function detectWaiting(service: ServiceClient, limit: number) {
  const started = Date.now();
  const cols =
    'id, title, description, updated_at, compensation_text, salary_status, experience_level, employment_type, job_function, city, country_id, additional_locations, source_posted_at, remote, visa_sponsorship, work_arrangement, visa_status';
  const { data, error } = await service
    .from('sponsored_jobs')
    .select(cols)
    .eq('awaiting_release', true)
    .eq('status', 'published')
    .is('facts_v', null)
    .lt('facts_attempts', 3)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as WaitingRow[];
  if (!rows.length) return { ok: true, detected: 0, left: 0 };
  await service.rpc('job_facts_count_attempt', { p_ids: rows.map((r) => r.id) });

  const maps = await countryMaps(service);
  let busyMs = 0; // time spent analysing ≈ CPU time (the limit that matters)
  let detected = 0;
  let filled = 0;
  for (const r of rows) {
    if (busyMs > 1200 || Date.now() - started > 25_000) break;
    const t0 = performance.now();
    const payload = safeAnalyse(r.title ?? '', r.description);
    const patch = fillInPatch(r, payload.facts, maps);
    busyMs += performance.now() - t0;
    let res = await service.from('sponsored_jobs').update({ facts: payload, ...patch }).eq('id', r.id).eq('updated_at', r.updated_at);
    // Older databases without work_arrangement / visa_status: save the rest.
    if (res.error && /work_arrangement|visa_status|column/i.test(res.error.message)) {
      delete patch.work_arrangement;
      delete patch.visa_status;
      res = await service.from('sponsored_jobs').update({ facts: payload, ...patch }).eq('id', r.id).eq('updated_at', r.updated_at);
    }
    if (!res.error) {
      detected++;
      if (Object.keys(patch).length) filled++;
    }
  }
  return { ok: true, detected, filled, left: rows.length - detected, ms: Date.now() - started };
}

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply({ ok: false, error: 'POST only.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));

    // --- pg_cron: detect jobs waiting for auto-publish ------------------
    if (body?.cron === 'detect') {
      const given = req.headers.get('x-madevisa-cron') ?? '';
      const expected = await cronSecret(service);
      if (!given || !expected || given !== expected) return reply({ ok: false, error: 'Forbidden.' }, 403);
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 60);
      return reply(await detectWaiting(service, limit));
    }

    // Admin = is_admin() for the caller's own session (includes the
    // two-step login requirement). Anonymous visitors are never admin.
    const authHeader = req.headers.get('Authorization') ?? '';
    let isAdmin = false;
    if (authHeader) {
      const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data } = await asCaller.rpc('is_admin');
      isAdmin = data === true;
    }

    // --- Admin: analyse raw descriptions (importer) --------------------
    if (Array.isArray(body?.items)) {
      if (!isAdmin) return reply({ ok: false, error: 'Admin access required.' }, 403);
      const items = (body.items as { title?: string; description?: string | null }[]).slice(0, 500);
      return reply({
        ok: true,
        facts: items.map((it) => {
          try {
            const raw = it?.description && it.description.length > MAX_DESCRIPTION_HTML ? it.description.slice(0, MAX_DESCRIPTION_HTML) : it?.description ?? null;
            const d = raw ? stripPageChrome(sanitizeJobHtml(raw), it?.title ?? '') : null;
            return detectJobFacts(d || raw || null, it?.title ?? '');
          } catch {
            return detectJobFacts(null, it?.title ?? '');
          }
        }),
      });
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
      const payload = safeAnalyse(r.title ?? '', r.description);
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
