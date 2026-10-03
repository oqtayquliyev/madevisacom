// supabase/functions/auto-pipeline/index.ts
//
// MadeVisa's automatic pipeline — runs with no admin tab open. pg_cron
// (migration 20261101090000_auto_pipeline.sql) calls it with:
//   { cron: "sync", want: 5 }  → conveyor.ts: check 1–3 companies (different
//        countries), close jobs gone from their careers pages, add + detect
//        the few newest new jobs, publish them.            (every 3–4 min)
//   { cron: "find" }           → finder.ts: add one new company from the
//        next country (or save it for later).              (every ~20 min)
//   { cron: "articles" }       → articles.ts: weekly hiring reports.   (Mondays)
//   { cron: "social" }         → social.ts: plan, check and publish social posts. (every 10 min)
//   { cron: "sponsors" }       → sponsors.ts: UK register of licensed sponsors.   (daily)
//   { cron: "monthly" }        → monthly.ts: Visa Hiring Report for last month. (1st of month)
//   { cron: "media" }          → media.ts: real photos and clips per country, from Pexels. (daily, or from the admin panel)
// The header x-madevisa-cron must match app_secrets.cron_secret.
// It answers at once (202) and keeps working in the background.
//
// Deploy (from the project folder — it uses files from job-facts/ and
// company-finder/, so it must be deployed with the CLI, not the dashboard):
//   supabase functions deploy auto-pipeline --no-verify-jwt
//   supabase functions deploy import-ats-jobs

import { createClient } from 'npm:@supabase/supabase-js@2';
import { runConveyor } from './conveyor.ts';
import { runFinder } from './finder.ts';
import { runArticles } from './articles.ts';
import { runSocial } from './social.ts';
import { runSponsors } from './sponsors.ts';
import { runMonthly } from './monthly.ts';
import { runMedia } from './media.ts';
import { pipelineSecret } from './shared.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ ok: false, error: 'POST only.' }, 405);

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const given = req.headers.get('x-madevisa-cron') ?? '';
  const expected = await pipelineSecret(service);
  if (!given || !expected || given !== expected) return reply({ ok: false, error: 'Forbidden.' }, 403);

  const body = await req.json().catch(() => ({}));
  let work: Promise<void>;
  if (body?.cron === 'sync') work = runConveyor(service, Math.min(Math.max(Number(body.want) || 0, 0), 50));
  else if (body?.cron === 'find') work = runFinder(service);
  else if (body?.cron === 'articles') work = runArticles(service);
  else if (body?.cron === 'social') work = runSocial(service, body.force === true);
  else if (body?.cron === 'sponsors') work = runSponsors(service);
  else if (body?.cron === 'monthly') work = runMonthly(service);
  else if (body?.cron === 'media') work = runMedia(service, body.force === true).then(() => undefined);
  else return reply({ ok: false, error: 'Unknown job.' }, 400);

  const safe = work.catch(async (e) => {
    await service.rpc('pipeline_finished', { p_kind: body.cron, p_ok: false, p_summary: `Crashed: ${e instanceof Error ? e.message : String(e)}`, p_detail: null });
  });
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(safe);
    return reply({ ok: true, started: body.cron }, 202);
  }
  await safe;
  return reply({ ok: true, done: body.cron });
});
