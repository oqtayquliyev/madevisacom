# Outreach fix + 10 sender addresses (10 Oct 2026)

## Deploy
1. Supabase → SQL Editor → paste `supabase/migrations/20261217090000_outreach_senders.sql` → Run.
   (The `20261216…` file in this zip has the same fix inside, for a fresh install — you don't need to run it again.)
2. Copy `src/pages/admin/OutreachSection.tsx` into the project and push.

## The error "UPDATE requires a WHERE clause"
Supabase refuses an UPDATE without a WHERE when it comes from the website. Two outreach functions had one (the live job numbers used by every template, and saving Sending & limits), so template previews, tests and campaigns failed. Fixed.

## Senders (Admin → Outreach → Senders)
Ten addresses ready, each with its own name, daily limit (50 to start), reply-to (hello@madevisa.com), and switches for campaigns / Auto Apply series:
oqtay@, jobs@, careers@, autoapply@, matches@, team@, hello@, news@, updates@, visa@ — all @news.madevisa.com.
They start OFF. Verify news.madevisa.com in Resend (Domains → Add → DNS records in Cloudflare → Verify), then press "news.madevisa.com is verified — switch all on". Rename, change limits, add more or delete in the table.
A campaign sends from one sender or rotates between the switched-on ones; each stops at its own limit and the rest wait until the next day. The overall daily cap still applies on top.

## Add a contact
Contacts tab → "Add a contact": email (required), name, country, tags → Add contact. "Import many" is still there for lists.
The email field in Templates is only for sending a test to yourself — it never adds contacts.
