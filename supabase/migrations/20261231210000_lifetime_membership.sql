/*
# The membership becomes a one-time payment: $12.50 for lifetime access (launch offer)

Run AFTER 20261231200000_hr_contacts_members_only.sql. Safe to run more than once.

1. Plan 'starter' (the membership) costs 1250 cents, billed 'once'.
2. A one-time purchase is stored like a membership with the id "sale:<Gumroad sale id>"
   and access for good (100 years). A refund or chargeback switches it off.
3. gumroad_settings.previous_product_ids: when the membership's product is replaced
   (the 3-month membership → the one-time product), the old product is remembered so the
   people who bought it keep the membership and their renewals still count.
4. membership_places_left(): how many of the first 200 launch places are left — counted from
   real one-time purchases (not test, not refunded). The pricing card shows it.
5. The "your membership is active" notification no longer names Starter/Pro or old quotas.
*/

SET lock_timeout = '5s';

-- 1. Price and billing
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_billing_interval_check;
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'quarterly', 'once'));

UPDATE public.billing_plans
SET name = 'Membership', price_amount = 1250, billing_interval = 'once', is_active = true, updated_at = now()
WHERE id = 'starter';

-- 3. Earlier products of the membership
ALTER TABLE public.gumroad_settings ADD COLUMN IF NOT EXISTS previous_product_ids text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.gumroad_keep_previous_product(p_product text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.gumroad_settings
  SET previous_product_ids = array_append(previous_product_ids, p_product), updated_at = now()
  WHERE id AND nullif(btrim(p_product), '') IS NOT NULL AND NOT (p_product = ANY (previous_product_ids));
$$;
REVOKE ALL ON FUNCTION public.gumroad_keep_previous_product(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_keep_previous_product(text) TO service_role;

-- 2 + 5. gumroad_apply: 'once' = for good; plain wording in the notifications.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.gumroad_apply(jsonb)'::regprocedure) INTO def;
  IF position('WHEN ''once'' THEN' IN def) = 0 THEN
    def := replace(def, 'WHEN ''yearly'' THEN interval ''1 year''', 'WHEN ''once'' THEN interval ''100 years''
    WHEN ''yearly'' THEN interval ''1 year''');
  END IF;
  def := replace(def, '''Your MadeVisa '' || initcap(v_after) || '' is active''', '''Your MadeVisa Membership is active''');
  def := replace(def, '''Full CV match reports on every job, 10 sponsorship documents a month, up to 5 job alerts and sponsorship insights are unlocked. Thank you for supporting MadeVisa!''',
                      '''Apply to every job, CV tailoring on every job, unlimited sponsorship documents, recruiter contacts and job alerts are unlocked. Thank you for supporting MadeVisa!''');
  def := replace(def, '''Your MadeVisa '' || initcap(v_before) || '' has ended''', '''Your MadeVisa Membership has ended''');
  EXECUTE def;
END $$;

-- 4. The launch offer's places left (first 200 one-time buyers)
CREATE OR REPLACE FUNCTION public.membership_places_left()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, 200 - (
    SELECT count(*)::integer FROM public.gumroad_subscriptions
    WHERE subscription_id LIKE 'sale:%' AND NOT coalesce(test, false) AND ended_at IS NULL
  ));
$$;
REVOKE ALL ON FUNCTION public.membership_places_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_places_left() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
