# Email for MadeVisa: what to set up, and outreach

## 1. What sends email, and from where

| Email | Sent by | Goes to | From |
|---|---|---|---|
| Sign-in codes, confirmations | Supabase Auth (through Resend SMTP, step 4) | the person | `MadeVisa <hello@mail.madevisa.com>` |
| Job alerts, monthly visa report, plan requests | the database (`app_secrets` → Resend API) | the person / you | same |
| "Your applications are out" summary | the database, when a batch finishes | the person | same |
| Applications to employers who take them through MadeVisa | the application worker (Resend API) | the employer's address | same, **Reply-To = the candidate** |
| Applications on employers' careers sites | the application worker types the **candidate's own email** into the form | — | — |

The last row is the important one: **applications need no email connection at all.** The worker fills the form with the candidate's email address, so employers reply to the candidate and their confirmation emails land in the candidate's inbox. MadeVisa never sends from, or reads, a candidate's mailbox.

## 2. Addresses to have

Real inboxes (Google Workspace or Zoho Mail on `madevisa.com`):
- **hello@madevisa.com** — public contact; already used all over the site and as the admin notification address.
- **oqtay@madevisa.com** — you, for partners and employers who reply to you personally.

Aliases into hello@ (no extra cost):
- **support@** — people's questions about their applications.
- **privacy@** — data requests (worth listing in the Privacy Policy).
- **security@** — already referenced in `/.well-known/security.txt`.
- **employers@** — employers asking to receive applications through MadeVisa.
- **dmarc@** — DMARC reports (step 3).

Sending only (no inbox needed): **hello@mail.madevisa.com** as the From for everything the site sends. Replies go to hello@madevisa.com via Reply-To.

## 3. Connect Resend (about 15 minutes)

You already have a Resend account. Use a **subdomain** for sending (`mail.madevisa.com`), so the site's mail can never hurt the reputation of your main inbox domain — and the other way round.

1. Resend → **Domains → Add domain** → `mail.madevisa.com`, region EU (Ireland) or US — pick one and keep it.
2. Resend shows 3 records. Add them exactly as shown in your DNS (Cloudflare → madevisa.com → DNS → Records):
   - **MX** `send.mail` → `feedback-smtp.<region>.amazonses.com`, priority 10 (bounces)
   - **TXT** `send.mail` → `v=spf1 include:amazonses.com ~all` (SPF)
   - **TXT** `resend._domainkey.mail` → the long `p=…` key (DKIM)
   Copy names and values from Resend, not from here: they include your region and key.
3. Add DMARC for the main domain, if there isn't one yet: **TXT** `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@madevisa.com`. After 2–4 weeks of clean reports, tighten to `p=quarantine`.
4. Back in Resend → **Verify**. Usually a few minutes.
5. Resend → **API Keys → Create** → permission *Sending access*, domain `mail.madevisa.com`. Copy it once.
6. Supabase → SQL Editor:
   ```sql
   INSERT INTO public.app_secrets (name, value) VALUES
     ('resend_api_key', 're_…'),
     ('email_from', 'MadeVisa <hello@mail.madevisa.com>')
   ON CONFLICT (name) DO UPDATE SET value = excluded.value;
   ```
   Job alerts, the batch summary and the email channel all start working with this.
7. Supabase → **Authentication → SMTP settings** (under *Emails* or *Settings*, depending on your dashboard version) → **Enable custom SMTP**:
   host `smtp.resend.com` · port `465` · username `resend` · password = the API key · sender `hello@mail.madevisa.com`, name `MadeVisa`. Then raise the email rate limit under **Authentication → Rate Limits**. Supabase's built-in mail is only meant for testing, so sign-in codes to real users depend on this step.
8. Test: sign in with a fresh address, and send yourself a test email from Resend's dashboard. Check Gmail → *Show original*: SPF, DKIM and DMARC should all say **PASS**.

Free Resend covers 3,000 emails a month (100 a day). Move to the paid plan before the daily cap bites — a busy job-alert morning can pass 100.

## 4. Outreach

**Not through Resend, and not from madevisa.com.** Resend's Acceptable Use Policy forbids "cold outreach, purchased lists, or scraped contact data" — it would get the account that sends your sign-in codes suspended. Keep cold email completely separate:

- A second domain that redirects to madevisa.com, e.g. `trymadevisa.com` or `madevisa.co`.
- 2–3 Google Workspace mailboxes on it with real names (`oqtay@trymadevisa.com`), each with SPF, DKIM and DMARC.
- Warm them up for 2–3 weeks; then at most 30–40 new emails a day per mailbox.
- A sending tool built for this (Instantly, Smartlead or lemlist), or simply Gmail and a spreadsheet for the first 100.
- Plain text, one link at most, a real signature, and one line to opt out — honoured the same day. Keep bounces under 2% (verify addresses first) and spam complaints well under 0.3%.

**Who to contact — employers, not candidates.** Cold-emailing job seekers is spam and hurts trust; reach them through content, social, SEO and communities, and email them only after they sign up. Employers and partners, in order of value:

1. **Companies already on MadeVisa that sponsor visas** (the UK register data is already in the database). Offer: *receive applications through MadeVisa* — pre-screened, tailored CVs from candidates who need sponsorship, free. Every "yes" turns on the email channel for their jobs (Admin → job → *Applications through MadeVisa*), which also means fully automatic applications for your users.
2. **Recruitment agencies placing international talent** — same offer, plus sponsored listings.
3. **University careers offices and bootcamps with international students** — a partnership: their students get CV Match and Auto Apply, you get candidates.
4. **Immigration lawyers and relocation firms** — referrals both ways (fits the Visa Plan).

A first email that tends to get replies (B2B, short, specific):

> Subject: Applicants for your Data Analyst role in Berlin
>
> Hi Anna — MadeVisa lists your Data Analyst opening and our users who need visa sponsorship keep applying to it. We could send you those applications directly instead: one email per candidate, a CV tailored to your ad, and their answers on sponsorship and notice period up front. Free for employers.
>
> Want me to switch it on for this role?
>
> Oqtay Quliyev, MadeVisa · madevisa.com
> (Reply "no" and I won't write again.)

Then one follow-up after 4–5 days, and stop.

**Email your own users (with Resend — they signed up).** The highest-value messages: a welcome that gets the CV uploaded; "16 new jobs match your CV this week"; "Your applications are out"; a nudge after 14 quiet days; the monthly visa report. Each with an unsubscribe link.

B2B cold email in the EU and UK generally rests on legitimate interest, with a clear sender and an easy opt-out; rules differ by country. I'm not a lawyer — check before scaling up.
