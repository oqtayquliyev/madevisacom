/*
# The membership is sold with the book: $27.40 for the book + 1 year (7 November 2026)

Run AFTER 20261231270000_admin_company_job_counts.sql. Safe to run more than once.

One Gumroad product (madevisa.gumroad.com/l/membership) with two versions:
  • "Book Only"                           $17     — the book, no membership
  • "Book + 1 Year MadeVisa Membership"   $27.40  — the book and one year of the membership

1. Plan 'starter' (the membership) costs 2740 cents, one payment.
2. A sale of the "Book + 1 Year" version is stored like before ("sale:<id>") with recurrence
   'yearly', so gumroad_apply gives one year of access (+3 days grace). "Book Only" sales grant
   nothing. Earlier $12.50 lifetime buyers keep access for good (their rows say 'once').

After running: Admin → Plans → Gumroad → connect https://madevisa.gumroad.com/l/membership.
The old lifetime product is remembered automatically, so its buyers keep their access.
*/

SET lock_timeout = '5s';

UPDATE public.billing_plans
SET name = 'Membership', price_amount = 2740, billing_interval = 'once', is_active = true, updated_at = now()
WHERE id = 'starter';

NOTIFY pgrst, 'reload schema';
