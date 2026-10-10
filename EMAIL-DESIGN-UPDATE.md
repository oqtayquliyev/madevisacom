# Email design update: real logo, MadeVisa icons, no emojis

## Files (copy into your project, same folders)
- public/email/icons/*.png: 60 icon images in MadeVisa blue (deploy the site so they're live at madevisa.com/email/icons/…)
- supabase/migrations/20261217120000_email_design_icons.sql: run once in the Supabase SQL Editor (after 20261217090000)
- src/pages/admin/OutreachSection.tsx: the template editor has icon buttons that add a list line
- supabase/tests/outreach.test.sql: tests (scratch database only)

## Order
1. Deploy the site first (so the icon images exist), then 2. run the SQL.

## What changes
- Header: the real MadeVisa logo (madevisa.com/og-logo.png) replaces the text-and-plane mark.
- Lists: "- [target] text" shows an icon, "- 1. text" a blue numbered step, "- text" a check.
- Live-job numbers are cards with icons; the dashboard link has an icon.
- The 6 built-in templates are rewritten without emojis. Any emoji typed into a template, or
  anywhere else in an email, is removed when it's sent (subject, text and HTML).
- Icon names: target zap globe plane mail pause file bell sparkles chart clock check trending
  briefcase dashboard search send puzzle user rocket badge list calendar shield new star heart inbox award map
