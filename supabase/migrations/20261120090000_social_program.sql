/*
# Social content program (Batch 6)

Run AFTER 20261119090000_visa_plan_name.sql. Safe to run more than once.
Paste the whole file into ONE query tab in the Supabase SQL Editor and run it.
Then deploy:  supabase functions deploy auto-pipeline --no-verify-jwt

## What this adds
Until now the pipeline posted job lists, campaign by campaign. This adds a
PROGRAM on top: press Start once and every network gets a planned mix of
45 kinds of post (fresh jobs, "X is hiring", visa routes, the Visa Plan,
real applicant outcomes, questions, tips, news…) at different times every
day. The formats, the mix and the timing rules are in
supabase/functions/auto-pipeline/programCatalog.ts and programSchedule.ts.

## Tables
- social_program          one row: running or not, time zone, autopilot or
                          approve-first, posts per day per network, which
                          formats are on, the pillar mix, the @handles.
- social_posts            new status "planned" (a slot with a time and a kind
                          of post, written later), and new columns: origin,
                          kind, pillar, topic_key, meta, write_at.
- social_history          what was posted where (kind, topic, opening line) —
                          small rows kept 4 months, so nothing repeats even
                          after old posts are deleted.
- social_news             the News desk: items you add ("X announced Y") with
                          their source. Posted once per network, then archived.
- social_country_photos   one photo per country for the images (optional —
                          without one the image uses the flag on the gradient).
- social_replies          Instagram comments already answered (comment "+"
                          posts), so nobody is answered twice.

## Flow
pg_cron → social_tick() every 5 min → auto-pipeline { cron: "social" }:
  program: plan the next 3 days → write the slots that are close →
  campaigns (paused on networks the program covers) → publish what is due →
  reply to "+" comments.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. social_posts: slots and program posts
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'campaign';
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS pillar text;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS topic_key text;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
-- When the pipeline should write the slot (its time minus the lead: 2 h for job posts, 20 h for the rest).
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS write_at timestamptz;

ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_status_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('planned', 'awaiting_approval', 'approved', 'publishing', 'published', 'manual', 'failed', 'rejected', 'expired'));
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_origin_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_origin_check CHECK (origin IN ('campaign', 'program'));

CREATE INDEX IF NOT EXISTS social_posts_program_idx ON public.social_posts (origin, status, scheduled_at);

-- ---------------------------------------------------------------------------
-- 2. The program (one row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_program (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  running boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',                -- the audience's clock, e.g. Europe/Berlin
  autopilot boolean NOT NULL DEFAULT true,             -- false = every post waits for approval
  per_day jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { "instagram": 3, "telegram": 5 } (missing = default rhythm, 0 = not in the program)
  formats jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { "comment_cta": false } (missing = the format's default)
  mix jsonb NOT NULL DEFAULT '{}'::jsonb,              -- { "jobs": 28, "visa": 17, … } (missing = default share)
  handles jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { "instagram": "@madevisa" }
  focus text[] NOT NULL DEFAULT '{}',                  -- ISO codes to feature first (empty = follow the data)
  started_at timestamptz,
  stopped_at timestamptz,
  planned_at timestamptz,
  last_run_at timestamptz,
  last_result text,
  lock_until timestamptz,
  replies_ok boolean,
  replies_note text,
  replies_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.social_program (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. What was posted (the program's memory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_history (
  id bigserial PRIMARY KEY,
  platform text NOT NULL,
  kind text NOT NULL,
  pillar text NOT NULL,
  topic text,                 -- "country_hiring:DE", "visa_route:de-blue-card"
  opening text,               -- first line of the caption, lower-case
  at timestamptz NOT NULL,    -- when the post was scheduled
  post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_history_platform_idx ON public.social_history (platform, at DESC);
CREATE INDEX IF NOT EXISTS social_history_post_idx ON public.social_history (post_id);

-- ---------------------------------------------------------------------------
-- 4. News desk
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,                 -- "Portugal opens applications for its job-seeker visa"
  summary text,                           -- one or two sentences
  points text[] NOT NULL DEFAULT '{}',    -- up to 3 short facts
  country_code text,                      -- ISO, for the flag and the photo
  kicker text,                            -- label on the image: "News", "New program", "Deadline"…
  source_name text,                       -- "gov.pt"
  source_url text NOT NULL,               -- the official page — required
  link_path text,                         -- page on madevisa.com to send people to, e.g. /destinations/portugal
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'archived')),
  use_after timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '10 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_news_limits CHECK (
    length(btrim(headline)) BETWEEN 8 AND 160
    AND (summary IS NULL OR length(summary) <= 320)
    AND coalesce(array_length(points, 1), 0) <= 3
    AND source_url ~* '^https://'
    AND (link_path IS NULL OR link_path ~ '^/')
    AND (country_code IS NULL OR country_code ~ '^[A-Za-z]{2}$')
  )
);
CREATE INDEX IF NOT EXISTS social_news_status_idx ON public.social_news (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Country photos and answered comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_country_photos (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  url text NOT NULL CHECK (url ~* '^https://'),
  credit text CHECK (credit IS NULL OR length(credit) <= 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_replies (
  comment_id text PRIMARY KEY,
  post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin only (the pipeline uses the service key).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_program', 'social_history', 'social_news', 'social_country_photos', 'social_replies'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_admin" ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.social_history_id_seq TO authenticated, service_role;

-- Country photos are uploaded by admins into social-images/countries/ (JPEG, public read, 5 MB — the bucket's own limits).
DROP POLICY IF EXISTS "social_images_admin_insert" ON storage.objects;
CREATE POLICY "social_images_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-images' AND (storage.foldername(name))[1] = 'countries' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS "social_images_admin_update" ON storage.objects;
CREATE POLICY "social_images_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'social-images' AND (storage.foldername(name))[1] = 'countries' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS "social_images_admin_delete" ON storage.objects;
CREATE POLICY "social_images_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-images' AND (storage.foldername(name))[1] = 'countries' AND (SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- 6. Rejecting, expiring or re-planning a post frees its jobs AND its topic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_posts_release_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('rejected', 'expired', 'planned') AND OLD.status NOT IN ('rejected', 'expired', 'planned') THEN
    DELETE FROM public.social_post_jobs WHERE post_id = NEW.id;
    DELETE FROM public.social_history WHERE post_id = NEW.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Start, stop, re-plan, rewrite
-- ---------------------------------------------------------------------------

-- Pipeline: one program run at a time.
CREATE OR REPLACE FUNCTION public.social_program_claim(p_minutes integer DEFAULT 6)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.social_program SET lock_until = now() + make_interval(mins => p_minutes)
  WHERE id AND (lock_until IS NULL OR lock_until < now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.social_program_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_program_claim(integer) TO service_role;

-- Admin: start (or restart with new settings). Only the keys you pass are changed.
CREATE OR REPLACE FUNCTION public.social_program_start(p_settings jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_settings ? 'timezone' AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_settings->>'timezone') THEN
    RAISE EXCEPTION 'Unknown time zone: %', p_settings->>'timezone';
  END IF;
  UPDATE public.social_program SET
    running = true,
    started_at = now(),
    stopped_at = NULL,
    planned_at = NULL,
    lock_until = NULL,
    timezone = coalesce(p_settings->>'timezone', timezone),
    autopilot = coalesce((p_settings->>'autopilot')::boolean, autopilot),
    per_day = coalesce(p_settings->'per_day', per_day),
    formats = coalesce(p_settings->'formats', formats),
    mix = coalesce(p_settings->'mix', mix),
    handles = coalesce(p_settings->'handles', handles),
    focus = CASE WHEN p_settings ? 'focus' THEN ARRAY(SELECT upper(x) FROM jsonb_array_elements_text(p_settings->'focus') x) ELSE focus END,
    updated_at = now()
  WHERE id;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'started';
END;
$$;
REVOKE ALL ON FUNCTION public.social_program_start(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_program_start(jsonb) TO authenticated;

-- Admin: stop. Slots are removed and program posts that haven't gone out are
-- withdrawn (their jobs and topics become free again). Published posts stay.
CREATE OR REPLACE FUNCTION public.social_program_stop()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slots integer;
  posts integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.social_program SET running = false, stopped_at = now(), lock_until = NULL, updated_at = now() WHERE id;
  DELETE FROM public.social_posts WHERE origin = 'program' AND status = 'planned';
  GET DIAGNOSTICS slots = ROW_COUNT;
  UPDATE public.social_posts SET status = 'rejected', error = 'Program stopped'
  WHERE origin = 'program' AND status IN ('awaiting_approval', 'approved', 'failed');
  GET DIAGNOSTICS posts = ROW_COUNT;
  RETURN format('stopped: %s slots removed, %s posts withdrawn', slots, posts);
END;
$$;
REVOKE ALL ON FUNCTION public.social_program_stop() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_program_stop() TO authenticated;

-- Admin: plan again after changing settings (slots not yet written are replaced; written posts stay).
CREATE OR REPLACE FUNCTION public.social_program_replan()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.social_posts WHERE origin = 'program' AND status = 'planned';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.social_program SET planned_at = NULL, lock_until = NULL, updated_at = now() WHERE id;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN format('%s slots replaced', n);
END;
$$;
REVOKE ALL ON FUNCTION public.social_program_replan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_program_replan() TO authenticated;

-- Admin: write a slot now, write a post again, or change what kind of post a slot is.
-- p_want names the exact topic (a News desk item's id) when a specific one is meant.
DROP FUNCTION IF EXISTS public.social_slot_rewrite(uuid, text);
CREATE OR REPLACE FUNCTION public.social_slot_rewrite(p_id uuid, p_kind text DEFAULT NULL, p_want text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.social_posts SET
    status = 'planned',
    format = 'slot',
    kind = coalesce(nullif(p_kind, ''), kind),
    caption = '',
    headline = '',
    images = '[]'::jsonb,
    links = '[]'::jsonb,
    job_ids = '{}',
    topic_key = NULL,
    image_key = 'slot:' || id::text,
    validation = '{}'::jsonb,
    error = NULL,
    attempts = 0,
    write_at = now(),
    meta = (coalesce(meta, '{}'::jsonb) - 'want' - 'reply' - 'news_id') || jsonb_build_object('force', true) || CASE WHEN p_want IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('want', p_want) END
  WHERE id = p_id AND origin = 'program' AND status IN ('planned', 'awaiting_approval', 'approved', 'failed', 'expired', 'rejected')
    AND scheduled_at > now() - interval '2 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RETURN 'not changed (already published, or its time has passed)'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'writing';
END;
$$;
REVOKE ALL ON FUNCTION public.social_slot_rewrite(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_slot_rewrite(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Schedule: every 5 minutes, and only when there is something to do
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prog public.social_program;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.social_platforms WHERE enabled) THEN RETURN 'nothing due'; END IF;
  SELECT * INTO prog FROM public.social_program WHERE id;
  IF NOT (
    -- a campaign is due, or an approved post's time has come
    EXISTS (SELECT 1 FROM public.social_campaigns WHERE enabled AND next_at <= now())
    OR EXISTS (SELECT 1 FROM public.social_posts WHERE status = 'approved' AND scheduled_at <= now())
    -- a slot to write (also a "Try it" post while the program is stopped)
    OR EXISTS (SELECT 1 FROM public.social_posts WHERE origin = 'program' AND status = 'planned' AND coalesce(write_at, scheduled_at) <= now())
    -- the program: time to plan again (hourly), or "+" comments to answer
    OR (coalesce(prog.running, false) AND (
      prog.planned_at IS NULL OR prog.planned_at < now() - interval '55 minutes'
      OR EXISTS (SELECT 1 FROM public.social_posts WHERE platform = 'instagram' AND status = 'published' AND meta ? 'reply' AND published_at > now() - interval '4 days')
    ))
  ) THEN
    RETURN 'nothing due';
  END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.social_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-social'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('madevisa-social', '*/5 * * * *', 'select public.social_tick()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%).', SQLERRM;
END $$;
