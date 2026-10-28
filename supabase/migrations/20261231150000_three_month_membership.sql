/*
# One membership: $2.99 for 3 months

Run AFTER 20261231140000_free_plan.sql. Safe to run more than once. Deletes nothing.

1. The membership (plan 'starter') costs 299 cents and is billed every 3 months.
   → In Gumroad, the membership product must have ONE tier with ONLY the
     "Every 3 months" (quarterly) price at $2.99. Then press Connect again in
     Admin → Plans → Card payments: it re-reads the price. Until then, checkout
     refuses to open (the price on MadeVisa must be the price Gumroad charges).
2. People already paying $2.29 a month keep their subscription as it is on Gumroad;
   their membership keeps working (renewals apply the period Gumroad reports).
3. The sign-up reminder email and the email templates that still say "$2.29 a month"
   now say "$2.99 for 3 months".
*/

SET lock_timeout = '5s';

-- The billing period column only allowed 'monthly'.
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_billing_interval_check;
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'quarterly'));

UPDATE public.billing_plans
SET name = 'Membership', price_amount = 299, billing_interval = 'quarterly', is_active = true, updated_at = now()
WHERE id = 'starter';

-- The reminder email's text lives inside its function: swap the price wording in place.
DO $$
DECLARE
  def text;
  fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'run_starter_reminders' LIMIT 1;
  IF def IS NULL OR position('$2.29' IN def) = 0 THEN RETURN; END IF;
  fixed := replace(replace(replace(def,
    '$2.29/month', '$2.99 for 3 months'),
    '$2.29 a month', '$2.99 for 3 months'),
    '$2.29', '$2.99 for 3 months');
  EXECUTE fixed;
END $$;

-- Email templates edited in Admin → Emails.
DO $$
BEGIN
  IF to_regclass('public.email_templates') IS NOT NULL THEN
    UPDATE public.email_templates SET
      subject = replace(replace(subject, '$2.29 a month', '$2.99 for 3 months'), '$2.29/month', '$2.99 for 3 months'),
      headline = replace(replace(headline, '$2.29 a month', '$2.99 for 3 months'), '$2.29/month', '$2.99 for 3 months'),
      body = replace(replace(body, '$2.29 a month', '$2.99 for 3 months'), '$2.29/month', '$2.99 for 3 months'),
      cta_label = replace(replace(cta_label, '$2.29/month', '$2.99'), '$2.29', '$2.99')
    WHERE subject LIKE '%$2.29%' OR headline LIKE '%$2.29%' OR body LIKE '%$2.29%' OR cta_label LIKE '%$2.29%';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
