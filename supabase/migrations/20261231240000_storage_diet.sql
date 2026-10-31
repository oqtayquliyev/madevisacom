-- Storage diet: the database is ~2.7 GB, 2.5 GB of it sponsored_jobs.
--
-- 1. One copy of each job's text. The cleaned description was saved twice: raw in
--    `description` and cleaned in `facts.html`. From now on the cleaned text IS the description
--    and facts.html is empty (job-facts + auto-pipeline save it that way). Existing rows are moved
--    in small batches by pg_cron (storage_diet_move), so nothing locks the table.
--    Nothing is cut: the whole description stays.
-- 2. Closed jobs are deleted, not kept: imported jobs 7 days after closing (any reason),
--    jobs posted on MadeVisa itself after 90 days. Their counts go to publisher_job_stats first,
--    as cleanup_closed_jobs already does.
-- 3. Jobs the checker hasn't seen on the company's site for 7 days are closed (not_seen).
-- 4. Logs kept shorter: search_ping_queue 3 days, pipeline_log 14 days.
-- 5. admin_storage_report(): what takes space (tables, buckets), for Admin and the SQL editor.
--
-- After the move has finished (Admin → storage report shows facts_html_left = 0), give the space
-- back to the disk once, at a quiet hour, in the SQL editor:
--     VACUUM (FULL, ANALYZE) public.sponsored_jobs;
-- (It locks the jobs table for a few minutes. Without it the space is reused but not returned.)

-- 0. Settings -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_diet_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  closed_keep_days integer NOT NULL DEFAULT 7 CHECK (closed_keep_days BETWEEN 1 AND 365),
  direct_closed_keep_days integer NOT NULL DEFAULT 90 CHECK (direct_closed_keep_days BETWEEN 1 AND 3650),
  not_seen_days integer NOT NULL DEFAULT 7 CHECK (not_seen_days BETWEEN 2 AND 60),
  move_cursor uuid,
  move_done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.storage_diet_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.storage_diet_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_diet_settings FROM anon, authenticated;

-- 1a. Moving the text into the description doesn't count as an edit (updated_at stays). ----
CREATE OR REPLACE FUNCTION public.job_facts_keep_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'facts' - 'updated_at') = (to_jsonb(OLD) - 'facts' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  -- The detector saving its cleaned text as the description (facts.html emptied at the same time).
  ELSIF (to_jsonb(NEW) - 'facts' - 'updated_at' - 'description') = (to_jsonb(OLD) - 'facts' - 'updated_at' - 'description')
        AND coalesce(NEW.facts->>'html', '') = ''
        AND NEW.facts IS DISTINCT FROM OLD.facts THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

-- 1b. The move, a batch at a time (by id, so each run reads only its batch). -----------------
CREATE OR REPLACE FUNCTION public.storage_diet_move(p_batch integer DEFAULT 1500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '50s'
AS $$
DECLARE
  st public.storage_diet_settings;
  v_last uuid;
  v_moved integer := 0;
  v_seen integer := 0;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM public.storage_diet_settings WHERE id FOR UPDATE;
  IF st.move_done THEN RETURN jsonb_build_object('done', true); END IF;

  WITH batch AS (
    SELECT id FROM public.sponsored_jobs
    WHERE st.move_cursor IS NULL OR id > st.move_cursor
    ORDER BY id
    LIMIT least(greatest(coalesce(p_batch, 1500), 100), 5000)
  ),
  moved AS (
    UPDATE public.sponsored_jobs j
    SET description = j.facts->>'html',
        facts = jsonb_set(j.facts, '{html}', '""'::jsonb)
    FROM batch
    WHERE j.id = batch.id
      AND coalesce(j.facts->>'html', '') <> ''
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM moved), (SELECT count(*) FROM batch), (SELECT max(id::text)::uuid FROM batch)
  INTO v_moved, v_seen, v_last;

  IF v_seen = 0 THEN
    UPDATE public.storage_diet_settings SET move_done = true, updated_at = now() WHERE id;
    BEGIN
      PERFORM cron.unschedule('madevisa-storage-diet-move');
    EXCEPTION WHEN others THEN NULL;
    END;
    RETURN jsonb_build_object('done', true);
  END IF;
  UPDATE public.storage_diet_settings SET move_cursor = v_last, updated_at = now() WHERE id;
  RETURN jsonb_build_object('moved', v_moved, 'read', v_seen);
END;
$$;
REVOKE ALL ON FUNCTION public.storage_diet_move(integer) FROM PUBLIC, anon, authenticated;

-- 2 + 3. Closed jobs deleted after a week; jobs not seen for a week closed. ------------------
CREATE OR REPLACE FUNCTION public.storage_diet_retention(p_batch integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  st public.storage_diet_settings;
  v_deleted integer := 0;
  v_closed integer := 0;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM public.storage_diet_settings WHERE id;

  -- Not seen on the company's site for a week: the checker can't confirm it, so it closes.
  WITH stale AS (
    SELECT id FROM public.sponsored_jobs
    WHERE status = 'published'
      AND origin = 'imported'
      AND last_seen_at IS NOT NULL
      AND last_seen_at < now() - make_interval(days => st.not_seen_days)
    ORDER BY last_seen_at
    LIMIT least(greatest(coalesce(p_batch, 5000), 100), 20000)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sponsored_jobs j
  SET status = 'expired', closed_reason = 'not_seen', closed_at = now() - interval '2 days'
  FROM stale WHERE j.id = stale.id;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Closed long enough: deleted (company counts kept, like cleanup_closed_jobs).
  WITH gone AS (
    SELECT id FROM public.sponsored_jobs
    WHERE status IN ('expired', 'rejected')
      AND coalesce(closed_at, updated_at) < now() - make_interval(days => CASE WHEN origin = 'imported' THEN st.closed_keep_days ELSE st.direct_closed_keep_days END)
    ORDER BY coalesce(closed_at, updated_at)
    LIMIT least(greatest(coalesce(p_batch, 5000), 100), 20000)
  ),
  deleted AS (
    DELETE FROM public.sponsored_jobs j USING gone
    WHERE j.id = gone.id
    RETURNING j.publisher_id, j.closed_at, coalesce(j.approved_at, j.created_at) AS opened_at
  ),
  per_company AS (
    SELECT publisher_id, count(*) AS n,
           sum(greatest(extract(epoch FROM (coalesce(closed_at, now()) - opened_at)) / 86400, 0)) AS days,
           max(closed_at) AS last_closed
    FROM deleted WHERE publisher_id IS NOT NULL GROUP BY publisher_id
  ),
  saved AS (
    INSERT INTO public.publisher_job_stats AS s (publisher_id, jobs_closed, days_open_total, last_closed_at, updated_at)
    SELECT publisher_id, n, coalesce(days, 0), last_closed, now() FROM per_company
    WHERE EXISTS (SELECT 1 FROM public.program_publishers p WHERE p.id = per_company.publisher_id)
    ON CONFLICT (publisher_id) DO UPDATE
      SET jobs_closed = s.jobs_closed + excluded.jobs_closed,
          days_open_total = s.days_open_total + excluded.days_open_total,
          last_closed_at = greatest(s.last_closed_at, excluded.last_closed_at),
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN jsonb_build_object('closed_not_seen', v_closed, 'deleted', v_deleted);
END;
$$;
REVOKE ALL ON FUNCTION public.storage_diet_retention(integer) FROM PUBLIC, anon, authenticated;

-- 4. Shorter logs (same helper as free_plan_cleanup). -----------------------------------------
CREATE OR REPLACE FUNCTION public.storage_diet_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out jsonb := '{}'::jsonb;
  n integer;
BEGIN
  BEGIN
    n := public._trim_table('search_ping_queue', interval '3 days');
    out := out || jsonb_build_object('search_ping_queue', n);
  EXCEPTION WHEN others THEN out := out || jsonb_build_object('search_ping_queue', SQLERRM);
  END;
  BEGIN
    n := public._trim_table('pipeline_log', interval '14 days');
    out := out || jsonb_build_object('pipeline_log', n);
  EXCEPTION WHEN others THEN out := out || jsonb_build_object('pipeline_log', SQLERRM);
  END;
  BEGIN
    EXECUTE 'DELETE FROM net._http_response WHERE created < now() - interval ''1 day''';
    GET DIAGNOSTICS n = ROW_COUNT;
    out := out || jsonb_build_object('net._http_response', n);
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_diet_logs() FROM PUBLIC, anon, authenticated;

-- 5. What takes space. -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_storage_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables jsonb;
  v_buckets jsonb := '[]'::jsonb;
  v_left bigint;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_agg(t ORDER BY (t->>'total_mb')::numeric DESC) INTO v_tables FROM (
    SELECT jsonb_build_object(
      'table', n.nspname || '.' || c.relname,
      'total_mb', round(pg_total_relation_size(c.oid) / 1048576.0, 1),
      'table_mb', round(pg_relation_size(c.oid) / 1048576.0, 1),
      'toast_mb', round(coalesce(pg_total_relation_size(nullif(c.reltoastrelid, 0)), 0) / 1048576.0, 1),
      'index_mb', round(pg_indexes_size(c.oid) / 1048576.0, 1),
      'rows', c.reltuples::bigint,
      'dead_rows', coalesce(s.n_dead_tup, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
    WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 25
  ) x;
  BEGIN
    SELECT coalesce(jsonb_agg(b ORDER BY (b->>'mb')::numeric DESC), '[]'::jsonb) INTO v_buckets FROM (
      SELECT jsonb_build_object('bucket', bucket_id, 'files', count(*),
                                'mb', round(coalesce(sum((metadata->>'size')::bigint), 0) / 1048576.0, 1),
                                'older_than_60_days', count(*) FILTER (WHERE created_at < now() - interval '60 days')) AS b
      FROM storage.objects GROUP BY bucket_id
    ) y;
  EXCEPTION WHEN others THEN NULL;
  END;
  SELECT (SELECT count(*) FROM public.sponsored_jobs WHERE coalesce(facts->>'html', '') <> '') INTO v_left;
  RETURN jsonb_build_object(
    'database_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'tables', v_tables,
    'buckets', v_buckets,
    'facts_html_left', v_left,
    'live_jobs', (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published'),
    'settings', (SELECT to_jsonb(s) - 'id' FROM public.storage_diet_settings s WHERE id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_storage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storage_report() TO authenticated;

-- Schedules ------------------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-storage-diet-move'); EXCEPTION WHEN others THEN NULL; END;
  BEGIN PERFORM cron.unschedule('madevisa-storage-diet-retention'); EXCEPTION WHEN others THEN NULL; END;
  BEGIN PERFORM cron.unschedule('madevisa-storage-diet-logs'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM cron.schedule('madevisa-storage-diet-move', '*/3 * * * *', 'select public.storage_diet_move(1500)');
  PERFORM cron.schedule('madevisa-storage-diet-retention', '41 * * * *', 'select public.storage_diet_retention(5000)');
  PERFORM cron.schedule('madevisa-storage-diet-logs', '51 3 * * *', 'select public.storage_diet_logs()');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available (%): run storage_diet_move / storage_diet_retention / storage_diet_logs by hand.', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
