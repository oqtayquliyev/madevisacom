# MadeVisa: Auto Apply, batch edition

Built 8 Oct 2026 on the project zip uploaded that day (migrations up to `20261204090000`).

## What changed, in one paragraph

**Apply to 16 jobs** no longer walks the person through one job at a time. MadeVisa now reads all 16 application forms first, works out what it already knows (account, CV, saved answers, things that follow from them), and shows **one** form: *"We checked all 16 applications. MadeVisa already has 92% of the information these applications need. 3 answers → 16 applications."* The person answers once, presses **Save answers & apply to 16 jobs**, and a new **application worker** — a small server with a real browser — opens each employer's careers page, fills in the form, attaches the tailored CV, submits it and keeps the proof. It runs in the background, so the person can leave the page. A job that can't be finished automatically (a sign-in, a CAPTCHA, a question only the person can answer) is marked **Needs attention**; the rest of the batch carries on. At the end: **"Your applications are out — 14 applications submitted, using oqtay@…"**.

## The one thing to know first

**The worker must be running, or nothing is submitted.** Until you deploy it, applications are prepared and wait as *Ready*, and the page says, honestly, *"MadeVisa's application service is offline right now — they will be submitted as soon as it is back."* Deploying it takes about 10 minutes: see `worker/README.md` (Railway, Fly.io or any Docker server; about $5–10 a month).

What it can and can't do:

| Employer's form | Result |
|---|---|
| Greenhouse, Lever, Ashby, and ordinary web forms on company careers pages | Filled and submitted automatically |
| Workday, iCIMS, SuccessFactors, Oracle, Taleo, Amazon | **Needs attention — needs a login.** These need the candidate's own account; MadeVisa never signs in as anyone. Everything is prepared for one visit. |
| Any site that shows a CAPTCHA | **Needs attention.** Never got round. |
| A question only the person can answer (an essay, an unusual choice) | **Needs attention**, with the question. The answer is saved, and every other application in the batch waiting on the same question goes too. |

"Submitted" is only shown when the employer's page confirmed it (we keep the confirmation text, a screenshot, and the exact CV file). If the worker pressed Submit but saw no confirmation, the application says so and asks the person to check their inbox — it is never retried blindly.

## Deploys (four)

1. **Database**: run `supabase/migrations/20261205090000_auto_apply_batch.sql` in the SQL Editor. One paste, one click. Safe to run twice. It converts applications from the old flow ("Needs your answer" / "Ready to send") into *Needs attention*, with a button to let MadeVisa submit them.
2. **Function**: `supabase functions deploy apply --no-verify-jwt` (new: reads the forms before anything is asked).
3. **Site**: copy the files and push, as usual. No new packages for the site.
4. **Worker**: `worker/README.md`. Two secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Try it safely first: `select apply_configure(p_auto_submit => false);` — the worker fills every form and presses nothing; each one ends as *Filled (test mode)* with a screenshot. Then `select apply_configure(p_auto_submit => true);`.

## The person's experience (what was built)

1. **CV Match page** — unchanged design. Under the matches: *Apply with MadeVisa · 16 recommended · 17 worth reviewing · 7 skipped · [Apply to 16 jobs] [Review matches] [Adjust preferences]* and *"MadeVisa checks every application and only asks you once when something is genuinely missing."* The preferences screen no longer has to be filled in before applying: recommended defaults are used (75% minimum, 20 a day, roles and countries from the CV and profile) and everything stays editable under *Adjust preferences*.
2. **Checking 16 applications…** while the forms are read (a few seconds).
3. **Ready to apply** — one form: coverage %, *N answers → M applications*, the questions (each says how many applications it's used for), an optional section for questions only one employer asks, the jobs that need a login, the email the applications use (changeable), *What MadeVisa will use* (every reused answer and where it came from), and the credits left.
4. **MadeVisa is applying for you — 7 of 16** — submitted / remaining / need attention, a progress bar, the current application with ✓ CV tailored ✓ Application completed ✓ Answers verified ✓ Submitted, Pause / Stop, and *"You can leave this page"* — shown **only** while a worker is actually online.
5. **Your applications are out — 14 applications submitted · Using you@email.com · 14 submitted · 2 need attention · 0 skipped** → *View applications* / *Find more jobs*. If different applications used different emails, it says so.
6. **Review application** (for one that needs attention): the reason in plain words, the question to answer (→ *Save answer & let MadeVisa apply*), *Let MadeVisa try again* where another try can help, and *Open the employer's page / I submitted it myself / Skip*, with the tailored CV and answers ready to copy.
7. **Receipt** (submitted): email used, when, how, the employer's confirmation number, what the employer's page said, the screenshot, the exact CV file and its fingerprint, the letter, every answer.

A refresh, a closed tab, another device: the batch is in the database and the page picks it up where it was (including the *Ready to apply* form, if it wasn't answered yet).

## How the "ask once" works

`src/lib/apply/concepts.ts` is the **normalization engine**: one registry of concepts (sponsorship_requirement, work_authorization, relocation_preference, salary_expectation, notice_period, start_date, years_of_experience, remote_preference, travel_willingness, onsite_willingness, minimum_age, previously_employed, privacy_consent, and the contact details), each with its recognisers, its category (**verified** / **preference** / **derived** / **sensitive**), whether it depends on the job's **country** ("allowed to work in Germany" ≠ "in Canada"), and how to fit an answer to a form's own choices ("6 years" → "6–9 years"). Adding a concept is one entry.

`src/lib/apply/batch.ts` plans a batch: for every question on every form — known (and from where), ask once (grouped by concept and country), or needs the person. It also computes the coverage %, and the exact answers each application is sent with.

Rules kept everywhere (page, worker, database):
- Nothing is guessed. Answers come from the account, the CV, saved answers, or things that follow from them (first/last name from the full name, years of experience and current title from the CV, "not authorised / needs sponsorship" from the person's nationality and residence where the match already worked that out, "have you worked here before? — No" only when the company isn't on the CV).
- Demographic questions are never answered. A *required* one is answered with the form's own "I'd rather not say" if it offers one; otherwise that application needs the person.
- Optional consents (marketing, talent pools) are never ticked. A required privacy notice is accepted only with the person's **yes for that batch**.
- Tailored CVs only reorder and re-emphasise the CV's own lines (unchanged from before, still verified word-for-word).

## Credits (configurable)

- A **submitted** application uses one. One is held while the worker submits; if it isn't submitted after all, it's given back.
- Skipped, duplicates, blocked, needs attention: nothing — until actually submitted.
- *I submitted it myself*: free by default — `select apply_configure(p_charge_self_sent => true);` to count it.
- Extra applications for a person this month: `select apply_grant('<user id>', 20, 'Goodwill');`
- Plan numbers as before: `select apply_configure(p_free_monthly => 10, p_pro_monthly => 200);`
- Out of credits mid-batch: the batch pauses with the reason on screen; nothing already submitted changes. Daily limit: the rest carry on by themselves the next day.

## Emails

When a batch finishes, the person gets a bell notification and — once Resend is set up (`app_secrets.resend_api_key`, `email_from`) — one summary email: *"3 applications were submitted on the employers' career sites using you@… · 2 need your attention"*. See `EMAIL-SETUP.md`.

## Where it lives

- **Rules**: `src/lib/apply/concepts.ts` (normalization), `batch.ts` (planning, answers), `runner.ts` (preparing a batch), `prepare.ts` (CV and letter), `machine.ts` (states), `store.ts` (page state, database calls).
- **Screens**: `src/components/apply/` — `AutoApply` (container), `ApplicationSummary`, `ApplicationReady` (new: the one form), `ApplicationProgress` (checking / applying / done), `ApplicationReceipt` (review, receipt), `ApplicationQueue`, `ApplicationStatus`, `ApplicationTracker`.
- **Function**: `supabase/functions/apply/forms.ts` (reading Greenhouse / Lever / Ashby forms), `core.ts` (`analyze` action).
- **Database**: `supabase/migrations/20261205090000_auto_apply_batch.sql` — new states, `application_forms`, `apply_workers`, worker claim / progress / report / reaper, credit grants, settings, the private `application-files` bucket, completion notification and email.
- **Worker**: `worker/` — `src/run.ts` (one application), `src/page.ts` (reading and filling a live page), `src/plan.ts` (what goes in each field), `src/index.ts` (the loop), `Dockerfile`, `README.md`.

Application states: `queued → analyzing → preparing → ready → submitting → submitted`, plus `needs_attention`, `blocked`, `failed`, `skipped`, `already_applied`, `expired`.

## Copy that changed (please read)

- **Privacy Policy** (`src/data/legalContent.ts`): the Auto Apply paragraph now says MadeVisa submits applications on employers' sites in the person's name, what is kept (form, answers, email used, the file sent, the confirmation and its screenshot), and the rules above. A new processor line: *the server provider that runs our application service*. Name your provider there once you've chosen one (Railway, Fly.io, Hetzner…). **This needs your read — I'm not a lawyer.**
- `/cv-match` FAQ: four answers rewritten (what *Apply to N jobs* does, whether MadeVisa submits, unknown questions, credits).

One thing worth checking with your lawyer or the platforms: some hiring systems' terms of use restrict automated submissions. The worker submits at a human pace (one application per site every 20 seconds, at most a few at a time), never gets round a CAPTCHA or sign-in, and only submits what the candidate confirmed — but it is your call whether to run it for every platform.

## Tests — status on 8 Oct 2026

Passed:
- Typecheck, build, and lint with no new problems (the repo's existing 107 errors and 53 warnings are unchanged).
- **129 unit tests** (`npm test`): the normalization engine (different wordings → one concept; country and company scope; fitting to choices), batch planning (ask once, reuse, coverage, one-employer questions, login-only jobs, live forms), answer reuse and saving, form reading for Greenhouse / Lever / Ashby, the `analyze` action, preparing a batch (order, pause, resume after a refresh), the fill planner, partial success (14 submitted / 2 need attention), credit use and refund, self-submitted, allowance and daily limits, duplicates, state transitions.
- **13 worker tests in a real Chromium** (`cd worker && npm test`) against pretend employer sites: a Greenhouse-style form, a Lever-style form with a question card (stops, then submits once answered), a careers page behind *Apply now*, a CAPTCHA (nothing sent), a sign-in (blocked), a form that refuses, a site that never confirms, test mode, closed jobs, an unreachable site, the email channel (sent once, idempotent).
- **16 database test groups** (`supabase/tests/auto_apply.test.sql`) on PostgreSQL 16 after all 100 migrations: worker heartbeat, batch setup and replacement, every allowed move and who may make it, nothing claimed before the person confirms, claim → submit with evidence → credit used → tracker row, partial success with the completion notification and one email, retries capped at three, a vanished worker (never sent twice), allowance pause and grants, the daily limit, pause / stop, test mode, row security. The migration also ran twice, and on a database holding applications in the old states.
- **The whole thing end to end**, in a real browser: the site (dev server) → a local PostgREST on that database → the real `apply` function code → the real worker → pretend employer sites. Five jobs: one submitted on the first pass, one blocked by a login, one CAPTCHA, two with a question found live; answering the salary question sent that application too. At 1280 and 390 px.

Not run:
- Nothing against the live Supabase project, and no real employer site (the worker was tested only on local look-alikes of Greenhouse, Lever and a generic careers page). **Run it in test mode on a handful of real jobs first.**
- Ashby's form reading follows the shape of its public job-board API as I know it; if Ashby changes it, those forms are simply read live by the worker instead.
- No real email through Resend.
