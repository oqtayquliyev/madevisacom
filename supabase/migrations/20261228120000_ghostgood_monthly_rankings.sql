/*
  GhostGood monthly company rankings ("Who's getting hiring right?").  Method version: gg-1.

  WHAT IS COUNTED (user-reported experiences, never "all applicants")
  - Month: a calendar month in UTC, [1st 00:00 UTC, 1st of next month 00:00 UTC).
  - Company identity: publishers that belong to the same organisation (program_publishers.organization_id)
    count as one company; otherwise each verified publisher is one company. Unverified publishers are left out.
  - One voice per person per company per month — their latest report that month. Repeat reports by the
    same person never add weight (duplicates, spam bursts).
  - Shared reports (/ghostgood): only reports a moderator approved (status 'approved'), dated by when they
    were submitted (created_at). Offer / interview / reply = positive, rejection = neutral (they did reply),
    "no response" = negative (the person explicitly reported being ignored). Verified email = weight 1,
    unverified = 0.5.
  - Applications tracked on MadeVisa: dated by applied_at. Offer / interview / reply / viewed = positive,
    rejection = neutral. No update yet ('applied', 'no_response…') = UNANSWERED: shown as a count but never
    scored as negative, because nobody reported it as an experience. Clicks, withdrawn and excluded ones are
    ignored. If the same person also shared a report that month, the shared report wins.
  - Jobs published that month: the company's jobs first released that month, a repeated title in the same
    country counted once (cross-posts). Shown next to the score as context and as "reports per 100 jobs".
    MadeVisa does not know how many people applied to each job, so this is NOT a probability of being
    ghosted, and jobs never enter the score — a company is not rewarded or penalised for posting more.

  SCORE (0–100, shown as stars = score / 20)
  - Points: positive 100, neutral 50, negative 0.
  - Confidence-adjusted (Bayesian average): score = (C × μ + Σ weight × points) / (C + Σ weight),
    with C = 10 and μ = the month's average over every scored voice (50 if the month has none).
    A company with few reports stays close to the average; only many consistent reports move it far.
  - Eligible for any ranking or public numbers: at least 5 scored voices from 5 different people
    (one voice per person). Below that: "Not enough data" and no per-company numbers are published.
  - Best: eligible and at or above μ, highest score first. Needs improvement: eligible and below μ,
    lowest first. Most reviewed: eligible, most scored voices first. Ties: more voices first, then name.

  SNAPSHOTS (past months never change silently)
  - On the 3rd of each month (01:30 UTC) the previous month is computed and stored in
    ghostgood_month_rankings. Past months are always read from the stored snapshot. The current month is
    computed live and marked "so far".
  - Reports approved, edited or removed after the snapshot do not change it. An admin can recompute a
    month on purpose (ghostgood_snapshot(month, true)); computed_at shows when a snapshot was made.
*/

CREATE TABLE IF NOT EXISTS public.ghostgood_month_rankings (
  month date NOT NULL,
  company_key uuid NOT NULL,
  publisher_id uuid NOT NULL,
  name text NOT NULL,
  logo_url text,
  country_code text,
  voices int NOT NULL,
  people int NOT NULL,
  positive int NOT NULL,
  neutral int NOT NULL,
  negative int NOT NULL,
  unanswered int NOT NULL,
  jobs int NOT NULL,
  score numeric(5,1),
  prior_mean numeric(5,1) NOT NULL,
  eligible boolean NOT NULL,
  method text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, company_key)
);
CREATE INDEX IF NOT EXISTS ghostgood_month_rankings_rank_idx ON public.ghostgood_month_rankings (month, eligible, score);
ALTER TABLE public.ghostgood_month_rankings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ghostgood_month_rankings FROM anon, authenticated;

-- Indexes for the month windows.
CREATE INDEX IF NOT EXISTS company_experience_reports_month_idx ON public.company_experience_reports (created_at) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS application_reports_applied_idx ON public.application_reports (applied_at) WHERE NOT excluded;

/* Every company with at least one voice in the month, with its counts and score (not filtered for eligibility). */
CREATE OR REPLACE FUNCTION public.ghostgood_compute(p_month date)
RETURNS SETOF public.ghostgood_month_rankings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month::timestamp)::date AS m,
      date_trunc('month', p_month::timestamp) AT TIME ZONE 'UTC' AS t0,
      (date_trunc('month', p_month::timestamp) + interval '1 month') AT TIME ZONE 'UTC' AS t1
  ),
  pub AS (
    SELECT p.id, coalesce(p.organization_id, p.id) AS ckey FROM public.program_publishers p
  ),
  shared AS (
    SELECT DISTINCT ON (r.user_id, pb.ckey) r.user_id, pb.ckey,
      CASE WHEN r.outcome IN ('offer', 'interview', 'responded') THEN 'positive' WHEN r.outcome = 'rejected' THEN 'neutral' ELSE 'negative' END AS cat,
      CASE WHEN r.email_verified THEN 1.0 ELSE 0.5 END::numeric AS w, 1 AS pri
    FROM public.company_experience_reports r
    JOIN pub pb ON pb.id = r.publisher_id
    CROSS JOIN b
    WHERE r.status = 'approved' AND r.user_id IS NOT NULL AND r.created_at >= b.t0 AND r.created_at < b.t1
    ORDER BY r.user_id, pb.ckey, r.created_at DESC, r.id DESC
  ),
  tracked AS (
    SELECT DISTINCT ON (a.user_id, pb.ckey) a.user_id, pb.ckey,
      CASE WHEN a.status IN ('offer', 'interview', 'responded', 'viewed') THEN 'positive' WHEN a.status = 'rejected' THEN 'neutral' ELSE 'unanswered' END AS cat,
      1.0::numeric AS w, 2 AS pri
    FROM public.application_reports a
    JOIN pub pb ON pb.id = a.publisher_id
    CROSS JOIN b
    WHERE NOT a.excluded AND a.user_id IS NOT NULL AND a.status NOT IN ('clicked', 'withdrawn')
      AND a.applied_at >= b.t0 AND a.applied_at < b.t1
    ORDER BY a.user_id, pb.ckey, a.applied_at DESC, a.id DESC
  ),
  voices AS (
    SELECT DISTINCT ON (user_id, ckey) user_id, ckey, cat, w,
      CASE cat WHEN 'positive' THEN 100 WHEN 'neutral' THEN 50 WHEN 'negative' THEN 0 END::numeric AS p
    FROM (SELECT * FROM shared UNION ALL SELECT * FROM tracked) u
    ORDER BY user_id, ckey, pri
  ),
  prior AS (
    SELECT coalesce(round(sum(w * p) FILTER (WHERE p IS NOT NULL) / nullif(sum(w) FILTER (WHERE p IS NOT NULL), 0), 1), 50.0) AS mu FROM voices
  ),
  agg AS (
    SELECT ckey,
      count(*) FILTER (WHERE p IS NOT NULL)::int AS voices,
      count(DISTINCT user_id) FILTER (WHERE p IS NOT NULL)::int AS people,
      count(*) FILTER (WHERE cat = 'positive')::int AS pos,
      count(*) FILTER (WHERE cat = 'neutral')::int AS neu,
      count(*) FILTER (WHERE cat = 'negative')::int AS neg,
      count(*) FILTER (WHERE cat = 'unanswered')::int AS una,
      sum(w * p) FILTER (WHERE p IS NOT NULL) AS sp,
      sum(w) FILTER (WHERE p IS NOT NULL) AS sw
    FROM voices GROUP BY ckey
  ),
  jobs AS (
    SELECT pb.ckey, count(DISTINCT (lower(btrim(s.title)), s.country_id))::int AS jobs
    FROM public.sponsored_jobs s
    JOIN pub pb ON pb.id = s.publisher_id
    CROSS JOIN b
    WHERE s.status IN ('published', 'expired')
      AND coalesce(s.released_at, s.approved_at, s.created_at) >= b.t0 AND coalesce(s.released_at, s.approved_at, s.created_at) < b.t1
    GROUP BY pb.ckey
  ),
  names AS (
    SELECT DISTINCT ON (pb.ckey) pb.ckey, p.id AS publisher_id, coalesce(o.name, p.name) AS name,
      coalesce(o.logo_url, p.logo_url) AS logo_url, c.iso_code
    FROM public.program_publishers p
    JOIN pub pb ON pb.id = p.id
    LEFT JOIN public.organizations o ON o.id = p.organization_id
    LEFT JOIN public.countries c ON c.id = coalesce(o.country_id, p.country_id)
    WHERE p.verification_status = 'verified'
    ORDER BY pb.ckey, (p.logo_url IS NULL), p.created_at, p.id
  )
  SELECT b.m, a.ckey, n.publisher_id, n.name, n.logo_url, n.iso_code,
    a.voices, a.people, a.pos, a.neu, a.neg, a.una, coalesce(j.jobs, 0),
    CASE WHEN a.sw > 0 THEN round((10 * pr.mu + a.sp) / (10 + a.sw), 1) END,
    pr.mu, (a.voices >= 5 AND a.people >= 5), 'gg-1', now()
  FROM agg a
  JOIN names n ON n.ckey = a.ckey
  LEFT JOIN jobs j ON j.ckey = a.ckey
  CROSS JOIN prior pr
  CROSS JOIN b;
$$;
REVOKE ALL ON FUNCTION public.ghostgood_compute(date) FROM PUBLIC, anon, authenticated;

/* Store a finished month. Never overwrites an existing snapshot unless p_force (admin correction). */
CREATE OR REPLACE FUNCTION public.ghostgood_snapshot(p_month date, p_force boolean DEFAULT false)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m date := date_trunc('month', p_month::timestamp)::date;
  n int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF m >= date_trunc('month', now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Only finished months can be stored (got %)', m;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ghostgood_month_rankings WHERE month = m) THEN
    IF NOT p_force THEN RETURN 0; END IF;
    DELETE FROM public.ghostgood_month_rankings WHERE month = m;
  END IF;
  INSERT INTO public.ghostgood_month_rankings SELECT * FROM public.ghostgood_compute(m);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.ghostgood_snapshot(date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ghostgood_snapshot(date, boolean) TO authenticated;

/* Public read: one month (default: this month so far), optionally one country (ISO code). */
CREATE OR REPLACE FUNCTION public.ghostgood_rankings(p_month date DEFAULT NULL, p_country text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  this_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  m date := least(date_trunc('month', coalesce(p_month, this_month)::timestamp)::date, this_month);
  is_final boolean;
  cc text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  out jsonb;
BEGIN
  is_final := m < this_month AND EXISTS (SELECT 1 FROM public.ghostgood_month_rankings WHERE month = m);
  WITH src AS (
    SELECT * FROM public.ghostgood_month_rankings WHERE is_final AND month = m
    UNION ALL
    SELECT * FROM public.ghostgood_compute(m) WHERE NOT is_final
  ),
  el AS (
    SELECT *, jsonb_build_object(
      'publisher_id', publisher_id, 'name', name, 'logo_url', logo_url, 'country_code', country_code,
      'score', score, 'stars', round(score / 20, 1), 'voices', voices,
      'positive', positive, 'neutral', neutral, 'negative', negative, 'unanswered', unanswered,
      'jobs', jobs, 'per100', CASE WHEN jobs > 0 THEN round(100.0 * voices / jobs, 1) END) AS j
    FROM src WHERE eligible AND (cc IS NULL OR country_code = cc)
  )
  SELECT jsonb_build_object(
    'month', m,
    'final', is_final,
    'method', 'gg-1',
    'computed_at', (SELECT max(computed_at) FROM src),
    'prior_mean', coalesce((SELECT max(prior_mean) FROM src), 50),
    'companies_ranked', (SELECT count(*) FROM el),
    'companies_with_reports', (SELECT count(*) FROM src WHERE cc IS NULL OR country_code = cc),
    'voices', (SELECT coalesce(sum(voices), 0) FROM src WHERE cc IS NULL OR country_code = cc),
    'countries', coalesce((SELECT jsonb_agg(DISTINCT country_code) FROM src WHERE eligible AND country_code IS NOT NULL), '[]'::jsonb),
    'best', coalesce((SELECT jsonb_agg(j ORDER BY score DESC, voices DESC, name) FROM (SELECT * FROM el WHERE score >= prior_mean ORDER BY score DESC, voices DESC, name LIMIT 10) x), '[]'::jsonb),
    'worst', coalesce((SELECT jsonb_agg(j ORDER BY score, voices DESC, name) FROM (SELECT * FROM el WHERE score < prior_mean ORDER BY score, voices DESC, name LIMIT 10) x), '[]'::jsonb),
    'most', coalesce((SELECT jsonb_agg(j ORDER BY voices DESC, score DESC, name) FROM (SELECT * FROM el ORDER BY voices DESC, score DESC, name LIMIT 10) x), '[]'::jsonb),
    'months', (SELECT jsonb_agg(x ORDER BY x DESC) FROM (SELECT DISTINCT month AS x FROM public.ghostgood_month_rankings UNION SELECT this_month) mm)
  ) INTO out;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.ghostgood_rankings(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ghostgood_rankings(date, text) TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('madevisa-ghostgood-snapshot');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('madevisa-ghostgood-snapshot', '30 1 3 * *',
      $c$select public.ghostgood_snapshot((date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date)$c$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
