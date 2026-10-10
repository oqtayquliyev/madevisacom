# MadeVisa: Outreach, Auto Apply email series, email dashboard, profile menu

Built 10 Oct 2026 on top of the previous update (migration `20261215090000` must already be run).

## Deploy
1. Supabase → SQL Editor → paste `supabase/migrations/20261216090000_outreach_campaigns.sql` → Run. Safe to run twice (template edits are kept).
2. Copy the files into the project (same folders) and push.
3. Do **not** run anything in `supabase/tests/` on the live project.

## Files
New: `supabase/migrations/20261216090000_outreach_campaigns.sql`, `supabase/tests/outreach.test.sql`, `src/pages/admin/OutreachSection.tsx`, `src/pages/my/MyDashboardPage.tsx`, this file.
Changed: `src/App.tsx` (route `/my`), `src/pages/admin/AdminPanelPage.tsx` (Outreach tab), `src/pages/admin/EmailsSection.tsx` (labels for campaign / series / test emails), `src/pages/profile/ProfilePage.tsx` (menu across the top).

## Admin → Outreach
- **Campaigns**: template + audience (imported contacts, accounts, or both; by tag, country, no CV / CV / free / Pro; skip anyone emailed in the last N days; max number) → live count and how many days it takes at your cap → send yourself a test → Start. Pause, resume, cancel. Progress: sent, waiting, refused, skipped, opened their dashboard, unsubscribed.
- **Contacts**: import by pasting or a CSV (email alone is enough; name and country used if present), up to 50,000 at a time; tags; search and filters; bulk tag / unsubscribe / resubscribe / delete. Unsubscribed and bounced addresses are never emailed by a campaign, and re-importing doesn't resubscribe them.
- **Templates**: 3 campaign emails (Upload your CV → CV Match · Auto Apply: hundreds of jobs, one click · Fresh jobs today) and 3 Auto Apply series emails. Edit subject, preview text, headline, body, button; live preview; send a test. Placeholders: `{{first_name}} {{jobs_live}} {{jobs_today}} {{jobs_visa}} {{matches}} {{cv_line}} {{country}}`.
- **Auto Apply series**: free accounts get 3 emails, 12 days apart (changeable), daily at 13:20 Baku. Stops on Pro, Auto Apply, unsubscribe or "News and tips" off; never within 3 days of a campaign email.
- **Sending & limits**: daily cap (all emails), reserve for site emails, emails per minute, pause everything.

The "X% more chance to be hired" line isn't in the templates: there's no measured number behind it yet, and an invented figure in a mass email is a consumer-protection risk. Once you have your own number (e.g. interview rate with vs without Auto Apply), add it in Templates.

## Sending thousands
1. Resend Pro ($20/month: 50,000 a month, no daily cap) or Scale. Then raise the daily cap in Sending & limits.
2. Separate sender for campaigns: add `news.madevisa.com` as a second domain in Resend, then
   `insert into public.app_secrets (name, value) values ('email_from_outreach', 'Oqtay from MadeVisa <oqtay@news.madevisa.com>') on conflict (name) do update set value = excluded.value;`
   Optional: `resend_api_key_outreach` for a separate Resend key.
3. Warm up a new domain: 50 → 200 → 500 → 1,000+ a day over 2–3 weeks.
4. Only people who agreed to hear from you. Bought or scraped lists get Resend accounts suspended; cold outreach to employers needs a separate domain and a cold-email tool.

## Email dashboard — /my?t=…
Linked from every campaign and series email; no sign-in. Live jobs, new in 24 h, visa sponsorship, jobs in their country. For accounts: CV, matching jobs, applications (Auto Apply / own / in queue), Auto Apply status, plan. Unsubscribe link at the bottom.

## Profile
Dashboard · Organizations · Settings is now one row across the top (blue band). On phones the section comes first, the profile card after it, with no gap under the menu.

## Tested
SQL: `outreach.test.sql` (import, audiences, templates, campaign sending with per-minute and daily caps, unsubscribe mid-campaign, series spacing and stop rules, dashboard) and the previous suite, on PostgreSQL 16 after all migrations; migration ran twice. Typecheck (only the old `facts.ts` error), lint, build. Pages rendered with test data at 1280 and 390 px. Not run against live Supabase or real Resend.
