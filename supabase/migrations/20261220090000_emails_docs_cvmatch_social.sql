/*
# Emails that arrive, 5 free documents, CV match for paid plans, job-first social
Run AFTER 20261219090000_starter_pro_plans.sql. Paste the whole file once in the
Supabase SQL Editor. Safe to run more than once.

1. EMAILS — the 429 and 403 errors in Admin → Emails
   - 429 "Too many requests. You can only make 10 requests per second": every email
     of a run (up to 150 "Jobs for you" at 11:10) was handed to Resend at the same
     moment. Now every email goes into an outbox (email_log, status "queued") and
     email_outbox_tick() sends at most 8 every 5 seconds. A 429 is tried again a few
     seconds later (up to 6 times) instead of being lost.
   - 403 "This API key is not authorized to send emails from news.madevisa.com": the
     Resend API key only allows the main domain. The email is sent again at once from
     the main address (same display name, same reply-to), so it still arrives.
     To use the news.madevisa.com senders for real: in Resend → API Keys, create a key
     with "Sending access: All domains" (or verify news.madevisa.com and give the key
     access to it) and put it in app_secrets 'resend_api_key_outreach'.
   - Job alerts: 3 jobs instead of 5, and the number in the email ("126 new jobs") is
     an underlined link to /jobs with the alert's search, country and date filled in.
   - Every email's footer (and plain-text version) now ends with the address:
     Yashil Dara, Sumgayit AZ5000, Azerbaijan · +994 77 572 00 98 · hello@madevisa.com

2. SPONSORSHIP DOCUMENTS — 5 free for every account
   brief_credits_for(): every account has 5 free documents (plus the plan's monthly
   allowance and anything granted). Editing a document never costs one.

3. CV MATCH — Starter and Pro only
   plan_entitlements: Free no longer includes missing skills (the app shows CV match
   to paid plans only).

4. SOCIAL MEDIA — direct job opportunities, started automatically
   The program's settings are reset to the new job-first plan (programCatalog.ts):
   white "X is hiring" cards and fast job reels, roles from different kinds of work,
   slow text reels off, Telegram links only. Slots already planned are planned again
   with the new formats, and the program is switched on.
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. EMAILS
-- ===========================================================================

ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS key_name text;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS idem text;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS next_at timestamptz;
CREATE INDEX IF NOT EXISTS email_log_outbox_idx ON public.email_log (id) WHERE status = 'queued' AND request_id IS NULL;

/* The address, phone and email in every email. */
CREATE OR REPLACE FUNCTION public.mv_contact_line()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'MadeVisa · Yashil Dara, Sumgayit AZ5000, Azerbaijan · +994 77 572 00 98 · hello@madevisa.com'; $$;

/* "Manufacturing & more" → "Manufacturing%20%26%20more" (for links in emails). */
CREATE OR REPLACE FUNCTION public.mv_urlencode(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(string_agg(
    CASE WHEN ch ~ '^[A-Za-z0-9_.~-]$' THEN ch
         ELSE (SELECT string_agg('%' || upper(lpad(to_hex(get_byte(b, i)), 2, '0')), '' ORDER BY i)
               FROM (SELECT convert_to(ch, 'UTF8') AS b) x, generate_series(0, octet_length(convert_to(ch, 'UTF8')) - 1) i)
    END, '' ORDER BY o), '')
  FROM regexp_split_to_table(coalesce(p, ''), '') WITH ORDINALITY t(ch, o)
  WHERE ch <> '';
$$;

/* Every email goes into the outbox; email_outbox_tick() hands them to Resend a few at a time.
   Same signature and answer as before (true = it will be sent). */
CREATE OR REPLACE FUNCTION public.mv_send_email(
  p_to text,
  p_subject text,
  p_html text,
  p_text text,
  p_kind text,
  p_user uuid DEFAULT NULL,
  p_unsub_url text DEFAULT NULL,
  p_idempotency text DEFAULT NULL,
  p_reply_to text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
  body jsonb;
  pref_kind text := CASE WHEN p_kind = 'auto_apply' THEN 'application' ELSE p_kind END;
BEGIN
  IF coalesce(btrim(p_to), '') = '' THEN RETURN false; END IF;
  IF p_user IS NOT NULL AND NOT public.email_allowed(p_user, pref_kind) THEN
    INSERT INTO public.email_log (user_id, to_email, kind, subject, status, error)
    VALUES (p_user, p_to, p_kind, left(p_subject, 300), 'skipped', 'Turned off in email settings');
    RETURN false;
  END IF;
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN false; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';

  body := jsonb_build_object(
    'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
    'to', jsonb_build_array(p_to),
    'subject', left(p_subject, 300),
    'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', regexp_replace(p_kind, '[^a-zA-Z0-9_-]', '_', 'g')))
  );
  IF p_html IS NOT NULL THEN body := body || jsonb_build_object('html', p_html); END IF;
  IF p_text IS NOT NULL THEN
    body := body || jsonb_build_object('text', p_text || CASE WHEN p_text ILIKE '%Sumgayit%' THEN '' ELSE E'\n\n—\n' || public.mv_contact_line() END);
  END IF;
  IF p_reply_to IS NOT NULL THEN body := body || jsonb_build_object('reply_to', p_reply_to); END IF;
  IF p_unsub_url IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || p_unsub_url || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;

  INSERT INTO public.email_log (user_id, to_email, kind, subject, payload, key_name, idem)
  VALUES (p_user, p_to, p_kind, left(p_subject, 300), body, 'main', left(p_idempotency, 240));
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.email_log (user_id, to_email, kind, subject, status, error) VALUES (p_user, p_to, p_kind, left(coalesce(p_subject, ''), 300), 'failed', left(SQLERRM, 300));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE NOTICE 'mv_send_email: %', SQLERRM;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_send_email(text, text, text, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

/* Campaign / series email through a chosen sender (or the default one), into the outbox.
   Returns the email_log id (campaign_settle matches on it). */
CREATE OR REPLACE FUNCTION public.mv_send_outreach(p_to text, p_rendered jsonb, p_kind text, p_user uuid DEFAULT NULL, p_idempotency text DEFAULT NULL, p_sender public.email_senders DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
  reply text := 'hello@madevisa.com';
  body jsonb;
  lid bigint;
  txt text := p_rendered->>'text';
BEGIN
  SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key')) INTO key;
  IF coalesce(key, '') = '' THEN RETURN NULL; END IF;
  IF p_sender.id IS NOT NULL THEN
    sender := p_sender.from_name || ' <' || p_sender.from_email || '>';
    reply := coalesce(nullif(p_sender.reply_to, ''), reply);
  ELSE
    SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'email_from_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'email_from'), 'MadeVisa <onboarding@resend.dev>') INTO sender;
  END IF;
  IF txt IS NOT NULL AND txt NOT ILIKE '%Sumgayit%' THEN txt := txt || E'\n\n—\n' || public.mv_contact_line(); END IF;
  body := jsonb_build_object('from', sender, 'to', jsonb_build_array(p_to), 'subject', p_rendered->>'subject',
                             'html', p_rendered->>'html', 'text', txt, 'reply_to', reply,
                             'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', p_kind)));
  IF p_rendered->>'unsub' IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || (p_rendered->>'unsub') || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;
  INSERT INTO public.email_log (user_id, to_email, kind, subject, sender_id, payload, key_name, idem)
  VALUES (p_user, p_to, p_kind, left(p_rendered->>'subject', 300), p_sender.id, body, 'outreach', left(p_idempotency, 240))
  RETURNING id INTO lid;
  RETURN lid;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_send_outreach(text, jsonb, text, uuid, text, public.email_senders) FROM PUBLIC, anon, authenticated;

/* Resend's answers onto the log. 429 and timeouts: tried again shortly. 403 for a sender
   domain the key may not use: sent again from the main address. */
CREATE OR REPLACE FUNCTION public.email_log_settle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  r record;
  main text := (SELECT value FROM public.app_secrets WHERE name = 'email_from');
  main_addr text;
  cur_addr text;
  shown text;
  msg text;
BEGIN
  main_addr := lower(coalesce(substring(main FROM '<([^>]+)>'), btrim(main), ''));
  BEGIN
    FOR r IN EXECUTE $q$
      SELECT l.id, l.attempts, l.payload, l.idem, resp.status_code AS code, resp.error_msg, resp.content
      FROM public.email_log l
      JOIN net._http_response resp ON resp.id = l.request_id
      WHERE l.status = 'queued' AND l.request_id IS NOT NULL AND l.created_at > now() - interval '2 days'
      ORDER BY l.id
      LIMIT 2000
    $q$
    LOOP
      msg := left(coalesce(r.error_msg, r.content, 'No answer'), 300);
      IF r.code BETWEEN 200 AND 299 THEN
        UPDATE public.email_log SET status = 'sent', status_code = r.code, error = NULL, payload = NULL WHERE id = r.id;
      ELSIF (r.code = 429 OR r.code IS NULL OR r.code >= 500) AND r.payload IS NOT NULL AND r.attempts < 6 THEN
        -- Too many at once (or no answer): back into the outbox, a little later each time.
        UPDATE public.email_log SET request_id = NULL, status_code = r.code, error = 'Retrying: ' || msg,
               next_at = now() + make_interval(secs => 10 * r.attempts)
        WHERE id = r.id;
      ELSIF r.code = 403 AND r.payload IS NOT NULL AND msg ILIKE '%not authorized to send emails from%' AND main_addr LIKE '%@%' THEN
        cur_addr := lower(coalesce(substring(r.payload->>'from' FROM '<([^>]+)>'), r.payload->>'from'));
        IF split_part(cur_addr, '@', 2) <> split_part(main_addr, '@', 2) THEN
          -- The key can't send from this sender's domain: the same email from the main address.
          shown := nullif(btrim(regexp_replace(coalesce(r.payload->>'from', ''), '\s*<[^>]*>\s*$', '')), '');
          UPDATE public.email_log SET request_id = NULL, status_code = r.code, error = 'Sent from ' || main_addr || ' instead: ' || msg, next_at = NULL,
                 idem = CASE WHEN idem IS NULL THEN NULL ELSE left(idem, 230) || '-main' END,
                 payload = payload || jsonb_build_object('from', coalesce(shown, 'MadeVisa') || ' <' || main_addr || '>')
          WHERE id = r.id;
        ELSE
          UPDATE public.email_log SET status = 'failed', status_code = r.code, error = msg, payload = NULL WHERE id = r.id;
        END IF;
      ELSE
        UPDATE public.email_log SET status = 'failed', status_code = r.code, error = msg, payload = NULL WHERE id = r.id;
      END IF;
      n := n + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'email_log_settle: %', SQLERRM;
  END;
  -- pg_net forgets answers after a while: older handed-over ones without an answer are counted as sent (Resend took them).
  UPDATE public.email_log SET status = 'sent', payload = NULL WHERE status = 'queued' AND request_id IS NOT NULL AND created_at < now() - interval '12 hours';
  -- Never handed over in two days: give up.
  UPDATE public.email_log SET status = 'failed', error = coalesce(error, 'Not sent'), payload = NULL WHERE status = 'queued' AND request_id IS NULL AND created_at < now() - interval '2 days';
  DELETE FROM public.email_log WHERE created_at < now() - interval '180 days';
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.email_log_settle() FROM PUBLIC, anon, authenticated;

/* The outbox: answers first, then up to app_secrets 'email_per_tick' (default 8) emails to Resend.
   Runs every 5 seconds: at most ~1.6 a second, well under Resend's limit. */
CREATE OR REPLACE FUNCTION public.email_outbox_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per integer := 8;
  r record;
  main_key text := (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key');
  out_key text := nullif((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), '');
  key text;
  hdr jsonb;
  rid bigint;
  n integer := 0;
BEGIN
  BEGIN
    per := greatest(1, least(50, coalesce((SELECT nullif(btrim(value), '')::integer FROM public.app_secrets WHERE name = 'email_per_tick'), 8)));
  EXCEPTION WHEN OTHERS THEN per := 8;
  END;
  -- Only settle when something is waiting for an answer (cheap when idle).
  IF EXISTS (SELECT 1 FROM public.email_log WHERE status = 'queued' AND request_id IS NOT NULL AND created_at > now() - interval '2 days') THEN
    PERFORM public.email_log_settle();
  END IF;

  FOR r IN
    SELECT id, payload, key_name, idem FROM public.email_log
    WHERE status = 'queued' AND request_id IS NULL AND payload IS NOT NULL AND coalesce(next_at, created_at) <= now()
    ORDER BY id
    LIMIT per
    FOR UPDATE SKIP LOCKED
  LOOP
    key := CASE WHEN r.key_name = 'outreach' THEN coalesce(out_key, main_key) ELSE main_key END;
    IF coalesce(key, '') = '' THEN
      UPDATE public.email_log SET status = 'failed', error = 'Resend isn’t connected (no API key)', payload = NULL WHERE id = r.id;
      CONTINUE;
    END IF;
    hdr := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json');
    IF r.idem IS NOT NULL THEN hdr := hdr || jsonb_build_object('Idempotency-Key', r.idem); END IF;
    SELECT net.http_post(url := 'https://api.resend.com/emails', headers := hdr, body := r.payload, timeout_milliseconds := 10000) INTO rid;
    UPDATE public.email_log SET request_id = rid, attempts = attempts + 1 WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.email_outbox_tick() FROM PUBLIC, anon, authenticated;

/* Campaign recipients now carry the email_log id (older ones: the pg_net request id). */
CREATE OR REPLACE FUNCTION public.campaign_settle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer := 0;
BEGIN
  PERFORM public.email_log_settle();
  WITH bad AS (
    UPDATE public.email_campaign_recipients q SET status = 'failed', error = l.error
    FROM public.email_log l
    WHERE q.status = 'sent' AND q.request_id IS NOT NULL AND (l.id = q.request_id OR l.request_id = q.request_id)
      AND lower(l.to_email) = lower(q.email) AND l.status = 'failed'
      AND q.sent_at > now() - interval '2 days'
    RETURNING q.contact_id, l.status_code
  )
  UPDATE public.email_contacts c SET status = 'bounced', updated_at = now()
  FROM bad WHERE c.id = bad.contact_id AND c.status = 'subscribed' AND bad.status_code IN (422);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.campaign_settle() FROM PUBLIC, anon, authenticated;

/* The layout every email uses — with the address, phone and email in the footer. */
CREATE OR REPLACE FUNCTION public.mv_email_html(
  p_preheader text,
  p_eyebrow text,
  p_title text,
  p_intro text,
  p_body text,
  p_cta_label text DEFAULT NULL,
  p_cta_url text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_unsub_url text DEFAULT NULL,
  p_unsub_all_url text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT public.mv_no_emoji(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  || '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' || mv_esc(p_title) || '</title></head>'
  || '<body style="margin:0;padding:0;background:#f1f4f9;-webkit-text-size-adjust:100%">'
  || '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f4f9">' || mv_esc(coalesce(p_preheader, '')) || '&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f9"><tr><td align="center" style="padding:28px 12px">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">'
  || '<tr><td style="padding:0 6px 18px">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
  || '<td valign="middle"><a href="https://madevisa.com/?s=em" style="text-decoration:none;display:inline-block">'
  || '<img src="https://madevisa.com/og-logo.png" width="132" height="27" alt="MadeVisa" style="display:block;width:132px;height:27px;border:0;outline:none;border-radius:6px"></a></td>'
  || CASE WHEN p_eyebrow IS NOT NULL THEN '<td align="right" valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#1d4ed8;letter-spacing:0.6px;text-transform:uppercase">' || mv_esc(p_eyebrow) || '</td>' ELSE '' END
  || '</tr></table></td></tr>'
  || '<tr><td style="background:#ffffff;border-radius:18px;border:1px solid #e2e8f0;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">'
  || '<h1 style="margin:0 0 12px;font-size:25px;line-height:1.28;font-weight:800;letter-spacing:-0.5px;color:#0f172a">' || mv_esc(p_title) || '</h1>'
  || CASE WHEN coalesce(p_intro, '') <> '' THEN '<p style="margin:0 0 20px;font-size:15.5px;line-height:1.6;color:#475569">' || p_intro || '</p>' ELSE '' END
  || coalesce(p_body, '')
  || CASE WHEN p_cta_url IS NOT NULL THEN
       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px"><tr><td style="border-radius:12px;background:#1d4ed8">'
       || '<a href="' || mv_esc(p_cta_url) || '" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;white-space:nowrap">' || mv_esc(btrim(public.mv_no_emoji(coalesce(p_cta_label, 'Open MadeVisa')))) || ' &rarr;</a>'
       || '</td></tr></table>'
     ELSE '' END
  || '</td></tr>'
  || '<tr><td style="padding:22px 10px 0;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center">'
  || '<p style="margin:0 0 6px;color:#64748b;font-weight:600">MadeVisa &middot; Find your path to a new life abroad</p>'
  || CASE WHEN p_reason IS NOT NULL THEN '<p style="margin:0 0 8px">' || mv_esc(p_reason) || '</p>' ELSE '' END
  || '<p style="margin:0 0 8px">'
  || '<a href="https://madevisa.com/profile?tab=settings#emails" style="color:#64748b;text-decoration:underline">Email settings</a>'
  || CASE WHEN p_unsub_url IS NOT NULL THEN ' &nbsp;&middot;&nbsp; <a href="' || mv_esc(p_unsub_url) || '" style="color:#64748b;text-decoration:underline">Unsubscribe</a>' ELSE '' END
  || CASE WHEN p_unsub_all_url IS NOT NULL THEN ' &nbsp;&middot;&nbsp; <a href="' || mv_esc(p_unsub_all_url) || '" style="color:#64748b;text-decoration:underline">Unsubscribe from all</a>' ELSE '' END
  || '</p>'
  || '<p style="margin:0 0 6px">MadeVisa &middot; Yashil Dara, Sumgayit AZ5000, Azerbaijan</p>'
  || '<p style="margin:0">&copy; ' || extract(year FROM now())::int || ' MadeVisa &middot; <a href="tel:+994775720098" style="color:#94a3b8;text-decoration:none">+994 77 572 00 98</a> &middot; <a href="mailto:hello@madevisa.com" style="color:#94a3b8;text-decoration:none">hello@madevisa.com</a> &middot; <a href="https://madevisa.com/?s=em" style="color:#94a3b8;text-decoration:none">madevisa.com</a></p>'
  || '</td></tr>'
  || '</table></td></tr></table></body></html>');
$$;

-- ---------------------------------------------------------------------------
-- Job alerts: 3 jobs, and the number links to the full list on /jobs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_job_alert_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  ALERT_EMAILS_PER_RUN constant integer := 90;
  SHOWN constant integer := 3;
  key text;
  a record;
  jobs jsonb;
  hits integer;
  rows_html text;
  rows_text text;
  subject text;
  unsub text;
  since timestamptz;
  list_url text;
  count_html text;
  what_html text;
  sent integer := 0;
BEGIN
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN 0; END IF;

  FOR a IN
    SELECT al.*, u.email, coalesce(c.name, '') AS country_name
    FROM public.job_alerts al
    JOIN auth.users u ON u.id = al.user_id AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
    LEFT JOIN public.countries c ON c.iso_code = al.country_code
    LEFT JOIN public.email_prefs ep ON ep.user_id = al.user_id
    WHERE al.active AND al.email_enabled
      AND NOT coalesce(ep.all_off, false) AND coalesce(ep.job_alerts, true)
      AND (al.last_emailed_at IS NULL OR al.last_emailed_at < now() - interval '20 hours')
    ORDER BY al.last_emailed_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= ALERT_EMAILS_PER_RUN;
    since := coalesce(a.last_emailed_at, a.created_at);

    SELECT count(*), coalesce(jsonb_agg(j ORDER BY rn) FILTER (WHERE rn <= SHOWN), '[]'::jsonb)
    INTO hits, jobs
    FROM (
      SELECT jsonb_build_object('id', s.id, 'title', s.title, 'company', p.name, 'logo', p.logo_url, 'city', s.city, 'country', co.name,
               'visa', (s.visa_status = 'offered' OR s.visa_sponsorship),
               'salary', CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END) AS j,
             row_number() OVER (ORDER BY (s.visa_status = 'offered' OR s.visa_sponsorship) DESC, s.released_at DESC) AS rn
      FROM public.sponsored_jobs s
      JOIN public.program_publishers p ON p.id = s.publisher_id
      LEFT JOIN public.countries co ON co.id = s.country_id
      WHERE s.released_at > since AND s.released_at <= now()
        AND s.status = 'published' AND NOT s.awaiting_release
        AND (a.country_code IS NULL OR co.iso_code = a.country_code)
        AND (a.keywords = '' OR s.title ILIKE '%' || a.keywords || '%' OR s.job_function ILIKE '%' || a.keywords || '%')
    ) t;

    CONTINUE WHEN hits = 0;

    -- The full list on /jobs: the alert's words, its country and the time since the last alert.
    list_url := 'https://madevisa.com/jobs?s=em'
      || CASE WHEN a.keywords <> '' THEN '&q=' || public.mv_urlencode(a.keywords) ELSE '' END
      || CASE WHEN a.country_name <> '' THEN '&country=' || public.mv_urlencode(a.country_name) ELSE '' END
      || '&posted=' || public.mv_urlencode(CASE WHEN since > now() - interval '26 hours' THEN 'Past 24 hours' WHEN since > now() - interval '3 days' THEN 'Past 3 days' WHEN since > now() - interval '7 days' THEN 'Past week' ELSE 'Past 2 weeks' END);

    unsub := 'https://madevisa.com/alerts/unsubscribe?t=' || a.unsub_token::text;
    SELECT string_agg(
             public.mv_email_job('https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=em', j->>'title', j->>'company', j->>'logo',
               nullif(concat_ws(', ', j->>'city', j->>'country'), ''),
               CASE WHEN (j->>'visa')::boolean THEN public.mv_email_chip('Visa sponsorship', 'blue') ELSE '' END
               || CASE WHEN j->>'salary' IS NOT NULL THEN public.mv_email_chip(j->>'salary', 'gray') ELSE '' END), ''),
           string_agg('• ' || (j->>'title') || ' — ' || (j->>'company') || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=em', E'\n')
    INTO rows_html, rows_text
    FROM jsonb_array_elements(jobs) j;

    subject := hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END
               || CASE WHEN a.keywords <> '' THEN ' for “' || a.keywords || '”' ELSE '' END
               || CASE WHEN a.country_name <> '' THEN ' in ' || a.country_name ELSE '' END;
    count_html := '<a href="' || mv_esc(list_url) || '" style="color:#1d4ed8;font-weight:800;text-decoration:underline">'
                  || hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END || '</a>';
    what_html := CASE WHEN a.keywords <> '' THEN ' for <b style="color:#0f172a">“' || mv_esc(a.keywords) || '”</b>' ELSE '' END
                 || CASE WHEN a.country_name <> '' THEN ' in ' || mv_esc(a.country_name) ELSE '' END;

    PERFORM public.mv_send_email(
      a.email, subject,
      public.mv_email_html(
        (jobs->0->>'title') || ' at ' || (jobs->0->>'company'),
        'Job alert',
        subject,
        count_html || what_html || ' since your last alert.'
          || CASE WHEN hits > SHOWN THEN ' Here are ' || SHOWN || ' of them — the rest are one click away.' ELSE '' END,
        rows_html
          || CASE WHEN hits > SHOWN THEN '<p style="margin:14px 0 0;font-size:15px"><a href="' || mv_esc(list_url) || '" style="color:#1d4ed8;font-weight:700;text-decoration:underline">See all ' || hits || ' jobs &rarr;</a></p>' ELSE '' END,
        'See all ' || hits || CASE WHEN hits = 1 THEN ' job' ELSE ' jobs' END, list_url,
        'You get this because you set a job alert on MadeVisa.',
        unsub, public.mv_unsub_url(a.user_id, 'all')),
      subject || E'\n\n' || rows_text
        || CASE WHEN hits > SHOWN THEN E'\n\nSee all ' || hits || ': ' || list_url ELSE '' END
        || E'\n\nUnsubscribe from this alert: ' || unsub,
      'job_alert', a.user_id, unsub);
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

-- The outbox runs every 5 seconds (every minute where pg_cron can't do seconds).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('madevisa-email-outbox');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.schedule('madevisa-email-outbox', '5 seconds', 'select public.email_outbox_tick()');
    EXCEPTION WHEN OTHERS THEN
      PERFORM cron.schedule('madevisa-email-outbox', '* * * * *', 'select public.email_outbox_tick()');
    END;
  END IF;
END $$;

-- ===========================================================================
-- 2. SPONSORSHIP DOCUMENTS — 5 free for every account
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.brief_credits_for(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  FREE_DOCS constant integer := 5;
  quota integer := coalesce(public.feature_limit(p_user, 'sponsorship_documents'), 0);
  granted integer;
  spent integer;
  used integer;
  pro boolean := quota > 0;
  pro_used integer := 0;
  docs integer;
  pro_left integer;
BEGIN
  SELECT coalesce(sum(credits), 0) INTO granted FROM public.brief_credit_grants WHERE user_id = p_user;
  SELECT count(*) FILTER (WHERE paid_with = 'credit'), count(*) INTO spent, used FROM public.hiring_briefs WHERE user_id = p_user;
  IF pro THEN
    SELECT count(*) INTO pro_used FROM public.hiring_briefs
    WHERE user_id = p_user AND paid_with = 'pro' AND created_at >= date_trunc('month', now());
  END IF;
  docs := greatest(0, FREE_DOCS + granted - spent);
  pro_left := CASE WHEN pro THEN greatest(0, quota - pro_used) ELSE 0 END;
  RETURN jsonb_build_object(
    'unit', 'documents',
    'docs', docs,
    'free', FREE_DOCS,
    'granted', granted,
    'spent', spent,
    'used', used,
    'pro', pro,
    'plan', public.plan_tier(p_user),
    'pro_left', pro_left,
    'quota', quota,
    'left', docs + pro_left
  );
END;
$$;
REVOKE ALL ON FUNCTION public.brief_credits_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hiring_briefs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c jsonb;
  n integer;
  counters boolean := coalesce(current_setting('madevisa.brief_counters', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO n FROM public.hiring_briefs WHERE user_id = NEW.user_id AND created_at > now() - interval '7 days';
    IF n >= 30 THEN
      RAISE EXCEPTION 'That''s 30 sponsorship documents this week — the fair-use limit. Try again in a few days.' USING ERRCODE = 'P0001';
    END IF;
    c := public.brief_credits_for(NEW.user_id);
    IF (c->>'pro')::boolean AND (c->>'pro_left')::int > 0 THEN
      NEW.paid_with := 'pro';
    ELSIF (c->>'docs')::int >= 1 THEN
      NEW.paid_with := 'credit';
    ELSIF (c->>'pro')::boolean AND c->>'plan' = 'starter' THEN
      RAISE EXCEPTION 'You''ve used all % sponsorship documents for this month and your 5 free ones. They renew on the 1st, or Pro includes 50 a month.', c->>'quota' USING ERRCODE = 'P0001';
    ELSIF (c->>'pro')::boolean THEN
      RAISE EXCEPTION 'You''ve used all % sponsorship documents for this month. They renew on the 1st.', c->>'quota' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'You''ve used your 5 free sponsorship documents. Starter includes 10 a month and Pro 50. See Pricing.' USING ERRCODE = 'P0001';
    END IF;
    NEW.cost_usd := 0;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
  ELSE
    IF NOT public.is_admin() THEN
      IF NOT counters THEN
        NEW.view_count := OLD.view_count;
        NEW.first_viewed_at := OLD.first_viewed_at;
        NEW.last_viewed_at := OLD.last_viewed_at;
      END IF;
      NEW.share_id := OLD.share_id;
      NEW.user_id := OLD.user_id;
      NEW.job_id := OLD.job_id;
      NEW.route_id := OLD.route_id;
      NEW.country_code := OLD.country_code;
      NEW.created_at := OLD.created_at;
      NEW.cost_usd := OLD.cost_usd;
      NEW.paid_with := OLD.paid_with;
    END IF;
    IF NEW.status = 'sent' AND OLD.status = 'created' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;
    IF NEW.status IN ('replied', 'interview', 'offer', 'declined') AND NEW.responded_at IS NULL THEN
      NEW.responded_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 3. CV MATCH — Starter and Pro only
-- ===========================================================================
UPDATE public.plan_entitlements SET allowed = false, usage_limit = 0
WHERE plan_id = 'free' AND feature IN ('cv_missing_skills', 'cv_full_report');

-- ===========================================================================
-- 4. SOCIAL MEDIA — the job-first plan, switched on
-- ===========================================================================
DO $$
BEGIN
  IF to_regclass('public.social_program') IS NULL THEN RETURN; END IF;
  UPDATE public.social_program SET
    running = true,
    started_at = coalesce(started_at, now()),
    stopped_at = NULL,
    planned_at = NULL,
    lock_until = NULL,
    autopilot = true,
    -- The shares in programCatalog.ts (jobs 70, CV match 12, follow and questions 10 …).
    mix = '{}'::jsonb,
    -- White cards, no photo in front of them.
    look = 'graphic',
    formats = (coalesce(formats, '{}'::jsonb)
      - 'hiring_card' - 'reel_hiring' - 'jobs_links' - 'follow_cta')
      || jsonb_build_object(
        'hiring_card', true, 'reel_hiring', true, 'jobs_links', true, 'follow_cta', true,
        'reel_country', false, 'reel_city', false, 'reel_route', false, 'reel_myth', false,
        'reel_plan', false, 'reel_cvfix', false, 'reel_news', false, 'reel_match', false),
    handles = jsonb_build_object('instagram', 'madevisacom', 'tiktok', 'madevisacom', 'facebook', 'madevisa') || coalesce(handles, '{}'::jsonb),
    updated_at = now()
  WHERE id;

  -- Planned slots and posts not out yet are planned again with the new formats (Telegram keeps its links).
  DELETE FROM public.social_posts WHERE origin = 'program' AND status = 'planned';
  UPDATE public.social_posts SET status = 'rejected', error = 'Replaced by the job-first plan'
  WHERE origin = 'program' AND platform <> 'telegram' AND status IN ('rendering', 'awaiting_approval', 'approved');

  BEGIN
    PERFORM public._pipeline_call(jsonb_build_object('cron', 'social'));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'The social program will plan on its next scheduled run: %', SQLERRM;
  END;
END $$;
