/*
# Employer replies on sponsorship documents (Batch 1)
Run AFTER 20261114090000_social_no_repeats.sql. Safe to run more than once.

What this adds
1. "Opened" that means something. Views are counted per distinct visitor
   (hashed network + browser, never the raw IP), not per page load.
   FIXES A BUG: before this, hiring_briefs_guard reset view_count on every
   update by a non-admin, so "opens by others" was always 0.
2. One-click employer reply on /brief/<id>: Interested / Need more info /
   Not right now, with an optional name, work email and short message.
3. Candidate notifications: once when the document is first opened, and on
   each reply (capped).
4. Measured reply rates for admins, which replace the assumed 2.3×.

How each kind of abuse is handled
- Candidate opens their own link logged out / in incognito to fake views
  → their browser+network is remembered as "owner" whenever they open any of
    their own documents signed in; those visits never count.
- Candidate replies "Interested" to their own document to look successful
  → refused when signed in as the owner or from an owner network.
- Email security scanners, link previews and bots open every link
  → the page only records a view after 4 s visible on a real browser; the
    server also ignores known bot user agents and any visitor that opens
    more than 25 different documents in a day.
- Refresh spam → one visitor = one view, ever.
- Scripted reply spam → hidden honeypot field, at least 4 s on the page,
  single-use proof of work, 1 reply per visitor per document, max 5 replies
  per document, max 5 replies per visitor per day, and a global brake of
  200 replies per hour.
- Scam "employers" (e.g. asking the candidate to pay a visa fee)
  → no links allowed in messages, emails on free mail domains are never
    marked verified, the candidate always sees a safety warning, and can
    report a reply (it's hidden, uncounted, and admins are alerted).
- Inflated reply stats → only replies that are counted (not owner, not
  reported) feed the stats; "verified" additionally needs a work email
  on the company's own domain.
- Privacy → only salted hashes are stored; visitor rows are deleted after
  90 days. Reply emails are shown to the candidate because the sender typed
  them into a field labelled "shared with <candidate>".
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. A server-only secret for hashing visitors (never exposed to clients).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
INSERT INTO public.app_secrets (key, value)
VALUES ('visitor_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Salted hash of this request's network + browser. NULL when unknown.
CREATE OR REPLACE FUNCTION public.request_visitor_hash()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := coalesce(headers->>'cf-connecting-ip', headers->>'x-real-ip', btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)));
  ua text := left(coalesce(headers->>'user-agent', ''), 300);
  pepper text;
BEGIN
  IF coalesce(ip, '') = '' THEN RETURN NULL; END IF;
  SELECT value INTO pepper FROM public.app_secrets WHERE key = 'visitor_pepper';
  RETURN encode(digest(coalesce(pepper, '') || '|' || ip || '|' || ua, 'sha256'), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.request_visitor_hash() FROM PUBLIC, anon, authenticated;

-- Known crawlers, link previewers and mail scanners.
CREATE OR REPLACE FUNCTION public.request_is_bot()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json->>'user-agent')
      ~* '(bot|crawl|spider|slurp|preview|scanner|headless|phantom|curl|wget|python|httpclient|java/|go-http|facebookexternalhit|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|skypeuripreview|outlook|microsoft office|proofpoint|mimecast|barracuda|safelinks)',
    true);  -- no user agent at all → treat as a bot
$$;
REVOKE ALL ON FUNCTION public.request_is_bot() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Distinct visitors
-- ---------------------------------------------------------------------------
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS unique_viewers integer NOT NULL DEFAULT 0;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS viewed_notified_at timestamptz;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.brief_visitors (
  brief_id uuid NOT NULL REFERENCES public.hiring_briefs(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL,
  is_owner boolean NOT NULL DEFAULT false,
  owner_id uuid,                      -- set for owner rows, to spot the owner on their other documents
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brief_id, visitor_hash)
);
CREATE INDEX IF NOT EXISTS brief_visitors_hash_idx ON public.brief_visitors (visitor_hash, last_at DESC);
CREATE INDEX IF NOT EXISTS brief_visitors_owner_idx ON public.brief_visitors (owner_id, visitor_hash) WHERE is_owner;
ALTER TABLE public.brief_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brief_visitors FROM anon, authenticated;

-- The counters may only be changed by the functions below (or an admin).
CREATE OR REPLACE FUNCTION public.hiring_briefs_counters_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('madevisa.brief_counters', true), '') <> '1' AND NOT public.is_admin() THEN
    NEW.unique_viewers := OLD.unique_viewers;
    NEW.viewed_notified_at := OLD.viewed_notified_at;
    NEW.reply_count := OLD.reply_count;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hiring_briefs_counters_guard ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_counters_guard
  BEFORE UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_counters_guard();

-- The old guard reset view_count for everyone but admins — which silently
-- undid every recorded view. Let the view/reply functions through.
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
    ELSE
      RAISE EXCEPTION 'You have no document credits left. Get more on the Offers page.' USING ERRCODE = 'P0001';
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

-- Is this visitor the owner (on this or any of their documents, last 90 days)?
CREATE OR REPLACE FUNCTION public.brief_visitor_is_owner(p_owner uuid, p_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.brief_visitors
    WHERE is_owner AND owner_id = p_owner AND visitor_hash = p_hash AND last_at > now() - interval '90 days'
  );
$$;
REVOKE ALL ON FUNCTION public.brief_visitor_is_owner(uuid, text) FROM PUBLIC, anon, authenticated;

-- Called by the page after 4 s visible. Owners call it too: that's how
-- their own networks get remembered.
CREATE OR REPLACE FUNCTION public.record_hiring_brief_view(p_share_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  h text := public.request_visitor_hash();
  me uuid := auth.uid();
  is_new boolean;
  n integer;
BEGIN
  SELECT id, user_id, status, job_title, company_name, share_id, viewed_notified_at INTO b
  FROM public.hiring_briefs WHERE share_id = p_share_id;
  IF b.id IS NULL OR b.status = 'withdrawn' OR h IS NULL THEN RETURN; END IF;

  -- Owner: remember this network/browser, count nothing.
  IF me IS NOT NULL AND me = b.user_id THEN
    INSERT INTO public.brief_visitors (brief_id, visitor_hash, is_owner, owner_id)
    VALUES (b.id, h, true, me)
    ON CONFLICT (brief_id, visitor_hash) DO UPDATE SET is_owner = true, owner_id = me, last_at = now();
    RETURN;
  END IF;

  IF public.request_is_bot() OR public.brief_visitor_is_owner(b.user_id, h) THEN RETURN; END IF;

  -- A "visitor" opening dozens of different documents is a scanner or scraper.
  SELECT count(*) INTO n FROM public.brief_visitors WHERE visitor_hash = h AND last_at > now() - interval '24 hours';
  IF n >= 25 THEN RETURN; END IF;

  INSERT INTO public.brief_visitors (brief_id, visitor_hash)
  VALUES (b.id, h)
  ON CONFLICT (brief_id, visitor_hash) DO UPDATE SET last_at = now()
  RETURNING (xmax = 0) INTO is_new;

  IF NOT is_new THEN RETURN; END IF;

  PERFORM set_config('madevisa.brief_counters', '1', true);
  UPDATE public.hiring_briefs
  SET view_count = view_count + 1,
      unique_viewers = unique_viewers + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now(),
      viewed_notified_at = coalesce(viewed_notified_at, now())
  WHERE id = b.id;
  PERFORM set_config('madevisa.brief_counters', '', true);

  -- One "opened" notification per document, ever.
  IF b.viewed_notified_at IS NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (b.user_id, 'offer_viewed', 'Someone opened your sponsorship document',
            left(b.job_title || ' at ' || b.company_name, 200) || '. If it was the company, they can reply to you in one click from the document.',
            '/brief/' || b.share_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'record_hiring_brief_view: %', SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_hiring_brief_view(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Employer replies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brief_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.hiring_briefs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('interested', 'more_info', 'not_now')),
  sender_name text,
  sender_email text,
  message text,
  verified_domain boolean NOT NULL DEFAULT false,
  counted boolean NOT NULL DEFAULT true,
  reported_at timestamptz,
  visitor_hash text,
  pow_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brief_id, visitor_hash)
);
CREATE INDEX IF NOT EXISTS brief_replies_brief_idx ON public.brief_replies (brief_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brief_replies_visitor_idx ON public.brief_replies (visitor_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS brief_replies_time_idx ON public.brief_replies (created_at DESC);
ALTER TABLE public.brief_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brief_replies FROM anon, authenticated;

-- "acme.co.uk" from "https://www.acme.co.uk/careers".
CREATE OR REPLACE FUNCTION public.bare_domain(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(lower(regexp_replace(regexp_replace(coalesce(p, ''), '^[a-z]+://', '', 'i'), '^www\.|[/:?#].*$', '', 'gi')), '');
$$;

CREATE OR REPLACE FUNCTION public.submit_brief_reply(
  p_share_id text,
  p_kind text,
  p_name text,
  p_email text,
  p_message text,
  p_website text,      -- honeypot: real people leave it empty
  p_started_at bigint,
  p_pow_ts bigint,
  p_pow_nonce text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  now_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  b record;
  h text := public.request_visitor_hash();
  pow text;
  name_clean text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  email_clean text := lower(btrim(coalesce(p_email, '')));
  msg text := btrim(regexp_replace(coalesce(p_message, ''), '[\r\n]{3,}', E'\n\n', 'g'));
  email_dom text;
  company_dom text;
  verified boolean := false;
  n integer;
  first_name text;
  title text;
BEGIN
  -- Honeypot: look successful, store nothing.
  IF coalesce(p_website, '') <> '' THEN RETURN json_build_object('ok', true); END IF;

  IF p_kind NOT IN ('interested', 'more_info', 'not_now') THEN RAISE EXCEPTION 'Please choose a reply.'; END IF;

  IF p_started_at IS NULL OR now_ms - p_started_at < 4000 OR now_ms - p_started_at > 7200000 THEN
    RAISE EXCEPTION 'Please reload the page and try again.';
  END IF;
  IF p_pow_ts IS NULL OR p_pow_nonce IS NULL OR length(p_pow_nonce) > 32
     OR now_ms - p_pow_ts > 1800000 OR p_pow_ts - now_ms > 120000 THEN
    RAISE EXCEPTION 'Verification expired. Please reload the page and try again.';
  END IF;
  pow := encode(digest(p_pow_ts::text || ':' || p_pow_nonce, 'sha256'), 'hex');
  IF left(pow, 4) <> '0000' THEN RAISE EXCEPTION 'Verification failed. Please reload the page and try again.'; END IF;
  IF EXISTS (SELECT 1 FROM public.brief_replies WHERE pow_hash = pow) THEN
    RAISE EXCEPTION 'This reply was already sent.';
  END IF;

  SELECT hb.id, hb.user_id, hb.status, hb.job_title, hb.company_name, hb.share_id, hb.candidate_name, hb.terms,
         pp.website AS pub_website
  INTO b
  FROM public.hiring_briefs hb
  LEFT JOIN public.program_publishers pp ON pp.id = hb.publisher_id
  WHERE hb.share_id = p_share_id;
  IF b.id IS NULL OR b.status = 'withdrawn' THEN RAISE EXCEPTION 'This document is no longer available.'; END IF;

  -- Never from the candidate themselves.
  IF auth.uid() = b.user_id OR public.brief_visitor_is_owner(b.user_id, h) THEN
    RAISE EXCEPTION 'This is your own document — replies come from the company.';
  END IF;

  -- Fields.
  IF length(msg) > 500 THEN RAISE EXCEPTION 'Please keep the message under 500 characters.'; END IF;
  IF msg ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|io|co|ru|xyz|info|biz|link|top|me|ly)(/|\M))' THEN
    RAISE EXCEPTION 'Links aren’t allowed in the message. Add your work email instead.';
  END IF;
  IF email_clean <> '' THEN
    IF length(email_clean) > 120 OR email_clean !~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$' THEN
      RAISE EXCEPTION 'Please enter a valid email address, or leave it empty.';
    END IF;
    email_dom := split_part(email_clean, '@', 2);
    company_dom := public.bare_domain(coalesce(b.terms->'employer'->>'website', b.pub_website));
    verified := company_dom IS NOT NULL
      AND email_dom !~* '^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|web|mail|yandex|zoho|tutanota|qq|163|126)\.'
      AND (email_dom = company_dom OR email_dom LIKE '%.' || company_dom);
  END IF;

  -- Rate limits.
  SELECT count(*) INTO n FROM public.brief_replies WHERE created_at > now() - interval '1 hour';
  IF n >= 200 THEN RAISE EXCEPTION 'Too many replies right now. Please try again in an hour.'; END IF;
  IF h IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.brief_replies WHERE brief_id = b.id AND visitor_hash = h) THEN
      RAISE EXCEPTION 'You already replied to this document. Contact % directly to follow up.', split_part(b.candidate_name, ' ', 1);
    END IF;
    SELECT count(*) INTO n FROM public.brief_replies WHERE visitor_hash = h AND created_at > now() - interval '24 hours';
    IF n >= 5 THEN RAISE EXCEPTION 'Too many replies from your network today. Please try again tomorrow.'; END IF;
  END IF;
  SELECT count(*) INTO n FROM public.brief_replies WHERE brief_id = b.id;
  IF n >= 5 THEN RAISE EXCEPTION 'This document has received the maximum number of replies.'; END IF;

  INSERT INTO public.brief_replies (brief_id, kind, sender_name, sender_email, message, verified_domain, visitor_hash, pow_hash)
  VALUES (b.id, p_kind, nullif(name_clean, ''), nullif(email_clean, ''), nullif(msg, ''), verified, h, pow);

  PERFORM set_config('madevisa.brief_counters', '1', true);
  UPDATE public.hiring_briefs
  SET reply_count = reply_count + 1,
      -- A positive reply moves "sent / no reply" forward; never overrides interview/offer.
      status = CASE WHEN p_kind IN ('interested', 'more_info') AND status IN ('created', 'sent', 'no_reply') THEN 'replied' ELSE status END
  WHERE id = b.id;
  PERFORM set_config('madevisa.brief_counters', '', true);

  first_name := split_part(b.candidate_name, ' ', 1);
  title := CASE p_kind
    WHEN 'interested' THEN '🎉 A company is interested'
    WHEN 'more_info' THEN 'A company wants more information'
    ELSE 'A company replied: not right now' END;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (b.user_id, 'offer_reply', title,
          left(b.job_title || ' at ' || b.company_name
               || CASE WHEN verified THEN ' · sent from a verified company email' ELSE '' END, 220),
          '/brief/' || b.share_id);

  RETURN json_build_object('ok', true, 'verified', verified);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_brief_reply(text, text, text, text, text, text, bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_brief_reply(text, text, text, text, text, text, bigint, bigint, text) TO anon, authenticated;

-- Owner reads the replies to their document.
CREATE OR REPLACE FUNCTION public.my_brief_replies(p_share_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'unique_viewers', hb.unique_viewers,
    'replies', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'name', r.sender_name, 'email', r.sender_email,
        'message', r.message, 'verified', r.verified_domain, 'created_at', r.created_at
      ) ORDER BY r.created_at DESC)
      FROM public.brief_replies r
      WHERE r.brief_id = hb.id AND r.reported_at IS NULL
    ), '[]'::jsonb)
  )
  FROM public.hiring_briefs hb
  WHERE hb.share_id = p_share_id AND hb.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_brief_replies(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_brief_replies(text) TO authenticated;

-- Owner reports a reply as spam or a scam: hidden, uncounted, admins alerted.
CREATE OR REPLACE FUNCTION public.report_brief_reply(p_reply_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
BEGIN
  UPDATE public.brief_replies r
  SET reported_at = now(), counted = false
  FROM public.hiring_briefs hb
  WHERE r.id = p_reply_id AND hb.id = r.brief_id AND hb.user_id = auth.uid() AND r.reported_at IS NULL
  RETURNING r.brief_id INTO bid;
  IF bid IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (audience, kind, title, body, link)
  VALUES ('admin', 'reply_reported', 'A reply on a sponsorship document was reported', 'Reply ' || p_reply_id::text, '/admin');
END;
$$;
REVOKE ALL ON FUNCTION public.report_brief_reply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_brief_reply(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Measured reply rates (admin) — the real number behind "2.3×"
-- ---------------------------------------------------------------------------
-- Only documents sent at least 21 days ago count (time for a reply), and
-- only applications tracked at least 21 days ago, so the two are comparable.
CREATE OR REPLACE FUNCTION public.admin_offer_reply_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  docs jsonb;
  apps jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;

  WITH d AS (
    SELECT hb.id,
      EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.counted) AS replied,
      EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.counted AND r.verified_domain) AS verified,
      EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.counted AND r.kind = 'interested') AS interested,
      hb.status IN ('replied', 'interview', 'offer', 'declined') AS self_reported,
      hb.unique_viewers > 0 AS opened
    FROM public.hiring_briefs hb
    WHERE hb.status <> 'withdrawn' AND coalesce(hb.sent_at, hb.created_at) < now() - interval '21 days'
  )
  SELECT jsonb_build_object(
    'documents', count(*),
    'opened', count(*) FILTER (WHERE opened),
    'any_reply', count(*) FILTER (WHERE replied OR self_reported),
    'button_reply', count(*) FILTER (WHERE replied),
    'verified_reply', count(*) FILTER (WHERE verified),
    'interested', count(*) FILTER (WHERE interested),
    'reply_rate', CASE WHEN count(*) >= 30 THEN round(100.0 * count(*) FILTER (WHERE replied OR self_reported) / count(*), 1) END
  ) INTO docs FROM d;

  SELECT jsonb_build_object(
    'applications', count(*),
    'any_reply', count(*) FILTER (WHERE status IN ('responded', 'interview', 'offer', 'rejected')),
    'reply_rate', CASE WHEN count(*) >= 30 THEN round(100.0 * count(*) FILTER (WHERE status IN ('responded', 'interview', 'offer', 'rejected')) / count(*), 1) END
  ) INTO apps
  FROM public.application_reports
  WHERE applied_at < now() - interval '21 days' AND status <> 'withdrawn';

  RETURN jsonb_build_object(
    'documents', docs,
    'applications', apps,
    'lift', CASE WHEN (docs->>'reply_rate') IS NOT NULL AND coalesce((apps->>'reply_rate')::numeric, 0) > 0
                 THEN round((docs->>'reply_rate')::numeric / (apps->>'reply_rate')::numeric, 2) END,
    'note', 'Rates appear once a group has 30+ items older than 21 days.'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_offer_reply_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_reply_stats() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Housekeeping: forget visitors after 90 days (hashes only, but still).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_brief_visitors()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.brief_visitors WHERE last_at < now() - interval '90 days';
  UPDATE public.brief_replies SET visitor_hash = NULL WHERE visitor_hash IS NOT NULL AND created_at < now() - interval '90 days';
$$;
REVOKE ALL ON FUNCTION public.prune_brief_visitors() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-brief-visitors';
    PERFORM cron.schedule('prune-brief-visitors', '17 3 * * *', 'SELECT public.prune_brief_visitors()');
  END IF;
END $$;
