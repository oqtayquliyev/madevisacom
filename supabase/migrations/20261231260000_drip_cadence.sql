-- Publishing cadence: new jobs every 2–4 minutes, 6,000–10,000 a day, and about as many old
-- jobs taken down, so the live catalogue stays near its target.
--
-- 1. Daily range: today's limit (auto-balanced toward target_live) is kept between daily_min and
--    daily_max (6,000–10,000). daily_limit becomes 8,000.
-- 2. Gaps of 2–4 minutes (min/max_interval_s 120/240); each batch is a random 50–150% of the even
--    share, up to max_per_tick (40) — sometimes 4 jobs at once, sometimes 15+.
-- 3. Rotation: at the start of each day, when more jobs are live than target_live, the oldest live
--    imported jobs are closed (closed_reason 'rotation') — as many as were published the day
--    before, at most the excess — 1,000 an hour. storage_diet_retention deletes them a week later.
-- All of it is in Admin → Publish update → Settings (daily range, rotation on/off).
-- Patches the current function bodies in place (they were changed by several migrations).

ALTER TABLE public.auto_release_settings ADD COLUMN IF NOT EXISTS daily_min integer NOT NULL DEFAULT 6000 CHECK (daily_min BETWEEN 0 AND 50000);
ALTER TABLE public.auto_release_settings ADD COLUMN IF NOT EXISTS daily_max integer NOT NULL DEFAULT 10000 CHECK (daily_max BETWEEN 0 AND 50000);
ALTER TABLE public.auto_release_settings ADD COLUMN IF NOT EXISTS rotate_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.auto_release_settings ADD COLUMN IF NOT EXISTS rotate_left integer NOT NULL DEFAULT 0;
ALTER TABLE public.auto_release_settings ADD COLUMN IF NOT EXISTS rotated_today integer NOT NULL DEFAULT 0;
ALTER TABLE public.auto_release_settings ADD COLUMN IF NOT EXISTS released_yesterday integer;

UPDATE public.auto_release_settings
SET daily_limit = 8000, min_interval_s = 120, max_interval_s = 240, max_per_tick = 40, updated_at = now()
WHERE id;

-- Patch a function's current body: every (old, new) pair must match exactly once.
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(p_fn regprocedure, p_pairs text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  def text := pg_get_functiondef(p_fn);
  i integer;
BEGIN
  FOR i IN 1 .. array_length(p_pairs, 1) BY 2 LOOP
    IF position(p_pairs[i + 1] IN def) > 0 THEN CONTINUE; END IF; -- already patched
    IF position(p_pairs[i] IN def) = 0 THEN
      RAISE EXCEPTION 'patch_fn %: text not found: %', p_fn, left(p_pairs[i], 120);
    END IF;
    def := replace(def, p_pairs[i], p_pairs[i + 1]);
  END LOOP;
  EXECUTE def;
END;
$$;

-- The tick: daily range, rotation quota at day start, varied batch sizes.
SELECT pg_temp.patch_fn('public.auto_release_tick()'::regprocedure, ARRAY[
  'UPDATE public.auto_release_settings SET day = today, today_limit = lim, released_today = 0, extra_today = 0 WHERE id;',
  '-- Kept in the daily range (6,000–10,000 by default).
    lim := least(greatest(s.daily_max, s.daily_min), greatest(s.daily_min, lim));
    -- Rotation: as many old jobs come down today as went up yesterday, while above target_live.
    UPDATE public.auto_release_settings SET released_yesterday = s.released_today, rotated_today = 0,
      rotate_left = CASE WHEN s.rotate_enabled THEN coalesce(s.released_today, 0) ELSE 0 END WHERE id;
    UPDATE public.auto_release_settings SET day = today, today_limit = lim, released_today = 0, extra_today = 0 WHERE id;',

  'n := least(s.max_per_tick, budget, greatest(1, ceil(budget / slots)::integer));',
  'n := least(s.max_per_tick, budget, greatest(1, ceil(budget / slots)::integer));
    -- Not the same number every time: 50–150% of the even share.
    n := least(s.max_per_tick, budget, greatest(1, round(n * (0.5 + random()))::integer));'
]);

-- Rotation, an hour at a time.
CREATE OR REPLACE FUNCTION public.rotate_old_jobs(p_batch integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  s public.auto_release_settings;
  v_live integer;
  v_n integer;
  v_closed integer := 0;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.auto_release_settings WHERE id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR NOT s.rotate_enabled OR s.rotate_left <= 0 THEN RETURN jsonb_build_object('closed', 0); END IF;

  SELECT count(*) INTO v_live FROM public.sponsored_jobs
  WHERE status = 'published' AND NOT awaiting_release AND (expires_at IS NULL OR expires_at > now());
  v_n := least(s.rotate_left, greatest(v_live - s.target_live, 0), greatest(coalesce(p_batch, 1000), 1));
  IF v_n <= 0 THEN
    UPDATE public.auto_release_settings SET rotate_left = 0 WHERE id;
    RETURN jsonb_build_object('closed', 0, 'live', v_live);
  END IF;

  WITH oldest AS (
    SELECT id FROM public.sponsored_jobs
    WHERE status = 'published' AND NOT awaiting_release AND origin = 'imported'
    ORDER BY public.job_posted_at(source_posted_at, created_at)
    LIMIT v_n
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sponsored_jobs j
  SET status = 'expired', closed_reason = 'rotation', closed_at = now() - interval '2 days'
  FROM oldest WHERE j.id = oldest.id;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.auto_release_settings
  SET rotate_left = greatest(rotate_left - v_closed, 0), rotated_today = rotated_today + v_closed
  WHERE id;
  RETURN jsonb_build_object('closed', v_closed, 'live', v_live - v_closed);
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_old_jobs(integer) FROM PUBLIC, anon, authenticated;

-- Settings from Admin.
SELECT pg_temp.patch_fn('public.auto_release_configure(jsonb)'::regprocedure, ARRAY[
  'daily_limit = coalesce((p->>''daily_limit'')::integer, daily_limit),',
  'daily_limit = coalesce((p->>''daily_limit'')::integer, daily_limit),
    daily_min = coalesce((p->>''daily_min'')::integer, daily_min),
    daily_max = coalesce((p->>''daily_max'')::integer, daily_max),
    rotate_enabled = coalesce((p->>''rotate_enabled'')::boolean, rotate_enabled),'
]);

SELECT pg_temp.patch_fn('public.auto_release_status()'::regprocedure, ARRAY[
  '''daily_limit'', s.daily_limit,',
  '''daily_limit'', s.daily_limit,
    ''daily_min'', s.daily_min,
    ''daily_max'', s.daily_max,
    ''rotate_enabled'', s.rotate_enabled,
    ''rotate_left'', s.rotate_left,
    ''rotated_today'', s.rotated_today,
    ''released_yesterday'', s.released_yesterday,'
]);

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('madevisa-rotate-old-jobs'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM cron.schedule('madevisa-rotate-old-jobs', '7 * * * *', 'select public.rotate_old_jobs(1000)');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available (%): run select public.rotate_old_jobs(1000) by hand.', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
