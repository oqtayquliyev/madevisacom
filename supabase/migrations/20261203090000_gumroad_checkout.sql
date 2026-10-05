/*
  # Card payments for MadeVisa Pro through Gumroad

  Until now a person asked for Pro, got a payment link by email, and an admin
  switched Pro on by hand. With this, "Get Pro" goes to Gumroad's checkout and
  Pro switches on and off by itself.

  How it fits together
   - The site asks the `gumroad` function for a checkout link. The function
     decides the price for the buyer's country (the same price list the
     pricing page prints), creates a one-time discount code on Gumroad when
     that price is below the list price, and remembers the checkout here
     (gumroad_checkouts) so the payment can be matched to the account.
   - Gumroad tells the function about every payment, renewal, cancellation,
     refund and dispute. The function asks Gumroad's API what the membership
     looks like now (a notification is never believed on its own) and calls
     gumroad_apply(), which keeps gumroad_subscriptions and the person's row
     in `subscriptions` up to date. is_pro() needs no change.

  Paid-through rule: Pro lasts until the last paid period ends, plus 3 days
  while the membership is alive (so a renewal that arrives late does not cut
  anyone off). A cancelled membership keeps Pro until the date Gumroad gives.
  An ended, refunded or disputed one ends now.

  Nothing here is readable from the browser except three small functions:
  gumroad_public() (is card payment on?), and for admins gumroad_admin() and
  gumroad_admin_enable().

  Which account does a payment belong to? The checkout link carries a
  reference to the account that pressed "Get Pro". A membership bought on
  Gumroad without it is matched by email, but only to an account whose email
  is VERIFIED the MadeVisa way (profiles.email_verified_at, migration
  20261005090000): Supabase's own "confirmed" flag is set for every sign-up
  here and proves nothing.

  Can be run more than once. Needs 20261107090000_plans_notifications.sql
  and 20261005090000_email_verification.sql.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Where a plan came from
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_ref text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Tables (server only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gumroad_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Card payments shown to everyone. Admins can try the checkout before this is on.
  enabled boolean NOT NULL DEFAULT false,
  product_url text,
  product_id text,
  product_name text,
  seller_id text,
  -- List prices as Gumroad has them (cents).
  monthly_cents integer,
  yearly_cents integer,
  -- The access token may create discount codes (needed for country prices).
  can_discount boolean NOT NULL DEFAULT false,
  -- Secret part of the address Gumroad posts to.
  webhook_key text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  hooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_at timestamptz,
  last_ping_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.gumroad_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.gumroad_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gumroad_settings FROM anon, authenticated;

-- One row each time someone presses "Get Pro": the price they were given.
CREATE TABLE IF NOT EXISTS public.gumroad_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  billing text NOT NULL CHECK (billing IN ('monthly', 'yearly')),
  -- Where the server saw the buyer (NULL = could not tell).
  country text CHECK (country IS NULL OR char_length(country) = 2),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  list_cents integer NOT NULL CHECK (list_cents > 0),
  offer_code text,
  offer_code_id text,
  code_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  sale_id text
);
CREATE INDEX IF NOT EXISTS gumroad_checkouts_user_idx ON public.gumroad_checkouts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gumroad_checkouts_open_idx ON public.gumroad_checkouts (created_at) WHERE used_at IS NULL AND offer_code_id IS NOT NULL AND code_deleted_at IS NULL;
ALTER TABLE public.gumroad_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gumroad_checkouts FROM anon, authenticated;

-- One row per Gumroad membership.
CREATE TABLE IF NOT EXISTS public.gumroad_subscriptions (
  subscription_id text PRIMARY KEY,
  -- NULL = paid, but no MadeVisa account matched yet.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  recurrence text,
  status text NOT NULL DEFAULT 'alive',
  last_sale_id text,
  last_paid_at timestamptz,
  paid_until timestamptz,
  cancel_at timestamptz,
  ended_at timestamptz,
  price_cents integer,
  -- Country Gumroad reports for the payment, and the country the price was set for.
  card_country text,
  priced_country text,
  checkout_id uuid,
  test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gumroad_subscriptions_user_idx ON public.gumroad_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS gumroad_subscriptions_email_idx ON public.gumroad_subscriptions (lower(email));
ALTER TABLE public.gumroad_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gumroad_subscriptions FROM anon, authenticated;

-- What Gumroad sent, and what was done with it (kept 90 days).
CREATE TABLE IF NOT EXISTS public.gumroad_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  resource text NOT NULL,
  sale_id text,
  subscription_id text,
  email text,
  -- NULL = received, not yet handled.
  ok boolean,
  note text,
  payload jsonb
);
CREATE INDEX IF NOT EXISTS gumroad_events_at_idx ON public.gumroad_events (at DESC);
ALTER TABLE public.gumroad_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gumroad_events FROM anon, authenticated;

-- "Check my payment now": at most once every 10 seconds per person.
CREATE TABLE IF NOT EXISTS public.gumroad_refreshes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gumroad_refreshes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gumroad_refreshes FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. For the function (service role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gumroad_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT to_jsonb(s) FROM public.gumroad_settings s WHERE id $$;
REVOKE ALL ON FUNCTION public.gumroad_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_config() TO service_role;

-- Saves what "Connect" found. Only the keys that are sent are changed.
CREATE OR REPLACE FUNCTION public.gumroad_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.gumroad_settings SET
    product_url   = CASE WHEN p ? 'product_url'   THEN p->>'product_url'   ELSE product_url END,
    product_id    = CASE WHEN p ? 'product_id'    THEN p->>'product_id'    ELSE product_id END,
    product_name  = CASE WHEN p ? 'product_name'  THEN p->>'product_name'  ELSE product_name END,
    seller_id     = CASE WHEN p ? 'seller_id'     THEN p->>'seller_id'     ELSE seller_id END,
    monthly_cents = CASE WHEN p ? 'monthly_cents' THEN (p->>'monthly_cents')::integer ELSE monthly_cents END,
    yearly_cents  = CASE WHEN p ? 'yearly_cents'  THEN (p->>'yearly_cents')::integer  ELSE yearly_cents END,
    can_discount  = CASE WHEN p ? 'can_discount'  THEN (p->>'can_discount')::boolean  ELSE can_discount END,
    hooks         = CASE WHEN p ? 'hooks'         THEN coalesce(p->'hooks', '[]'::jsonb) ELSE hooks END,
    connected_at  = CASE WHEN p ? 'connected'     THEN CASE WHEN (p->>'connected')::boolean THEN now() ELSE NULL END ELSE connected_at END,
    enabled       = CASE WHEN p ? 'connected' AND NOT (p->>'connected')::boolean THEN false ELSE enabled END,
    last_error    = CASE WHEN p ? 'last_error'    THEN left(p->>'last_error', 400) ELSE last_error END,
    updated_at    = now()
  WHERE id;
  RETURN public.gumroad_config();
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_save(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_save(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gumroad_log_event(p_resource text, p_sale text, p_subscription text, p_email text, p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.gumroad_events (resource, sale_id, subscription_id, email, payload)
  VALUES (left(coalesce(p_resource, 'sale'), 40), left(p_sale, 80), left(p_subscription, 80), left(p_email, 254), p_payload)
  RETURNING id INTO v_id;
  UPDATE public.gumroad_settings SET last_ping_at = now() WHERE id;
  DELETE FROM public.gumroad_events WHERE at < now() - interval '90 days';
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_log_event(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_log_event(text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gumroad_finish_event(p_id bigint, p_ok boolean, p_note text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.gumroad_events SET ok = p_ok, note = left(p_note, 400) WHERE id = p_id;
  UPDATE public.gumroad_settings SET last_error = CASE WHEN p_ok THEN NULL ELSE left(to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI') || ' ' || coalesce(p_note, 'A notification could not be handled.'), 400) END WHERE id AND (NOT p_ok OR last_error IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.gumroad_finish_event(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_finish_event(bigint, boolean, text) TO service_role;

-- Who is asking (for "Get Pro" and "check my payment").
CREATE OR REPLACE FUNCTION public.gumroad_user(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    -- Verified the MadeVisa way (a link or code that reached the inbox), for the address the account has now.
    'email_verified', EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.email_verified_at IS NOT NULL AND p.verified_email = lower(u.email)),
    'is_admin', EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.role = 'admin'),
    'subscription_ids', coalesce((SELECT jsonb_agg(g.subscription_id ORDER BY g.updated_at DESC) FROM public.gumroad_subscriptions g WHERE g.user_id = u.id), '[]'::jsonb),
    -- An alive Gumroad membership: a second one must not be started.
    'alive_subscription', (SELECT g.subscription_id FROM public.gumroad_subscriptions g
                           WHERE g.user_id = u.id AND g.ended_at IS NULL AND g.status IN ('alive', 'pending_failure', 'payment_method_update_required')
                           ORDER BY g.updated_at DESC LIMIT 1)
  )
  FROM auth.users u WHERE u.id = p_user;
$$;
REVOKE ALL ON FUNCTION public.gumroad_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.gumroad_refresh_allowed(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  SELECT at INTO v_last FROM public.gumroad_refreshes WHERE user_id = p_user FOR UPDATE;
  IF v_last IS NOT NULL AND v_last > now() - interval '10 seconds' THEN RETURN false; END IF;
  INSERT INTO public.gumroad_refreshes (user_id, at) VALUES (p_user, now())
  ON CONFLICT (user_id) DO UPDATE SET at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_refresh_allowed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_refresh_allowed(uuid) TO service_role;

-- A checkout for this person at this price. An open one from the last 12
-- hours at the same price is used again, so pressing the button twice does
-- not make two discount codes. At most 20 new ones a day per person.
CREATE OR REPLACE FUNCTION public.gumroad_checkout_start(p_user uuid, p_billing text, p_country text, p_price_cents integer, p_list_cents integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.gumroad_checkouts;
BEGIN
  SELECT * INTO c FROM public.gumroad_checkouts
  WHERE user_id = p_user AND billing = p_billing AND price_cents = p_price_cents AND list_cents = p_list_cents
    AND used_at IS NULL AND code_deleted_at IS NULL AND created_at > now() - interval '12 hours'
    AND (p_price_cents >= p_list_cents OR offer_code IS NOT NULL)
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', c.id, 'offer_code', c.offer_code, 'reused', true);
  END IF;
  IF (SELECT count(*) FROM public.gumroad_checkouts WHERE user_id = p_user AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Too many checkouts today. Try again tomorrow, or write to hello@madevisa.com.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.gumroad_checkouts (user_id, billing, country, price_cents, list_cents)
  VALUES (p_user, p_billing, nullif(upper(left(coalesce(p_country, ''), 2)), ''), p_price_cents, p_list_cents)
  RETURNING * INTO c;
  RETURN jsonb_build_object('id', c.id, 'offer_code', NULL, 'reused', false);
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_checkout_start(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_checkout_start(uuid, text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.gumroad_checkout_code(p_id uuid, p_code text, p_code_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ UPDATE public.gumroad_checkouts SET offer_code = p_code, offer_code_id = p_code_id WHERE id = p_id $$;
REVOKE ALL ON FUNCTION public.gumroad_checkout_code(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_checkout_code(uuid, text, text) TO service_role;

-- Discount codes nobody used within 2 days: the function removes them from Gumroad.
CREATE OR REPLACE FUNCTION public.gumroad_checkout_stale(p_limit integer DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'offer_code_id', offer_code_id)), '[]'::jsonb) FROM (
    SELECT id, offer_code_id FROM public.gumroad_checkouts
    WHERE used_at IS NULL AND offer_code_id IS NOT NULL AND code_deleted_at IS NULL AND created_at < now() - interval '2 days'
    ORDER BY created_at LIMIT greatest(1, least(coalesce(p_limit, 5), 20))
  ) t;
$$;
REVOKE ALL ON FUNCTION public.gumroad_checkout_stale(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_checkout_stale(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.gumroad_checkout_code_gone(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ UPDATE public.gumroad_checkouts SET code_deleted_at = now() WHERE id = p_id $$;
REVOKE ALL ON FUNCTION public.gumroad_checkout_code_gone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_checkout_code_gone(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The membership as Gumroad's API describes it → Pro on or off
-- ---------------------------------------------------------------------------
-- p: subscription_id (required), status, recurrence, email, last_sale_id,
--    last_paid_at (latest payment that was not refunded or disputed; absent =
--    nothing paid), cancel_at, ended_at, price_cents, card_country, test,
--    checkout_id (from the checkout link), claim_user (the signed-in person
--    asking "check my payment", when their verified email is the buyer's).
CREATE OR REPLACE FUNCTION public.gumroad_apply(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := nullif(btrim(p->>'subscription_id'), '');
  v_status text := coalesce(nullif(p->>'status', ''), 'alive');
  v_recurrence text := nullif(p->>'recurrence', '');
  v_email text := nullif(lower(btrim(p->>'email')), '');
  v_last_paid timestamptz := nullif(p->>'last_paid_at', '')::timestamptz;
  v_cancel_at timestamptz := nullif(p->>'cancel_at', '')::timestamptz;
  v_ended_at timestamptz := nullif(p->>'ended_at', '')::timestamptz;
  v_checkout uuid := CASE WHEN (p->>'checkout_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'checkout_id')::uuid END;
  v_claim uuid := nullif(p->>'claim_user', '')::uuid;
  v_alive boolean;
  v_period interval;
  v_paid_until timestamptz;
  v_until timestamptz;
  v_user uuid;
  v_priced text;
  v_is_new boolean;
  v_was_pro boolean := false;
  v_now_pro boolean := false;
  v_touch boolean := true;
  g public.gumroad_subscriptions;
  s public.subscriptions;
  c public.gumroad_checkouts;
  v_matches integer;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'subscription_id is required'; END IF;
  -- Gumroad can send two notifications about one membership at the same moment: one at a time.
  PERFORM pg_advisory_xact_lock(hashtextextended('gumroad:' || v_id, 0));
  v_alive := v_status IN ('alive', 'pending_cancellation', 'pending_failure', 'payment_method_update_required') AND v_ended_at IS NULL;

  SELECT * INTO g FROM public.gumroad_subscriptions WHERE subscription_id = v_id FOR UPDATE;
  v_is_new := NOT FOUND;
  v_recurrence := coalesce(v_recurrence, g.recurrence, 'monthly');
  -- A test purchase (the seller buying their own product) is not listed among
  -- Gumroad's payments afterwards: it keeps the date it was first seen with.
  IF v_last_paid IS NULL AND v_alive AND (g.test OR coalesce((p->>'test')::boolean, false)) THEN
    v_last_paid := coalesce(g.last_paid_at, now());
  END IF;
  v_period := CASE v_recurrence
    WHEN 'yearly' THEN interval '1 year'
    WHEN 'quarterly' THEN interval '3 months'
    WHEN 'biannually' THEN interval '6 months'
    WHEN 'every_two_years' THEN interval '2 years'
    ELSE interval '1 month' END;
  -- Nothing paid (or everything refunded): paid through now.
  v_paid_until := coalesce(v_last_paid + v_period, now());
  v_until := CASE
    WHEN NOT v_alive THEN least(v_paid_until, now())
    WHEN v_status = 'pending_cancellation' AND v_cancel_at IS NOT NULL THEN v_cancel_at
    WHEN v_last_paid IS NULL THEN now()
    ELSE v_paid_until + interval '3 days' END;

  -- Whose is it? Once matched it stays with that account.
  v_user := g.user_id;
  v_priced := g.priced_country;
  IF v_checkout IS NOT NULL THEN
    SELECT * INTO c FROM public.gumroad_checkouts WHERE id = v_checkout;
    IF FOUND THEN
      v_user := coalesce(v_user, c.user_id);
      v_priced := coalesce(v_priced, c.country);
      UPDATE public.gumroad_checkouts SET used_at = coalesce(used_at, now()), sale_id = coalesce(sale_id, p->>'last_sale_id') WHERE id = c.id;
    ELSE
      v_checkout := NULL;
    END IF;
  END IF;
  IF v_user IS NULL AND v_claim IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_claim) THEN
    v_user := v_claim;
  END IF;
  -- Bought on Gumroad directly: the account with that email, if the email is verified and it is the only one.
  IF v_user IS NULL AND v_email IS NOT NULL THEN
    SELECT count(*), (array_agg(u.id))[1] INTO v_matches, v_user
    FROM auth.users u JOIN public.profiles pr ON pr.id = u.id
    WHERE lower(u.email) = v_email AND pr.email_verified_at IS NOT NULL AND pr.verified_email = lower(u.email);
    IF v_matches <> 1 THEN v_user := NULL; END IF;
  END IF;

  INSERT INTO public.gumroad_subscriptions AS t
    (subscription_id, user_id, email, recurrence, status, last_sale_id, last_paid_at, paid_until, cancel_at, ended_at, price_cents, card_country, priced_country, checkout_id, test)
  VALUES
    (v_id, v_user, v_email, v_recurrence, v_status, nullif(p->>'last_sale_id', ''), v_last_paid, v_paid_until, v_cancel_at,
     CASE WHEN v_alive THEN NULL ELSE coalesce(v_ended_at, now()) END,
     nullif(p->>'price_cents', '')::integer, nullif(upper(left(coalesce(p->>'card_country', ''), 2)), ''), v_priced, v_checkout, coalesce((p->>'test')::boolean, false))
  ON CONFLICT (subscription_id) DO UPDATE SET
    user_id = coalesce(t.user_id, excluded.user_id),
    email = coalesce(excluded.email, t.email),
    recurrence = excluded.recurrence,
    status = excluded.status,
    last_sale_id = coalesce(excluded.last_sale_id, t.last_sale_id),
    last_paid_at = excluded.last_paid_at,
    paid_until = excluded.paid_until,
    cancel_at = excluded.cancel_at,
    ended_at = CASE WHEN v_alive THEN NULL ELSE coalesce(t.ended_at, excluded.ended_at) END,
    price_cents = coalesce(excluded.price_cents, t.price_cents),
    card_country = coalesce(excluded.card_country, t.card_country),
    priced_country = coalesce(t.priced_country, excluded.priced_country),
    checkout_id = coalesce(t.checkout_id, excluded.checkout_id),
    test = t.test OR excluded.test,
    updated_at = now()
  RETURNING * INTO g;

  IF v_user IS NULL THEN
    IF v_is_new AND v_alive THEN
      INSERT INTO public.notifications (audience, kind, title, body, link)
      VALUES ('admin', 'plan_paid', 'Pro paid, but no account matched',
              coalesce(v_email, 'A buyer') || ' paid on Gumroad without using the Get Pro button, and no MadeVisa account has that email verified. Pro switches on when they sign in with that email, verify it, and press Get Pro → "Check my payment".', '/admin?tab=plans');
    END IF;
    RETURN jsonb_build_object('linked', false, 'active', false, 'until', v_until, 'new', v_is_new);
  END IF;

  SELECT * INTO s FROM public.subscriptions WHERE user_id = v_user FOR UPDATE;
  IF FOUND THEN
    v_was_pro := s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now());
    -- A plan from somewhere else (set by an admin, or another membership) that runs longer stays as it is.
    IF v_was_pro AND (s.provider IS DISTINCT FROM 'gumroad' OR s.provider_ref IS DISTINCT FROM v_id)
       AND (s.current_period_end IS NULL OR s.current_period_end > v_until) THEN
      v_touch := false;
    END IF;
  END IF;

  IF v_touch THEN
    INSERT INTO public.subscriptions AS t (user_id, plan, status, started_at, current_period_end, note, provider, provider_ref, billing, cancel_at_period_end, updated_at)
    VALUES (v_user, 'pro', CASE WHEN v_until > now() THEN 'active' ELSE 'cancelled' END, now(), v_until, 'Gumroad ' || v_id, 'gumroad', v_id, v_recurrence,
            v_alive AND v_status = 'pending_cancellation', now())
    ON CONFLICT (user_id) DO UPDATE SET
      plan = 'pro',
      status = excluded.status,
      started_at = CASE WHEN v_was_pro THEN t.started_at ELSE now() END,
      current_period_end = excluded.current_period_end,
      note = excluded.note,
      provider = 'gumroad',
      provider_ref = v_id,
      billing = excluded.billing,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now();
    v_now_pro := v_until > now();
  ELSE
    v_now_pro := true;
  END IF;

  IF v_touch AND v_now_pro AND NOT v_was_pro THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_user, 'plan_active', 'Your MadeVisa Pro is active',
            'Full CV match reports on every job, 50 sponsorship documents a month, instant job alerts and full company data are unlocked. Thank you for supporting MadeVisa!', '/jobs');
  ELSIF v_touch AND v_was_pro AND NOT v_now_pro THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_user, 'plan_ended', 'Your MadeVisa Pro has ended',
            'Your account is back on the free plan. Your CV, matches and documents are all still here. You can start Pro again any time.', '/pricing');
  END IF;

  -- For the admin: a new paying member, and a price set for one country but paid from another.
  IF v_is_new AND v_alive THEN
    INSERT INTO public.notifications (audience, kind, title, body, link)
    VALUES ('admin', 'plan_paid', 'New Pro member' || CASE WHEN g.test THEN ' (test purchase)' ELSE '' END,
            concat_ws(' · ', coalesce(v_email, 'A buyer'), v_recurrence,
              CASE WHEN g.price_cents IS NOT NULL THEN '$' || trim(to_char(g.price_cents / 100.0, 'FM999990.00')) END,
              CASE WHEN g.card_country IS NOT NULL THEN 'paid from ' || g.card_country END),
            '/admin?tab=plans');
    IF g.priced_country IS NOT NULL AND g.card_country IS NOT NULL AND g.priced_country <> g.card_country THEN
      INSERT INTO public.notifications (audience, kind, title, body, link)
      VALUES ('admin', 'plan_price_check', 'Check this Pro price',
              coalesce(v_email, 'A buyer') || ' was given the price for ' || g.priced_country || ' but paid from ' || g.card_country || '. If that looks like a VPN discount, refund it in Gumroad; Pro then ends by itself.', '/admin?tab=plans');
    END IF;
  END IF;

  RETURN jsonb_build_object('linked', true, 'user_id', v_user, 'active', v_now_pro, 'until', v_until, 'new', v_is_new, 'kept_other_plan', NOT v_touch);
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_apply(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_apply(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. For the site
-- ---------------------------------------------------------------------------
-- Is card payment on? `connected` lets admins try the checkout before switching it on for everyone.
CREATE OR REPLACE FUNCTION public.gumroad_public()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', enabled AND product_id IS NOT NULL AND connected_at IS NOT NULL,
    'connected', product_id IS NOT NULL AND connected_at IS NOT NULL
  ) FROM public.gumroad_settings WHERE id;
$$;
REVOKE ALL ON FUNCTION public.gumroad_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gumroad_public() TO anon, authenticated, service_role;

-- Admin → Plans: the connection, members who pay by card, and what Gumroad sent lately.
CREATE OR REPLACE FUNCTION public.gumroad_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.gumroad_settings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.gumroad_settings WHERE id;
  RETURN jsonb_build_object(
    'enabled', s.enabled,
    'connected', s.product_id IS NOT NULL AND s.connected_at IS NOT NULL,
    'product_url', s.product_url,
    'product_name', s.product_name,
    'monthly_cents', s.monthly_cents,
    'yearly_cents', s.yearly_cents,
    'can_discount', s.can_discount,
    'hooks', jsonb_array_length(s.hooks),
    'connected_at', s.connected_at,
    'last_ping_at', s.last_ping_at,
    'last_error', s.last_error,
    -- Checkouts in the last 7 days, and how many where the server could not tell the buyer's country
    -- (those get the middle price). Many of them means country prices are not working.
    'checkouts_7d', (SELECT count(*) FROM public.gumroad_checkouts WHERE created_at > now() - interval '7 days'),
    'checkouts_unknown_7d', (SELECT count(*) FROM public.gumroad_checkouts WHERE created_at > now() - interval '7 days' AND country IS NULL),
    'members', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'updated_at') DESC) FROM (
        SELECT jsonb_build_object(
          'subscription_id', g.subscription_id, 'email', g.email, 'name', pr.full_name, 'linked', g.user_id IS NOT NULL,
          'recurrence', g.recurrence, 'status', g.status, 'price_cents', g.price_cents,
          'paid_until', g.paid_until, 'cancel_at', g.cancel_at, 'ended_at', g.ended_at,
          'card_country', g.card_country, 'priced_country', g.priced_country, 'test', g.test, 'updated_at', g.updated_at) AS x
        FROM public.gumroad_subscriptions g LEFT JOIN public.profiles pr ON pr.id = g.user_id
        ORDER BY g.updated_at DESC LIMIT 100) t), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'resource', e.resource, 'email', e.email, 'ok', e.ok, 'note', e.note) ORDER BY e.id DESC)
      FROM (SELECT * FROM public.gumroad_events ORDER BY id DESC LIMIT 25) e), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gumroad_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.gumroad_admin_enable(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_enabled AND NOT EXISTS (SELECT 1 FROM public.gumroad_settings WHERE id AND product_id IS NOT NULL AND connected_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Connect the Gumroad product first.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.gumroad_settings SET enabled = coalesce(p_enabled, false), updated_at = now() WHERE id;
  RETURN public.gumroad_admin();
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_admin_enable(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gumroad_admin_enable(boolean) TO authenticated;
