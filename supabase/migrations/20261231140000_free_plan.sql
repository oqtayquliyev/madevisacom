/*
# Free plan: keep MadeVisa inside Supabase's free limits

Run AFTER 20261231130000_trust_layer.sql. Safe to run more than once.
It DELETES old log rows (never jobs, accounts, CVs, payments or applications) — see the list.

Supabase Free: 500 MB database, 1 GB file storage, 5 GB egress a month, a small shared
computer (Nano), and no backups. This migration:

1. free_plan_cleanup(): trims logs that grow every day and nobody reads after a while.
   Runs every night at 03:40 UTC (pg_cron), and once now.
     paywall_events        older than 90 days
     job_daily_views       older than 30 days
     pipeline_log          older than 30 days
     email_provider_events older than 30 days
     search_ping_queue     older than 14 days (already sent)
     job_searches          older than 60 days
     cv_search_log         older than 30 days
     brief_visitors        older than 60 days
     email_log             older than 120 days
     notifications         older than 120 days
     cron.job_run_details  older than 3 days (pg_cron's own history; it grows fast)
   A table or column that doesn't exist is skipped.
2. Background jobs that ran every few seconds now run every minute or every few minutes:
   on the Nano computer, every-5-seconds jobs alone keep the database busy. Emails still go
   out within a minute.
3. admin_storage_report(): the database size against the 500 MB limit, and the 12 largest
   tables (Admin → Today shows it).

Before switching the project to Free: run  SELECT public.admin_storage_report();  as an admin
(or look at Database → Settings → Disk). If the database is over 500 MB, Supabase can make it
read-only. Bring it under first.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._trim_table(p_table text, p_keep interval)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col text;
  v_n integer := 0;
BEGIN
  SELECT c.column_name INTO v_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name IN ('created_at', 'at', 'sent_at', 'logged_at')
    AND c.data_type LIKE 'timestamp%'
  ORDER BY array_position(ARRAY['created_at', 'at', 'sent_at', 'logged_at'], c.column_name::text)
  LIMIT 1;
  IF v_col IS NULL THEN RETURN 0; END IF;
  -- In batches, so one run never holds the small free database for long.
  EXECUTE format('DELETE FROM public.%I WHERE ctid IN (SELECT ctid FROM public.%I WHERE %I < now() - $1 LIMIT 20000)', p_table, p_table, v_col) USING p_keep;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._trim_table(text, interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.free_plan_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out jsonb := '{}'::jsonb;
  r record;
  n integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('paywall_events', interval '90 days'),
    ('job_daily_views', interval '30 days'),
    ('pipeline_log', interval '30 days'),
    ('email_provider_events', interval '30 days'),
    ('search_ping_queue', interval '14 days'),
    ('job_searches', interval '60 days'),
    ('cv_search_log', interval '30 days'),
    ('brief_visitors', interval '60 days'),
    ('email_log', interval '120 days'),
    ('notifications', interval '120 days')
  ) AS t(tbl, keep) LOOP
    BEGIN
      n := public._trim_table(r.tbl, r.keep);
      IF n > 0 THEN out := out || jsonb_build_object(r.tbl, n); END IF;
    EXCEPTION WHEN OTHERS THEN
      out := out || jsonb_build_object(r.tbl, 'skipped: ' || SQLERRM);
    END;
  END LOOP;
  -- job_daily_views uses a day column, not a timestamp.
  BEGIN
    DELETE FROM public.job_daily_views WHERE day < current_date - 30;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN out := out || jsonb_build_object('job_daily_views', n); END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- pg_cron's own run history.
  BEGIN
    EXECUTE 'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''3 days''';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN out := out || jsonb_build_object('cron.job_run_details', n); END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.free_plan_cleanup() FROM PUBLIC, anon, authenticated;

-- Nightly, and once now.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule('madevisa-free-plan-cleanup', '40 3 * * *', 'SELECT public.free_plan_cleanup()');
  END IF;
END $$;
SELECT public.free_plan_cleanup();

-- Calmer background jobs (only the ones that exist; their work is unchanged).
DO $$
DECLARE
  r record;
  v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('madevisa-email-outbox', '* * * * *'),        -- was every 5 seconds
    ('madevisa-auto-release', '*/2 * * * *'),      -- was every 30 seconds
    ('madevisa-detect-waiting', '*/5 * * * *'),    -- was every minute
    ('madevisa-campaign-sends', '*/2 * * * *'),    -- was every minute
    ('madevisa-site-stats', '*/15 * * * *'),       -- was every 5 minutes
    ('madevisa-finder', '*/15 * * * *'),           -- was every 5 minutes
    ('madevisa-social', '*/10 * * * *'),           -- was every 5 minutes
    ('madevisa-email-log', '*/15 * * * *'),        -- was every 5 minutes
    ('madevisa-job-contacts', '*/30 * * * *')      -- was every 10 minutes
  ) AS t(name, sched) LOOP
    SELECT jobid INTO v_id FROM cron.job WHERE jobname = r.name LIMIT 1;
    IF v_id IS NOT NULL THEN
      BEGIN
        PERFORM cron.alter_job(v_id, schedule := r.sched);
      EXCEPTION WHEN OTHERS THEN
        UPDATE cron.job SET schedule = r.sched WHERE jobid = v_id;
      END;
    END IF;
  END LOOP;
END $$;

-- Admin: how big is the database, and what makes it big?
CREATE OR REPLACE FUNCTION public.admin_storage_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins'; END IF;
  RETURN jsonb_build_object(
    'database_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'free_limit_mb', 500,
    'largest', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('table', relname, 'mb', mb) ORDER BY mb DESC), '[]'::jsonb)
      FROM (
        SELECT c.relname::text AS relname, round(pg_total_relation_size(c.oid) / 1048576.0, 1) AS mb
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname IN ('public', 'cron', 'auth', 'storage')
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 12
      ) t
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_storage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storage_report() TO authenticated;

NOTIFY pgrst, 'reload schema';
