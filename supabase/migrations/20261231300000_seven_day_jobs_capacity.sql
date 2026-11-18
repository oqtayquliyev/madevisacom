-- Seven-day job window + capacity cap (fits Supabase Free / a small self-hosted server)
--
-- Why: the database had grown to ~2.7 GB (2.5 GB of it sponsored_jobs, ~75,000 live jobs as the
-- target). That doesn't fit a free plan (500 MB database, 500 MB RAM) or a small server.
--
-- What this does:
-- 1. Window: an imported job is shown for 7 days after it was SHARED on MadeVisa (released_at,
--    else created_at). expires_at is capped at shared + 7 days on every insert / release, so every
--    list, search, sitemap and count already respects it without waiting for a clean-up.
--    Jobs a company posted and paid for on MadeVisa itself (origin 'direct' / 'admin') keep their
--    own term (30 days, see sponsored-listing terms) and are never deleted by this file.
-- 2. Clean-up (every 10 min): imported jobs past the window are closed, then deleted a day later
--    by storage_diet_retention (closed_keep_days becomes 1). Imported jobs that never went public
--    and are older than the window are deleted straight away.
-- 3. Capacity: job_capacity_check() (every 5 min) counts imported job rows and the database size.
--    When either is over its limit (default 10,000 jobs / 420 MB), "is_full" is set:
--      - new imported rows are silently skipped (BEFORE INSERT trigger returns NULL),
--      - today's auto-publish limit is stopped where it is.
--    It clears itself as soon as the clean-up brings things back under the limits.
--    Deleting rows doesn't shrink the database file by itself: a weekly VACUUM FULL of the jobs
--    table (scheduled below) gives the space back. After the first big clean-up, run it once by
--    hand (see MOVE-OFF-SUPABASE.md).
-- 4. Fetching: the pipeline only imports jobs posted in the last 7 days, and publishes about
--    1,400 a day (300–2,000), aiming at ~10,000 live — 7 days × 1,400 ≈ the cap.
-- 5. job_capacity_status(): the numbers, for Admin and the SQL editor.
--
-- Change the limits later (SQL editor):
--   UPDATE public.job_capacity_settings SET max_imported_jobs = 15000, db_budget_mb = 3000 WHERE id;
--   (a self-hosted server with a big disk can go much higher; Supabase Free must stay < 500 MB.)
--
-- Safe to run more than once.

SET lock_timeout = '5s';

-- 0. Settings + cached state ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_capacity_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  window_days integer NOT NULL DEFAULT 7 CHECK (window_days BETWEEN 1 AND 30),
  max_imported_jobs integer NOT NULL DEFAULT 10000 CHECK (max_imported_jobs BETWEEN 100 AND 500000),
  db_budget_mb integer NOT NULL DEFAULT 420 CHECK (db_budget_mb BETWEEN 100 AND 200000),
  imported_rows integer,
  db_mb numeric,
  is_full boolean NOT NULL DEFAULT false,
  full_reason text,
  checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.job_capacity_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.job_capacity_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_capacity_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._job_window_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT window_days FROM public.job_capacity_settings WHERE id), 7);
$$;
REVOKE ALL ON FUNCTION public._job_window_days() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS sponsored_jobs_imported_shared_idx
  ON public.sponsored_jobs ((coalesce(released_at, created_at)))
  WHERE origin = 'imported' OR import_source_id IS NOT NULL;

-- 1. Window: expires_at never later than shared + window_days (imported jobs only) -----------
CREATE OR REPLACE FUNCTION public.cap_job_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_lim timestamptz;
  v_age_cap timestamptz;
BEGIN
  IF NOT (NEW.origin = 'imported' OR NEW.import_source_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  v_days := public._job_window_days();
  v_lim := coalesce(NEW.released_at, NEW.created_at, now()) + make_interval(days => v_days);
  IF TG_OP = 'UPDATE' AND NEW.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at THEN
    -- Just went public: the 7 days start now (the 30-day posting cap still applies).
    v_age_cap := public.job_posted_at(NEW.source_posted_at, coalesce(NEW.created_at, now())) + interval '30 days';
    NEW.expires_at := least(v_lim, v_age_cap);
  ELSIF NEW.expires_at IS NULL OR NEW.expires_at > v_lim THEN
    NEW.expires_at := v_lim;
  END IF;
  RETURN NEW;
END;
$$;

-- After a_cap_job_age and sponsored_jobs_release_guard (BEFORE triggers run in name order).
DROP TRIGGER IF EXISTS zz_cap_job_window ON public.sponsored_jobs;
CREATE TRIGGER zz_cap_job_window
  BEFORE INSERT OR UPDATE OF status, expires_at, released_at, awaiting_release, source_posted_at ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cap_job_window();

-- 2. Capacity guard on insert: when full, new imported rows are skipped (not an error) --------
CREATE OR REPLACE FUNCTION public.job_capacity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.origin = 'imported' OR NEW.import_source_id IS NOT NULL)
     AND coalesce((SELECT is_full FROM public.job_capacity_settings WHERE id), false) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Runs first (name order), so a skipped row costs nothing else.
DROP TRIGGER IF EXISTS a0_job_capacity_guard ON public.sponsored_jobs;
CREATE TRIGGER a0_job_capacity_guard
  BEFORE INSERT ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_capacity_guard();

-- 3. Capacity check (every 5 min) ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_capacity_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  st public.job_capacity_settings;
  v_rows integer;
  v_mb numeric;
  v_full boolean;
  v_reason text;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM public.job_capacity_settings WHERE id;

  SELECT count(*) INTO v_rows FROM public.sponsored_jobs
  WHERE origin = 'imported' OR import_source_id IS NOT NULL;
  v_mb := round(pg_database_size(current_database()) / 1048576.0, 1);

  v_full := v_rows >= st.max_imported_jobs OR v_mb >= st.db_budget_mb;
  v_reason := CASE
    WHEN v_rows >= st.max_imported_jobs THEN format('%s imported jobs (limit %s)', v_rows, st.max_imported_jobs)
    WHEN v_mb >= st.db_budget_mb THEN format('database %s MB (limit %s MB)', v_mb, st.db_budget_mb)
  END;

  UPDATE public.job_capacity_settings
  SET imported_rows = v_rows, db_mb = v_mb, is_full = v_full, full_reason = v_reason, checked_at = now()
  WHERE id;

  -- Full: stop today's auto-publishing where it is (it starts again tomorrow, if there's room).
  IF v_full THEN
    BEGIN
      UPDATE public.auto_release_settings SET today_limit = released_today
      WHERE id AND today_limit > released_today;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('imported_rows', v_rows, 'db_mb', v_mb, 'full', v_full, 'reason', v_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.job_capacity_check() FROM PUBLIC, anon, authenticated;

-- 4. Window clean-up (every 10 min) ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_window_enforce(p_batch integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_days integer := public._job_window_days();
  v_cutoff timestamptz;
  v_batch integer := least(greatest(coalesce(p_batch, 5000), 100), 20000);
  v_dropped integer := 0;
  v_closed integer := 0;
  v_capped integer := 0;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  v_cutoff := now() - make_interval(days => v_days);

  -- a. Never went public and older than the window: just deleted.
  WITH old AS (
    SELECT id FROM public.sponsored_jobs
    WHERE (origin = 'imported' OR import_source_id IS NOT NULL)
      AND (awaiting_release OR status NOT IN ('published', 'expired'))
      AND created_at < v_cutoff
    ORDER BY created_at
    LIMIT v_batch
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.sponsored_jobs j USING old WHERE j.id = old.id;
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  -- b. Public for longer than the window: closed (closed_at in the past, so it isn't shown
  --    greyed out); storage_diet_retention deletes it on its next run and keeps company counts.
  WITH old AS (
    SELECT id FROM public.sponsored_jobs
    WHERE (origin = 'imported' OR import_source_id IS NOT NULL)
      AND status = 'published'
      AND NOT awaiting_release
      AND coalesce(released_at, created_at) < v_cutoff
    ORDER BY coalesce(released_at, created_at)
    LIMIT v_batch
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sponsored_jobs j
  SET status = 'expired', closed_reason = 'window', closed_at = now() - interval '2 days'
  FROM old WHERE j.id = old.id;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- c. Jobs from before this file: bring expires_at down to shared + window.
  WITH late AS (
    SELECT id FROM public.sponsored_jobs
    WHERE (origin = 'imported' OR import_source_id IS NOT NULL)
      AND status = 'published'
      AND (expires_at IS NULL OR expires_at > coalesce(released_at, created_at) + make_interval(days => v_days))
    LIMIT v_batch
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sponsored_jobs j
  SET expires_at = coalesce(j.released_at, j.created_at) + make_interval(days => v_days)
  FROM late WHERE j.id = late.id;
  GET DIAGNOSTICS v_capped = ROW_COUNT;

  RETURN jsonb_build_object('deleted_unreleased', v_dropped, 'closed', v_closed, 'expiry_capped', v_capped);
END;
$$;
REVOKE ALL ON FUNCTION public.job_window_enforce(integer) FROM PUBLIC, anon, authenticated;

-- 5. Status for Admin / SQL editor -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_capacity_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := public._job_window_days();
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT to_jsonb(s) - 'id' FROM public.job_capacity_settings s WHERE id) || jsonb_build_object(
    'live_jobs', (SELECT count(*) FROM public.sponsored_jobs
                  WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now())),
    'past_window_left', (SELECT count(*) FROM public.sponsored_jobs
                         WHERE (origin = 'imported' OR import_source_id IS NOT NULL)
                           AND coalesce(released_at, created_at) < now() - make_interval(days => v_days)),
    'database_mb_now', round(pg_database_size(current_database()) / 1048576.0, 1)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.job_capacity_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.job_capacity_status() TO authenticated;

-- 6. Fetching and publishing sized to the window --------------------------------------------
DO $$
BEGIN
  UPDATE public.auto_release_settings SET
    max_age_days = 7,        -- only jobs posted on the company's site in the last 7 days
    target_live = 10000,     -- ≈ 7 days × ~1,400 a day
    daily_limit = 1400,
    updated_at = now()
  WHERE id;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'auto_release_settings not updated (%): set max_age_days 7, target_live 10000, daily_limit 1400 in Admin.', SQLERRM;
END $$;

DO $$
BEGIN
  UPDATE public.auto_release_settings SET daily_min = 300, daily_max = 2000 WHERE id;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'daily_min / daily_max not updated (%).', SQLERRM;
END $$;

-- Closed imported jobs: deleted after 1 day (was 7) — they were only kept to show greyed out.
DO $$
BEGIN
  UPDATE public.storage_diet_settings SET closed_keep_days = 1, updated_at = now() WHERE id;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'storage_diet_settings not updated (%).', SQLERRM;
END $$;

-- 7. Schedules -------------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-job-capacity'); EXCEPTION WHEN others THEN NULL; END;
  BEGIN PERFORM cron.unschedule('madevisa-job-window'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM cron.schedule('madevisa-job-capacity', '*/5 * * * *', 'select public.job_capacity_check()');
  PERFORM cron.schedule('madevisa-job-window', '*/10 * * * *', 'select public.job_window_enforce(5000)');
  -- Retention (deletes the closed ones) every 20 min instead of hourly, while there's a backlog.
  BEGIN PERFORM cron.unschedule('madevisa-storage-diet-retention'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM cron.schedule('madevisa-storage-diet-retention', '*/20 * * * *', 'select public.storage_diet_retention(5000)');
  -- Deleted rows only free space for reuse; the database size (what the plan limit and the
  -- capacity check measure) only goes down after VACUUM FULL. With ~10,000 live jobs it takes
  -- seconds (it copies only live rows). Weekly, Sunday 03:37 UTC.
  BEGIN PERFORM cron.unschedule('madevisa-jobs-vacuum-full'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM cron.schedule('madevisa-jobs-vacuum-full', '37 3 * * 0', 'VACUUM (FULL, ANALYZE) public.sponsored_jobs');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available (%): run job_capacity_check() and job_window_enforce() by hand.', SQLERRM;
END $$;

-- First check now, so the guard is right from the start.
SELECT public.job_capacity_check();

NOTIFY pgrst, 'reload schema';
