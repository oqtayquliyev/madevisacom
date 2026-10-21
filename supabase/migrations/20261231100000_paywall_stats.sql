/*
# Paywall statistics: how often the membership popup opens, and how often "Subscribe now" is pressed

Run AFTER 20261231090000_single_membership_guest_checkout.sql. Safe to run more than once.

  paywall_events          one row per popup shown / button pressed. No names or emails:
                          a random id kept in the visitor's browser (to count people, not
                          only views), the screen it was on (job page, jobs list, landing,
                          CV match) and the time. Written only through paywall_track(),
                          at most 300 a day per visitor. Kept 180 days.
  paywall_track(...)      called by the site (anyone, signed in or not).
  admin_paywall_stats(n)  Admin → Paywall: per day for the last n days — popups opened,
                          people who saw it, "Subscribe now" presses, people who pressed it,
                          and new paying members (Gumroad) — plus totals per screen.
*/

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.paywall_events (
  id bigserial PRIMARY KEY,
  visitor text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shown', 'click')),
  source text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paywall_events_created_idx ON public.paywall_events (created_at DESC);
CREATE INDEX IF NOT EXISTS paywall_events_visitor_idx ON public.paywall_events (visitor, created_at);
ALTER TABLE public.paywall_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paywall_events FROM anon, authenticated;
DROP POLICY IF EXISTS "paywall_events admin read" ON public.paywall_events;
CREATE POLICY "paywall_events admin read" ON public.paywall_events FOR SELECT USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.paywall_track(p_visitor text, p_kind text, p_source text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_visitor IS NULL OR length(p_visitor) NOT BETWEEN 8 AND 64 OR p_kind NOT IN ('shown', 'click') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.paywall_events WHERE visitor = p_visitor AND created_at > now() - interval '1 day') >= 300 THEN RETURN; END IF;
  INSERT INTO public.paywall_events (visitor, kind, source, user_id)
  VALUES (p_visitor, p_kind, CASE WHEN p_source ~ '^[a-z0-9_]{1,40}$' THEN p_source ELSE 'other' END, auth.uid());
  -- Keep 180 days (a cheap delete now and then).
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
        'paid', coalesce(g.paid, 0)
      ) ORDER BY d.day DESC)
      FROM generate_series(v_since, (now() AT TIME ZONE 'UTC')::date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
               count(*) FILTER (WHERE kind = 'shown') AS shown,
               count(DISTINCT visitor) FILTER (WHERE kind = 'shown') AS people,
               count(*) FILTER (WHERE kind = 'click') AS clicks,
               count(DISTINCT visitor) FILTER (WHERE kind = 'click') AS clickers
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

NOTIFY pgrst, 'reload schema';
