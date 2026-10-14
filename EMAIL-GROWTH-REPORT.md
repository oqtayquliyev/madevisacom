# MadeVisa email growth system: what changed

Migration `20261223090000_email_growth_system.sql`. Nothing in it sends email, changes sender limits or changes contacts' statuses.

## A. Audit (what was there)

- **Templates.** `email_templates` is what gets sent. Admins edit it directly in Admin → Templates (`admin_template_save`), with no record of MadeVisa's own version, so a migration couldn't tell an edited template from an untouched one.
- **Rendering.**
  - Autopilot emails use `mv_render_auto`; series and campaign emails use `mv_render_template`.
  - Both read the template from `email_templates`.
  - Name placeholders fall back cleanly when the name is unknown.
  - Any placeholder left unfilled is removed.
- **Sending.** `mv_send_outreach` queues to the outbox (`email_log`). The plain-text version and the List-Unsubscribe header were already in place.
- **Gaps found:**
  - No tracking of which template or variant an email was.
  - Resend's message id wasn't stored.
  - Bounces and spam complaints reported after Resend accepts an email were never received (no webhook).
  - Gmail's one-click unsubscribe (a POST request) had nothing to handle it on this single-page site.
  - The "visa jobs first" ordering put jobs with an unknown visa status first.
  - On `pricing#employers` links, the `s=` tracking parameter was added after the `#`, so it was lost.
- **Attribution.**
  - Vercel Analytics (`trackBilling`) records funnel events with no personal data.
  - Gumroad checkouts store `source`, and a checkout is marked paid (`used_at`) only after Gumroad's API confirms it. That is a reliable purchase signal, so it is reused here.
- **Segments.** Campaign audiences were limited to all, no CV, has CV, free and pro. The data for the new segments exists: `user_cvs`, `cv_checks`, `saved_jobs`, `job_applications`, `gumroad_checkouts`, `hiring_briefs`, and `plan_tier()`. What was missing was any record of "viewed CV match", so this change adds `user_milestones`.

## B. Templates

All 12 are rewritten (the full text is in the migration, in `email_template_library`):

- `auto_employer_1` and `auto_employer_2`
- `auto_seeker_1`, `auto_seeker_2` and `auto_seeker_3`
- `nurture_1`, `nurture_2` and `nurture_3`
- `promo_auto_apply`, `promo_cv`, `promo_employers` and `promo_fresh_jobs`

5 lifecycle templates are new:

- `life_no_cv`
- `life_cv_ready`
- `life_starter_upgrade`
- `life_pro_upgrade`
- `life_saved_jobs`

Each template's `meta` holds its target audience, conversion event, exclusions and A/B idea, and the Templates tab shows them.

Fixed claims:

- Registering is now required to upload a CV.
- The free plan is described as 3 matches, with the top one partly hidden.
- Full reports are described as Starter ($2.99) and Pro.
- Auto Apply is described as Pro only ($8.99): tailored CV and cover letter, sent where MadeVisa can submit, ready to send everywhere else.
- No "every day for a month", no "read first", and no promises of interviews or visas.

## C. Files

| File | What |
|---|---|
| `supabase/migrations/20261223090000_email_growth_system.sql` | Template library and safe update, backups and restore, variants, tracking, renderer fixes, attribution, milestones, Resend events, segments, contact classification, report, fair split of the daily cap |
| `supabase/functions/resend-webhook/core.ts`, `index.ts` | New: signature-checked Resend webhook |
| `src/lib/emailAttribution.ts` | New: reads `mc`/`mt` from email links, records the click, links it to the account after sign-in, notes milestones |
| `src/main.tsx`, `src/lib/auth.tsx` | Capture the click on arrival; link it to the account after sign-in |
| `src/pages/cv/CvMatchPage.tsx`, `src/pages/pricing/PricingPage.tsx`, `src/components/pro/UpgradePrompt.tsx` | Milestones: CV match viewed, pricing viewed, Pro prompt clicked |
| `src/pages/submit/SubmitJobPage.tsx`, `src/pages/alerts/UnsubscribePage.tsx` | Employer listing and unsubscribe credited to the email they came from |
| `middleware.ts` | One-click unsubscribe POST |
| `src/pages/admin/OutreachSection.tsx` | Results tab; MadeVisa version, restore and A/B editor on Templates; lifecycle audiences in Campaigns |
| `supabase/tests/email_growth.test.sql`, `src/lib/__tests__/emailGrowth.test.ts` | New tests |
| `supabase/tests/{outreach,email_finder,plans_billing,emails_auto_apply_service}.test.sql` | Expectations updated for the earlier changes (outbox, new copy, 20 documents on Starter, 3-day cooldown) |

## D. Segments

| Segment | Trigger (campaign → Accounts) | Goal | Left out | CTA | Conversion |
|---|---|---|---|---|---|
| Free, no CV | confirmed, free, no CV | CV upload | has a CV, paid plans | Upload my CV | CV uploaded |
| CV, matches not opened | CV uploaded, never opened CV match or checked a job match | Open CV match | anyone who opened CV match | See my matches | CV match viewed |
| Free preview seen | free, CV, opened CV match | Starter | Starter and Pro members | Compare Starter and Pro | Starter purchase |
| Starter with Pro intent | Starter, plus an unpaid Pro checkout or a Pro prompt click in the last 30 days, or 15+ documents used this month | Pro | Pro members, Free users | See what Pro adds | Pro purchase |
| Saved, no application | saved jobs; no new save or application in 14 days | Return to the shortlist | recent activity | Open my saved jobs | click, then application |
| Employer listing published | **not built**, see G | | | | |

Every segment also leaves out:

- unconfirmed accounts;
- News and tips or all emails off;
- unsubscribed, bounced or complained addresses;
- anyone emailed by a campaign, the series or the autopilot in the last 3 days (new global cooldown);
- the campaign's skip window.

None of these segments sends by itself: an admin picks the template and audience in Campaigns.

## E. Experiments

All 7 are written as variant B and switched off. Each person always gets the same variant. Each test changes one thing: the hook (subject, preheader and headline), or for `nurture_3` the order of the body.

1. `nurture_3`: full Pro value vs Auto Apply first. Measure Pro purchases.
2. `nurture_1`: simple workflow vs control and transparency. Measure Pro checkouts and purchases.
3. `promo_cv`: job inventory vs the CV matching benefit. Measure sign-ups and CV uploads.
4. `auto_seeker_2`: curiosity vs practical fit. Measure sign-ups and CV uploads.
5. `auto_seeker_1`: role inventory vs visa transparency. Measure clicks, then sign-ups.
6. `auto_employer_1`: convenience vs international candidates. Measure listings.
7. `auto_employer_2`: 30-day placement vs social exposure. Measure sponsored requests.

Judge results in the Results tab on clicks, sign-ups, CV uploads and purchases. Keep unsubscribes and complaints no higher than variant A. Never pick a winner on opens (they aren't tracked). Rows with fewer than 200 sent or 20 clicks are marked "small sample".

## F. Measurement

**Tracked right away, after the migration and a deploy:**

- sent and accepted;
- unique clicks;
- landing page (path only);
- confirmed sign-ups;
- CV uploads;
- CV match viewed;
- checkouts started;
- Starter and Pro purchases confirmed by Gumroad, with revenue;
- revenue per delivered email;
- still active now;
- unsubscribes per email;
- employer listings submitted.

Cold and lifecycle email are reported separately. Each conversion is credited once, to the last email clicked within 30 days before it.

**Needs the Resend webhook:**

- delivered;
- bounces reported after Resend accepted the email;
- complaints;
- Resend's own click events.

**Not measurable yet:**

- Sponsored listing and social add-on purchases: they are billed manually, so only the listing request is tracked.
- Renewals and cancellations per email: retention is shown only as "still active now".
- Incremental lift: it needs a hold-out group, not built.

## G. Dependencies

- **Employer "listing approved" email.** Listing requests are handled manually (`listing_requests.status`), and an approved request isn't linked to the job that gets published. Smallest fix: link `listing_requests` to `sponsored_jobs`, then send a confirmation when the job goes live.
- **"Free preview viewed".** Only counted from this deploy on, so the segment starts empty.
- **Sponsored listing purchases.** Need a payment record (for example a Gumroad product) before they can be attributed.
- **Open-rate tests.** Not supported by design.

## H. Tests

- **New SQL suite:** `email_growth.test.sql`, **92 checks passed**. It covers:
  - templates replaced only when untouched, edits kept, use and restore;
  - every placeholder resolved for known and unknown names, empty roles and zero results;
  - singular and plural counts, encoded links, parameters before the `#`;
  - HTML and text versions agreeing;
  - variants assigned stably;
  - tokens: refused when unknown or malformed, never on test sends;
  - clicks and events recorded once;
  - a full funnel with each step credited once, and unrelated purchases not credited;
  - provider events: duplicate, soft and hard bounces, complaints, autopilot pause;
  - all segments and their exclusions;
  - contact classification and import;
  - milestones;
  - the fair split of the daily cap.
- **Existing suites, run on a database with all 120 migrations:**
  - email_finder 41, outreach 49, plans_billing 114, emails_auto_apply_service 43: all passing.
  - `auto_apply.test.sql` fails at line 202 (permission denied for table application_reports) on the original code too, before any of these changes.
- **TypeScript:** 6 of 6 checks pass for the webhook signatures and link helpers, run with Node because vitest can't start in this environment (a native rollup module is missing). tsc and eslint are clean.
- **Not tested here:**
  - real Gmail, Outlook or Resend delivery;
  - the admin screens in a browser (this environment can't run the dev server);
  - the deployed middleware.

## I. Launch checklist

1. Run the migration. Check the notice for kept templates, then look in Admin → Templates for "A newer MadeVisa version is available".
2. Deploy the site; this includes the middleware and the click capture.
3. Deploy `resend-webhook`, set `RESEND_WEBHOOK_SECRET`, and add the endpoint in Resend with the delivered, bounced, complained and clicked events.
4. Raise the daily cap in Sending & limits to what your Resend plan allows. At 100 it caps the 16 addresses, which are now shared fairly.
5. Send a test of each new template to yourself.
6. Start one A/B test at a time, `nurture_3` first, and wait for the "small sample" flag to clear.
7. Before cold outreach in each country, confirm you have a lawful basis to email those contacts.
