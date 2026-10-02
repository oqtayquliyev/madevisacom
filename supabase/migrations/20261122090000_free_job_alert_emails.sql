/*
# Free job-alert emails (signup booster)
Run AFTER 20261121090000_employer_inbox.sql. Safe to run more than once.

Before: job alerts were Pro-only and only lit up the bell inside the site.
Now:    everyone with an account gets 1 free alert, emailed once a day
        (Pro keeps up to 10 alerts). This is the main reason people sign up
        on job sites, and the email brings them back.

Needs Resend (already used for admin emails) — see 20261107090000:
  app_secrets 'resend_api_key' and 'email_from' (e.g. MadeVisa <jobs@madevisa.com>).
  Without a key nothing is sent and nothing breaks.

Safety rules:
- Email only to CONFIRMED addresses.
- At most one email per alert per ~day, max 5 jobs listed.
- One-click unsubscribe link in every email (+ List-Unsubscribe header).
- Budget brake: at most 90 emails per daily run (Resend's free plan is
  3,000/month). Raise ALERT_EMAILS_PER_RUN below when you upgrade.
- Free accounts: 1 alert; Pro: 10. Max 3 new alerts per account per day.
*/

SET lock_timeout = '5s';

-- Country-only alerts ("anything in Germany") are allowed now.
ALTER TABLE public.job_alerts DROP CONSTRAINT IF EXISTS job_alerts_keywords_check;
ALTER TABLE public.job_alerts ADD CONSTRAINT job_alerts_keywords_check CHECK (char_length(keywords) <= 120);

ALTER TABLE public.job_alerts ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.job_alerts ADD COLUMN IF NOT EXISTS unsub_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.job_alerts ADD COLUMN IF NOT EXISTS last_emailed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS job_alerts_unsub_idx ON public.job_alerts (unsub_token);

-- Create an alert (free: 1, Pro: 10). Returns the alert, or raises a friendly error.
CREATE OR REPLACE FUNCTION public.create_job_alert(p_keywords text, p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  kw text := left(btrim(regexp_replace(coalesce(p_keywords, ''), '\s+', ' ', 'g')), 120);
  cc text := nullif(btrim(coalesce(p_country, '')), '');
  n integer;
  cap integer;
  existing public.job_alerts;
  rec public.job_alerts;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  -- Accepts a code ("DE") or a name ("Germany"); anything else = all countries.
  IF cc IS NOT NULL THEN
    SELECT iso_code INTO cc FROM public.countries WHERE iso_code = upper(cc) OR lower(name) = lower(cc) LIMIT 1;
  END IF;
  IF kw = '' AND cc IS NULL THEN RAISE EXCEPTION 'Choose a country or a keyword for your alert.'; END IF;

  -- Same alert again → just switch it (back) on.
  SELECT * INTO existing FROM public.job_alerts
  WHERE user_id = me AND lower(keywords) = lower(kw) AND coalesce(country_code, '') = coalesce(cc, '');
  IF FOUND THEN
    UPDATE public.job_alerts SET active = true, email_enabled = true WHERE id = existing.id RETURNING * INTO rec;
    RETURN jsonb_build_object('id', rec.id, 'keywords', rec.keywords, 'country_code', rec.country_code, 'existing', true);
  END IF;

  SELECT count(*) INTO n FROM public.job_alerts WHERE user_id = me AND created_at > now() - interval '24 hours';
  IF n >= 3 THEN RAISE EXCEPTION 'You can add 3 alerts a day. Try again tomorrow.'; END IF;

  cap := CASE WHEN public.is_pro(me) THEN 10 ELSE 1 END;
  SELECT count(*) INTO n FROM public.job_alerts WHERE user_id = me AND active;
  IF n >= cap THEN
    IF cap = 1 THEN
      -- Free plan: replace the old alert instead of refusing.
      UPDATE public.job_alerts SET active = false WHERE user_id = me AND active;
    ELSE
      RAISE EXCEPTION 'You have % alerts — the maximum. Remove one first.', cap;
    END IF;
  END IF;

  INSERT INTO public.job_alerts (user_id, keywords, country_code, label, last_checked_at)
  VALUES (me, kw, cc, nullif(concat_ws(' · ', nullif(kw, ''), (SELECT name FROM public.countries WHERE iso_code = cc)), ''), now())
  RETURNING * INTO rec;
  RETURN jsonb_build_object('id', rec.id, 'keywords', rec.keywords, 'country_code', rec.country_code, 'existing', false);
END;
$$;
REVOKE ALL ON FUNCTION public.create_job_alert(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_job_alert(text, text) TO authenticated;

-- My active alerts (for the "you're subscribed" state).
CREATE OR REPLACE FUNCTION public.my_job_alerts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'keywords', a.keywords, 'country_code', a.country_code, 'country_name', c.name, 'email', a.email_enabled) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM public.job_alerts a LEFT JOIN public.countries c ON c.iso_code = a.country_code
  WHERE a.user_id = auth.uid() AND a.active;
$$;
GRANT EXECUTE ON FUNCTION public.my_job_alerts() TO authenticated;

-- One-click unsubscribe from the email link (no sign-in needed).
CREATE OR REPLACE FUNCTION public.unsubscribe_job_alert(p_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lbl text;
BEGIN
  UPDATE public.job_alerts SET email_enabled = false, active = false WHERE unsub_token = p_token RETURNING coalesce(label, keywords) INTO lbl;
  RETURN coalesce(lbl, '');
END;
$$;
GRANT EXECUTE ON FUNCTION public.unsubscribe_job_alert(uuid) TO anon, authenticated;

-- The bell: now for everyone with an active alert, not only Pro.
CREATE OR REPLACE FUNCTION public.run_job_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  a record;
  hits integer;
  first_title text;
  total integer := 0;
BEGIN
  FOR a IN SELECT al.* FROM public.job_alerts al WHERE al.active LOOP
    SELECT count(*), (array_agg(s.title ORDER BY s.released_at DESC))[1]
    INTO hits, first_title
    FROM public.sponsored_jobs s
    LEFT JOIN public.countries c ON c.id = s.country_id
    WHERE s.released_at > a.last_checked_at AND s.released_at <= now()
      AND s.status = 'published' AND NOT s.awaiting_release
      AND (a.country_code IS NULL OR c.iso_code = a.country_code)
      AND (a.keywords = '' OR s.title ILIKE '%' || a.keywords || '%' OR s.job_function ILIKE '%' || a.keywords || '%');
    IF hits > 0 THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (a.user_id, 'job_alert',
              hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END || ' for “' || coalesce(a.label, a.keywords) || '”',
              first_title || CASE WHEN hits > 1 THEN ' and ' || (hits - 1) || ' more' ELSE '' END,
              '/jobs?q=' || replace(a.keywords, ' ', '+') || coalesce('&country=' || replace((SELECT name FROM public.countries WHERE iso_code = a.country_code), ' ', '+'), ''));
      total := total + 1;
    END IF;
    UPDATE public.job_alerts SET last_checked_at = now() WHERE id = a.id;
  END LOOP;
  DELETE FROM public.notifications WHERE created_at < now() - interval '90 days';
  RETURN total;
END;
$$;

-- Daily email digest.
CREATE OR REPLACE FUNCTION public.run_job_alert_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  ALERT_EMAILS_PER_RUN constant integer := 90;
  key text;
  sender text;
  a record;
  jobs jsonb;
  hits integer;
  rows_html text;
  rows_text text;
  subject text;
  unsub text;
  sent integer := 0;
BEGIN
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN 0; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';

  FOR a IN
    SELECT al.*, u.email, coalesce(c.name, '') AS country_name
    FROM public.job_alerts al
    JOIN auth.users u ON u.id = al.user_id AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
    LEFT JOIN public.countries c ON c.iso_code = al.country_code
    WHERE al.active AND al.email_enabled
      AND (al.last_emailed_at IS NULL OR al.last_emailed_at < now() - interval '20 hours')
    ORDER BY al.last_emailed_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= ALERT_EMAILS_PER_RUN;

    SELECT count(*), coalesce(jsonb_agg(j) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO hits, jobs
    FROM (
      SELECT jsonb_build_object('id', s.id, 'title', s.title, 'company', p.name, 'city', s.city,
               'visa', (s.visa_status = 'offered' OR s.visa_sponsorship)) AS j,
             row_number() OVER (ORDER BY (s.visa_status = 'offered' OR s.visa_sponsorship) DESC, s.released_at DESC) AS rn
      FROM public.sponsored_jobs s
      JOIN public.program_publishers p ON p.id = s.publisher_id
      LEFT JOIN public.countries co ON co.id = s.country_id
      WHERE s.released_at > coalesce(a.last_emailed_at, a.created_at) AND s.released_at <= now()
        AND s.status = 'published' AND NOT s.awaiting_release
        AND (a.country_code IS NULL OR co.iso_code = a.country_code)
        AND (a.keywords = '' OR s.title ILIKE '%' || a.keywords || '%' OR s.job_function ILIKE '%' || a.keywords || '%')
    ) t;

    -- Nothing new → no email, and don't move the window (jobs keep accumulating).
    CONTINUE WHEN hits = 0;

    unsub := 'https://madevisa.com/alerts/unsubscribe?t=' || a.unsub_token::text;
    SELECT string_agg(
             '<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb"><a href="https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=em" style="color:#1D4ED8;font-weight:bold;text-decoration:none">'
             || replace(replace(j->>'title', '<', '&lt;'), '>', '&gt;') || '</a><br><span style="color:#4b5563;font-size:14px">'
             || replace(replace(j->>'company', '<', '&lt;'), '>', '&gt;') || coalesce(' · ' || replace(replace(j->>'city', '<', '&lt;'), '>', '&gt;'), '')
             || CASE WHEN (j->>'visa')::boolean THEN ' · <b style="color:#047857">Visa sponsorship</b>' ELSE '' END || '</span></td></tr>', ''),
           string_agg('- ' || (j->>'title') || ' — ' || (j->>'company') || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=em', E'\n')
    INTO rows_html, rows_text
    FROM jsonb_array_elements(jobs) j;

    subject := hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END
               || CASE WHEN a.keywords <> '' THEN ' for “' || a.keywords || '”' ELSE '' END
               || CASE WHEN a.country_name <> '' THEN ' in ' || a.country_name ELSE '' END;

    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
        'to', jsonb_build_array(a.email),
        'subject', subject,
        'headers', jsonb_build_object('List-Unsubscribe', '<' || unsub || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'),
        'html', '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">'
                || '<p style="font-size:18px;font-weight:bold">' || replace(replace(subject, '<', '&lt;'), '>', '&gt;') || '</p>'
                || '<table style="width:100%;border-collapse:collapse">' || rows_html || '</table>'
                || CASE WHEN hits > 5 THEN '<p><a href="https://madevisa.com/jobs?s=em" style="color:#1D4ED8">See all ' || hits || ' on MadeVisa →</a></p>' ELSE '' END
                || '<p style="font-size:14px;color:#374151;margin-top:20px">Job doesn’t mention a visa? <a href="https://madevisa.com/offers?s=em" style="color:#1D4ED8">Send them a Visa Plan</a> — your first one is free.</p>'
                || '<p style="font-size:12px;color:#9ca3af;margin-top:24px">You get this because you set a job alert on MadeVisa. <a href="' || unsub || '" style="color:#9ca3af">Unsubscribe in one click</a>.</p></div>',
        'text', subject || E'\n\n' || rows_text || E'\n\nUnsubscribe: ' || unsub
      ),
      timeout_milliseconds := 10000
    );
    UPDATE public.job_alerts SET last_emailed_at = now() WHERE id = a.id;
    sent := sent + 1;
  END LOOP;
  RETURN sent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'run_job_alert_emails: %', SQLERRM;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_job_alert_emails() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'madevisa-job-alert-emails';
    -- Every day 07:30 UTC (morning in Europe, afternoon in Asia).
    PERFORM cron.schedule('madevisa-job-alert-emails', '30 7 * * *', 'select public.run_job_alert_emails()');
  END IF;
END $$;
