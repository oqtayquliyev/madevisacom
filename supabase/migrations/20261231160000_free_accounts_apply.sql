/*
# Every job open to every account

Run AFTER 20261231150000_three_month_membership.sql. Safe to run more than once. Deletes nothing.

What changes:
- job_apply_link() now gives the company's apply address to ANY signed-in account
  (free or paid). Signed-out visitors get { locked: true } and the site asks them to
  sign up (a free account) first.
- The one-free-application-per-browser rule is gone (signing up replaces it).
  The table job_free_applies is kept, unused.
- The membership is now: CV match, "Your edge on this job", sponsorship documents,
  more job alerts. Those are checked where they always were (has_feature).
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.job_apply_link(p_job uuid, p_visitor text DEFAULT NULL, p_free boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j record;
  v_uid uuid := auth.uid();
BEGIN
  SELECT s.id, s.status, s.expires_at, s.official_url, s.application_url, s.contact_email, p.owner_id
  INTO j
  FROM public.sponsored_jobs s LEFT JOIN public.program_publishers p ON p.id = s.publisher_id
  WHERE s.id = p_job;
  IF NOT FOUND OR j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at < now()) THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_open');
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'sign_up', 'free_left', 0);
  END IF;

  RETURN jsonb_build_object(
    'url', coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')),
    'contact', j.contact_email,
    'why', CASE WHEN j.owner_id = v_uid THEN 'owner' ELSE 'member' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.job_apply_link(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_apply_link(uuid, text, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
