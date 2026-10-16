/*
  Hiring feedback (/feedback):
  1. Several companies at once: up to 10 reports a day with a verified email (was 3), 5 without (was 2).
     Every report is still reviewed before it counts; the per-company limits are unchanged.
  2. "Your report is live": when a report is approved, the person who shared it gets a notification
     on the site and one email. Sent once per report, never with other people's details.
*/

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
  day_limit int;
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

  day_limit := CASE WHEN NEW.email_verified THEN 10 ELSE 5 END;
  SELECT count(*) INTO recent FROM public.company_experience_reports
    WHERE user_id = auth.uid() AND created_at > now() - interval '24 hours';
  IF NOT public.is_admin() AND recent >= day_limit THEN
    RAISE EXCEPTION 'You can share up to % experiences a day. Thank you — please come back tomorrow.', day_limit;
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

/* Approved → tell the person who shared it (site notification + one email). */
CREATE OR REPLACE FUNCTION public.company_experience_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  to_email text;
  first text;
  company text;
  body text;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  company := coalesce((SELECT name FROM public.program_publishers WHERE id = NEW.publisher_id), NEW.company_name);

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (NEW.user_id, 'feedback_published', 'Your report on ' || company || ' is live',
          'Thanks! It now counts in ' || company || '’s reply rate on MadeVisa.', '/ghostgood');

  to_email := (SELECT email FROM auth.users WHERE id = NEW.user_id);
  IF coalesce(to_email, '') <> '' THEN
    first := nullif(split_part(btrim(coalesce((SELECT full_name FROM public.profiles WHERE id = NEW.user_id), '')), ' ', 1), '');
    body := '<p style="margin:0;font-size:14px;line-height:1.6;color:#475569">Your report now counts in <b style="color:#0f172a">'
      || mv_esc(company) || '</b>’s reply rate. It is only ever shown as part of the total, never with your name or email.</p>'
      || '<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#475569">Applied somewhere else lately? Every report helps the next applicant decide where to spend their time.</p>';
    PERFORM public.mv_send_email(
      to_email, 'Your report on ' || company || ' is live',
      public.mv_email_html('Your report on ' || company || ' now counts in its reply rate.', 'GhostGood',
        'Your report is live', 'Hi ' || mv_esc(coalesce(first, 'there')) || ', thanks for sharing how your application went.',
        body, 'Share another company', 'https://madevisa.com/ghostgood?s=fbpub',
        'You get this because you shared an application experience on MadeVisa.', NULL, public.mv_unsub_url(NEW.user_id, 'all')),
      'Your report on ' || company || ' is live.' || E'\n\n'
        || 'It now counts in ' || company || '''s reply rate on MadeVisa, only as part of the total, never with your name.'
        || E'\n\nShare another company: https://madevisa.com/ghostgood',
      'feedback_published', NEW.user_id, NULL, 'madevisa-fb-live-' || NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a review because of the notice.
  RAISE NOTICE 'company_experience_published: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.company_experience_published() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS company_experience_published ON public.company_experience_reports;
CREATE TRIGGER company_experience_published
  AFTER UPDATE OF status ON public.company_experience_reports
  FOR EACH ROW EXECUTE FUNCTION public.company_experience_published();

NOTIFY pgrst, 'reload schema';
