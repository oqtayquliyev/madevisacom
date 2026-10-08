/*
# Auto Apply: "You applied to X at Y" — one email per submitted application
Run AFTER 20261207090000_apply_original_cv.sql. Safe to run more than once.

The moment MadeVisa submits an application (the employer's site or mail
service confirmed it), the person gets:
  • a bell notification: "You applied: Product Designer at Scotch & Soda"
  • an email: "Hey Oqtay, you applied for Product Designer at Scotch & Soda"
    with when, the email address used, the confirmation number, and a link
    to the receipt.
Sent through Resend with the key in app_secrets ('resend_api_key',
'email_from'), once per application (an idempotency key), never for one the
person marked as submitted themselves.

The end-of-batch summary is now sent only when something needs the person.

Switch the per-application emails off (the bell stays):
  update public.apply_settings set notify_each = false;
*/

SET lock_timeout = '5s';

ALTER TABLE public.apply_settings ADD COLUMN IF NOT EXISTS notify_each boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.apply_html(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'); $$;

/* Tell the person one application went out. */
CREATE OR REPLACE FUNCTION public.apply_notify_submitted(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  key text;
  sender text;
  to_email text;
  first text;
  conf text;
  at_text text;
  subject text;
  text_body text;
  html_body text;
  link text := 'https://madevisa.com/cv-match#applications';
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = p_id;
  IF NOT FOUND OR a.status <> 'submitted' OR NOT a.verified THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (a.user_id, 'application_submitted', 'You applied: ' || a.title || ' at ' || a.company,
          concat_ws(' · ', 'Submitted by MadeVisa', CASE WHEN a.email_used IS NOT NULL THEN 'using ' || a.email_used END), '/cv-match#applications');

  IF NOT (SELECT notify_each FROM public.apply_settings) THEN RETURN; END IF;
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';
  to_email := coalesce(nullif(a.email_used, ''), (SELECT email FROM auth.users WHERE id = a.user_id));
  IF coalesce(to_email, '') = '' THEN RETURN; END IF;

  first := nullif(split_part(trim(coalesce(
    (SELECT answers->'first_name'->>'value' FROM public.application_profiles WHERE user_id = a.user_id),
    (SELECT answers->'full_name'->>'value' FROM public.application_profiles WHERE user_id = a.user_id),
    (SELECT full_name FROM public.profiles WHERE id = a.user_id), '')), ' ', 1), '');
  conf := CASE WHEN a.confirmation->>'id' IS NOT NULL AND a.confirmation->>'id' <> a.id::text THEN a.confirmation->>'id' END;
  at_text := to_char(coalesce(a.submitted_at, now()) AT TIME ZONE 'utc', 'DD Mon YYYY, HH24:MI') || ' UTC';
  subject := 'You applied: ' || a.title || ' at ' || a.company;

  text_body := concat_ws(E'\n',
    'Hey ' || coalesce(first, 'there') || ',',
    '',
    'You applied for ' || a.title || ' at ' || a.company || '.',
    '',
    'When: ' || at_text,
    'Email used: ' || coalesce(a.email_used, to_email),
    CASE WHEN conf IS NOT NULL THEN 'Confirmation: ' || conf END,
    CASE WHEN a.cover_letter THEN 'Cover letter: included' END,
    '',
    CASE WHEN a.channel = 'madevisa' THEN a.company || ' received your application by email. Replies come straight to you.'
         ELSE 'MadeVisa submitted it on ' || a.company || '’s careers site. Their confirmation email, and any reply, will come to ' || coalesce(a.email_used, to_email) || '.' END,
    '',
    'See exactly what was sent: ' || link,
    '',
    'Good luck!',
    'MadeVisa');

  html_body := '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">'
    || '<p style="font-size:16px;margin:0 0 16px">Hey ' || apply_html(coalesce(first, 'there')) || ',</p>'
    || '<p style="font-size:20px;font-weight:700;line-height:1.35;margin:0 0 20px">You applied for ' || apply_html(a.title) || ' at ' || apply_html(a.company) || '.</p>'
    || '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px">'
    || '<tr><td style="padding:6px 0;color:#64748b;width:130px">When</td><td style="padding:6px 0">' || apply_html(at_text) || '</td></tr>'
    || '<tr><td style="padding:6px 0;color:#64748b">Email used</td><td style="padding:6px 0">' || apply_html(coalesce(a.email_used, to_email)) || '</td></tr>'
    || CASE WHEN conf IS NOT NULL THEN '<tr><td style="padding:6px 0;color:#64748b">Confirmation</td><td style="padding:6px 0">' || apply_html(conf) || '</td></tr>' ELSE '' END
    || '<tr><td style="padding:6px 0;color:#64748b">Match</td><td style="padding:6px 0">' || a.score || '%</td></tr>'
    || '</table>'
    || '<p style="font-size:14px;line-height:1.55;color:#334155;margin:0 0 24px">'
    || CASE WHEN a.channel = 'madevisa' THEN apply_html(a.company) || ' received your application by email. Replies come straight to you.'
            ELSE 'MadeVisa submitted it on ' || apply_html(a.company) || '’s careers site. Their confirmation email, and any reply, will come to ' || apply_html(coalesce(a.email_used, to_email)) || '.' END
    || '</p>'
    || '<a href="' || link || '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:999px">See what was sent</a>'
    || '<p style="font-size:14px;color:#334155;margin:24px 0 0">Good luck!<br>MadeVisa</p>'
    || '</div>';

  BEGIN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json', 'Idempotency-Key', 'madevisa-applied-' || a.id),
      body := jsonb_build_object('from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'), 'to', jsonb_build_array(to_email), 'subject', subject, 'text', text_body, 'html', html_body),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'apply: submitted email not sent: %', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_notify_submitted(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_submitted_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submitted' AND NEW.verified AND OLD.status IS DISTINCT FROM 'submitted' THEN
    PERFORM public.apply_notify_submitted(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification must never undo a submission.
  RAISE NOTICE 'apply: submitted notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_applications_submitted_notify ON public.job_applications;
CREATE TRIGGER job_applications_submitted_notify
  AFTER UPDATE OF status ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.apply_submitted_trigger();

/* The end-of-batch summary: now only when something needs the person (each submitted one had its own email). */
CREATE OR REPLACE FUNCTION public.apply_queue_settle(p_queue uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.application_queues;
  sent int;
  attention int;
  skipped int;
  key text;
  sender text;
  body text;
BEGIN
  IF p_queue IS NULL THEN RETURN; END IF;
  SELECT * INTO q FROM public.application_queues WHERE id = p_queue;
  IF q.state <> 'running' OR EXISTS (SELECT 1 FROM public.job_applications x WHERE x.queue_id = q.id AND public.apply_pending(x.status)) THEN RETURN; END IF;
  UPDATE public.application_queues SET state = 'done', pause_reason = NULL, finished_at = now(), updated_at = now() WHERE id = q.id AND state = 'running';
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.apply_log(q.user_id, 'auto_apply_completed', NULL, q.id, NULL);

  SELECT count(*) FILTER (WHERE status = 'submitted'),
         count(*) FILTER (WHERE status IN ('needs_attention', 'blocked', 'failed')),
         count(*) FILTER (WHERE status IN ('skipped', 'already_applied', 'expired'))
    INTO sent, attention, skipped
    FROM public.job_applications WHERE queue_id = q.id;
  IF q.notified_at IS NOT NULL OR sent + attention = 0 THEN RETURN; END IF;
  -- Each submitted application already had its own email: a summary only when something needs the person.
  IF attention = 0 AND (SELECT notify_each FROM public.apply_settings) THEN
    UPDATE public.application_queues SET notified_at = now() WHERE id = q.id;
    RETURN;
  END IF;
  UPDATE public.application_queues SET notified_at = now() WHERE id = q.id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (q.user_id, 'auto_apply_done',
          CASE WHEN sent > 0 THEN sent || CASE WHEN sent = 1 THEN ' application submitted' ELSE ' applications submitted' END ELSE 'Your applications need your attention' END,
          concat_ws(' · ', CASE WHEN q.email IS NOT NULL THEN 'Using ' || q.email END, CASE WHEN attention > 0 THEN attention || ' need your attention' END),
          '/cv-match#applications');

  -- An email as well, when the mail service is set up (the same Resend key the job alerts use).
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' OR coalesce(q.email, '') = '' THEN RETURN; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';
  body := concat_ws(E'\n',
    'Your applications are out.',
    '',
    sent || CASE WHEN sent = 1 THEN ' application was' ELSE ' applications were' END || ' submitted on the employers’ career sites using ' || q.email || '.',
    CASE WHEN attention > 0 THEN attention || CASE WHEN attention = 1 THEN ' application needs' ELSE ' applications need' END || ' your attention — for example an employer that asks you to sign in.' END,
    CASE WHEN skipped > 0 THEN skipped || ' skipped (already applied, or no longer open).' END,
    '',
    'Employers reply to ' || q.email || ' directly. Confirmation emails from them will arrive there too.',
    '',
    'See every application, with the CV and answers used: https://madevisa.com/cv-match#applications');
  BEGIN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json', 'Idempotency-Key', 'madevisa-batch-' || q.id),
      body := jsonb_build_object(
        'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
        'to', jsonb_build_array(q.email),
        'subject', CASE WHEN sent > 0 THEN sent || CASE WHEN sent = 1 THEN ' application submitted' ELSE ' applications submitted' END || ' — MadeVisa' ELSE 'Your MadeVisa applications need your attention' END,
        'text', body
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'apply: completion email not sent: %', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_queue_settle(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
