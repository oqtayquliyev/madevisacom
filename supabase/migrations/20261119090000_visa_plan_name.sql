/*
# "Sponsorship offer" → "Visa Plan"
Run AFTER 20261118090000_telegram_channels.sql. Safe to run more than once.

Several older database functions write notifications that say "sponsor
offer" / "Sponsorship offer". Instead of copying those long functions just
to change wording, one small trigger rewrites the old name in every new
notification. Unread notifications already sent are updated too.

Only the product name changes. Real job offers ("You got an offer") are
untouched: the rule matches "sponsor offer" / "sponsorship offer" and
"your offer" only.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.visa_plan_wording(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(coalesce(p, ''), '\msponsor(ship)? offer(s?)\M', 'Visa Plan\2', 'gi'),
         '\myour offer\M', 'your Visa Plan', 'gi');
$$;

CREATE OR REPLACE FUNCTION public.notifications_visa_plan_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title ~* 'offer' THEN NEW.title := public.visa_plan_wording(NEW.title); END IF;
  IF NEW.body ~* 'offer' THEN NEW.body := public.visa_plan_wording(NEW.body); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_visa_plan_name ON public.notifications;
CREATE TRIGGER notifications_visa_plan_name
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_visa_plan_name();

-- Unread notifications already sent.
UPDATE public.notifications
SET title = public.visa_plan_wording(title), body = public.visa_plan_wording(body)
WHERE read_at IS NULL AND (title ~* 'sponsor(ship)? offer|your offer' OR body ~* 'sponsor(ship)? offer|your offer');

-- The campaign added in 20261117090000.
UPDATE public.social_campaigns SET name = 'No visa line? Send a Visa Plan' WHERE name = 'No visa line? Send an offer';
