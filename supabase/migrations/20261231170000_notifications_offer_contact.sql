/*
# Notifications: "Offer" and "Reach the recruiter" after Apply, kept 30 days

Run AFTER 20261231160000_free_accounts_apply.sql. Safe to run more than once. Deletes only
notifications older than 30 days.

1. When someone presses Apply on a job (application_reports row with status 'clicked'),
   instead of "Did you apply to …?" they now get, in the bell:
   - "Offer: your sponsorship document for <job>" — when the job is in another country than
     theirs (or we don't know theirs). The link opens the job with the document preview
     (/jobs/sponsored-<id>?doc=1).
   - "Follow up with the recruiter: as***@mail.com" — when the ad has a recruiter email.
     Members see the full address; everyone else sees it shortened (the full one is in
     the membership).
   Each is sent once per job (pressing Apply again doesn't repeat them).
2. "You applied to …" (after they confirm) stays as it was.
3. Notifications are kept 30 days (was 120): the nightly cleanup deletes older ones,
   and old ones are deleted now.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mv_mask_email(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
              THEN left(split_part(p, '@', 1), 2) || '***@' || split_part(p, '@', 2) END
$$;

CREATE OR REPLACE FUNCTION public.application_report_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company text;
  v_job text := coalesce(nullif(NEW.listing_title, ''), 'this job');
  v_track text := '/profile?track=' || NEW.listing_id;
  v_link text;
  v_job_country uuid;
  v_country_name text;
  v_home uuid;
  v_email text;
  v_member boolean;
BEGIN
  SELECT name INTO v_company FROM public.program_publishers WHERE id = NEW.publisher_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'clicked' THEN
    v_link := '/jobs/sponsored-' || NEW.listing_id;

    BEGIN
      SELECT s.country_id, c.name,
             coalesce(nullif(s.facts #>> '{contact,email}', ''), nullif(nullif(s.contact_email, ''), 'hello@madevisa.com'))
      INTO v_job_country, v_country_name, v_email
      FROM public.sponsored_jobs s LEFT JOIN public.countries c ON c.id = s.country_id
      WHERE s.id::text = NEW.listing_id::text;
    EXCEPTION WHEN OTHERS THEN
      v_job_country := NULL;
    END;
    SELECT coalesce(p.nationality_country_id, p.country_id) INTO v_home FROM public.profiles p WHERE p.id = NEW.user_id;

    -- Offer: a sponsorship document, for a job abroad.
    IF v_home IS NULL OR v_job_country IS NULL OR v_home <> v_job_country THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = NEW.user_id AND n.kind = 'offer_suggest' AND n.link = v_link || '?doc=1') THEN
        INSERT INTO public.notifications (user_id, kind, title, body, link)
        VALUES (NEW.user_id, 'offer_suggest', left('Offer: your sponsorship document for ' || v_job, 200),
                left(coalesce(v_company, 'The employer') || coalesce(' · ' || v_country_name, '')
                     || '. Preview it and send it with your application.', 300),
                v_link || '?doc=1');
      END IF;
    END IF;

    -- Reach the recruiter: who to follow up with.
    IF v_email IS NOT NULL AND public.mv_mask_email(v_email) IS NOT NULL THEN
      v_member := coalesce(public.has_feature(NEW.user_id, 'cv_full_report'), false);
      IF NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = NEW.user_id AND n.kind = 'recruiter_contact' AND n.link = v_link) THEN
        INSERT INTO public.notifications (user_id, kind, title, body, link)
        VALUES (NEW.user_id, 'recruiter_contact',
                left('Follow up with the recruiter: ' || CASE WHEN v_member THEN v_email ELSE public.mv_mask_email(v_email) END, 200),
                left('A short email to ' || coalesce(v_company, 'the employer') || ' after applying gives you a better chance of a reply.'
                     || CASE WHEN v_member THEN '' ELSE ' The full address is in the membership.' END, 300),
                v_link);
      END IF;
    END IF;

  ELSIF (TG_OP = 'INSERT' AND NEW.status = 'applied')
     OR (TG_OP = 'UPDATE' AND OLD.status = 'clicked' AND NEW.status = 'applied') THEN
    DELETE FROM public.notifications
    WHERE notifications.user_id = NEW.user_id AND notifications.kind = 'application_confirm' AND notifications.link = v_track;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.user_id, 'application', left('You applied to ' || v_job, 200),
            coalesce('At ' || v_company || '. ', '') || 'Track it here — we''ll remind you to check back.', v_track);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'application_report_notify: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Keep notifications 30 days: the nightly cleanup (free_plan_cleanup) gets a 30-day rule.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.free_plan_cleanup()'::regprocedure) INTO def;
  IF def IS NOT NULL AND position('(''notifications'', interval ''120 days'')' IN def) > 0 THEN
    EXECUTE replace(def, '(''notifications'', interval ''120 days'')', '(''notifications'', interval ''30 days'')');
  END IF;
EXCEPTION WHEN undefined_function OR invalid_text_representation THEN
  NULL; -- the free-plan migration hasn't run: the delete below and the job further down still apply
END $$;

-- Also a small job of its own, in case the cleanup above isn't installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notifications-30-days';
    PERFORM cron.schedule('notifications-30-days', '17 3 * * *', $c$DELETE FROM public.notifications WHERE created_at < now() - interval '30 days'$c$);
  END IF;
END $$;

DELETE FROM public.notifications WHERE created_at < now() - interval '30 days';

NOTIFY pgrst, 'reload schema';
