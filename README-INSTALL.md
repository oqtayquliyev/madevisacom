# MadeVisa update: outreach + senders + email design (one package)

Contains every file from these updates, in their latest version:
- Outreach (campaigns, contacts, templates, Auto Apply series, /my dashboard, profile top menu)
- Senders fix (10 sender addresses, the "UPDATE requires a WHERE clause" fix, Add contact)
- Email design (real logo, MadeVisa icons, no emojis)

## Install
1. Copy everything inside `madevisacom/` into your project (same folders, overwrite).
2. Deploy the site (Vercel), so `madevisa.com/email/icons/...` exists.
3. In the Supabase SQL Editor, run in this order (skip any you already ran; each is safe to run again):
   1. supabase/migrations/20261216090000_outreach_campaigns.sql
   2. supabase/migrations/20261217090000_outreach_senders.sql
   3. supabase/migrations/20261217120000_email_design_icons.sql

`supabase/tests/` is for a scratch database only. Don't run it on the live one.
Details: OUTREACH-UPDATE.md, SENDERS-FIX-UPDATE.md, EMAIL-DESIGN-UPDATE.md.
