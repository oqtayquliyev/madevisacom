/*
# Automatic pipeline — find, sync, detect and publish, a few at a time, all day

Run AFTER 20261031090000_auto_release_drip.sql. Safe to run more than once.
Needs the new Edge Function `auto-pipeline` and the updated
`import-ats-jobs` (see the deploy notes in auto-pipeline/index.ts).

Nothing here needs a browser tab. pg_cron drives everything:

## Conveyor (every 3–4 minutes, on the auto-publish timer)
auto_release_tick() calls the auto-pipeline function, which:
  1. takes the next 1–3 companies, each from a DIFFERENT country, rotating
     through the country list (companies checked in the last resync_hours
     are skipped);
  2. reads each company's careers feed once, closes jobs that are gone
     from it (same safety rules as "Update all jobs");
  3. inserts only the few NEWEST new jobs it needs this round (the rest
     stay on the company's own careers page, not in a waiting list here),
     runs the description detector on them straight away;
  4. publishes them as one small release (conveyor_release) — topped up
     from anything still waiting from manual syncs.
If the function stops answering for 15 minutes, the tick falls back to
publishing from the waiting list directly, so the site never freezes.

## Finder (every finder_every_min minutes, default 20)
Calls auto-pipeline to add ONE new company: next country in the list,
next company down that country's Wikidata ranking that isn't on MadeVisa
yet. Clear career page → company + source added (the conveyor picks it
up). Unsure / no page → saved to company_leads, as the admin tool does.
Each country's position is kept in finder_country_progress.

## Admin
Admin → Publish update → "Automatic pipeline" (switches, settings, recent
activity, "Run once now").
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Settings / state
-- ---------------------------------------------------------------------------
ALTER TABLE public.auto_release_settings
  ADD COLUMN IF NOT EXISTS pipeline_url text DEFAULT 'https://fduetqpklyoxeqqdhozg.supabase.co/functions/v1/auto-pipeline',
  ADD COLUMN IF NOT EXISTS conveyor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS companies_per_run integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS resync_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS country_order text[] NOT NULL DEFAULT ARRAY[
    'GB','NL','DE','IE','CA','US','AU','SE','NO','DK','FI','CH','AT','BE','LU','FR','ES','PT','IT','PL','CZ','AE','SG','JP','KR','OTHER'],
  ADD COLUMN IF NOT EXISTS conveyor_country_idx integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conveyor_lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS conveyor_fired_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_conveyor_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_conveyor jsonb,
  ADD COLUMN IF NOT EXISTS finder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finder_every_min integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS next_finder_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finder_country_idx integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finder_lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_finder_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_finder jsonb;

DO $$
BEGIN
  ALTER TABLE public.auto_release_settings ADD CONSTRAINT auto_release_companies_per_run_check CHECK (companies_per_run BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.auto_release_settings ADD CONSTRAINT auto_release_resync_hours_check CHECK (resync_hours BETWEEN 1 AND 336);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.auto_release_settings ADD CONSTRAINT auto_release_finder_every_check CHECK (finder_every_min BETWEEN 5 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Where the finder is in each country's ranking.
CREATE TABLE IF NOT EXISTS public.finder_country_progress (
  country text PRIMARY KEY,
  list jsonb NOT NULL DEFAULT '[]'::jsonb, -- Wikidata ids, biggest first
  list_at timestamptz,
  next_index integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finder_country_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finder_country_progress FROM anon, authenticated;

-- What the pipeline did (last ~500 entries kept).
CREATE TABLE IF NOT EXISTS public.pipeline_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,          -- 'sync' | 'find' | 'error'
  ok boolean NOT NULL DEFAULT true,
  summary text NOT NULL,
  detail jsonb
);
CREATE INDEX IF NOT EXISTS pipeline_log_at_idx ON public.pipeline_log (at DESC);
ALTER TABLE public.pipeline_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pipeline_log FROM anon, authenticated;

-- Finding a company's jobs for the conveyor quickly.
CREATE INDEX IF NOT EXISTS import_sources_last_synced_idx ON public.import_sources (last_synced_at NULLS FIRST);

-- ---------------------------------------------------------------------------
-- Conveyor helpers (called by the auto-pipeline function with the service key)
-- ---------------------------------------------------------------------------

-- One run at a time. true = this run may go ahead.
CREATE OR REPLACE FUNCTION public.pipeline_claim(p_kind text, p_minutes integer DEFAULT 6)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_kind = 'sync' THEN
    UPDATE public.auto_release_settings SET conveyor_lock_until = now() + make_interval(mins => p_minutes)
    WHERE id AND (conveyor_lock_until IS NULL OR conveyor_lock_until < now());
  ELSE
    UPDATE public.auto_release_settings SET finder_lock_until = now() + make_interval(mins => p_minutes)
    WHERE id AND (finder_lock_until IS NULL OR finder_lock_until < now());
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- The next companies to check: each from a different country, rotating.
-- Claims them (last_synced_at = now) so a crash can't loop on one company.
CREATE OR REPLACE FUNCTION public.conveyor_next_sources(p_count integer)
RETURNS TABLE (id uuid, publisher_id uuid, kind text, source_url text, resolved_url text, strategy text, auto_publish boolean, publisher_name text, country text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  s public.auto_release_settings;
  n integer;
  i integer := 0;
  code text;
  picked uuid[] := ARRAY[]::uuid[];
  listed text[];
  row_id uuid;
BEGIN
  SELECT * INTO s FROM public.auto_release_settings WHERE auto_release_settings.id;
  n := coalesce(array_length(s.country_order, 1), 0);
  IF n = 0 THEN RETURN; END IF;
  listed := array_remove(s.country_order, 'OTHER');

  WHILE i < n AND coalesce(array_length(picked, 1), 0) < greatest(p_count, 1) LOOP
    code := s.country_order[((s.conveyor_country_idx + i) % n) + 1];
    SELECT src.id INTO row_id
    FROM public.import_sources src
    JOIN public.program_publishers p ON p.id = src.publisher_id
    LEFT JOIN public.countries c ON c.id = p.country_id
    WHERE (src.last_synced_at IS NULL OR src.last_synced_at < now() - make_interval(hours => s.resync_hours))
      AND NOT (src.id = ANY (picked))
      AND CASE WHEN code = 'OTHER' THEN (c.iso_code IS NULL OR NOT (c.iso_code = ANY (listed))) ELSE c.iso_code = code END
    ORDER BY src.last_synced_at NULLS FIRST
    LIMIT 1;
    IF row_id IS NOT NULL THEN picked := picked || row_id; END IF;
    row_id := NULL;
    i := i + 1;
  END LOOP;

  UPDATE public.auto_release_settings SET conveyor_country_idx = (conveyor_country_idx + i) % n WHERE auto_release_settings.id;
  UPDATE public.import_sources SET last_synced_at = now() WHERE import_sources.id = ANY (picked);

  RETURN QUERY
  SELECT src.id, src.publisher_id, src.kind::text, src.source_url::text, src.resolved_url::text, src.strategy::text, src.auto_publish, p.name::text, c.iso_code::text
  FROM public.import_sources src
  JOIN public.program_publishers p ON p.id = src.publisher_id
  LEFT JOIN public.countries c ON c.id = p.country_id
  WHERE src.id = ANY (picked)
  ORDER BY array_position(picked, src.id);
END;
$$;

-- "Still on the careers page" — at most once a day per job (feeds the job page's "checked" signal).
CREATE OR REPLACE FUNCTION public.conveyor_mark_seen(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sponsored_jobs SET last_seen_at = now()
  WHERE id = ANY (p_ids) AND (last_seen_at IS NULL OR last_seen_at < now() - interval '20 hours');
$$;

-- Publishes the conveyor's new jobs (+ a top-up from the waiting list) as one step.
CREATE OR REPLACE FUNCTION public.conveyor_release(p_ids uuid[], p_topup integer, p_summary jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  own integer := 0;
  extra integer := 0;
  msg text;
BEGIN
  IF coalesce(array_length(p_ids, 1), 0) > 0 THEN
    UPDATE public.sponsored_jobs SET awaiting_release = false, released_at = now()
    WHERE id = ANY (p_ids) AND awaiting_release AND status = 'published';
    GET DIAGNOSTICS own = ROW_COUNT;
    IF own > 0 THEN
      INSERT INTO public.job_releases (jobs_released, new_today, note, published_by)
      VALUES (own, public.count_new_today(), 'pipeline', NULL);
    END IF;
  END IF;
  IF coalesce(p_topup, 0) > 0 THEN
    extra := public._release_ready_jobs(p_topup, 'pipeline top-up');
  END IF;

  UPDATE public.auto_release_settings SET
    released_today = released_today + own + extra,
    last_release_at = CASE WHEN own + extra > 0 THEN now() ELSE last_release_at END,
    last_batch = CASE WHEN own + extra > 0 THEN own + extra ELSE last_batch END,
    last_conveyor_at = now(),
    last_conveyor = coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('published', own + extra, 'from_waiting', extra),
    conveyor_lock_until = NULL
  WHERE id;

  msg := coalesce(p_summary->>'text', 'Checked companies') || ' · published ' || (own + extra);
  INSERT INTO public.pipeline_log (kind, ok, summary, detail) VALUES ('sync', coalesce((p_summary->>'ok')::boolean, true), msg, p_summary);
  DELETE FROM public.pipeline_log WHERE id < (SELECT max(id) - 500 FROM public.pipeline_log);
  RETURN jsonb_build_object('published', own + extra, 'own', own, 'from_waiting', extra);
END;
$$;

CREATE OR REPLACE FUNCTION public.pipeline_finished(p_kind text, p_ok boolean, p_summary text, p_detail jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind = 'find' THEN
    UPDATE public.auto_release_settings SET last_finder_at = now(), last_finder = coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('text', p_summary, 'ok', p_ok), finder_lock_until = NULL WHERE id;
  ELSIF p_kind = 'sync' THEN
    -- A sync run that ended without releasing (error / nothing to do).
    UPDATE public.auto_release_settings SET last_conveyor_at = now(), last_conveyor = coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('text', p_summary, 'ok', p_ok), conveyor_lock_until = NULL WHERE id;
  END IF;
  INSERT INTO public.pipeline_log (kind, ok, summary, detail) VALUES (p_kind, p_ok, p_summary, p_detail);
  DELETE FROM public.pipeline_log WHERE id < (SELECT max(id) - 500 FROM public.pipeline_log);
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_claim(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conveyor_next_sources(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conveyor_mark_seen(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conveyor_release(uuid[], integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_finished(text, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_claim(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.conveyor_next_sources(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.conveyor_mark_seen(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.conveyor_release(uuid[], integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pipeline_finished(text, boolean, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Calling the function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pipeline_call(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.auto_release_settings;
  secret text;
  headers jsonb;
BEGIN
  SELECT * INTO s FROM public.auto_release_settings WHERE id;
  IF coalesce(s.pipeline_url, '') = '' THEN RETURN; END IF;
  SELECT value INTO secret FROM public.app_secrets WHERE name = 'cron_secret';
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-madevisa-cron', secret);
  IF coalesce(s.detect_bearer, '') <> '' THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || s.detect_bearer, 'apikey', s.detect_bearer);
  END IF;
  PERFORM net.http_post(url := s.pipeline_url, body := p_body, headers := headers, timeout_milliseconds := 30000);
END;
$$;
REVOKE ALL ON FUNCTION public._pipeline_call(jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The tick (replaces the version from 20261031090000)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_release_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '25s'
AS $$
DECLARE
  s public.auto_release_settings;
  local_now timestamp;
  today date;
  live integer;
  lim integer;
  budget integer;
  slots numeric;
  n integer := 0;
  got integer := 0;
  healthy boolean;
  mode text := 'direct';
BEGIN
  SELECT * INTO s FROM public.auto_release_settings WHERE id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('skipped', 'busy'); END IF;

  local_now := now() AT TIME ZONE s.timezone;
  today := local_now::date;

  IF s.day IS DISTINCT FROM today THEN
    lim := s.daily_limit;
    IF s.auto_balance AND s.target_live > 0 THEN
      SELECT count(*) INTO live FROM public.sponsored_jobs
      WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now());
      lim := round(s.daily_limit * least(1.5, greatest(0.5, s.target_live::numeric / greatest(live, 1))))::integer;
    END IF;
    UPDATE public.auto_release_settings SET day = today, today_limit = lim, released_today = 0, extra_today = 0 WHERE id;
    s.day := today; s.today_limit := lim; s.released_today := 0; s.extra_today := 0;
    DELETE FROM public.job_releases WHERE published_at < now() - interval '14 days'
      AND id <> (SELECT max(id) FROM public.job_releases);
  END IF;

  IF NOT s.enabled THEN RETURN jsonb_build_object('skipped', 'off'); END IF;
  IF now() < s.next_release_at THEN RETURN jsonb_build_object('skipped', 'not yet'); END IF;

  budget := coalesce(s.today_limit, s.daily_limit) + s.extra_today - s.released_today;
  IF budget > 0 THEN
    slots := greatest(1, floor(extract(epoch FROM ((today + 1)::timestamp - local_now)) / ((s.min_interval_s + s.max_interval_s) / 2.0)));
    n := least(s.max_per_tick, budget, greatest(1, ceil(budget / slots)::integer));
  END IF;

  -- Healthy = it reported back in the last 15 min (or was switched on less
  -- than 15 min ago). conveyor_fired_at = when it was first called since
  -- being switched on.
  healthy := coalesce(s.last_conveyor_at, s.conveyor_fired_at, now()) > now() - interval '15 minutes';

  IF s.conveyor_enabled AND coalesce(s.pipeline_url, '') <> '' THEN
    IF s.conveyor_lock_until IS NULL OR s.conveyor_lock_until < now() THEN
      -- Checks companies (removals too) even when today's limit is reached; want = 0 then.
      PERFORM public._pipeline_call(jsonb_build_object('cron', 'sync', 'want', n));
      UPDATE public.auto_release_settings SET conveyor_fired_at = coalesce(conveyor_fired_at, now()) WHERE id;
      mode := 'pipeline';
    END IF;
    IF NOT healthy AND n > 0 THEN
      got := public._release_ready_jobs(n, 'auto (pipeline not answering)');
      mode := mode || '+fallback';
    END IF;
  ELSIF n > 0 THEN
    got := public._release_ready_jobs(n, 'auto');
  END IF;

  UPDATE public.auto_release_settings SET
    released_today = released_today + got,
    next_release_at = now() + make_interval(secs => (s.min_interval_s + floor(random() * (greatest(s.max_interval_s - s.min_interval_s, 0) + 1)))::double precision),
    last_release_at = CASE WHEN got > 0 THEN now() ELSE last_release_at END,
    last_batch = CASE WHEN got > 0 THEN got ELSE last_batch END
  WHERE id;
  RETURN jsonb_build_object('mode', mode, 'want', n, 'released_directly', got);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_release_tick() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finder_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.auto_release_settings;
BEGIN
  SELECT * INTO s FROM public.auto_release_settings WHERE id;
  IF NOT s.finder_enabled OR now() < s.next_finder_at THEN RETURN 'not yet'; END IF;
  IF s.finder_lock_until IS NOT NULL AND s.finder_lock_until > now() THEN RETURN 'running'; END IF;
  UPDATE public.auto_release_settings SET next_finder_at = now() + make_interval(mins => s.finder_every_min) WHERE id;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'find'));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.finder_tick() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_release_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  s public.auto_release_settings;
  c record;
  last_detect_status integer;
  has_cron boolean := false;
  due integer;
  log jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.auto_release_settings WHERE id;

  SELECT
    count(*) AS waiting,
    count(*) FILTER (WHERE facts_v IS NULL AND facts_attempts < 3) AS to_detect,
    count(*) FILTER (WHERE facts_v IS NULL AND facts_attempts >= 3) AS detect_failed,
    count(*) FILTER (WHERE (facts_v IS NOT NULL OR facts_attempts >= 3)
                       AND char_length(coalesce(description, '')) < s.min_description_chars) AS too_short,
    count(*) FILTER (WHERE public.job_posted_at(source_posted_at, created_at) <= now() - make_interval(days => s.max_age_days)) AS too_old,
    count(*) FILTER (WHERE (facts_v IS NOT NULL OR facts_attempts >= 3)
                       AND (expires_at IS NULL OR expires_at > now())
                       AND char_length(coalesce(description, '')) >= s.min_description_chars
                       AND public.job_posted_at(source_posted_at, created_at) > now() - make_interval(days => s.max_age_days)) AS ready
  INTO c
  FROM public.sponsored_jobs
  WHERE awaiting_release AND status = 'published';

  SELECT count(*) INTO due FROM public.import_sources
  WHERE last_synced_at IS NULL OR last_synced_at < now() - make_interval(hours => s.resync_hours);

  SELECT coalesce(jsonb_agg(jsonb_build_object('at', at, 'kind', kind, 'ok', ok, 'summary', summary) ORDER BY id DESC), '[]'::jsonb)
  INTO log FROM (SELECT * FROM public.pipeline_log ORDER BY id DESC LIMIT 12) l;

  BEGIN
    SELECT status_code INTO last_detect_status FROM net._http_response ORDER BY id DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN last_detect_status := NULL;
  END;
  BEGIN
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'madevisa-auto-release') INTO has_cron;
  EXCEPTION WHEN OTHERS THEN has_cron := false;
  END;

  RETURN jsonb_build_object(
    'enabled', s.enabled,
    'daily_limit', s.daily_limit,
    'auto_balance', s.auto_balance,
    'target_live', s.target_live,
    'min_interval_s', s.min_interval_s,
    'max_interval_s', s.max_interval_s,
    'max_per_tick', s.max_per_tick,
    'min_description_chars', s.min_description_chars,
    'max_age_days', s.max_age_days,
    'timezone', s.timezone,
    'detect_enabled', s.detect_enabled,
    'today_limit', coalesce(s.today_limit, s.daily_limit),
    'extra_today', s.extra_today,
    'released_today', s.released_today,
    'next_release_at', s.next_release_at,
    'last_release_at', s.last_release_at,
    'last_batch', s.last_batch,
    'last_detect_at', s.last_detect_at,
    'last_detect_status', last_detect_status,
    'waiting', c.waiting,
    'ready', c.ready,
    'to_detect', c.to_detect,
    'detect_failed', c.detect_failed,
    'too_short', c.too_short,
    'too_old', c.too_old,
    'cron', has_cron,
    'conveyor_enabled', s.conveyor_enabled,
    'companies_per_run', s.companies_per_run,
    'resync_hours', s.resync_hours,
    'last_conveyor_at', s.last_conveyor_at,
    'last_conveyor', s.last_conveyor,
    'conveyor_healthy', coalesce(s.last_conveyor_at, s.conveyor_fired_at, now()) > now() - interval '15 minutes',
    'sources_due', due,
    'finder_enabled', s.finder_enabled,
    'finder_every_min', s.finder_every_min,
    'next_finder_at', s.next_finder_at,
    'last_finder_at', s.last_finder_at,
    'last_finder', s.last_finder,
    'log', log
  );
END;
$$;
REVOKE ALL ON FUNCTION public.auto_release_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_release_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_release_configure(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.auto_release_settings SET
    enabled = coalesce((p->>'enabled')::boolean, enabled),
    daily_limit = coalesce((p->>'daily_limit')::integer, daily_limit),
    auto_balance = coalesce((p->>'auto_balance')::boolean, auto_balance),
    target_live = coalesce((p->>'target_live')::integer, target_live),
    min_interval_s = coalesce((p->>'min_interval_s')::integer, min_interval_s),
    max_interval_s = greatest(coalesce((p->>'max_interval_s')::integer, max_interval_s), coalesce((p->>'min_interval_s')::integer, min_interval_s)),
    max_per_tick = coalesce((p->>'max_per_tick')::integer, max_per_tick),
    min_description_chars = coalesce((p->>'min_description_chars')::integer, min_description_chars),
    max_age_days = coalesce((p->>'max_age_days')::integer, max_age_days),
    timezone = coalesce(nullif(p->>'timezone', ''), timezone),
    detect_enabled = coalesce((p->>'detect_enabled')::boolean, detect_enabled),
    conveyor_enabled = coalesce((p->>'conveyor_enabled')::boolean, conveyor_enabled),
    companies_per_run = coalesce((p->>'companies_per_run')::integer, companies_per_run),
    resync_hours = coalesce((p->>'resync_hours')::integer, resync_hours),
    finder_enabled = coalesce((p->>'finder_enabled')::boolean, finder_enabled),
    finder_every_min = coalesce((p->>'finder_every_min')::integer, finder_every_min),
    today_limit = CASE WHEN p ? 'daily_limit' THEN (p->>'daily_limit')::integer ELSE today_limit END,
    next_release_at = CASE WHEN (p->>'enabled')::boolean AND NOT enabled THEN now() ELSE next_release_at END,
    next_finder_at = CASE WHEN (p->>'finder_enabled')::boolean AND NOT finder_enabled THEN now() ELSE next_finder_at END,
    -- Switching the conveyor on/off starts its health check fresh.
    conveyor_fired_at = CASE WHEN p ? 'conveyor_enabled' THEN NULL ELSE conveyor_fired_at END,
    updated_at = now()
  WHERE id;
  RETURN public.auto_release_status();
END;
$$;
REVOKE ALL ON FUNCTION public.auto_release_configure(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_release_configure(jsonb) TO authenticated;

-- Admin: run one step now (for testing / catching up).
CREATE OR REPLACE FUNCTION public.pipeline_run_now(p_kind text, p_want integer DEFAULT 5)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_kind = 'find' THEN
    PERFORM public._pipeline_call(jsonb_build_object('cron', 'find'));
  ELSE
    PERFORM public._pipeline_call(jsonb_build_object('cron', 'sync', 'want', greatest(least(coalesce(p_want, 5), 50), 0)));
    UPDATE public.auto_release_settings SET conveyor_fired_at = coalesce(conveyor_fired_at, now()) WHERE id;
  END IF;
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.pipeline_run_now(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pipeline_run_now(text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: the finder checks every 5 minutes whether its turn has come.
-- (madevisa-auto-release from the previous migration keeps running.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-finder'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('madevisa-finder', '*/5 * * * *', 'select public.finder_tick()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%): the finder can only be run from the admin panel.', SQLERRM;
END $$;
