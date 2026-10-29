/*
# Membership: unlimited sponsorship documents

Run AFTER 20261231170000_notifications_offer_contact.sql. Safe to run more than once.

The membership's sponsorship documents go from 20 a month to unlimited. Stored as a
monthly limit of 999 (the site shows "Unlimited"); the fair-use rule of at most 30
documents in any 7 days still applies, as before.
*/

UPDATE public.plan_entitlements SET allowed = true, usage_limit = 999
WHERE plan_id = 'starter' AND feature IN ('sponsorship_documents');

-- The retired plan, for the few still on it: never less than the membership.
UPDATE public.plan_entitlements SET allowed = true, usage_limit = 999
WHERE plan_id = 'pro' AND feature IN ('sponsorship_documents');

NOTIFY pgrst, 'reload schema';
