/*
Fair "applicant experience" score for shared and tracked applications.

Why: "no response" and "rejected" are always the most common answers —
people who got an interview or an offer rarely come back to report it.
Counting every report the same would make almost every company look bad.

How each report counts (weight = how much it moves the score):
  outcome     points  weight
  offer         100    ×3.0   rare and under-reported, so it counts more
  interview      90    ×2.0
  replied        70    ×1.2
  rejected       45    ×1.0   a clear "no" is still a reply
  no response     0    ×1.0
  × trust:  email-verified 1.0 · not verified 0.5 · tracked on a MadeVisa listing 1.2
  × fit (negative outcomes only): 0.4 + 0.6 × match%  (someone who matched 30%
    and heard nothing says less about the company than someone who matched 90%);
    no match given → 0.8

  score = (Σ weight × points + 5 × 50) / (Σ weight + 5)
  The "+5 × 50" pulls small samples toward a neutral 50, so 2–3 reports
  can't produce an extreme score. Shown only once 3 different people shared.

Also:
  - People without a confirmed email can share again (you review everything);
    they count half as much and are marked in the admin panel.
  - New: match_pct ("How well did you match the requirements?"),
    email_verified, form_ms (seconds spent on the form; very fast = likely a bot).

Run after 20261022090000_hiring_feedback_overview.sql.
*/

ALTER TABLE public.company_experience_reports
  ADD COLUMN IF NOT EXISTS match_pct smallint CHECK (match_pct IS NULL OR match_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_ms int;

-- Points and weight for one report (used by the summaries below).
CREATE OR REPLACE FUNCTION public.experience_points(outcome text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE outcome WHEN 'offer' THEN 100 WHEN 'interview' THEN 90 WHEN 'responded' THEN 70 WHEN 'rejected' THEN 45 ELSE 0 END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.experience_weight(outcome text, trust numeric, match_pct int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE outcome WHEN 'offer' THEN 3.0 WHEN 'interview' THEN 2.0 WHEN 'responded' THEN 1.2 ELSE 1.0 END)
    * trust
    * (CASE WHEN outcome IN ('no_response', 'rejected')
         THEN CASE WHEN match_pct IS NULL THEN 0.8 ELSE 0.4 + 0.6 * match_pct / 100.0 END
         ELSE 1.0 END);
$$;

-- Sharing: sign-in required; email confirmation no longer required.
CREATE OR REPLACE FUNCTION public.guard_company_experience_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent int;
  same_company_recent int;
  same_company_total int;
  key text;
  verified boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to share your experience';
  END IF;
  NEW.user_id := auth.uid();
  NEW.status := 'pending';
  NEW.admin_note := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  NEW.company_name := btrim(regexp_replace(NEW.company_name, '\s+', ' ', 'g'));

  SELECT email_verified_at IS NOT NULL INTO verified FROM public.profiles WHERE id = auth.uid();
  NEW.email_verified := coalesce(verified, false);

  IF NEW.form_ms IS NOT NULL AND NEW.form_ms < 2500 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'That was very fast — please check your answers and try again.';
  END IF;

  IF NEW.applied_on > current_date OR NEW.applied_on < current_date - 730 THEN
    RAISE EXCEPTION 'Choose when you applied (within the last 2 years)';
  END IF;
  IF NEW.outcome = 'no_response' THEN
    NEW.reply_days := NULL;
    IF NEW.applied_on > current_date - 7 THEN
      RAISE EXCEPTION 'You can report "no response" once a week has passed since applying';
    END IF;
  END IF;

  SELECT count(*) INTO recent FROM public.company_experience_reports
    WHERE user_id = auth.uid() AND created_at > now() - interval '24 hours';
  IF NOT public.is_admin() AND recent >= (CASE WHEN NEW.email_verified THEN 3 ELSE 2 END) THEN
    RAISE EXCEPTION 'You can share up to % experiences a day. Thank you — please come back tomorrow.', CASE WHEN NEW.email_verified THEN 3 ELSE 2 END;
  END IF;

  key := lower(regexp_replace(NEW.company_name, '[^[:alnum:]]+', '', 'g'));
  SELECT count(*) FILTER (WHERE created_at > now() - interval '30 days'), count(*)
    INTO same_company_recent, same_company_total
    FROM public.company_experience_reports
    WHERE user_id = auth.uid()
      AND status <> 'rejected'
      AND (
        (NEW.publisher_id IS NOT NULL AND publisher_id = NEW.publisher_id)
        OR lower(regexp_replace(company_name, '[^[:alnum:]]+', '', 'g')) = key
      );
  IF same_company_recent > 0 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You already shared an experience with this company in the last 30 days.';
  END IF;
  IF same_company_total >= 3 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You have already shared 3 experiences with this company.';
  END IF;
  RETURN NEW;
END;
$$;

-- One company: counts + fair score (one voice per person, latest report).
CREATE OR REPLACE FUNCTION public.company_experience_summary(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (user_id) user_id, outcome, reply_days, applied_on, match_pct, email_verified
    FROM public.company_experience_reports
    WHERE publisher_id = pid AND status = 'approved'
    ORDER BY user_id, applied_on DESC, created_at DESC
  ),
  w AS (
    SELECT *, public.experience_weight(outcome, CASE WHEN email_verified THEN 1.0 ELSE 0.5 END, match_pct) AS wt
    FROM latest
  ),
  agg AS (
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE outcome = 'no_response')::int AS no_response,
      count(*) FILTER (WHERE outcome = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE outcome = 'responded')::int AS responded,
      count(*) FILTER (WHERE outcome = 'interview')::int AS interview,
      count(*) FILTER (WHERE outcome = 'offer')::int AS offer,
      round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL)::numeric, 1) AS avg_reply_days,
      round(avg(match_pct) FILTER (WHERE match_pct IS NOT NULL))::int AS avg_match,
      count(*) FILTER (WHERE email_verified)::int AS verified,
      max(applied_on) AS last_applied,
      round((sum(wt * public.experience_points(outcome)) + 250) / (sum(wt) + 5))::int AS score
    FROM w
  )
  SELECT CASE WHEN agg.n >= 3 THEN jsonb_build_object(
      'total', agg.n, 'reporters', agg.n, 'hidden', false,
      'no_response', agg.no_response, 'rejected', agg.rejected, 'responded', agg.responded,
      'interview', agg.interview, 'offer', agg.offer,
      'avg_reply_days', agg.avg_reply_days, 'avg_match', agg.avg_match, 'verified', agg.verified,
      'score', agg.score, 'last_applied', agg.last_applied)
    ELSE jsonb_build_object(
      'total', agg.n, 'reporters', agg.n, 'hidden', true,
      'no_response', 0, 'rejected', 0, 'responded', 0, 'interview', 0, 'offer', 0,
      'avg_reply_days', NULL, 'avg_match', NULL, 'verified', NULL, 'score', NULL, 'last_applied', NULL)
    END
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.company_experience_summary(uuid) TO anon, authenticated;

-- All companies (/feedback): same weighting; tracked MadeVisa applications count ×1.2.
CREATE OR REPLACE FUNCTION public.hiring_feedback_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shared AS (
    SELECT DISTINCT ON (user_id, publisher_id)
      user_id, publisher_id, outcome, reply_days::numeric AS reply_days, created_at AS at, 'shared'::text AS src,
      CASE WHEN email_verified THEN 1.0 ELSE 0.5 END AS trust, match_pct::int AS match_pct
    FROM public.company_experience_reports
    WHERE status = 'approved' AND publisher_id IS NOT NULL
    ORDER BY user_id, publisher_id, applied_on DESC, created_at DESC
  ),
  tracked AS (
    SELECT user_id, publisher_id,
      CASE status
        WHEN 'viewed' THEN 'responded'
        WHEN 'responded' THEN 'responded'
        WHEN 'interview' THEN 'interview'
        WHEN 'offer' THEN 'offer'
        WHEN 'rejected' THEN 'rejected'
        ELSE 'no_response'
      END AS outcome,
      CASE WHEN responded_at IS NOT NULL THEN EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0 END AS reply_days,
      updated_at AS at, 'tracked'::text AS src, 1.2::numeric AS trust, NULL::int AS match_pct
    FROM public.application_reports
    WHERE NOT excluded AND status IN ('viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response', 'no_response_week')
  ),
  allr AS (
    SELECT *, public.experience_weight(outcome, trust, match_pct) AS wt FROM (SELECT * FROM shared UNION ALL SELECT * FROM tracked) u
  ),
  tot AS (
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE src = 'shared')::int AS shared_n,
      count(*) FILTER (WHERE src = 'tracked')::int AS tracked_n,
      count(DISTINCT publisher_id)::int AS companies,
      count(DISTINCT user_id)::int AS people,
      count(*) FILTER (WHERE outcome = 'no_response')::int AS no_response,
      count(*) FILTER (WHERE outcome = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE outcome = 'responded')::int AS responded,
      count(*) FILTER (WHERE outcome = 'interview')::int AS interview,
      count(*) FILTER (WHERE outcome = 'offer')::int AS offer,
      round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL AND reply_days >= 0)::numeric, 1) AS avg_reply_days,
      count(*) FILTER (WHERE at > now() - interval '7 days')::int AS last_7d,
      round((sum(wt * public.experience_points(outcome)) + 250) / (sum(wt) + 5))::int AS score
    FROM allr
  ),
  per AS (
    SELECT a.publisher_id, count(*)::int AS n,
      round(100.0 * count(*) FILTER (WHERE a.outcome <> 'no_response') / count(*))::int AS heard_pct,
      round(100.0 * count(*) FILTER (WHERE a.outcome = 'no_response') / count(*))::int AS silent_pct,
      round((sum(a.wt * public.experience_points(a.outcome)) + 250) / (sum(a.wt) + 5))::int AS score,
      round(avg(a.reply_days) FILTER (WHERE a.reply_days IS NOT NULL AND a.reply_days >= 0)::numeric, 1) AS avg_reply_days
    FROM allr a
    GROUP BY a.publisher_id
    HAVING count(DISTINCT a.user_id) >= 3
  ),
  named AS (
    SELECT per.*, p.name, p.logo_url
    FROM per JOIN public.program_publishers p ON p.id = per.publisher_id
    WHERE p.verification_status = 'verified'
  )
  SELECT jsonb_build_object(
    'total', tot.n, 'shared', tot.shared_n, 'tracked', tot.tracked_n,
    'companies', tot.companies, 'people', tot.people, 'last_7d', tot.last_7d,
    'no_response', tot.no_response, 'rejected', tot.rejected, 'responded', tot.responded,
    'interview', tot.interview, 'offer', tot.offer,
    'avg_reply_days', tot.avg_reply_days, 'score', tot.score,
    'most_responsive', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', publisher_id, 'name', name, 'logo_url', logo_url, 'n', n, 'pct', heard_pct, 'score', score, 'avg_reply_days', avg_reply_days) ORDER BY score DESC, n DESC)
      FROM (SELECT * FROM named WHERE score >= 55 ORDER BY score DESC, n DESC LIMIT 5) x
    ), '[]'::jsonb),
    'most_silent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', publisher_id, 'name', name, 'logo_url', logo_url, 'n', n, 'pct', silent_pct, 'score', score) ORDER BY silent_pct DESC, n DESC)
      FROM (SELECT * FROM named WHERE silent_pct > 50 AND score < 55 ORDER BY silent_pct DESC, n DESC LIMIT 5) x
    ), '[]'::jsonb)
  )
  FROM tot;
$$;

GRANT EXECUTE ON FUNCTION public.hiring_feedback_overview() TO anon, authenticated;
