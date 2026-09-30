/*
# Document credits + fair regional pricing
Run AFTER 20261112090000_offer_documents_final.sql. Safe to run more than once.

Sponsorship documents are now counted in CREDITS instead of dollars:
  1 credit = 1 document, the same in every country.
Only the price of buying credit (and Pro) depends on where you are — the
website shows it, the person requests it, and an admin activates it after
payment with the number of documents paid for.

- Every account has 1 free document (was: $20 credit = one $15 document).
- Bought credit: brief_credit_grants.credits (documents). amount_usd is now
  just a record of what was paid, when known.
- Pro: 10 documents per calendar month, then from credit.
- Fair use: at most 30 new documents per rolling 7 days (unchanged).
- Nothing already made or bought is lost: every document paid from credit
  counts as 1, every earlier top-up already stored its number of documents.
- Sponsored jobs are now $149 for 30 days (was $299).
*/

SET lock_timeout = '5s';

-- The free document every account starts with.
CREATE OR REPLACE FUNCTION public.brief_credits_for(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signup constant integer := 1;
  quota constant integer := 10;
  granted integer;
  spent integer;
  used integer;
  pro boolean := public.is_pro(p_user);
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
  docs := greatest(0, signup + granted - spent);
  pro_left := CASE WHEN pro THEN greatest(0, quota - pro_used) ELSE 0 END;
  RETURN jsonb_build_object(
    'unit', 'documents',
    'docs', docs,
    'granted', granted,
    'spent', spent,
    'used', used,
    'pro', pro,
    'pro_left', pro_left,
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Fair use.
    SELECT count(*) INTO n FROM public.hiring_briefs WHERE user_id = NEW.user_id AND created_at > now() - interval '7 days';
    IF n >= 30 THEN
      RAISE EXCEPTION 'That''s 30 sponsorship documents this week — the fair-use limit. Try again in a few days.' USING ERRCODE = 'P0001';
    END IF;
    -- One document: from the Pro monthly allowance first, then 1 credit.
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
      NEW.view_count := OLD.view_count;
      NEW.first_viewed_at := OLD.first_viewed_at;
      NEW.last_viewed_at := OLD.last_viewed_at;
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

DROP TRIGGER IF EXISTS hiring_briefs_guard ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_guard
  BEFORE INSERT OR UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_guard();

-- Admin activates a request after payment. For document credit, p_months =
-- the number of documents paid for (1, 5, 15 or any number).
CREATE OR REPLACE FUNCTION public.activate_plan(p_request uuid, p_months integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests;
  n integer := greatest(coalesce(p_months, 1), 1);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.plan_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF r.user_id IS NOT NULL AND r.plan IN ('pro', 'relocation') THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, current_period_end, note)
    VALUES (r.user_id, r.plan, 'active', now(), now() + make_interval(months => n), 'Request ' || r.id)
    ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, status = 'active',
      current_period_end = greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + make_interval(months => n),
      note = excluded.note, updated_at = now();
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'plan_active', 'Your MadeVisa Pro is active',
            '10 sponsorship documents a month, job alerts and full company data are unlocked. Thank you for supporting MadeVisa!', '/offers');
  ELSIF r.user_id IS NOT NULL AND r.plan = 'brief_credits' THEN
    INSERT INTO public.brief_credit_grants (user_id, credits, amount_usd, reason)
    VALUES (r.user_id, n, NULL, 'Request ' || r.id || coalesce(' · ' || r.price_label, ''));
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'credits_added',
            n::text || ' document credit' || CASE WHEN n > 1 THEN 's' ELSE '' END || ' added',
            'Each credit prepares one sponsorship document. Pick a job and press "Prepare PDF".',
            '/offers');
  END IF;
  UPDATE public.plan_requests SET status = 'active', handled_at = now() WHERE id = p_request;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plan(uuid, integer) TO authenticated;

-- Sponsored job listing requests: $149 for 30 days.
CREATE OR REPLACE FUNCTION public.listing_requests_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.plan = 'sponsored_job' THEN NEW.price_usd := 149; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listing_requests_price ON public.listing_requests;
CREATE TRIGGER listing_requests_price
  BEFORE INSERT ON public.listing_requests
  FOR EACH ROW EXECUTE FUNCTION public.listing_requests_price();
