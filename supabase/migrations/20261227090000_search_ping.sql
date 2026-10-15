/* Tell search engines about job pages as soon as they change.

   • Google Indexing API (made for job postings): "this job page is new or changed" (URL_UPDATED) and
     "this job is gone" (URL_DELETED). Default quota about 200 a day, so the newest jobs go first.
   • IndexNow (Bing, Yandex, Seznam, Naver; DuckDuckGo and others use Bing's index): any number at once.

   The database keeps a queue (search_ping_queue): a job is added when it goes live or its title changes,
   and again when it is closed, unpublished or expires. Every 30 minutes the search-ping edge function
   takes the queue and sends it. All live jobs are queued once now, newest first.

   Needs: supabase functions deploy search-ping --no-verify-jwt, and the secret GOOGLE_INDEXING_KEY
   (the service account's JSON key; the service account must be an Owner in Search Console).
   Without the key only IndexNow is sent. */

CREATE TABLE IF NOT EXISTS public.search_ping_queue (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('update', 'delete')),
  -- Kept here so the address can still be built after a job row is gone.
  title text NOT NULL,
  company text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  google_at timestamptz,
  google_status text,
  indexnow_at timestamptz,
  UNIQUE (job_id, action)
);
CREATE INDEX IF NOT EXISTS search_ping_google_idx ON public.search_ping_queue (queued_at DESC) WHERE google_at IS NULL;
CREATE INDEX IF NOT EXISTS search_ping_indexnow_idx ON public.search_ping_queue (queued_at DESC) WHERE indexnow_at IS NULL;
CREATE INDEX IF NOT EXISTS search_ping_google_day_idx ON public.search_ping_queue (google_at) WHERE google_at IS NOT NULL;
ALTER TABLE public.search_ping_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_ping_queue FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.search_ping_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  -- Google's default Indexing API quota is 200 publish requests a day; stay just under it.
  google_daily integer NOT NULL DEFAULT 190 CHECK (google_daily BETWEEN 0 AND 100000),
  function_url text NOT NULL DEFAULT 'https://fduetqpklyoxeqqdhozg.supabase.co/functions/v1/search-ping',
  last_sweep_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_note text,
  -- Google requests accepted on google_day (Pacific time, when Google's quota resets).
  google_day date,
  google_count integer NOT NULL DEFAULT 0
);
INSERT INTO public.search_ping_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.search_ping_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_ping_settings FROM anon, authenticated;

/* Queue one job (a newer event replaces an older unsent one; an update and a delete cancel each other out). */
CREATE OR REPLACE FUNCTION public.search_ping_enqueue(p_job uuid, p_action text, p_title text, p_company text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_job IS NULL OR coalesce(btrim(p_title), '') = '' THEN RETURN; END IF;
  DELETE FROM public.search_ping_queue WHERE job_id = p_job AND action <> p_action AND google_at IS NULL AND indexnow_at IS NULL;
  -- Half-sent (IndexNow done, Google still waiting, or the reverse): don't send the stale half.
  UPDATE public.search_ping_queue
  SET google_status = CASE WHEN google_at IS NULL THEN 'replaced' ELSE google_status END,
      google_at = coalesce(google_at, now()), indexnow_at = coalesce(indexnow_at, now())
  WHERE job_id = p_job AND action <> p_action AND (google_at IS NULL OR indexnow_at IS NULL);
  INSERT INTO public.search_ping_queue AS q (job_id, action, title, company)
  VALUES (p_job, p_action, p_title, coalesce(nullif(btrim(p_company), ''), 'company'))
  ON CONFLICT (job_id, action) DO UPDATE SET
    title = excluded.title, company = excluded.company, queued_at = now(),
    google_at = NULL, google_status = NULL, indexnow_at = NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.search_ping_enqueue(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_ping_job_live(s public.sponsored_jobs)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT s.status = 'published' AND NOT coalesce(s.awaiting_release, false) AND (s.expires_at IS NULL OR s.expires_at > now()) $$;

CREATE OR REPLACE FUNCTION public.search_ping_job_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_live boolean := TG_OP <> 'INSERT' AND public.search_ping_job_live(OLD);
  is_live boolean := TG_OP <> 'DELETE' AND public.search_ping_job_live(NEW);
  company text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF was_live THEN
      SELECT p.name INTO company FROM public.program_publishers p WHERE p.id = OLD.publisher_id;
      PERFORM public.search_ping_enqueue(OLD.id, 'delete', OLD.title, company);
    END IF;
    RETURN OLD;
  END IF;
  IF is_live AND (NOT was_live OR NEW.title IS DISTINCT FROM OLD.title) THEN
    SELECT p.name INTO company FROM public.program_publishers p WHERE p.id = NEW.publisher_id;
    PERFORM public.search_ping_enqueue(NEW.id, 'update', NEW.title, company);
  ELSIF was_live AND NOT is_live THEN
    SELECT p.name INTO company FROM public.program_publishers p WHERE p.id = NEW.publisher_id;
    PERFORM public.search_ping_enqueue(NEW.id, 'delete', OLD.title, company);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block saving a job because of this.
  RAISE NOTICE 'search_ping_job_changed: %', SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS search_ping_job_changed ON public.sponsored_jobs;
CREATE TRIGGER search_ping_job_changed
AFTER INSERT OR UPDATE OF status, awaiting_release, expires_at, title OR DELETE ON public.sponsored_jobs
FOR EACH ROW EXECUTE FUNCTION public.search_ping_job_changed();

/* For the edge function. Jobs that passed their expiry date since the last sweep → delete. */
CREATE OR REPLACE FUNCTION public.search_ping_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since timestamptz;
  n integer := 0;
  r record;
BEGIN
  SELECT last_sweep_at INTO since FROM public.search_ping_settings WHERE id;
  UPDATE public.search_ping_settings SET last_sweep_at = now() WHERE id;
  FOR r IN
    SELECT s.id, s.title, p.name AS company FROM public.sponsored_jobs s
    LEFT JOIN public.program_publishers p ON p.id = s.publisher_id
    WHERE s.status = 'published' AND s.expires_at > since AND s.expires_at <= now()
  LOOP
    PERFORM public.search_ping_enqueue(r.id, 'delete', r.title, r.company);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.search_ping_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_ping_sweep() TO service_role;

/* What to send next to one engine: removals first, then the newest jobs. Google: only what is left of today's quota. */
CREATE OR REPLACE FUNCTION public.search_ping_batch(p_engine text, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.search_ping_settings;
  lim integer := greatest(0, least(coalesce(p_limit, 100), 10000));
  sent_today integer;
BEGIN
  SELECT * INTO st FROM public.search_ping_settings WHERE id;
  IF NOT st.enabled THEN RETURN jsonb_build_object('items', '[]'::jsonb, 'left', 0); END IF;
  IF p_engine = 'google' THEN
    sent_today := CASE WHEN st.google_day = (now() AT TIME ZONE 'America/Los_Angeles')::date THEN st.google_count ELSE 0 END;
    lim := least(lim, greatest(0, st.google_daily - sent_today));
    RETURN jsonb_build_object('left', lim, 'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'job_id', q.job_id, 'action', q.action, 'title', q.title, 'company', q.company) ORDER BY q.action = 'update', q.queued_at DESC)
      FROM (SELECT * FROM public.search_ping_queue WHERE google_at IS NULL ORDER BY action = 'update', queued_at DESC LIMIT lim) q), '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('left', lim, 'items', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', q.id, 'job_id', q.job_id, 'action', q.action, 'title', q.title, 'company', q.company))
    FROM (SELECT * FROM public.search_ping_queue WHERE indexnow_at IS NULL ORDER BY action = 'update', queued_at DESC LIMIT lim) q), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.search_ping_batch(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_ping_batch(text, integer) TO service_role;

/* Mark what was sent. p_status: 'ok' or a short error ("403 Permission denied" …); errors are tried again next time. */
CREATE OR REPLACE FUNCTION public.search_ping_done(p_engine text, p_ids bigint[], p_status text DEFAULT 'ok')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_engine = 'google' THEN
    IF coalesce(p_status, 'ok') = 'ok' THEN
      UPDATE public.search_ping_queue SET google_at = now(), google_status = 'ok' WHERE id = ANY (p_ids);
      UPDATE public.search_ping_settings
      SET google_count = CASE WHEN google_day = (now() AT TIME ZONE 'America/Los_Angeles')::date THEN google_count ELSE 0 END + coalesce(cardinality(p_ids), 0),
          google_day = (now() AT TIME ZONE 'America/Los_Angeles')::date
      WHERE id;
    ELSE
      UPDATE public.search_ping_queue SET google_status = left(p_status, 200) WHERE id = ANY (p_ids);
    END IF;
  ELSIF coalesce(p_status, 'ok') = 'ok' THEN
    UPDATE public.search_ping_queue SET indexnow_at = now() WHERE id = ANY (p_ids);
  END IF;
  -- Sent to both long ago: no need to keep.
  DELETE FROM public.search_ping_queue WHERE google_at < now() - interval '60 days' AND indexnow_at IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.search_ping_done(text, bigint[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_ping_done(text, bigint[], text) TO service_role;

CREATE OR REPLACE FUNCTION public.search_ping_note(p_note text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ UPDATE public.search_ping_settings SET last_run_at = now(), last_note = left(p_note, 1000) WHERE id $$;
REVOKE ALL ON FUNCTION public.search_ping_note(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_ping_note(text) TO service_role;

/* How it is going (SQL editor, or an admin): select public.search_ping_status(); */
CREATE OR REPLACE FUNCTION public.search_ping_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'last_run_at', st.last_run_at,
    'last_note', st.last_note,
    'google_sent_today', CASE WHEN st.google_day = (now() AT TIME ZONE 'America/Los_Angeles')::date THEN st.google_count ELSE 0 END,
    'google_daily_limit', st.google_daily,
    'google_waiting', (SELECT count(*) FROM public.search_ping_queue WHERE google_at IS NULL),
    'google_last_error', (SELECT google_status FROM public.search_ping_queue WHERE google_at IS NULL AND google_status IS NOT NULL ORDER BY queued_at DESC LIMIT 1),
    'indexnow_waiting', (SELECT count(*) FROM public.search_ping_queue WHERE indexnow_at IS NULL),
    'indexnow_sent', (SELECT count(*) FROM public.search_ping_queue WHERE indexnow_at IS NOT NULL))
  FROM public.search_ping_settings st WHERE st.id;
$$;
REVOKE ALL ON FUNCTION public.search_ping_status() FROM PUBLIC, anon, authenticated;

/* The cron: call the edge function every 30 minutes (same secret header as the other pipelines). */
CREATE OR REPLACE FUNCTION public.search_ping_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.search_ping_settings;
  secret text;
BEGIN
  SELECT * INTO st FROM public.search_ping_settings WHERE id;
  IF NOT st.enabled THEN RETURN; END IF;
  SELECT value INTO secret FROM public.app_secrets WHERE name = 'cron_secret';
  PERFORM net.http_post(url := st.function_url, body := '{"run":true}'::jsonb,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-madevisa-cron', coalesce(secret, '')),
                        timeout_milliseconds := 60000);
END;
$$;
REVOKE ALL ON FUNCTION public.search_ping_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('madevisa-search-ping');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('madevisa-search-ping', '*/30 * * * *', 'select public.search_ping_tick()');
  END IF;
END $$;

-- Every job that is live now, once (newest first by queued_at).
INSERT INTO public.search_ping_queue (job_id, action, title, company, queued_at)
SELECT s.id, 'update', s.title, coalesce(nullif(btrim(p.name), ''), 'company'), coalesce(s.released_at, s.created_at)
FROM public.sponsored_jobs s
LEFT JOIN public.program_publishers p ON p.id = s.publisher_id
WHERE public.search_ping_job_live(s) AND coalesce(btrim(s.title), '') <> ''
ON CONFLICT (job_id, action) DO NOTHING;

NOTIFY pgrst, 'reload schema';
