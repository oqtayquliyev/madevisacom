/*
# Sponsor offers: slider terms, credits, notifications
Run AFTER 20261108090000_social_cards_mix.sql. Safe to run more than once.

## 1. Offer terms on hiring_briefs
`split` (0–100) is the candidate's slider: 0 = the employer carries the
shareable visa costs, 100 = the candidate does. `terms` is the snapshot the
employer reads (src/lib/sponsorOffer.ts builds it), so a saved document never
changes under them if the code does. Owners can re-drag for free.

## 2. Credits
Every account gets 5 sponsor offers free. Packs of 10 are added by an admin
(Admin → Plans → Activate) into brief_credit_grants. Pro members are
unlimited (fair use: 30 a week). A withdrawn offer still counts — owners can
no longer delete offers, so credits can't be recycled.

## 3. Notifications (bell)
- Apply clicked  → "Did you apply to …? Confirm and track it here"
- Confirmed      → "You applied to … at …. Track it here"
- Offer created  → "Your sponsor offer is ready"
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Offer terms
-- ---------------------------------------------------------------------------
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS split smallint NOT NULL DEFAULT 50;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS terms jsonb;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS terms_updated_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hiring_briefs_split_range') THEN
    ALTER TABLE public.hiring_briefs ADD CONSTRAINT hiring_briefs_split_range CHECK (split BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hiring_briefs_terms_size') THEN
    ALTER TABLE public.hiring_briefs ADD CONSTRAINT hiring_briefs_terms_size CHECK (terms IS NULL OR (jsonb_typeof(terms) = 'object' AND pg_column_size(terms) < 4000));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Credits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brief_credit_grants (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits integer NOT NULL CHECK (credits BETWEEN -1000 AND 1000),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brief_credit_grants_user_idx ON public.brief_credit_grants (user_id);

ALTER TABLE public.brief_credit_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brief_credit_grants_read" ON public.brief_credit_grants;
CREATE POLICY "brief_credit_grants_read" ON public.brief_credit_grants FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS "brief_credit_grants_admin" ON public.brief_credit_grants;
CREATE POLICY "brief_credit_grants_admin" ON public.brief_credit_grants FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_credit_grants TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.brief_credit_grants_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.brief_credits_for(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH g AS (SELECT coalesce(sum(credits), 0)::int AS granted FROM public.brief_credit_grants WHERE user_id = p_user),
       u AS (SELECT count(*)::int AS used FROM public.hiring_briefs WHERE user_id = p_user)
  SELECT jsonb_build_object(
    'free', 5,
    'granted', g.granted,
    'total', 5 + g.granted,
    'used', u.used,
    'left', greatest(0, 5 + g.granted - u.used),
    'unlimited', public.is_pro(p_user)
  )
  FROM g, u;
$$;
REVOKE ALL ON FUNCTION public.brief_credits_for(uuid) FROM PUBLIC, anon, authenticated;

-- The signed-in person's own credits only.
CREATE OR REPLACE FUNCTION public.brief_credits()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.brief_credits_for(auth.uid()) END;
$$;
REVOKE ALL ON FUNCTION public.brief_credits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brief_credits() TO authenticated;

-- Credits replace the old "5 a week" limit.
CREATE OR REPLACE FUNCTION public.hiring_briefs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.is_pro(NEW.user_id) THEN
      IF (SELECT count(*) FROM public.hiring_briefs
          WHERE user_id = NEW.user_id AND created_at > now() - interval '7 days') >= 30 THEN
        RAISE EXCEPTION 'That''s 30 sponsor offers this week — the fair-use limit. Try again in a few days.'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      c := public.brief_credits_for(NEW.user_id);
      IF (c->>'left')::int <= 0 THEN
        RAISE EXCEPTION 'You''ve used all your sponsor offer credits. Get more on the Pricing page.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
  ELSE
    IF NOT public.is_admin() THEN
      NEW.view_count := OLD.view_count;
      NEW.first_viewed_at := OLD.first_viewed_at;
      NEW.last_viewed_at := OLD.last_viewed_at;
      NEW.share_id := OLD.share_id;
      NEW.user_id := OLD.user_id;
      NEW.job_id := OLD.job_id;
      NEW.route_id := OLD.route_id;
      NEW.country_code := OLD.country_code;
      NEW.created_at := OLD.created_at;
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

DROP TRIGGER IF EXISTS hiring_briefs_guard ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_guard
  BEFORE INSERT OR UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_guard();

-- Owners withdraw instead of deleting (a deleted row would hand the credit back).
DROP POLICY IF EXISTS "hiring_briefs_delete_own" ON public.hiring_briefs;
CREATE POLICY "hiring_briefs_delete_own" ON public.hiring_briefs
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- Public read now includes the terms.
DROP FUNCTION IF EXISTS public.get_hiring_brief(text);
CREATE FUNCTION public.get_hiring_brief(p_share_id text)
RETURNS TABLE (
  share_id text,
  job_id uuid,
  publisher_id uuid,
  job_title text,
  company_name text,
  job_function text,
  job_city text,
  country_code text,
  route_id text,
  candidate_name text,
  candidate_headline text,
  candidate_linkedin text,
  candidate_username text,
  covers text[],
  remote_first boolean,
  note text,
  created_at timestamptz,
  is_owner boolean,
  status text,
  view_count integer,
  split smallint,
  terms jsonb,
  terms_updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    b.share_id, b.job_id, b.publisher_id, b.job_title, b.company_name, b.job_function, b.job_city,
    b.country_code, b.route_id, b.candidate_name, b.candidate_headline, b.candidate_linkedin,
    b.candidate_username, b.covers, b.remote_first, b.note, b.created_at,
    (b.user_id = auth.uid()) AS is_owner,
    CASE WHEN b.user_id = auth.uid() THEN b.status ELSE NULL END,
    CASE WHEN b.user_id = auth.uid() THEN b.view_count ELSE NULL END,
    b.split, b.terms, b.terms_updated_at
  FROM public.hiring_briefs b
  WHERE b.share_id = p_share_id
    AND b.status <> 'withdrawn'
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_hiring_brief(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hiring_brief_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (NEW.user_id, 'offer_ready', 'Your sponsor offer is ready',
          left(NEW.job_title || ' at ' || NEW.company_name, 200) || '. Save it as PDF and attach it when you apply.',
          '/brief/' || NEW.share_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'hiring_brief_ready: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hiring_brief_ready ON public.hiring_briefs;
CREATE TRIGGER hiring_brief_ready AFTER INSERT ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_brief_ready();

CREATE OR REPLACE FUNCTION public.application_report_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company text;
  v_job text := coalesce(nullif(NEW.listing_title, ''), 'this job');
  v_link text := '/profile?track=' || NEW.listing_id;
BEGIN
  SELECT name INTO v_company FROM public.program_publishers WHERE id = NEW.publisher_id;
  IF TG_OP = 'INSERT' AND NEW.status = 'clicked' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.user_id, 'application_confirm', left('Did you apply to ' || v_job || '?', 200),
            coalesce(v_company || ' · ', '') || 'Confirm it and track it here.', v_link);
  ELSIF (TG_OP = 'INSERT' AND NEW.status = 'applied')
     OR (TG_OP = 'UPDATE' AND OLD.status = 'clicked' AND NEW.status = 'applied') THEN
    -- The "Did you apply?" question is answered — replace it.
    DELETE FROM public.notifications
    WHERE notifications.user_id = NEW.user_id AND notifications.kind = 'application_confirm' AND notifications.link = v_link;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.user_id, 'application', left('You applied to ' || v_job, 200),
            coalesce('At ' || v_company || '. ', '') || 'Track it here — we''ll remind you to check back.', v_link);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'application_report_notify: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS application_report_notify ON public.application_reports;
CREATE TRIGGER application_report_notify AFTER INSERT OR UPDATE OF status ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.application_report_notify();

-- ---------------------------------------------------------------------------
-- 4. Plans: credit packs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.plan_requests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%hiring_brief%'
  LOOP
    EXECUTE format('ALTER TABLE public.plan_requests DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.plan_requests ADD CONSTRAINT plan_requests_plan_check
  CHECK (plan IN ('pro', 'relocation', 'sponsored_job', 'featured_social', 'employer', 'hiring_brief', 'brief_credits'));

CREATE OR REPLACE FUNCTION public.plan_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_name text := CASE NEW.plan
    WHEN 'pro' THEN 'MadeVisa Pro'
    WHEN 'relocation' THEN 'Relocation plan'
    WHEN 'sponsored_job' THEN 'Sponsored job'
    WHEN 'featured_social' THEN 'Featured in social posts'
    WHEN 'employer' THEN 'Employer plan'
    WHEN 'hiring_brief' THEN 'Hiring Brief'
    WHEN 'brief_credits' THEN 'Sponsor offer credits'
    ELSE NEW.plan END;
BEGIN
  INSERT INTO public.notifications (audience, kind, title, body, link)
  VALUES ('admin', 'plan_request', 'New plan request: ' || plan_name,
          coalesce(NEW.name, NEW.email) || ' · ' || coalesce(NEW.price_label, NEW.billing), '/admin?tab=plans');

  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (NEW.user_id, 'plan_request', 'We got your request for ' || plan_name,
            'We''ll email you a secure payment link within one working day.', '/pricing');
  END IF;

  PERFORM public.send_admin_email(
    'New plan request: ' || plan_name || ' — ' || coalesce(NEW.price_label, NEW.billing),
    concat_ws(E'\n',
      'Plan: ' || plan_name,
      'Billing: ' || NEW.billing || coalesce(' (' || NEW.price_label || ')', ''),
      'Region pricing: ' || coalesce(NEW.region, '—'),
      '',
      'Name: ' || coalesce(NEW.name, '—'),
      'Email: ' || NEW.email,
      'Company: ' || coalesce(NEW.company, '—'),
      'Country: ' || coalesce(NEW.country_code, '—'),
      'Role: ' || coalesce(NEW.occupation, '—'),
      'Specialization: ' || coalesce(NEW.specialization, '—'),
      'Experience: ' || coalesce(NEW.experience, '—'),
      'Target countries: ' || coalesce(array_to_string(NEW.target_countries, ', '), '—'),
      'Signed-in account: ' || CASE WHEN NEW.user_id IS NULL THEN 'no' ELSE 'yes' END,
      '',
      'Message:',
      coalesce(NEW.message, '—'),
      '',
      'Send the payment link, then activate it in Admin → Plans: https://madevisa.com/admin?tab=plans'
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_plan(p_request uuid, p_months integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.plan_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF r.user_id IS NOT NULL AND r.plan IN ('pro', 'relocation') THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, current_period_end, note)
    VALUES (r.user_id, r.plan, 'active', now(), now() + make_interval(months => greatest(p_months, 1)), 'Request ' || r.id)
    ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, status = 'active',
      current_period_end = greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + make_interval(months => greatest(p_months, 1)),
      note = excluded.note, updated_at = now();
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'plan_active', 'Your MadeVisa Pro is active',
            'Pro insights and job alerts are unlocked. Thank you for supporting MadeVisa!', '/jobs');
  ELSIF r.user_id IS NOT NULL AND r.plan = 'brief_credits' THEN
    -- One pack = 10 sponsor offers; p_months = number of packs.
    INSERT INTO public.brief_credit_grants (user_id, credits, reason)
    VALUES (r.user_id, 10 * greatest(p_months, 1), 'Request ' || r.id);
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'credits_added', (10 * greatest(p_months, 1))::text || ' sponsor offer credits added',
            'Open any job in a supported country and prepare your offer.', '/profile');
  END IF;
  UPDATE public.plan_requests SET status = 'active', handled_at = now() WHERE id = p_request;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plan(uuid, integer) TO authenticated;
