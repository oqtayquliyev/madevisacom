/*
# Sponsorship documents: editable until the company accepts, then "Confirmed"

Before: a document was final the moment its owner approved it. A typo in the
name meant withdrawing it and making a new one.

Now
1. The owner can change their own details (name, role line, note) and the
   terms on a saved document — until the company accepts it.
2. The company gets a fourth reply on the document: "We accept these terms".
   It needs a name and a work email. The first acceptance is recorded on the
   document (accepted_at, accepted_by, accepted_verified) and from then on
   the document shows "Confirmed" and can no longer be changed by its owner.
3. brief_acceptance(share id) tells the page whether a document is confirmed.

"Verified" keeps its meaning from migration 20261115090000: the work email
is on the company's own domain and not a free mail service.

This replaces the rule of migration 20261112090000 ("final once prepared").

Safe to run more than once. Run after 20261126090000.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. What a confirmation stores
-- ---------------------------------------------------------------------------
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS accepted_by text;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS accepted_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE public.brief_replies DROP CONSTRAINT IF EXISTS brief_replies_kind_check;
ALTER TABLE public.brief_replies ADD CONSTRAINT brief_replies_kind_check
  CHECK (kind IN ('interested', 'more_info', 'not_now', 'accepted'));

-- ---------------------------------------------------------------------------
-- 1b. The freeze from 20261112090000 ("final once prepared") now starts at
--     the company's acceptance instead of at the owner's approval.
--     Always fixed: the job, its city and function, and the owner's public
--     links — for a different job, a new document is made.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hiring_briefs_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.job_title := OLD.job_title;
    NEW.job_city := OLD.job_city;
    NEW.job_function := OLD.job_function;
    NEW.candidate_linkedin := OLD.candidate_linkedin;
    NEW.candidate_username := OLD.candidate_username;
    IF OLD.accepted_at IS NOT NULL THEN
      NEW.split := OLD.split;
      NEW.terms := OLD.terms;
      NEW.terms_updated_at := OLD.terms_updated_at;
      NEW.covers := OLD.covers;
      NEW.remote_first := OLD.remote_first;
      NEW.company_name := OLD.company_name;
      NEW.publisher_id := OLD.publisher_id;
      NEW.candidate_name := OLD.candidate_name;
      NEW.candidate_headline := OLD.candidate_headline;
      NEW.note := OLD.note;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hiring_briefs_freeze ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_freeze
  BEFORE UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_freeze();

-- ---------------------------------------------------------------------------
-- 2. The guard: same as 20261126090000, plus
--    • the confirmation fields can only be written by the reply function;
--    • once confirmed, the owner can't change what the company agreed to.
-- ---------------------------------------------------------------------------
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
    ELSIF (c->>'pro')::boolean THEN
      RAISE EXCEPTION 'You''ve used all 50 sponsorship documents for this month. They renew on the 1st.' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'Sponsorship documents are part of MadeVisa Pro — 50 a month. See Pricing.' USING ERRCODE = 'P0001';
    END IF;
    NEW.cost_usd := 0;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
    NEW.accepted_at := NULL;
    NEW.accepted_by := NULL;
    NEW.accepted_verified := false;
    NEW.edited_at := NULL;
  ELSE
    IF NOT public.is_admin() THEN
      IF NOT counters THEN
        NEW.view_count := OLD.view_count;
        NEW.first_viewed_at := OLD.first_viewed_at;
        NEW.last_viewed_at := OLD.last_viewed_at;
        -- Only the company's reply can confirm a document.
        NEW.accepted_at := OLD.accepted_at;
        NEW.accepted_by := OLD.accepted_by;
        NEW.accepted_verified := OLD.accepted_verified;
      END IF;
      NEW.share_id := OLD.share_id;
      NEW.user_id := OLD.user_id;
      NEW.job_id := OLD.job_id;
      NEW.route_id := OLD.route_id;
      NEW.country_code := OLD.country_code;
      NEW.created_at := OLD.created_at;
      NEW.cost_usd := OLD.cost_usd;
      NEW.paid_with := OLD.paid_with;

      IF OLD.accepted_at IS NOT NULL THEN
        -- Confirmed: what the company agreed to stays exactly as it was.
        NEW.candidate_name := OLD.candidate_name;
        NEW.candidate_headline := OLD.candidate_headline;
        NEW.candidate_linkedin := OLD.candidate_linkedin;
        NEW.note := OLD.note;
        NEW.job_title := OLD.job_title;
        NEW.company_name := OLD.company_name;
        NEW.publisher_id := OLD.publisher_id;
        NEW.job_city := OLD.job_city;
        NEW.covers := OLD.covers;
        NEW.remote_first := OLD.remote_first;
        NEW.split := OLD.split;
        NEW.terms := OLD.terms;
        NEW.terms_updated_at := OLD.terms_updated_at;
        NEW.edited_at := OLD.edited_at;
      ELSIF NEW.candidate_name IS DISTINCT FROM OLD.candidate_name
         OR NEW.candidate_headline IS DISTINCT FROM OLD.candidate_headline
         OR NEW.note IS DISTINCT FROM OLD.note
         OR NEW.terms IS DISTINCT FROM OLD.terms
         OR NEW.split IS DISTINCT FROM OLD.split THEN
        NEW.edited_at := now();
      END IF;
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

-- ---------------------------------------------------------------------------
-- 3. The company's reply: as in 20261115090000, with "accepted"
-- ---------------------------------------------------------------------------
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
  title text;
  first_acceptance boolean := false;
BEGIN
  -- Honeypot: look successful, store nothing.
  IF coalesce(p_website, '') <> '' THEN RETURN json_build_object('ok', true); END IF;

  IF p_kind NOT IN ('interested', 'more_info', 'not_now', 'accepted') THEN RAISE EXCEPTION 'Please choose a reply.'; END IF;

  -- Accepting the terms is a statement on behalf of the company: it needs a name and an email.
  IF p_kind = 'accepted' AND (name_clean = '' OR email_clean = '') THEN
    RAISE EXCEPTION 'To accept the terms, add your name and your work email.';
  END IF;

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
         hb.accepted_at, pp.website AS pub_website
  INTO b
  FROM public.hiring_briefs hb
  LEFT JOIN public.program_publishers pp ON pp.id = hb.publisher_id
  WHERE hb.share_id = p_share_id;
  IF b.id IS NULL OR b.status = 'withdrawn' THEN RAISE EXCEPTION 'This document is no longer available.'; END IF;

  -- Never from the candidate themselves.
  IF auth.uid() = b.user_id OR public.brief_visitor_is_owner(b.user_id, h) THEN
    RAISE EXCEPTION 'This is your own document — replies come from the company.';
  END IF;

  IF p_kind = 'accepted' AND b.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'These terms have already been accepted.';
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

  first_acceptance := p_kind = 'accepted';

  PERFORM set_config('madevisa.brief_counters', '1', true);
  UPDATE public.hiring_briefs
  SET reply_count = reply_count + 1,
      -- A positive reply moves "sent / no reply" forward; never overrides interview/offer.
      status = CASE WHEN p_kind IN ('interested', 'more_info', 'accepted') AND status IN ('created', 'sent', 'no_reply') THEN 'replied' ELSE status END,
      accepted_at = CASE WHEN first_acceptance THEN now() ELSE accepted_at END,
      accepted_by = CASE WHEN first_acceptance THEN name_clean ELSE accepted_by END,
      accepted_verified = CASE WHEN first_acceptance THEN verified ELSE accepted_verified END
  WHERE id = b.id;
  PERFORM set_config('madevisa.brief_counters', '', true);

  title := CASE p_kind
    WHEN 'accepted' THEN '✅ The company accepted your terms'
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

-- ---------------------------------------------------------------------------
-- 4. Is this document confirmed? (Anyone with the link may know.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brief_acceptance(p_share_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'accepted_at', hb.accepted_at,
    'accepted_by', hb.accepted_by,
    'verified', hb.accepted_verified,
    'edited_at', hb.edited_at
  )
  FROM public.hiring_briefs hb
  WHERE hb.share_id = p_share_id AND hb.status <> 'withdrawn';
$$;
REVOKE ALL ON FUNCTION public.brief_acceptance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brief_acceptance(text) TO anon, authenticated;
