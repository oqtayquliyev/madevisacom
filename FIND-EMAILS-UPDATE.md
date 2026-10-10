# Find emails + no awkward names (10 Oct 2026)

## Deploy
1. Supabase → SQL Editor → paste `supabase/migrations/20261218090000_email_finder_and_names.sql` → Run. Safe to run twice.
2. Deploy the new function: `supabase functions deploy email-finder`
3. Copy `src/pages/admin/OutreachSection.tsx` into the project and push.
4. Do **not** run anything in `supabase/tests/` on the live project.

## Admin → Outreach → Find emails
One button, **Find emails**:
1. Adds recruiter / HR addresses written in live job ads on MadeVisa (with the person's name when the ad gives it).
2. Adds the contact address on company profiles (not MadeVisa's default address).
3. Reads company websites (homepage + contact, imprint, about, careers pages — up to 7 pages per site), companies with the most live jobs first. "Websites per click" sets how many (16 – 1,000). Stop any time. Each site is read again only after 60 days.

**Read other websites**: paste any list of websites (up to 200) and read them the same way.

What it picks up: `mailto:` links, plain addresses, "name [at] firm [dot] com" / "name(at)firm.com", and Cloudflare-protected addresses.
What it skips: no-reply, privacy / GDPR / legal / security inboxes, image file names, tracking services, MadeVisa's own addresses, and any site whose robots.txt asks robots to stay out.

New contacts get source `found: job ad` / `found: company profile` / `found: website`, tags **found-online**, **employer** (+ job-ad / company-profile / website), and the page they were found on. Unsubscribed or bounced addresses are never added back.

**Campaigns:** found addresses are only included when you pick one of their tags (e.g. `employer`), so the job-seeker emails never reach companies by accident. Pick the new template **For employers: hire from abroad** for them (the campaign form warns you otherwise). Their emails say the address is published as a business contact and have one-click unsubscribe; the job-seeker dashboard link is left out.

Before sending to them: cold business email is fine in some countries but needs prior consent in others (e.g. Germany). Start small, use a separate sender, and filter by country where you're unsure.

## Names in emails
`{{first_name}}` is only used when it's a real first name. "info", "HR Team", "Acme GmbH", "j.smith", an email address etc. count as unknown; "anna MÜLLER" → "Anna", "Dr. John Smith" → "John", "Lee, Ann" → "Ann". For `first.last@` addresses found online, the name is taken from the address (anna.mueller@ → Anna).

When the name is unknown, it's taken out of the sentence instead of being replaced with something odd:
- "{{first_name}}, 12 new jobs today" → "12 new jobs today"
- "Thanks, {{first_name}}!" → "Thanks!"
- "Good news, {{first_name}}: …" → "Good news: …"
- "Hi {{first_name}}," → "Hi there,"
- "{{first_name}}'s matches" → "Your matches"
- "for {{first_name}}" → "for you"

and the "Hi …," line at the top of the email is left out. Works in subject, preview text, headline, body and button. Templates now have a **Name known / Name unknown** preview switch.

## Files
New: `supabase/migrations/20261218090000_email_finder_and_names.sql`, `supabase/functions/email-finder/index.ts`, `supabase/functions/email-finder/finder.ts`, `supabase/functions/email-finder/__tests__/finder.test.ts`, `supabase/tests/email_finder.test.sql`, this file.
Changed: `src/pages/admin/OutreachSection.tsx`, `supabase/tests/outreach.test.sql` (7 templates now).

## Tested
All migrations on PostgreSQL 16 (new one run twice); `email_finder.test.sql` (names, rendering both ways, preview, collect from ads/profiles, website queue + save, unsubscribed stay unsubscribed, campaign audience rules, employer email) and `outreach.test.sql` pass. Website reader: unit tests and a run against a local test site (contact/careers pages followed, disguised addresses decoded, privacy inbox skipped, robots.txt respected). Typecheck and lint clean for the changed files; admin page rendered with test data at 1280 and 390 px. Not run against live Supabase or real company websites.
