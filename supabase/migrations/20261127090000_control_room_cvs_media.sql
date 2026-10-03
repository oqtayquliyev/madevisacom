/*
# Control room, CVs for admins, upload limits, social media library
Run AFTER 20261126090000_cv_match_one_plan.sql. Safe to run more than once.

1. Master switch. One Start / Stop for everything that runs by itself:
   - "sync"     the conveyor: check companies' career pages, add new jobs,
                close jobs that are gone
   - "publish"  the auto-publish timer (and reading job details)
   - "finder"   find and add new companies
   - "social"   the social media program
   Start turns the ticked parts on and the unticked ones off, then runs each
   once straight away. Stop turns all four off. Every part keeps its own
   settings where they already are (Publish update, Social media).

2. admin_overview(hours): what happened in the last 24 hours — sign-ups,
   CVs, match checks, jobs, companies, posts, plan requests — with an
   hour-by-hour series and the latest sign-ups and CVs.

3. CVs for admins: admins can read every CV (list, text, original file).
   The site's wording and the Privacy Policy say so.

4. Limits:
   - visitors without an account: 3 CV uploads a day per visitor (counted
     here, nothing of the CV is stored);
   - accounts: 15 CV changes a day.

5. Social: settings for the voice (a host name for the sign-off), the look
   (photo first or graphic), the gap between networks (30 minutes), and
   social_media — a library of real photos and video clips per country that
   the pipeline fills from Pexels and the program uses behind posts and reels.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Master switch
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  running boolean NOT NULL DEFAULT false,
  parts jsonb NOT NULL DEFAULT '{"sync": true, "publish": true, "finder": true, "social": true}'::jsonb,
  started_at timestamptz,
  stopped_at timestamptz,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.master_control (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.master_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_control FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.master_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.master_control;
  a public.auto_release_settings;
  sp jsonb := NULL;
  has_cron boolean := false;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM public.master_control WHERE id;
  SELECT * INTO a FROM public.auto_release_settings WHERE id;
  BEGIN
    SELECT jsonb_build_object(
      'running', p.running, 'last_run_at', p.last_run_at, 'last_result', p.last_result,
      'queued', (SELECT count(*) FROM public.social_posts WHERE status IN ('planned', 'approved', 'awaiting_approval', 'rendering')),
      'networks', (SELECT count(*) FROM public.social_platforms WHERE enabled),
      'connected', (SELECT count(*) FROM public.social_platforms WHERE enabled AND connected)
    ) INTO sp FROM public.social_program p WHERE p.id;
  EXCEPTION WHEN OTHERS THEN sp := NULL;   -- social migrations not run
  END;
  BEGIN
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'madevisa-auto-release') INTO has_cron;
  EXCEPTION WHEN OTHERS THEN has_cron := false;
  END;
  RETURN jsonb_build_object(
    'running', m.running,
    'parts', m.parts,
    'started_at', m.started_at,
    'stopped_at', m.stopped_at,
    'note', m.note,
    'cron', has_cron,
    'publish', jsonb_build_object('on', a.enabled, 'released_today', a.released_today, 'today_limit', coalesce(a.today_limit, a.daily_limit), 'last_at', a.last_release_at, 'next_at', a.next_release_at),
    'sync', jsonb_build_object('on', a.conveyor_enabled, 'last_at', a.last_conveyor_at, 'last', a.last_conveyor, 'companies_per_run', a.companies_per_run,
              'healthy', coalesce(a.last_conveyor_at, a.conveyor_fired_at, now()) > now() - interval '15 minutes'),
    'finder', jsonb_build_object('on', a.finder_enabled, 'last_at', a.last_finder_at, 'last', a.last_finder, 'every_min', a.finder_every_min, 'next_at', a.next_finder_at),
    'social', sp
  );
END;
$$;
REVOKE ALL ON FUNCTION public.master_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_status() TO authenticated;

-- Start: the ticked parts go on, the others off; each ticked part runs once now.
CREATE OR REPLACE FUNCTION public.master_start(p_parts jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts jsonb;
  on_sync boolean;
  on_publish boolean;
  on_finder boolean;
  on_social boolean;
  notes text[] := '{}';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(p_parts, m.parts) INTO v_parts FROM public.master_control m WHERE id;
  on_sync := coalesce((v_parts->>'sync')::boolean, true);
  on_publish := coalesce((v_parts->>'publish')::boolean, true);
  on_finder := coalesce((v_parts->>'finder')::boolean, true);
  on_social := coalesce((v_parts->>'social')::boolean, true);

  UPDATE public.auto_release_settings SET
    next_release_at = CASE WHEN on_publish AND NOT enabled THEN now() ELSE next_release_at END,
    next_finder_at = CASE WHEN on_finder AND NOT finder_enabled THEN now() ELSE next_finder_at END,
    conveyor_fired_at = NULL,
    enabled = on_publish,
    detect_enabled = CASE WHEN on_publish OR on_sync THEN true ELSE detect_enabled END,
    conveyor_enabled = on_sync,
    finder_enabled = on_finder,
    updated_at = now()
  WHERE id;

  -- Social: start with the settings it already has, or stop it.
  BEGIN
    IF on_social THEN
      IF NOT EXISTS (SELECT 1 FROM public.social_platforms WHERE enabled) THEN
        notes := notes || 'Social: no network is switched on (Social media → Platforms).';
      ELSIF NOT (SELECT running FROM public.social_program WHERE id) THEN
        PERFORM public.social_program_start('{}'::jsonb);
      END IF;
    ELSIF (SELECT running FROM public.social_program WHERE id) THEN
      PERFORM public.social_program_stop();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    notes := notes || ('Social: ' || SQLERRM);
  END;

  -- Run each part once now, so nothing waits for its next turn.
  BEGIN
    IF on_sync THEN
      PERFORM public._pipeline_call(jsonb_build_object('cron', 'sync', 'want', 5));
      UPDATE public.auto_release_settings SET conveyor_fired_at = now() WHERE id;
    END IF;
    IF on_finder THEN PERFORM public._pipeline_call(jsonb_build_object('cron', 'find')); END IF;
  EXCEPTION WHEN OTHERS THEN
    notes := notes || ('Pipeline: ' || SQLERRM);
  END;

  UPDATE public.master_control SET running = true, parts = jsonb_build_object('sync', on_sync, 'publish', on_publish, 'finder', on_finder, 'social', on_social),
    started_at = now(), stopped_at = NULL, note = nullif(array_to_string(notes, ' '), ''), updated_at = now() WHERE id;
  INSERT INTO public.pipeline_log (kind, ok, summary) VALUES ('master', true,
    'Started: ' || concat_ws(', ', CASE WHEN on_sync THEN 'job sync' END, CASE WHEN on_publish THEN 'publishing' END, CASE WHEN on_finder THEN 'company finder' END, CASE WHEN on_social THEN 'social media' END));
  RETURN public.master_status();
END;
$$;
REVOKE ALL ON FUNCTION public.master_start(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_start(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.master_stop()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text := NULL;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.auto_release_settings SET enabled = false, conveyor_enabled = false, finder_enabled = false, conveyor_fired_at = NULL, updated_at = now() WHERE id;
  BEGIN
    IF (SELECT running FROM public.social_program WHERE id) THEN PERFORM public.social_program_stop(); END IF;
  EXCEPTION WHEN OTHERS THEN
    v_note := 'Social: ' || SQLERRM;
  END;
  UPDATE public.master_control SET running = false, stopped_at = now(), note = v_note, updated_at = now() WHERE id;
  INSERT INTO public.pipeline_log (kind, ok, summary) VALUES ('master', true, 'Stopped: job sync, publishing, company finder and social media are off.');
  RETURN public.master_status();
END;
$$;
REVOKE ALL ON FUNCTION public.master_stop() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_stop() TO authenticated;

-- Remember which parts are ticked without starting anything.
CREATE OR REPLACE FUNCTION public.master_set_parts(p_parts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.master_control SET parts = jsonb_build_object(
    'sync', coalesce((p_parts->>'sync')::boolean, true), 'publish', coalesce((p_parts->>'publish')::boolean, true),
    'finder', coalesce((p_parts->>'finder')::boolean, true), 'social', coalesce((p_parts->>'social')::boolean, true)), updated_at = now() WHERE id;
  RETURN public.master_status();
END;
$$;
REVOKE ALL ON FUNCTION public.master_set_parts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_set_parts(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Limits (before the overview, which counts guest uploads)
-- ---------------------------------------------------------------------------
-- Visitors without an account: only a counter per visitor and day. No CV text.
CREATE TABLE IF NOT EXISTS public.cv_guest_uploads (
  visitor_hash text NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  n integer NOT NULL DEFAULT 1,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_hash, day)
);
CREATE INDEX IF NOT EXISTS cv_guest_uploads_last_idx ON public.cv_guest_uploads (last_at DESC);
ALTER TABLE public.cv_guest_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cv_guest_uploads FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cv_guest_daily_uploads()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 3 $$;

-- Called when a visitor without an account adds a CV. Says whether it is allowed.
CREATE OR REPLACE FUNCTION public.cv_guest_upload()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h text := public.request_visitor_hash();
  lim integer := public.cv_guest_daily_uploads();
  today date := (now() AT TIME ZONE 'utc')::date;
  used integer;
BEGIN
  -- No address to count by (rare): let it through rather than block a real person.
  IF h IS NULL THEN RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', lim); END IF;
  SELECT n INTO used FROM public.cv_guest_uploads WHERE visitor_hash = h AND day = today;
  IF coalesce(used, 0) >= lim THEN
    RETURN jsonb_build_object('allowed', false, 'used', used, 'limit', lim);
  END IF;
  INSERT INTO public.cv_guest_uploads (visitor_hash, day) VALUES (h, today)
  ON CONFLICT (visitor_hash, day) DO UPDATE SET n = public.cv_guest_uploads.n + 1, last_at = now();
  -- Keep the table small.
  DELETE FROM public.cv_guest_uploads WHERE day < today - 60;
  RETURN jsonb_build_object('allowed', true, 'used', coalesce(used, 0) + 1, 'limit', lim);
END;
$$;
REVOKE ALL ON FUNCTION public.cv_guest_upload() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_guest_upload() TO anon, authenticated;

-- Accounts: at most 15 CV changes a day.
ALTER TABLE public.user_cvs ADD COLUMN IF NOT EXISTS uploads_day date;
ALTER TABLE public.user_cvs ADD COLUMN IF NOT EXISTS uploads_n integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.user_cvs_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.uploads_day := today;
    NEW.uploads_n := 1;
    RETURN NEW;
  END IF;
  IF NEW.text IS NOT DISTINCT FROM OLD.text THEN
    NEW.uploads_day := OLD.uploads_day;
    NEW.uploads_n := OLD.uploads_n;
    RETURN NEW;
  END IF;
  IF OLD.uploads_day = today THEN
    IF OLD.uploads_n >= 15 THEN
      RAISE EXCEPTION 'You''ve changed your CV 15 times today. Try again tomorrow.' USING ERRCODE = 'P0001';
    END IF;
    NEW.uploads_n := OLD.uploads_n + 1;
    NEW.uploads_day := today;
  ELSE
    NEW.uploads_day := today;
    NEW.uploads_n := 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_cvs_limit ON public.user_cvs;
CREATE TRIGGER user_cvs_limit BEFORE INSERT OR UPDATE ON public.user_cvs
  FOR EACH ROW EXECUTE FUNCTION public.user_cvs_limit();

-- ---------------------------------------------------------------------------
-- 3. CVs for admins
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_cvs_admin_select" ON public.user_cvs;
CREATE POLICY "user_cvs_admin_select" ON public.user_cvs FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "cvs_admin_select" ON storage.objects;
CREATE POLICY "cvs_admin_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND (SELECT public.is_admin()));

-- The list: newest first, searchable by name, email, file name or a word in the CV.
CREATE OR REPLACE FUNCTION public.admin_cv_list(p_search text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := nullif(btrim(coalesce(p_search, '')), '');
  like_q text;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  like_q := '%' || replace(replace(coalesce(q, ''), '%', '\%'), '_', '\_') || '%';

  SELECT count(*) INTO v_total
  FROM public.user_cvs c LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE q IS NULL OR p.full_name ILIKE like_q OR p.email ILIKE like_q OR c.file_name ILIKE like_q OR c.text ILIKE like_q;

  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'updated_at') DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'user_id', c.user_id,
      'name', p.full_name,
      'email', p.email,
      'username', p.username,
      'file_name', c.file_name,
      'file_size', c.file_size,
      'has_file', c.storage_path IS NOT NULL,
      'words', (c.profile->>'words')::integer,
      'skills', (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(c.profile->'skills') = 'object' THEN c.profile->'skills' ELSE '{}'::jsonb END)),
      'years', c.profile->'years',
      'titles', coalesce(c.profile->'titles', '[]'::jsonb),
      'education', c.profile->'education',
      'languages', coalesce(c.profile->'languages', '[]'::jsonb),
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'checks', (SELECT count(*) FROM public.cv_checks k WHERE k.user_id = c.user_id),
      'avg_score', (SELECT round(avg(k.score)) FROM public.cv_checks k WHERE k.user_id = c.user_id),
      'pro', public.is_pro(c.user_id)
    ) AS r
    FROM public.user_cvs c LEFT JOIN public.profiles p ON p.id = c.user_id
    WHERE q IS NULL OR p.full_name ILIKE like_q OR p.email ILIKE like_q OR c.file_name ILIKE like_q OR c.text ILIKE like_q
    ORDER BY c.updated_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0))
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cv_list(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cv_list(text, integer, integer) TO authenticated;

-- One CV in full, with the jobs it was checked against.
CREATE OR REPLACE FUNCTION public.admin_cv_get(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'user_id', c.user_id, 'file_name', c.file_name, 'storage_path', c.storage_path, 'text', c.text, 'profile', c.profile,
    'created_at', c.created_at, 'updated_at', c.updated_at,
    'checks', coalesce((
      SELECT jsonb_agg(jsonb_build_object('job_key', k.job_key, 'score', k.score, 'at', k.updated_at,
               'title', j.title, 'company', pub.name) ORDER BY k.updated_at DESC)
      FROM (SELECT * FROM public.cv_checks WHERE user_id = c.user_id ORDER BY updated_at DESC LIMIT 40) k
      LEFT JOIN public.sponsored_jobs j ON j.id::text = k.job_key
      LEFT JOIN public.program_publishers pub ON pub.id = j.publisher_id
    ), '[]'::jsonb)
  ) INTO v_out FROM public.user_cvs c WHERE c.user_id = p_user;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cv_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cv_get(uuid) TO authenticated;

-- How the upload limits are doing today (for the note on the CVs tab).
CREATE OR REPLACE FUNCTION public.admin_cv_limits()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'guests_today', (SELECT count(*) FROM public.cv_guest_uploads WHERE day = today),
    'guests_blocked_today', (SELECT count(*) FROM public.cv_guest_uploads WHERE day = today AND n >= public.cv_guest_daily_uploads()),
    'accounts_at_limit_today', (SELECT count(*) FROM public.user_cvs WHERE uploads_day = today AND uploads_n >= 15)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cv_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cv_limits() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The last 24 hours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_overview(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  hrs integer := greatest(1, least(coalesce(p_hours, 24), 24 * 31));
  since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 31)));
  earlier timestamptz := now() - make_interval(hours => 2 * greatest(1, least(coalesce(p_hours, 24), 24 * 31)));
  totals jsonb;
  prev jsonb;
  v_social jsonb := '{}'::jsonb;
  v_series jsonb;
  v_signups jsonb;
  v_cvs jsonb;
  v_log jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;

  totals := jsonb_build_object(
    'signups', (SELECT count(*) FROM public.profiles WHERE created_at >= since),
    'cvs', (SELECT count(*) FROM public.user_cvs WHERE created_at >= since),
    'cv_updates', (SELECT count(*) FROM public.user_cvs WHERE updated_at >= since AND created_at < since),
    'guest_cvs', (SELECT coalesce(sum(n), 0) FROM public.cv_guest_uploads WHERE last_at >= since),
    'checks', (SELECT count(*) FROM public.cv_checks WHERE updated_at >= since),
    'people_checking', (SELECT count(DISTINCT user_id) FROM public.cv_checks WHERE updated_at >= since),
    'hit_limit', (SELECT count(*) FROM (SELECT user_id FROM public.cv_checks WHERE unlocked AND unlocked_on = (now() AT TIME ZONE 'utc')::date
                    GROUP BY user_id HAVING count(*) >= public.cv_free_daily_checks()) t),
    'plan_requests', (SELECT count(*) FROM public.plan_requests WHERE created_at >= since),
    'pro_started', (SELECT count(*) FROM public.subscriptions WHERE started_at >= since AND status = 'active'),
    'documents', (SELECT count(*) FROM public.hiring_briefs WHERE created_at >= since),
    'applications', (SELECT count(*) FROM public.application_reports WHERE created_at >= since),
    'jobs_published', (SELECT count(*) FROM public.sponsored_jobs WHERE released_at >= since),
    'jobs_closed', (SELECT count(*) FROM public.sponsored_jobs WHERE closed_at >= since),
    'companies_added', (SELECT count(*) FROM public.program_publishers WHERE created_at >= since),
    'sources_checked', (SELECT count(*) FROM public.import_sources WHERE last_synced_at >= since),
    'runs_ok', (SELECT count(*) FROM public.pipeline_log WHERE at >= since AND ok),
    'runs_failed', (SELECT count(*) FROM public.pipeline_log WHERE at >= since AND NOT ok)
  );
  -- The same window before it, for "up / down".
  prev := jsonb_build_object(
    'signups', (SELECT count(*) FROM public.profiles WHERE created_at >= earlier AND created_at < since),
    'cvs', (SELECT count(*) FROM public.user_cvs WHERE created_at >= earlier AND created_at < since),
    'jobs_published', (SELECT count(*) FROM public.sponsored_jobs WHERE released_at >= earlier AND released_at < since),
    'companies_added', (SELECT count(*) FROM public.program_publishers WHERE created_at >= earlier AND created_at < since),
    'plan_requests', (SELECT count(*) FROM public.plan_requests WHERE created_at >= earlier AND created_at < since)
  );

  BEGIN
    v_social := jsonb_build_object(
      'published', (SELECT count(*) FROM public.social_posts WHERE status = 'published' AND published_at >= since),
      'failed', (SELECT count(*) FROM public.social_posts WHERE status = 'failed' AND updated_at >= since),
      'queued', (SELECT count(*) FROM public.social_posts WHERE status IN ('planned', 'approved', 'awaiting_approval', 'rendering')),
      'by_network', coalesce((SELECT jsonb_object_agg(platform, n) FROM (SELECT platform, count(*) AS n FROM public.social_posts WHERE status = 'published' AND published_at >= since GROUP BY platform) t), '{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN v_social := '{}'::jsonb;
  END;

  -- Hour by hour (UTC hours, oldest first).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    't', h,
    'signups', (SELECT count(*) FROM public.profiles WHERE created_at >= h AND created_at < h + interval '1 hour'),
    'cvs', (SELECT count(*) FROM public.user_cvs WHERE created_at >= h AND created_at < h + interval '1 hour'),
    'checks', (SELECT count(*) FROM public.cv_checks WHERE updated_at >= h AND updated_at < h + interval '1 hour'),
    'jobs', (SELECT count(*) FROM public.sponsored_jobs WHERE released_at >= h AND released_at < h + interval '1 hour')
  ) ORDER BY h), '[]'::jsonb) INTO v_series
  FROM generate_series(date_trunc('hour', now()) - make_interval(hours => least(hrs, 72) - 1), date_trunc('hour', now()), interval '1 hour') h;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb) INTO v_signups FROM (
    SELECT jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'at', p.created_at,
             'has_cv', EXISTS (SELECT 1 FROM public.user_cvs c WHERE c.user_id = p.id)) AS x
    FROM public.profiles p WHERE p.created_at >= since ORDER BY p.created_at DESC LIMIT 12) t;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb) INTO v_cvs FROM (
    SELECT jsonb_build_object('user_id', c.user_id, 'name', p.full_name, 'email', p.email, 'file_name', c.file_name,
             'words', (c.profile->>'words')::integer, 'at', c.updated_at, 'new', c.created_at >= since) AS x
    FROM public.user_cvs c LEFT JOIN public.profiles p ON p.id = c.user_id
    WHERE c.updated_at >= since ORDER BY c.updated_at DESC LIMIT 12) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('at', at, 'kind', kind, 'ok', ok, 'summary', summary) ORDER BY id DESC), '[]'::jsonb)
  INTO v_log FROM (SELECT * FROM public.pipeline_log ORDER BY id DESC LIMIT 14) l;

  RETURN jsonb_build_object(
    'hours', hrs,
    'at', now(),
    'totals', totals,
    'previous', prev,
    'social', v_social,
    'series', v_series,
    'signups', v_signups,
    'cvs', v_cvs,
    'log', v_log,
    'all_time', jsonb_build_object(
      'accounts', (SELECT count(*) FROM public.profiles),
      'cvs', (SELECT count(*) FROM public.user_cvs),
      'pro', (SELECT count(*) FROM public.subscriptions WHERE status = 'active' AND (current_period_end IS NULL OR current_period_end > now())),
      'live_jobs', (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND NOT coalesce(awaiting_release, false)),
      'companies', (SELECT count(*) FROM public.program_publishers)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview(integer) TO authenticated;

CREATE INDEX IF NOT EXISTS user_cvs_created_idx ON public.user_cvs (created_at DESC);
CREATE INDEX IF NOT EXISTS user_cvs_updated_idx ON public.user_cvs (updated_at DESC);
CREATE INDEX IF NOT EXISTS cv_checks_updated_idx ON public.cv_checks (updated_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Social: voice, look, spacing, and the media library
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS host_name text CHECK (host_name IS NULL OR char_length(host_name) <= 40);
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS look text NOT NULL DEFAULT 'photo';
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS gap_min integer NOT NULL DEFAULT 30;
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS media_at timestamptz;
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS media_note text;
DO $$
BEGIN
  ALTER TABLE public.social_program ADD CONSTRAINT social_program_look_check CHECK (look IN ('photo', 'graphic'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE public.social_program ADD CONSTRAINT social_program_gap_check CHECK (gap_min BETWEEN 10 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Real photos and video clips, per country ('ZZ' = any country: people at
-- work, airports, laptops). Filled from Pexels by the pipeline, or by hand.
CREATE TABLE IF NOT EXISTS public.social_media (
  id bigserial PRIMARY KEY,
  code text NOT NULL CHECK (code ~ '^[A-Z]{2}$'),
  kind text NOT NULL CHECK (kind IN ('photo', 'video')),
  url text NOT NULL CHECK (url ~* '^https://'),
  thumb text,
  credit text CHECK (credit IS NULL OR char_length(credit) <= 80),
  page text,
  query text,
  source text NOT NULL DEFAULT 'pexels',
  source_id text,
  width integer,
  height integer,
  seconds integer,
  enabled boolean NOT NULL DEFAULT true,
  uses integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, kind, source_id)
);
CREATE INDEX IF NOT EXISTS social_media_code_idx ON public.social_media (code, kind) WHERE enabled;

ALTER TABLE public.social_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_media_admin" ON public.social_media;
CREATE POLICY "social_media_admin" ON public.social_media FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
REVOKE ALL ON public.social_media FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_media TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.social_media_id_seq TO authenticated, service_role;

-- Admin: fill the library now (the pipeline also tops it up once a day while the program runs).
CREATE OR REPLACE FUNCTION public.social_media_fill_now()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'media', 'force', true));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.social_media_fill_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_media_fill_now() TO authenticated;

-- The pipeline marks what it used, so the same photo or clip doesn't come straight back.
CREATE OR REPLACE FUNCTION public.social_media_used(p_ids bigint[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.social_media SET uses = uses + 1, last_used_at = now() WHERE id = ANY (p_ids);
$$;
REVOKE ALL ON FUNCTION public.social_media_used(bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_media_used(bigint[]) TO service_role;
