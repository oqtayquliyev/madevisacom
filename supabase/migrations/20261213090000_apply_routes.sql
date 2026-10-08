/*
# Auto Apply: send-able jobs first
Run AFTER 20261212090000_apply_send_now.sql. Safe to run more than once.

Every job link is followed once (by the apply function the moment someone
sees the job in their matches, and by the worker for Pro auto-apply) and
where its application really goes is kept:
  auto    a Greenhouse / Lever / Ashby form MadeVisa fills and sends
  email   MadeVisa emails the application
  site    another careers site — MadeVisa tries; the person may need to finish
  login   the employer's site needs the person's own account
  none    no form;   closed  the job is gone
"Apply to 3 jobs" and Pro auto-apply pick auto / email jobs first, and an
application goes straight to the real form (not the company's page in front of it).
What the worker finds when it applies (a login, no form, a submission) corrects the route.
*/

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.job_apply_routes (
  job_id uuid PRIMARY KEY REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  route text NOT NULL CHECK (route IN ('pending', 'auto', 'email', 'site', 'login', 'none', 'closed')),
  url text,
  platform text,
  questions integer,
  source text NOT NULL DEFAULT 'probe' CHECK (source IN ('probe', 'worker')),
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_apply_routes_route_idx ON public.job_apply_routes (route, checked_at);
ALTER TABLE public.job_apply_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_apply_routes FROM anon, authenticated;

/* Jobs to follow now: the ones asked for that have no route yet, or an old "site"/unknown one (service role). */
CREATE OR REPLACE FUNCTION public.apply_routes_todo(p_jobs uuid[] DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', j.id,
      'url', coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')),
      'email', public.apply_channel_email(j.id) IS NOT NULL
    ) AS x
    FROM public.sponsored_jobs j
    LEFT JOIN public.job_apply_routes t ON t.job_id = j.id
    WHERE j.status = 'published' AND (j.expires_at IS NULL OR j.expires_at > now())
      AND (p_jobs IS NULL OR j.id = ANY (p_jobs))
      AND (p_jobs IS NOT NULL OR t.route = 'pending')
      AND (t.job_id IS NULL OR t.route = 'pending'
           OR (t.source = 'probe' AND t.route = 'site' AND t.checked_at < now() - interval '3 days')
           OR (t.source = 'probe' AND t.checked_at < now() - interval '14 days'))
    ORDER BY coalesce(j.released_at, j.approved_at, j.created_at) DESC
    LIMIT greatest(1, least(200, p_limit))
  ) s;
$$;
REVOKE ALL ON FUNCTION public.apply_routes_todo(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_routes_todo(uuid[], integer) TO service_role;

/* Keep what was found. p_items: [{ jobId, route, url, platform, questions }]. Applications not sent yet follow the real form. */
CREATE OR REPLACE FUNCTION public.apply_routes_store(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it jsonb;
  n integer := 0;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN RETURN 0; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN coalesce(it->>'jobId', '') !~* '^[0-9a-f-]{36}$'
      OR coalesce(it->>'route', '') NOT IN ('auto', 'email', 'site', 'login', 'none', 'closed')
      OR NOT EXISTS (SELECT 1 FROM public.sponsored_jobs WHERE id = (it->>'jobId')::uuid);
    INSERT INTO public.job_apply_routes (job_id, route, url, platform, questions, source, checked_at)
    VALUES ((it->>'jobId')::uuid, it->>'route', left(nullif(it->>'url', ''), 2000), left(nullif(it->>'platform', ''), 40),
            CASE WHEN (it->>'questions') ~ '^\d+$' THEN (it->>'questions')::int END, 'probe', now())
    ON CONFLICT (job_id) DO UPDATE SET route = excluded.route, url = excluded.url, platform = excluded.platform,
      questions = excluded.questions, source = 'probe', checked_at = now()
    -- What the worker saw on the real site wins over a quick look, for a week.
    WHERE job_apply_routes.source = 'probe' OR job_apply_routes.checked_at < now() - interval '7 days';
    n := n + 1;
    IF it->>'route' IN ('auto', 'site', 'login') AND nullif(it->>'url', '') IS NOT NULL THEN
      UPDATE public.job_applications SET url = it->>'url', platform = coalesce(left(nullif(it->>'platform', ''), 40), platform), updated_at = now()
       WHERE job_id = (it->>'jobId')::uuid AND status IN ('queued', 'analyzing', 'preparing', 'ready') AND channel = 'employer_site'
         AND url IS DISTINCT FROM it->>'url';
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_routes_store(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_routes_store(jsonb) TO service_role;

/* A new application goes to the real form when it is known. */
CREATE OR REPLACE FUNCTION public.job_applications_route_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.job_apply_routes;
BEGIN
  IF NEW.channel = 'employer_site' AND NEW.job_id IS NOT NULL THEN
    SELECT * INTO t FROM public.job_apply_routes WHERE job_id = NEW.job_id;
    IF FOUND AND t.route IN ('auto', 'site', 'login') AND t.url IS NOT NULL THEN
      NEW.url := t.url;
      NEW.platform := coalesce(t.platform, NEW.platform);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_applications_route_url ON public.job_applications;
CREATE TRIGGER job_applications_route_url BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_route_url();

/* What happened on the real site corrects the route (for everyone after). */
CREATE OR REPLACE FUNCTION public.job_applications_route_learn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r text;
BEGIN
  IF NEW.job_id IS NULL OR NEW.channel <> 'employer_site' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  r := CASE
    WHEN NEW.status = 'submitted' AND coalesce(NEW.verified, false) THEN 'auto'
    WHEN NEW.status = 'blocked' AND NEW.reason_code = 'login_required' THEN 'login'
    WHEN NEW.status = 'needs_attention' AND NEW.reason_code = 'no_form' THEN 'none'
    WHEN NEW.status = 'expired' THEN 'closed'
  END;
  IF r IS NOT NULL THEN
    INSERT INTO public.job_apply_routes (job_id, route, url, platform, source, checked_at)
    VALUES (NEW.job_id, r, NEW.url, NEW.platform, 'worker', now())
    ON CONFLICT (job_id) DO UPDATE SET route = excluded.route, url = coalesce(excluded.url, job_apply_routes.url),
      platform = coalesce(excluded.platform, job_apply_routes.platform), source = 'worker', checked_at = now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_applications_route_learn ON public.job_applications;
CREATE TRIGGER job_applications_route_learn AFTER UPDATE OF status ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_route_learn();

/* Matches on the page: the route of each job, and note the ones not followed yet. */
CREATE OR REPLACE FUNCTION public.apply_preview(p_jobs uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF coalesce(array_length(p_jobs, 1), 0) > 80 THEN RAISE EXCEPTION 'Too many jobs at once.'; END IF;
  -- Jobs nobody has followed yet are noted, so their route is found (the apply function, then the worker).
  INSERT INTO public.job_apply_routes (job_id, route, checked_at)
  SELECT j.id, 'pending', now() FROM public.sponsored_jobs j WHERE j.id = ANY (p_jobs)
  ON CONFLICT (job_id) DO NOTHING;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', j.id,
      'channel', CASE WHEN public.apply_channel_email(j.id) IS NOT NULL THEN 'madevisa' ELSE 'employer_site' END,
      'url', coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')),
      'closed', j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at <= now()),
      'applied',
        EXISTS (SELECT 1 FROM public.job_applications a WHERE a.user_id = me AND a.job_id = j.id AND a.status NOT IN ('skipped', 'failed'))
        OR EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id = j.id AND r.status NOT IN ('clicked', 'withdrawn')),
      'twin',
        EXISTS (SELECT 1 FROM public.job_applications a
                WHERE a.user_id = me AND a.job_id <> j.id AND a.publisher_id = j.publisher_id
                  AND a.norm_title = public.apply_norm_title(j.title) AND a.status IN ('submitted', 'submitting', 'review_required', 'queued', 'preparing', 'needs_answer'))
        OR EXISTS (SELECT 1 FROM public.application_reports r
                   WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id <> j.id AND r.publisher_id = j.publisher_id
                     AND r.status NOT IN ('clicked', 'withdrawn') AND public.apply_norm_title(r.listing_title) = public.apply_norm_title(j.title)),
      'knownSponsor', c.iso_code = 'GB' AND public.uk_sponsor_for_publisher(j.publisher_id) IS NOT NULL,
      'route', CASE WHEN public.apply_channel_email(j.id) IS NOT NULL THEN 'email' ELSE t.route END
    ))
    FROM public.sponsored_jobs j
    LEFT JOIN public.countries c ON c.id = j.country_id
    LEFT JOIN public.job_apply_routes t ON t.job_id = j.id AND t.route <> 'pending'
    WHERE j.id = ANY (p_jobs)
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_preview(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_preview(uuid[]) TO authenticated;

/* Pro auto-apply's new jobs: with the real form's address and its route. */
CREATE OR REPLACE FUNCTION public.apply_auto_jobs(p_user uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', j.id, 'title', j.title, 'company', pub.name, 'publisherId', j.publisher_id,
      'cc', c.iso_code, 'country', c.name,
      'html', coalesce(nullif(j.facts->>'html', ''), j.description, ''),
      'jobFunction', j.job_function, 'experience', j.experience_level,
      'visa', j.visa_sponsorship,
      'url', coalesce((SELECT t.url FROM public.job_apply_routes t WHERE t.job_id = j.id AND t.url IS NOT NULL AND t.route <> 'pending'), nullif(j.application_url, ''), nullif(j.official_url, '')),
      'route', CASE WHEN public.apply_channel_email(j.id) IS NOT NULL THEN 'email' ELSE (SELECT t.route FROM public.job_apply_routes t WHERE t.job_id = j.id AND t.route <> 'pending') END,
      'at', coalesce(j.released_at, j.approved_at, j.created_at)
    ) AS x
    FROM public.sponsored_jobs j
    LEFT JOIN public.program_publishers pub ON pub.id = j.publisher_id
    LEFT JOIN public.countries c ON c.id = j.country_id
    WHERE j.status = 'published'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND coalesce(j.released_at, j.approved_at, j.created_at) > p_since
      AND coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.job_applications a WHERE a.user_id = p_user AND a.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = p_user AND r.listing_kind = 'job' AND r.listing_id = j.id)
    ORDER BY coalesce(j.released_at, j.approved_at, j.created_at) DESC
    LIMIT 400
  ) t;
$$;
REVOKE ALL ON FUNCTION public.apply_auto_jobs(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_jobs(uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
