/*
# Auto Apply: a worker that runs on a schedule (free, on GitHub Actions)
Run AFTER 20261205090000_auto_apply_batch.sql. Safe to run more than once.

A worker running all the time checks in every 30 seconds. One that runs on a
schedule (the GitHub Actions workflow .github/workflows/apply-worker.yml)
checks in each time it runs and says how often that is (info.everyMinutes).
It counts as "online" while its next run is due — so the site can still tell
people they can leave the page, because their applications will be picked up.
*/

CREATE OR REPLACE FUNCTION public.apply_worker_online()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.apply_workers w
    WHERE w.seen_at > now() - make_interval(mins => 3 + CASE WHEN (w.info->>'everyMinutes') ~ '^\d{1,4}$' THEN least(240, (w.info->>'everyMinutes')::int) ELSE 0 END)
  );
$$;
REVOKE ALL ON FUNCTION public.apply_worker_online() FROM PUBLIC, anon, authenticated;

/* How soon ready applications will be picked up: 0 = a worker is running now; otherwise minutes until the next scheduled run (at most). */
CREATE OR REPLACE FUNCTION public.apply_worker_wait()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.apply_workers WHERE seen_at > now() - interval '3 minutes' AND coalesce(info->>'mode', '') <> 'scheduled') THEN 0
    ELSE (SELECT min(greatest(1, ceil(extract(epoch FROM (w.seen_at + make_interval(mins => (w.info->>'everyMinutes')::int) - now())) / 60)::int))
          FROM public.apply_workers w WHERE (w.info->>'everyMinutes') ~ '^\d{1,4}$')
  END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_wait() FROM PUBLIC, anon, authenticated;

/* The apply function asks GitHub to start a run right away; this keeps it to one request a minute. */
CREATE TABLE IF NOT EXISTS public.apply_kicks (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.apply_kicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apply_kicks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_kick_due()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.apply_kicks (id, at) VALUES (true, now())
  ON CONFLICT (id) DO UPDATE SET at = now() WHERE public.apply_kicks.at < now() - interval '1 minute';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_kick_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_kick_due() TO service_role;

/* apply_status: the same, plus how soon the next scheduled run is. */
CREATE OR REPLACE FUNCTION public.apply_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  s public.apply_settings;
  lim int;
  used int;
  q public.application_queues;
BEGIN
  SELECT * INTO s FROM public.apply_settings;
  IF me IS NULL THEN
    RETURN jsonb_build_object('signedIn', false, 'enabled', s.enabled, 'freeMonthly', s.free_monthly, 'proMonthly', s.pro_monthly, 'worker', jsonb_build_object('online', public.apply_worker_online(), 'waitMinutes', public.apply_worker_wait()));
  END IF;
  lim := public.apply_limit(me);
  used := public.apply_used(me);
  SELECT * INTO q FROM public.application_queues WHERE user_id = me ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'signedIn', true,
    'enabled', s.enabled,
    'pro', public.is_pro(me),
    'monthly', lim,
    'used', used,
    'left', greatest(0, lim - used),
    'freeMonthly', s.free_monthly,
    'proMonthly', s.pro_monthly,
    'dailyMax', s.daily_max,
    'daily', public.apply_daily_limit(me),
    'today', (SELECT count(*) FROM public.job_applications WHERE user_id = me AND day_started = (now() AT TIME ZONE 'utc')::date),
    'resetsAt', date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month',
    'chargeSelfSent', s.charge_self_sent,
    'worker', jsonb_build_object('online', public.apply_worker_online(), 'autoSubmit', s.auto_submit, 'waitMinutes', public.apply_worker_wait()),
    'queue', public.apply_queue_json(q)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_status() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
