/*
# Conversion boost: the popup's new numbers, Sponsor Proof (UK + NL + US), job views, diaspora

Run AFTER 20261231110000_guest_return.sql. Safe to run more than once. Deletes nothing.

  paywall_events            new kinds: checkout_open (Gumroad's form opened), downsell_shown,
                            downsell_click ("first month for less"), free_apply (the one free
                            application). paywall_track() accepts them; admin_paywall_stats()
                            counts them per day.
  job_daily_views           how many times a job page was opened per day (no visitor data at
                            all, just a counter). job_view_ping(job) adds one and answers
                            today's number — the popup shows "14 people looked at this today"
                            from 3 up.
  sponsor_registers         official sponsor registers besides the UK one: NL (IND recognised
                            sponsors) and US (USCIS H-1B Employer Data Hub), loaded daily by the
                            pipeline ({ cron: "sponsors" }, supabase/functions/auto-pipeline/sponsors.ts).
  sponsor_proof_for_publisher(id)  every official record for a company: UK + NL + US.
  social_program.trending_sounds  this week's trending sounds for reels posted by hand.
  diaspora_count(id, 'AZ')  how many members with that nationality tracked an application to
                            the company; null below 3 people.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Paywall: more kinds of events
-- ---------------------------------------------------------------------------
ALTER TABLE public.paywall_events DROP CONSTRAINT IF EXISTS paywall_events_kind_check;
ALTER TABLE public.paywall_events ADD CONSTRAINT paywall_events_kind_check
  CHECK (kind IN ('shown', 'click', 'checkout_open', 'downsell_shown', 'downsell_click', 'free_apply'));

CREATE OR REPLACE FUNCTION public.paywall_track(p_visitor text, p_kind text, p_source text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_visitor IS NULL OR length(p_visitor) NOT BETWEEN 8 AND 64
     OR p_kind NOT IN ('shown', 'click', 'checkout_open', 'downsell_shown', 'downsell_click', 'free_apply') THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.paywall_events WHERE visitor = p_visitor AND created_at > now() - interval '1 day') >= 300 THEN RETURN; END IF;
  INSERT INTO public.paywall_events (visitor, kind, source, user_id)
  VALUES (p_visitor, p_kind, CASE WHEN p_source ~ '^[a-z0-9_]{1,40}$' THEN p_source ELSE 'other' END, auth.uid());
  IF random() < 0.002 THEN DELETE FROM public.paywall_events WHERE created_at < now() - interval '180 days'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.paywall_track(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paywall_track(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_paywall_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 30), 180));
  v_since date := (now() AT TIME ZONE 'UTC')::date - (v_days - 1);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins'; END IF;
  RETURN jsonb_build_object(
    'days', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'shown', coalesce(e.shown, 0),
        'people', coalesce(e.people, 0),
        'clicks', coalesce(e.clicks, 0),
        'clickers', coalesce(e.clickers, 0),
        'checkouts', coalesce(e.checkouts, 0),
        'downsell_shown', coalesce(e.downsell_shown, 0),
        'downsell_clicks', coalesce(e.downsell_clicks, 0),
        'free_applies', coalesce(e.free_applies, 0),
        'paid', coalesce(g.paid, 0)
      ) ORDER BY d.day DESC)
      FROM generate_series(v_since, (now() AT TIME ZONE 'UTC')::date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
               count(*) FILTER (WHERE kind = 'shown') AS shown,
               count(DISTINCT visitor) FILTER (WHERE kind = 'shown') AS people,
               count(*) FILTER (WHERE kind = 'click') AS clicks,
               count(DISTINCT visitor) FILTER (WHERE kind = 'click') AS clickers,
               count(DISTINCT visitor) FILTER (WHERE kind = 'checkout_open') AS checkouts,
               count(DISTINCT visitor) FILTER (WHERE kind = 'downsell_shown') AS downsell_shown,
               count(DISTINCT visitor) FILTER (WHERE kind = 'downsell_click') AS downsell_clicks,
               count(DISTINCT visitor) FILTER (WHERE kind = 'free_apply') AS free_applies
        FROM public.paywall_events WHERE created_at >= v_since
        GROUP BY 1
      ) e ON e.day = d.day::date
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS paid
        FROM public.gumroad_subscriptions WHERE created_at >= v_since AND NOT test
        GROUP BY 1
      ) g ON g.day = d.day::date
    ), '[]'::jsonb),
    'by_source', coalesce((
      SELECT jsonb_agg(jsonb_build_object('source', source, 'shown', shown, 'people', people, 'clicks', clicks, 'clickers', clickers) ORDER BY shown DESC)
      FROM (
        SELECT source,
               count(*) FILTER (WHERE kind = 'shown') AS shown,
               count(DISTINCT visitor) FILTER (WHERE kind = 'shown') AS people,
               count(*) FILTER (WHERE kind = 'click') AS clicks,
               count(DISTINCT visitor) FILTER (WHERE kind = 'click') AS clickers
        FROM public.paywall_events WHERE created_at >= v_since
        GROUP BY source
      ) s
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_paywall_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_paywall_stats(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Job page views per day (a plain counter — nothing about the visitor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_daily_views (
  job_id uuid NOT NULL,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, day)
);
ALTER TABLE public.job_daily_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_daily_views FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.job_view_ping(p_job uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  n integer;
BEGIN
  IF p_job IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.job_daily_views (job_id, day, views) VALUES (p_job, v_day, 1)
  ON CONFLICT (job_id, day) DO UPDATE SET views = public.job_daily_views.views + 1
  RETURNING views INTO n;
  IF random() < 0.001 THEN DELETE FROM public.job_daily_views WHERE day < v_day - 60; END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.job_view_ping(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_view_ping(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Official sponsor registers besides the UK one (NL IND, US H-1B)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_registers (
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  name_key text NOT NULL,
  name text NOT NULL,
  city text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  seen_on date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, name_key)
);
ALTER TABLE public.sponsor_registers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsor_registers FROM anon, authenticated;

-- Pipeline: one batch of { n: name, c: city, d: detail } rows for one register.
-- US rows of the same company (several tax ids / cities) are added up.
CREATE OR REPLACE FUNCTION public.sponsor_registers_upsert(p_country text, p_rows jsonb, p_seen date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH src AS (
    SELECT public.normalize_org(x.n) AS k, x.n AS nm, x.c AS ct, coalesce(x.d, '{}'::jsonb) AS dt
    FROM jsonb_to_recordset(p_rows) AS x(n text, c text, d jsonb)
  ),
  agg AS (
    SELECT k, min(nm) AS nm, min(ct) AS ct,
           CASE WHEN p_country = 'US' THEN jsonb_build_object(
                  'approvals', sum(coalesce((dt->>'approvals')::int, 0)),
                  'new_approvals', sum(coalesce((dt->>'new_approvals')::int, 0)),
                  'year', max((dt->>'year')::int))
                ELSE (array_agg(dt))[1] END AS dt
    FROM src WHERE k IS NOT NULL GROUP BY k
  )
  INSERT INTO public.sponsor_registers (country, name_key, name, city, detail, seen_on, updated_at)
  SELECT p_country, k, left(nm, 200), left(ct, 100), dt, p_seen, now() FROM agg
  ON CONFLICT (country, name_key) DO UPDATE SET
    name = excluded.name,
    city = excluded.city,
    detail = CASE WHEN p_country = 'US' AND public.sponsor_registers.seen_on = excluded.seen_on
                  THEN jsonb_build_object(
                    'approvals', coalesce((public.sponsor_registers.detail->>'approvals')::int, 0) + coalesce((excluded.detail->>'approvals')::int, 0),
                    'new_approvals', coalesce((public.sponsor_registers.detail->>'new_approvals')::int, 0) + coalesce((excluded.detail->>'new_approvals')::int, 0),
                    'year', excluded.detail->'year')
                  ELSE excluded.detail END,
    seen_on = excluded.seen_on,
    updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_registers_upsert(text, jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsor_registers_upsert(text, jsonb, date) TO service_role;

-- Pipeline: before the first batch of one register. A second run on the same day starts over
-- (US approvals are added up across batches, so they must not be added twice).
CREATE OR REPLACE FUNCTION public.sponsor_registers_begin(p_country text, p_seen date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sponsor_registers SET seen_on = p_seen - 1 WHERE country = p_country AND seen_on >= p_seen;
$$;
REVOKE ALL ON FUNCTION public.sponsor_registers_begin(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsor_registers_begin(text, date) TO service_role;

-- Pipeline: after all batches of one register. Old rows go only when today's import is clearly complete.
CREATE OR REPLACE FUNCTION public.sponsor_registers_finish(p_country text, p_seen date, p_url text, p_min integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today integer;
  removed integer := 0;
BEGIN
  SELECT count(*) INTO today FROM public.sponsor_registers WHERE country = p_country AND seen_on = p_seen;
  IF today < p_min THEN
    RETURN format('%s: kept old data, only %s organisations today (minimum %s)', p_country, today, p_min);
  END IF;
  DELETE FROM public.sponsor_registers WHERE country = p_country AND seen_on < p_seen;
  GET DIAGNOSTICS removed = ROW_COUNT;
  INSERT INTO public.data_imports (source, imported_at, rows, file_url)
  VALUES ('sponsors_' || lower(p_country), now(), today, p_url)
  ON CONFLICT (source) DO UPDATE SET imported_at = now(), rows = excluded.rows, file_url = excluded.file_url;
  RETURN format('%s: %s organisations, %s removed', p_country, today, removed);
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_registers_finish(text, date, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsor_registers_finish(text, date, text, integer) TO service_role;

-- Public: every official sponsor record for a company (UK + others). [] when none.
CREATE OR REPLACE FUNCTION public.sponsor_proof_for_publisher(p_publisher uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (SELECT public.normalize_org(name) AS k FROM public.program_publishers WHERE id = p_publisher)
  SELECT coalesce(jsonb_agg(r ORDER BY r->>'country'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'country', 'GB', 'name', u.name, 'city', u.city,
      'detail', jsonb_build_object('routes', to_jsonb(u.routes), 'rating', u.rating),
      'source_url', 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
      'checked', (SELECT imported_at FROM public.data_imports WHERE source = 'uk_sponsors')
    ) AS r
    FROM p JOIN public.uk_sponsors u ON u.name_key = p.k
    UNION ALL
    SELECT jsonb_build_object(
      'country', s.country, 'name', s.name, 'city', s.city, 'detail', s.detail,
      'source_url', CASE s.country
        WHEN 'NL' THEN 'https://ind.nl/en/public-register-recognised-sponsors'
        WHEN 'US' THEN 'https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub'
        ELSE '' END,
      'checked', (SELECT imported_at FROM public.data_imports WHERE source = 'sponsors_' || lower(s.country))
    )
    FROM p JOIN public.sponsor_registers s ON s.name_key = p.k
  ) x;
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_proof_for_publisher(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Diaspora: members with this nationality who tracked an application here
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diaspora_count(p_publisher uuid, p_country text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN n >= 3 THEN n END FROM (
    SELECT count(DISTINCT a.user_id)::int AS n
    FROM public.application_reports a
    JOIN public.profiles pr ON pr.id = a.user_id
    JOIN public.countries c ON c.id = pr.nationality_country_id
    WHERE a.publisher_id = p_publisher AND upper(c.iso_code) = upper(p_country)
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.diaspora_count(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reels: this week's trending sounds (Admin → Social media → Reels), one suggested per reel
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_program ADD COLUMN IF NOT EXISTS trending_sounds text[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
