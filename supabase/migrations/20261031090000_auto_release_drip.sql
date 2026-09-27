/*
# Auto-publish: waiting jobs go live a few at a time, all day  ("drip")

Run AFTER 20261029090000_job_releases.sql. Safe to run more than once.
Changes no existing job rows; stops after 5 s if the table is busy (just
run it again a minute later).

## How it works (all inside Supabase — no browser tab needed)
Every 30 seconds pg_cron runs auto_release_tick(). When its random 3–4 min
timer is up, it publishes a small batch of waiting jobs as one release.
Batch size = what's left of today's limit ÷ the 3–4 min slots left today,
so the day's jobs are spread evenly over 24 h (in your time zone).

A job is published only when it is READY:
  - imported & waiting (awaiting_release), status published, not expired
  - the description detector has run on it (facts_v set) — or failed on it
    3 times, so one broken description can't block the queue
  - its description has at least min_description_chars characters
    (catches pages that aren't jobs, like "Read about our trading fees")
  - it was posted within the last max_age_days days (default 14)
Newest first, rotating between companies (a company that just had a job
published waits its turn), so the feed looks varied.

Jobs that aren't ready simply keep waiting; the 30-day rule removes them
in the end. "Publish update" (publish everything now) still works.

## Detection
Every minute pg_cron calls the job-facts Edge Function for up to 30
waiting jobs that haven't been detected yet (only when there are any).
The function stores the details and fills empty fields — the same as
Admin → "Detect job details". Deploy it with:
    supabase functions deploy job-facts --no-verify-jwt
(or in the dashboard turn off "Enforce JWT verification" for job-facts —
the function checks access itself). If you'd rather keep JWT checks on,
put your anon key in auto_release_settings.detect_bearer instead.

## Daily limit
daily_limit (default 2,400 ≈ 6 jobs every ~3.5 min). With the 30-day rule
the site holds about daily_limit × 30 live jobs, so 2,400/day keeps the
catalogue near today's ~72k — the /jobs page stays as fast as it is now.
auto_balance: each morning the day's limit is nudged toward target_live
(±50% at most): fewer live jobs than the target → a bit more that day,
more → a bit less. Admins can change everything in Admin → Publish update,
add extra jobs for today, or publish a number right away.

## Cost
Ticks read one settings row; a release updates a few rows and inserts one
job_releases row. Detection is ~1,440 function calls a day at most (none
when nothing is waiting). Visitors fetch only what changed since their last
visit (src/lib/sponsoredJobs.ts), not the whole list.
*/

SET lock_timeout = '5s';

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net could not be enabled here (%). Enable it in Database → Extensions, then run this file again.', SQLERRM;
END $$;

-- Detector attempts (so a description that always fails is given up on).
ALTER TABLE public.sponsored_jobs ADD COLUMN IF NOT EXISTS facts_attempts smallint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Settings + state (one row). Only reachable through the functions below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auto_release_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  daily_limit integer NOT NULL DEFAULT 2400 CHECK (daily_limit BETWEEN 0 AND 50000),
  auto_balance boolean NOT NULL DEFAULT true,
  target_live integer NOT NULL DEFAULT 75000 CHECK (target_live >= 0),
  min_interval_s integer NOT NULL DEFAULT 180 CHECK (min_interval_s BETWEEN 30 AND 3600),
  max_interval_s integer NOT NULL DEFAULT 240 CHECK (max_interval_s BETWEEN 30 AND 3600),
  max_per_tick integer NOT NULL DEFAULT 25 CHECK (max_per_tick BETWEEN 1 AND 500),
  min_description_chars integer NOT NULL DEFAULT 200 CHECK (min_description_chars >= 0),
  max_age_days integer NOT NULL DEFAULT 14 CHECK (max_age_days BETWEEN 1 AND 30),
  timezone text NOT NULL DEFAULT 'Asia/Baku',
  detect_enabled boolean NOT NULL DEFAULT true,
  detect_url text DEFAULT 'https://fduetqpklyoxeqqdhozg.supabase.co/functions/v1/job-facts',
  detect_bearer text,
  -- state
  day date,
  today_limit integer,
  extra_today integer NOT NULL DEFAULT 0,
  released_today integer NOT NULL DEFAULT 0,
  next_release_at timestamptz NOT NULL DEFAULT now(),
  last_release_at timestamptz,
  last_batch integer,
  last_detect_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_release_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auto_release_settings FROM anon, authenticated;
INSERT INTO public.auto_release_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Shared secret between pg_cron and the job-facts function (never exposed).
CREATE TABLE IF NOT EXISTS public.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
INSERT INTO public.app_secrets (name, value)
VALUES ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- Closed jobs that were never published stay hidden (they used to show as
-- "Closed" for 24 h when a sync removed a job that was still waiting).
DROP POLICY IF EXISTS "sponsored_jobs_select_published_or_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_select_published_or_owner"
  ON public.sponsored_jobs FOR SELECT
  TO anon, authenticated
  USING (
    (status = 'published' AND NOT awaiting_release)
    OR (status = 'expired' AND closed_at > now() - interval '24 hours' AND NOT awaiting_release)
    OR (SELECT public.is_admin())
    OR public.can_manage_publisher(publisher_id)
  );

-- ---------------------------------------------------------------------------
-- Publishing a batch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._release_ready_jobs(p_n integer, p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  s public.auto_release_settings;
  released integer := 0;
BEGIN
  IF coalesce(p_n, 0) <= 0 THEN RETURN 0; END IF;
  SELECT * INTO s FROM public.auto_release_settings WHERE id;

  WITH ready AS (
    SELECT j.id, j.publisher_id, public.job_posted_at(j.source_posted_at, j.created_at) AS posted
    FROM public.sponsored_jobs j
    WHERE j.awaiting_release
      AND j.status = 'published'
      AND (j.facts_v IS NOT NULL OR j.facts_attempts >= 3)
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND char_length(coalesce(j.description, '')) >= s.min_description_chars
      AND public.job_posted_at(j.source_posted_at, j.created_at) > now() - make_interval(days => s.max_age_days)
  ),
  ranked AS (
    SELECT id, publisher_id, posted,
           row_number() OVER (PARTITION BY publisher_id ORDER BY posted DESC, id) AS rn
    FROM ready
  ),
  recent AS (
    -- Companies that had a job published in the last 6 h, and when.
    SELECT publisher_id, max(released_at) AS last_at
    FROM public.sponsored_jobs
    WHERE released_at > now() - interval '6 hours'
    GROUP BY publisher_id
  ),
  pick AS (
    SELECT r.id
    FROM ranked r
    LEFT JOIN recent c USING (publisher_id)
    ORDER BY r.rn, c.last_at NULLS FIRST, r.posted DESC
    LIMIT p_n
  )
  UPDATE public.sponsored_jobs j
  SET awaiting_release = false, released_at = now()
  FROM pick
  WHERE j.id = pick.id AND j.awaiting_release;
  GET DIAGNOSTICS released = ROW_COUNT;

  IF released > 0 THEN
    INSERT INTO public.job_releases (jobs_released, new_today, note, published_by)
    VALUES (released, public.count_new_today(), p_note, NULL);
  END IF;
  RETURN released;
END;
$$;
REVOKE ALL ON FUNCTION public._release_ready_jobs(integer, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The tick (pg_cron, every 30 s)
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
  n integer;
  got integer := 0;
BEGIN
  -- SKIP LOCKED: if a tick is still running, the next one just skips.
  SELECT * INTO s FROM public.auto_release_settings WHERE id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('skipped', 'busy'); END IF;

  local_now := now() AT TIME ZONE s.timezone;
  today := local_now::date;

  -- New day: set today's limit (auto-balanced), reset counters, tidy up.
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
    got := public._release_ready_jobs(n, 'auto');
  END IF;

  UPDATE public.auto_release_settings SET
    released_today = released_today + got,
    next_release_at = now() + make_interval(secs => (s.min_interval_s + floor(random() * (greatest(s.max_interval_s - s.min_interval_s, 0) + 1)))::double precision),
    last_release_at = CASE WHEN got > 0 THEN now() ELSE last_release_at END,
    last_batch = CASE WHEN got > 0 THEN got ELSE last_batch END
  WHERE id;
  RETURN jsonb_build_object('released', got, 'left_today', greatest(budget - got, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.auto_release_tick() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Detection (pg_cron, every minute) → job-facts Edge Function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_facts_count_attempt(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sponsored_jobs SET facts_attempts = least(facts_attempts + 1, 100) WHERE id = ANY (p_ids);
$$;
REVOKE ALL ON FUNCTION public.job_facts_count_attempt(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_facts_count_attempt(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.detect_waiting_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  s public.auto_release_settings;
  secret text;
  headers jsonb;
BEGIN
  SELECT * INTO s FROM public.auto_release_settings WHERE id;
  IF NOT s.detect_enabled OR coalesce(s.detect_url, '') = '' THEN RETURN 'off'; END IF;
  -- Nothing waiting for detection → no function call at all.
  IF NOT EXISTS (
    SELECT 1 FROM public.sponsored_jobs
    WHERE awaiting_release AND status = 'published' AND facts_v IS NULL AND facts_attempts < 3
  ) THEN
    RETURN 'nothing to detect';
  END IF;
  SELECT value INTO secret FROM public.app_secrets WHERE name = 'cron_secret';
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-madevisa-cron', secret);
  IF coalesce(s.detect_bearer, '') <> '' THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || s.detect_bearer, 'apikey', s.detect_bearer);
  END IF;
  PERFORM net.http_post(
    url := s.detect_url,
    body := jsonb_build_object('cron', 'detect', 'limit', 30),
    headers := headers,
    timeout_milliseconds := 30000
  );
  UPDATE public.auto_release_settings SET last_detect_at = now() WHERE id;
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.detect_waiting_tick() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin panel
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
    'cron', has_cron
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
    -- A new daily limit applies today too (the auto-balanced number is recomputed tomorrow).
    today_limit = CASE WHEN p ? 'daily_limit' THEN (p->>'daily_limit')::integer ELSE today_limit END,
    -- Turning it on: first batch within a minute.
    next_release_at = CASE WHEN (p->>'enabled')::boolean AND NOT enabled THEN now() ELSE next_release_at END,
    updated_at = now()
  WHERE id;
  RETURN public.auto_release_status();
END;
$$;
REVOKE ALL ON FUNCTION public.auto_release_configure(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_release_configure(jsonb) TO authenticated;

-- Admin: more jobs today. p_now = true → publish them right away (one
-- release); false → add them to today's budget, spread over the rest of the day.
CREATE OR REPLACE FUNCTION public.auto_release_extra(p_n integer, p_now boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  got integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_n, 0) <= 0 THEN RETURN jsonb_build_object('released', 0); END IF;
  IF p_now THEN
    got := public._release_ready_jobs(least(p_n, 20000), 'manual');
  ELSE
    UPDATE public.auto_release_settings SET extra_today = extra_today + least(p_n, 50000) WHERE id;
  END IF;
  RETURN jsonb_build_object('released', got, 'status', public.auto_release_status());
END;
$$;
REVOKE ALL ON FUNCTION public.auto_release_extra(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_release_extra(integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron is not available (%). Auto-publish needs it.', SQLERRM;
    RETURN;
  END;

  BEGIN PERFORM cron.unschedule('madevisa-auto-release'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('madevisa-detect-waiting'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('madevisa-cron-history-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Every 30 s gives a natural 3–4 min rhythm; older pg_cron: every minute.
  BEGIN
    PERFORM cron.schedule('madevisa-auto-release', '30 seconds', 'select public.auto_release_tick()');
  EXCEPTION WHEN OTHERS THEN
    PERFORM cron.schedule('madevisa-auto-release', '* * * * *', 'select public.auto_release_tick()');
  END;
  PERFORM cron.schedule('madevisa-detect-waiting', '* * * * *', 'select public.detect_waiting_tick()');
  -- pg_cron keeps a log row per run; keep 2 days so it doesn't grow the database.
  PERFORM cron.schedule('madevisa-cron-history-cleanup', '17 3 * * *',
    $c$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'$c$);
END $$;
