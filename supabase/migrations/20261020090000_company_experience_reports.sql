/*
"Share your application experience" — for applications made outside
MadeVisa (a company's own careers site, LinkedIn, a job board, a referral).

A signed-in user names the company and says what happened: no response,
rejected, a reply, an interview or an offer. Every report goes to the admin
panel first. The admin links it to an existing company (catching the same
company under a different name), creates the company if it is real and
missing, or rejects it. Only approved reports count.

Approved reports are shown on the company page as their own block,
separate from applications tracked on MadeVisa listings (those carry
stronger proof), via company_experience_summary(pid).
*/

CREATE TABLE IF NOT EXISTS public.company_experience_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_website text,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  role_title text,
  applied_on date NOT NULL,
  channel text NOT NULL DEFAULT 'company_site'
    CHECK (channel IN ('company_site', 'linkedin', 'job_board', 'referral', 'recruiter', 'other')),
  outcome text NOT NULL
    CHECK (outcome IN ('no_response', 'rejected', 'responded', 'interview', 'offer')),
  reply_days int CHECK (reply_days IS NULL OR reply_days BETWEEN 0 AND 365),
  publisher_id uuid REFERENCES public.program_publishers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_experience_reports_limits CHECK (
    length(btrim(company_name)) BETWEEN 2 AND 120
    AND (company_website IS NULL OR length(company_website) <= 200)
    AND (role_title IS NULL OR length(role_title) <= 120)
    AND (admin_note IS NULL OR length(admin_note) <= 500)
  )
);

CREATE INDEX IF NOT EXISTS company_experience_reports_status_idx ON public.company_experience_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS company_experience_reports_publisher_idx ON public.company_experience_reports (publisher_id) WHERE status = 'approved';

ALTER TABLE public.company_experience_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cer_insert_own" ON public.company_experience_reports;
CREATE POLICY "cer_insert_own" ON public.company_experience_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cer_select_own_or_admin" ON public.company_experience_reports;
CREATE POLICY "cer_select_own_or_admin" ON public.company_experience_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "cer_delete_own_pending_or_admin" ON public.company_experience_reports;
CREATE POLICY "cer_delete_own_pending_or_admin" ON public.company_experience_reports FOR DELETE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR public.is_admin());

DROP POLICY IF EXISTS "cer_update_admin" ON public.company_experience_reports;
CREATE POLICY "cer_update_admin" ON public.company_experience_reports FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- New reports always start as pending, from the signed-in user, with sane dates
-- and a daily limit so the queue can't be flooded.
CREATE OR REPLACE FUNCTION public.guard_company_experience_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent int;
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
  IF recent >= 10 THEN
    RAISE EXCEPTION 'You can share up to 10 experiences a day. Please try again tomorrow.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_experience_reports_guard ON public.company_experience_reports;
CREATE TRIGGER company_experience_reports_guard
  BEFORE INSERT ON public.company_experience_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_experience_report();

-- Admin review: approve (linking to an existing company, or creating it), or reject.
CREATE OR REPLACE FUNCTION public.review_company_experience(
  p_id uuid,
  p_action text,
  p_publisher uuid DEFAULT NULL,
  p_new_name text DEFAULT NULL,
  p_new_website text DEFAULT NULL,
  p_new_country uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid := p_publisher;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_action = 'reject' THEN
    UPDATE public.company_experience_reports
      SET status = 'rejected', admin_note = left(p_note, 500), reviewed_at = now(), reviewed_by = auth.uid()
      WHERE id = p_id;
    RETURN NULL;
  END IF;
  IF p_action = 'pending' THEN
    UPDATE public.company_experience_reports
      SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL
      WHERE id = p_id;
    RETURN NULL;
  END IF;
  IF p_action <> 'approve' THEN
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;
  IF pid IS NULL THEN
    IF coalesce(btrim(p_new_name), '') = '' THEN
      RAISE EXCEPTION 'Pick an existing company or enter a name to create one';
    END IF;
    INSERT INTO public.program_publishers (org_type, name, website, country_id, verification_status)
      VALUES (
        'company',
        left(btrim(p_new_name), 120),
        CASE
          WHEN coalesce(btrim(p_new_website), '') = '' THEN NULL
          WHEN btrim(p_new_website) ~* '^https?://' THEN btrim(p_new_website)
          ELSE 'https://' || btrim(p_new_website)
        END,
        p_new_country,
        'verified'
      )
      RETURNING id INTO pid;
  END IF;
  UPDATE public.company_experience_reports
    SET status = 'approved', publisher_id = pid, admin_note = left(p_note, 500), reviewed_at = now(), reviewed_by = auth.uid()
    WHERE id = p_id;
  RETURN pid;
END;
$$;

REVOKE ALL ON FUNCTION public.review_company_experience(uuid, text, uuid, text, text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_company_experience(uuid, text, uuid, text, text, uuid, text) TO authenticated;

-- Public: approved reports for one company, as counts only (no one is identifiable).
CREATE OR REPLACE FUNCTION public.company_experience_summary(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'reporters', count(DISTINCT user_id),
    'no_response', count(*) FILTER (WHERE outcome = 'no_response'),
    'rejected', count(*) FILTER (WHERE outcome = 'rejected'),
    'responded', count(*) FILTER (WHERE outcome = 'responded'),
    'interview', count(*) FILTER (WHERE outcome = 'interview'),
    'offer', count(*) FILTER (WHERE outcome = 'offer'),
    'avg_reply_days', round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL)::numeric, 1),
    'last_applied', max(applied_on)
  )
  FROM public.company_experience_reports
  WHERE publisher_id = pid AND status = 'approved';
$$;

GRANT EXECUTE ON FUNCTION public.company_experience_summary(uuid) TO anon, authenticated;
