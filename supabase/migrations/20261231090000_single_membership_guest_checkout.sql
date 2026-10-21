/*
# One plan: MadeVisa Membership ($2.29 / month), bought with or without an account

Run AFTER 20261230090000_cv_quiz_events.sql. Paste the whole file once in the
Supabase SQL Editor. Safe to run more than once. Deletes nothing.

## What changes
1. PLANS. The membership is the plan stored as 'starter' (so existing members,
   checkouts and entitlements keep working), renamed "Membership" and priced
   $2.29 a month. 'pro' is no longer sold (is_active = false): people who still
   have it keep it, and it still counts as paid everywhere.
   → Set the Gumroad product connected to Starter to ONE tier at $2.29 monthly
     (Admin → Plans → Card payments → Connect again). Until Gumroad's price is
     $2.29, the checkout refuses to start, so nobody is charged a price the
     site doesn't show.

2. GUEST CHECKOUT. Anyone can open the Gumroad checkout without a MadeVisa
   account (the gumroad function's 'guest_checkout' action returns the product
   link). When Gumroad confirms the payment:
     • an account that already has that email (verified on MadeVisa, or signed
       in with Google) gets the membership;
     • no account with that email → the gumroad function creates one
       (Supabase Auth, sign-in by email code) and links the membership to it;
     • an existing account whose email was never verified is NOT linked
       automatically (anyone can type any email at sign-up). Admins get the
       usual "paid, but no account matched" notice and the person can verify
       their email and press "Check my payment".
   gumroad_buyer_account() answers which of these applies.

3. EMAILS, sent automatically, editable in Admin → Emails → Templates:
     member_account  "Your MadeVisa account is ready" — only when the account
                     was just created for a Gumroad purchase.
     member_welcome  "You now have access to every job" — whenever a person
                     goes from free to a paid plan.
   member_emails(user, kind, ref) renders and queues them (once per person and
   membership; the email log in Admin → Emails shows them, kind = membership).

4. NOTIFICATION WORDING. In-app plan notices say "MadeVisa Membership" instead
   of "Starter" (a small trigger rewrites them as they are written).

5. The sign-up reminder email (run_starter_reminders) sells the membership at $2.29.

6. Auto Apply is removed from the site: its two scheduled jobs are stopped.
   Its tables and functions stay (nothing is deleted); the `apply` edge function
   and the worker can be undeployed.
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. Plans
-- ===========================================================================
UPDATE public.billing_plans SET name = 'Membership', price_amount = 229, is_active = true, updated_at = now() WHERE id = 'starter';
UPDATE public.billing_plans SET is_active = false, updated_at = now() WHERE id = 'pro';

-- Same numbers as supabase/functions/_shared/plans.ts (membership = 'starter').
UPDATE public.plan_entitlements SET allowed = true, usage_limit = 20
WHERE plan_id = 'starter' AND feature IN ('sponsorship_documents');

-- ===========================================================================
-- 2. Who does a Gumroad buyer's email belong to?
-- ===========================================================================
-- state: 'linked'     the membership already belongs to an account (user_id)
--        'match'      exactly one account has this email and it is trusted
--                     (verified on MadeVisa, or a Google sign-in with this email)
--        'unverified' one account has it, never verified: not linked automatically
--        'many'       more than one account has it: not linked automatically
--        'none'       no account has it: the function may create one
CREATE OR REPLACE FUNCTION public.gumroad_buyer_account(p_email text, p_subscription text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mail text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_owner uuid;
  v_n integer;
  v_id uuid;
  v_ok boolean;
BEGIN
  IF p_subscription IS NOT NULL THEN
    SELECT user_id INTO v_owner FROM public.gumroad_subscriptions WHERE subscription_id = p_subscription;
    IF v_owner IS NOT NULL THEN RETURN jsonb_build_object('state', 'linked', 'user_id', v_owner); END IF;
  END IF;
  IF v_mail IS NULL OR v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN jsonb_build_object('state', 'no_email'); END IF;

  SELECT count(*), (array_agg(u.id))[1] INTO v_n, v_id FROM auth.users u WHERE lower(u.email) = v_mail;
  IF v_n = 0 THEN RETURN jsonb_build_object('state', 'none'); END IF;
  IF v_n > 1 THEN RETURN jsonb_build_object('state', 'many'); END IF;

  v_ok := EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_id AND pr.email_verified_at IS NOT NULL AND pr.verified_email = v_mail)
       OR EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = v_id AND i.provider = 'google' AND lower(i.identity_data->>'email') = v_mail);
  RETURN jsonb_build_object('state', CASE WHEN v_ok THEN 'match' ELSE 'unverified' END, 'user_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_buyer_account(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_buyer_account(text, text) TO service_role;

-- ===========================================================================
-- 3. Membership emails (templates editable in Admin → Emails → Templates)
-- ===========================================================================
INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats) VALUES
('member_account', 'Membership · your account is ready (after a Gumroad purchase)', 'accounts',
 $s$Your MadeVisa account is ready$s$,
 $s$We created it with the email you used to pay. Sign in with a one-time code — no password needed.$s$,
 'Membership',
 $s$Your MadeVisa account is ready$s$,
 $b$Thank you for joining MadeVisa. You paid on Gumroad without a MadeVisa account, so we created one for you with **this email address**, and your membership is already on it.

- [mail] Go to madevisa.com/login and enter this email address
- [check] We send you a one-time sign-in code: no password to remember
- [user] Add your name and CV once you are in, so CV match works on every job

Didn't buy a MadeVisa membership? Reply to this email and we'll sort it out.$b$,
 'Sign in to MadeVisa', 'https://madevisa.com/login?s=member', false),

('member_welcome', 'Membership · welcome, you now have access to every job', 'accounts',
 $s${{first_name}}, you now have access to every job on MadeVisa$s$,
 $s$Apply to any job, see your CV match on each one, and find employers that sponsor visas.$s$,
 'Membership',
 $s$Welcome to MadeVisa Membership$s$,
 $b$Your membership is active. Everything below is unlocked on your account now:

- [briefcase] Apply to every job: **{{jobs_live}} live jobs** straight from company career pages
- [globe] Remote and online job listings, marked on every job
- [target] CV match for every job, with personalised suggestions for your CV
- [plane] Companies that sponsor work visas, and 20 sponsorship documents a month

Your membership renews monthly on Gumroad, and you can cancel any time from your Gumroad receipt or Settings → Billing.$b$,
 'Browse jobs', 'https://madevisa.com/jobs?s=member', true)
ON CONFLICT (key) DO NOTHING;

-- Keep the template library in step, so Admin → Templates shows them as MadeVisa's own versions.
DO $$
BEGIN
  IF to_regclass('public.email_template_library') IS NOT NULL THEN
    INSERT INTO public.email_template_library (key, version, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats, replaces, meta)
    SELECT t.key, 1, t.name, t.audience, t.subject, t.preheader, t.eyebrow, t.headline, t.body, t.cta_label, t.cta_url, t.show_stats, '{}'::text[],
           CASE t.key
             WHEN 'member_account' THEN jsonb_build_object('goal', 'First sign-in after a guest purchase', 'audience', 'Accounts created for a Gumroad buyer', 'conversion', 'Sign-in', 'exclusions', 'Sent once per account and membership')
             ELSE jsonb_build_object('goal', 'Members use what they paid for', 'audience', 'Anyone going from free to a paid plan', 'conversion', 'Job opened, CV uploaded', 'exclusions', 'Sent once per person and membership')
           END
    FROM public.email_templates t
    WHERE t.key IN ('member_account', 'member_welcome')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- Renders and queues one membership email. p_kind: 'account' | 'welcome'. Once per person, kind and p_ref (the membership).
CREATE OR REPLACE FUNCTION public.member_emails(p_user uuid, p_kind text, p_ref text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mail text;
  v_key text := CASE p_kind WHEN 'account' THEN 'member_account' WHEN 'welcome' THEN 'member_welcome' END;
  v_idem text;
  r jsonb;
BEGIN
  IF p_user IS NULL OR v_key IS NULL THEN RETURN false; END IF;
  SELECT email INTO v_mail FROM auth.users WHERE id = p_user;
  IF coalesce(v_mail, '') = '' OR NOT EXISTS (SELECT 1 FROM public.email_templates WHERE key = v_key) THEN RETURN false; END IF;
  v_idem := left('member:' || p_kind || ':' || p_user::text || ':' || coalesce(p_ref, ''), 240);
  IF EXISTS (SELECT 1 FROM public.email_log WHERE idem = v_idem AND status IN ('queued', 'sent')) THEN RETURN false; END IF;
  r := public.mv_render_template(v_key, v_mail, NULL, p_user, NULL, NULL);
  RETURN public.mv_send_email(v_mail, r->>'subject', r->>'html', r->>'text', 'membership', p_user, NULL, v_idem);
END;
$$;
REVOKE ALL ON FUNCTION public.member_emails(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_emails(uuid, text, text) TO service_role;

-- ===========================================================================
-- 4. In-app plan notices name the membership
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mv_membership_wording()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind IN ('plan_active', 'plan_changed', 'plan_ended', 'plan_payment_issue', 'plan_paid') THEN
    NEW.title := replace(replace(NEW.title, 'MadeVisa Starter', 'MadeVisa Membership'), 'Starter', 'Membership');
    IF NEW.kind = 'plan_active' AND NEW.title ILIKE '%Membership%' THEN
      NEW.body := 'You now have access to every job: apply on any job page, see your CV match and suggestions on each one, find companies that sponsor visas, and make up to 20 sponsorship documents a month. Thank you for joining MadeVisa!';
    ELSE
      NEW.body := replace(NEW.body, 'Starter', 'Membership');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mv_membership_wording ON public.notifications;
CREATE TRIGGER mv_membership_wording BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.mv_membership_wording();

-- ===========================================================================
-- 5. The "your matches are waiting" email after sign-up: the membership, $2.29
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.run_starter_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  u record;
  fname text;
  n_matches integer;
  body text;
  sent integer := 0;
BEGIN
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = '' THEN RETURN 0; END IF;
  FOR u IN
    SELECT au.id, au.email, pr.full_name,
      EXISTS (SELECT 1 FROM public.user_cvs c WHERE c.user_id = au.id) AS has_cv
    FROM auth.users au
    LEFT JOIN public.profiles pr ON pr.id = au.id
    WHERE au.email_confirmed_at IS NOT NULL AND au.email IS NOT NULL AND au.deleted_at IS NULL
      AND au.created_at <= now() - interval '6 hours' AND au.created_at > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.email_log l WHERE l.user_id = au.id AND l.kind = 'starter_reminder')
    ORDER BY au.created_at
    LIMIT 40
  LOOP
    CONTINUE WHEN public.plan_tier(u.id) <> 'free';
    CONTINUE WHEN NOT public.email_allowed(u.id, 'news') OR public.mv_job_emailed_today(u.id);
    fname := nullif(split_part(btrim(coalesce(u.full_name, '')), ' ', 1), '');
    n_matches := 0;
    IF u.has_cv THEN
      BEGIN
        SELECT count(*) INTO n_matches FROM public.for_you_matches(u.id, now() - interval '14 days', 60);
      EXCEPTION WHEN OTHERS THEN n_matches := 0;
      END;
    END IF;
    body := '<p style="margin:0;font-size:15px;line-height:1.6;color:#334155">'
      || CASE WHEN n_matches > 0
           THEN 'We found <b style="color:#0f172a">' || n_matches || ' jobs</b> that match your CV. Browsing is free; '
           ELSE 'Upload your CV and MadeVisa ranks every job for you. Browsing is free; ' END
      || '<b style="color:#0f172a">the MadeVisa Membership lets you apply to every job</b>, with your CV match and suggestions on each one, remote and online listings, and the companies that sponsor visas.</p>'
      || '<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#334155">The membership is <b style="color:#0f172a">$2.29 a month</b>. Cancel anytime.</p>';
    PERFORM public.mv_send_email(
      u.email,
      CASE WHEN fname IS NOT NULL THEN fname || ', your best job matches are waiting' ELSE 'Your best job matches are waiting' END,
      public.mv_email_html(
        'Apply to every job for $2.29 a month.', 'MadeVisa Membership',
        'Apply to the jobs that match you',
        'Hi ' || mv_esc(coalesce(fname, 'there')) || ', thanks for joining MadeVisa.',
        body, 'Get started for $2.29/month', 'https://madevisa.com/pricing?s=st6h',
        'You get this once, because you signed up for MadeVisa today.', public.mv_unsub_url(u.id, 'news'), public.mv_unsub_url(u.id, 'all')),
      'Hi ' || coalesce(fname, 'there') || E',\n\n'
        || CASE WHEN n_matches > 0 THEN 'We found ' || n_matches || ' jobs that match your CV. ' ELSE '' END
        || 'The MadeVisa Membership lets you apply to every job, with your CV match on each one, for $2.29 a month.'
        || E'\n\nGet started: https://madevisa.com/pricing?s=st6h',
      'starter_reminder', u.id, public.mv_unsub_url(u.id, 'news'), 'madevisa-st6h-' || u.id);
    sent := sent + 1;
  END LOOP;
  RETURN sent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'run_starter_reminders: %', SQLERRM;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_starter_reminders() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 6. Auto Apply is gone from the site: stop its scheduled jobs (its data stays)
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('madevisa-auto-apply-expire', 'madevisa-auto-apply-series');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
