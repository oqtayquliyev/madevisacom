/*
# Trust layer: the apply link is locked on the server, outcome proof, the founder dashboard

Run AFTER 20261231120000_conversion_boost.sql. Safe to run more than once. Deletes nothing.

1. The company's apply address (sponsored_jobs.official_url / application_url) and the job's
   contact_email are no longer readable by visitors who aren't signed in (role anon). Before
   this, the popup only hid them in the browser: anyone could read them from the API.
   - job_apply_link(job, visitor) hands them out to: members, admins, the company that owns
     the job, and ONE free application per visitor / account (job_free_applies).
   - Signed-in non-members can still read the columns directly for now (the company and
     admin screens use the same role). Closing that too needs those screens to use RPCs.
   - IMPORTANT for later migrations: a column added to sponsored_jobs is NOT visible to
     visitors until you run  SELECT public.regrant_public_job_columns();
2. public_outcome_stats(): real numbers members tracked in the last 30 days (applications,
   employer replies, interviews, offers). Shown in the popup only from 10 replies up.
3. admin_north_star(days): Admin → Today. Employer replies per paying member, job freshness,
   check-in answers, the paywall funnel.
4. If you created public.seo_job in the dashboard, it may still return official_url to anyone:
   edit it so it doesn't (api/seo.ts no longer uses the address).
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Lock the apply address for visitors
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regrant_public_job_columns()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sponsored_jobs'
    AND column_name NOT IN ('official_url', 'application_url', 'contact_email');
  EXECUTE 'REVOKE SELECT ON public.sponsored_jobs FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.sponsored_jobs TO anon', cols);
  RETURN 'anon can read every sponsored_jobs column except official_url, application_url, contact_email';
END;
$$;
REVOKE ALL ON FUNCTION public.regrant_public_job_columns() FROM PUBLIC, anon, authenticated;

SELECT public.regrant_public_job_columns();

CREATE TABLE IF NOT EXISTS public.job_free_applies (
  id bigserial PRIMARY KEY,
  -- The account when signed in, else the random id kept in the visitor's browser.
  holder text NOT NULL,
  job_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holder, job_id)
);
ALTER TABLE public.job_free_applies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_free_applies FROM anon, authenticated;

-- The apply address of one job, for those allowed to have it.
--   { url, contact, why: 'member' | 'owner' | 'free' }  or  { locked: true, free_left: 0 }
CREATE OR REPLACE FUNCTION public.job_apply_link(p_job uuid, p_visitor text DEFAULT NULL, p_free boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j record;
  v_uid uuid := auth.uid();
  v_holder text;
  v_free_limit constant integer := 1;
  v_used integer;
  v_url text;
BEGIN
  SELECT s.id, s.status, s.expires_at, s.official_url, s.application_url, s.contact_email, p.owner_id
  INTO j
  FROM public.sponsored_jobs s LEFT JOIN public.program_publishers p ON p.id = s.publisher_id
  WHERE s.id = p_job;
  IF NOT FOUND OR j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at < now()) THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_open');
  END IF;
  v_url := coalesce(nullif(j.application_url, ''), nullif(j.official_url, ''));

  IF v_uid IS NOT NULL AND (public.is_admin() OR j.owner_id = v_uid OR coalesce(public.has_feature(v_uid, 'cv_full_report'), false)) THEN
    RETURN jsonb_build_object('url', v_url, 'contact', j.contact_email, 'why', CASE WHEN j.owner_id = v_uid THEN 'owner' ELSE 'member' END);
  END IF;

  -- One free application: per account, else per browser.
  v_holder := CASE WHEN v_uid IS NOT NULL THEN 'u:' || v_uid::text
                   WHEN p_visitor ~ '^[A-Za-z0-9]{8,64}$' THEN 'v:' || p_visitor END;
  IF v_holder IS NULL THEN RETURN jsonb_build_object('locked', true, 'free_left', 0); END IF;
  -- The same job again: still free.
  IF EXISTS (SELECT 1 FROM public.job_free_applies WHERE holder = v_holder AND job_id = p_job) THEN
    RETURN jsonb_build_object('url', v_url, 'contact', j.contact_email, 'why', 'free');
  END IF;
  SELECT count(*) INTO v_used FROM public.job_free_applies WHERE holder = v_holder;
  IF v_used >= v_free_limit THEN RETURN jsonb_build_object('locked', true, 'free_left', 0); END IF;
  -- Only spend it when asked to (pressing Apply), not when the page just looks.
  IF NOT p_free THEN RETURN jsonb_build_object('locked', true, 'free_left', v_free_limit - v_used); END IF;
  INSERT INTO public.job_free_applies (holder, job_id) VALUES (v_holder, p_job) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('url', v_url, 'contact', j.contact_email, 'why', 'free');
END;
$$;
REVOKE ALL ON FUNCTION public.job_apply_link(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_apply_link(uuid, text, boolean) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Real outcome numbers (last 30 days), for the popup and the site
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_outcome_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'days', 30,
    'applications', count(*) FILTER (WHERE status NOT IN ('withdrawn', 'clicked')),
    'replies', count(*) FILTER (WHERE status IN ('responded', 'interview', 'offer', 'rejected') OR responded_at IS NOT NULL),
    'interviews', count(*) FILTER (WHERE status IN ('interview', 'offer')),
    'offers', count(*) FILTER (WHERE status = 'offer'),
    'people_replied', count(DISTINCT user_id) FILTER (WHERE status IN ('responded', 'interview', 'offer', 'rejected') OR responded_at IS NOT NULL)
  )
  FROM public.application_reports
  WHERE applied_at > now() - interval '30 days' AND NOT coalesce(excluded, false);
$$;
GRANT EXECUTE ON FUNCTION public.public_outcome_stats() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin → Today: the numbers that say whether MadeVisa works
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_north_star(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 30), 180));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_members integer;
  out jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins'; END IF;
  SELECT count(*) INTO v_members FROM public.gumroad_subscriptions
  WHERE NOT test AND user_id IS NOT NULL AND ended_at IS NULL AND (paid_until IS NULL OR paid_until > now());

  SELECT jsonb_build_object(
    'days', v_days,
    'members', jsonb_build_object(
      'paying', v_members,
      'new', (SELECT count(*) FROM public.gumroad_subscriptions WHERE NOT test AND created_at >= v_since),
      'ended', (SELECT count(*) FROM public.gumroad_subscriptions WHERE NOT test AND ended_at >= v_since)
    ),
    'outcomes', (
      SELECT jsonb_build_object(
        'applications', count(*) FILTER (WHERE a.status NOT IN ('withdrawn', 'clicked')),
        'replies', count(*) FILTER (WHERE a.status IN ('responded', 'interview', 'offer', 'rejected') OR a.responded_at IS NOT NULL),
        'interviews', count(*) FILTER (WHERE a.status IN ('interview', 'offer')),
        'offers', count(*) FILTER (WHERE a.status = 'offer'),
        'member_replies', count(*) FILTER (WHERE (a.status IN ('responded', 'interview', 'offer', 'rejected') OR a.responded_at IS NOT NULL)
                                             AND EXISTS (SELECT 1 FROM public.gumroad_subscriptions g WHERE g.user_id = a.user_id AND NOT g.test)),
        'checkins_due', count(*) FILTER (WHERE a.remind_at IS NOT NULL AND a.remind_at <= now()),
        'still_applied', count(*) FILTER (WHERE a.status = 'applied' AND a.applied_at < now() - interval '14 days')
      )
      FROM public.application_reports a WHERE a.applied_at >= v_since AND NOT coalesce(a.excluded, false)
    ),
    'jobs', (
      SELECT jsonb_build_object(
        'live', count(*),
        'imported', count(*) FILTER (WHERE s.last_seen_at IS NOT NULL),
        'checked_24h', count(*) FILTER (WHERE s.last_seen_at > now() - interval '24 hours'),
        'stale_72h', count(*) FILTER (WHERE s.last_seen_at IS NOT NULL AND s.last_seen_at < now() - interval '72 hours'),
        'median_hours_since_check', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM now() - s.last_seen_at) / 3600) FILTER (WHERE s.last_seen_at IS NOT NULL))::numeric, 1),
        'no_apply_link', count(*) FILTER (WHERE coalesce(nullif(s.application_url, ''), nullif(s.official_url, '')) IS NULL)
      )
      FROM public.sponsored_jobs s
      WHERE s.status = 'published' AND (s.expires_at IS NULL OR s.expires_at > now())
    ),
    'funnel', (
      SELECT jsonb_build_object(
        'people_saw_popup', count(DISTINCT visitor) FILTER (WHERE kind = 'shown'),
        'people_pressed', count(DISTINCT visitor) FILTER (WHERE kind = 'click'),
        'people_opened_payment', count(DISTINCT visitor) FILTER (WHERE kind = 'checkout_open'),
        'free_applies', count(DISTINCT visitor) FILTER (WHERE kind = 'free_apply')
      )
      FROM public.paywall_events WHERE created_at >= v_since
    )
  ) INTO out;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_north_star(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_north_star(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
