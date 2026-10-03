# Visa Plan → Candidate Sponsorship Proposal — what changed and how to put it live

Built 3 Oct 2026 (night), on top of `DOCUMENT-AND-SOCIAL-UPDATE.md`. This is **Phase 1** of the redesign brief: the existing document is fixed and reframed; the builder, the link, the PDF, the employer replies and the plan all work as before.

## Putting it live — one step

**Site only.** Copy the files (list at the bottom), `npm run build`, push.

- **No SQL to run and no function to deploy.** The new information (sources, checks, version number) is stored inside the existing `terms` field of `hiring_briefs`. The largest possible record was measured at about 2.5 kB against the database's 4 kB limit.
- Documents made before this update keep working. They show the new layout, with "Provided by the candidate" where no source was recorded, and they keep the repayment term they were sent with.

---

## 1. What the document is now

- Title: **Visa Plan: Candidate Sponsorship Proposal**. Letterhead: "Candidate Sponsorship Proposal". First line: "A candidate-initiated proposal for discussing sponsorship, immigration and relocation arrangements."
- The contradiction is gone. It used to say "agreement", "Binding once signed by both parties" **and** "This is a proposal, not a contract". Now it says one thing everywhere: a proposal for discussion; not an employment offer, a contract, an immigration application or a guarantee; its terms count only once both sides put them into the employment contract or a signed agreement.
- **One status line**, worked out from what is already stored:
  - `Draft · not yet approved`
  - `Approved by the candidate on <date>`
  - `Accepted in principle by the employer on <date> (<name>)`
  - `Validity ended on <date>` (30 days after it was made)
- The signature block is now an **Acknowledgement**: "Signing here acknowledges this proposal as a basis for discussion. It does not create an employment contract or an obligation to sponsor."
- The employer's reply "We accept these terms" is now **"We accept in principle"**, with the same explanation. It still locks the document.

## 2. Proposal verification (new section on the document)

One row per fact, each with **its source** and **where it stands**:

| Group | Statuses used |
|---|---|
| Known (green ✓) | Checked by the candidate against the job ad · Source found |
| Proposed (blue ◉) | Provided by the candidate · Candidate proposal |
| Needs confirmation (amber ⚠) | Needs employer confirmation · Not stated · Differs from the job ad · Professional review recommended |

Rows: employer, role, work country, work location, on site / hybrid / remote, employment type, salary, visa sponsorship, potential immigration route, sponsor licence or registration, job source (with the date the details were captured and the date the ad was published).

Rules built into it:

- "Checked by the candidate" means exactly that. The section says: *MadeVisa has not verified the Employer or the job independently.*
- **Salary is never worked out.** From the ad → "from the job ad". Typed by the candidate → "Provided by the candidate", with what the ad shows. Nothing → "Not stated". An hourly or foreign-currency figure is shown as the ad shows it, not converted.
- **Work location is the place of work**, not the headquarters; with no city it says "City not stated · needs employer confirmation".
- **The route** is always "Potential route identified · whether it fits this role and candidate needs confirmation", with the official source and the month we last checked it. For a country without a checked route: "To be confirmed · Employer or professional confirmation required" — it no longer prints "National work permit" as if it were a route.
- If the candidate picked a country other than the ad's, the row says "Differs from the job ad".
- If the ad says sponsorship is **not** offered, the document says so.
- A summary on page 1 gives **counts** ("8 supported by a source · 1 stated by the Candidate · 2 need confirmation"). There is no score and no percentage anywhere.

## 3. Cost responsibility (replaces "Employer 75% / Candidate 25%")

- The percentage bar is gone from the document, the demo and the slider bubble.
- Each cost is a row: **cost · proposed payer · basis**.
  - *Route rule · official source* — what the route puts on the employer (never moved, never repaid).
  - *Candidate proposal* — with "a cost a candidate may pay on this route, per MadeVisa's check of <month>".
  - *Not checked · confirm before agreeing* — every cost the candidate offers to pay or share in a country whose rules we have not checked.
- The slider is kept. It now reads "2 for the employer · 1 shared · 2 for you", and the panel is called a **suggested starting point**, "a suggestion from MadeVisa, not a rule". The line "most employers can say yes to" is removed (nothing backs it).

## 4. Repayment and salary deduction

- **Repayment is no longer added automatically.** It used to appear by itself (12 or 24 months) depending on the slider. Now the default is "Not included", and the candidate can choose to offer one (6, 12, 18, 24 or 36 months).
- When chosen, it prints as "Proposed by the Candidate" with: *MadeVisa cannot determine whether this repayment term is legally appropriate in <country>. Professional review recommended. It applies only if both parties write it into a signed agreement and the applicable law allows it.*
- The optional salary deduction carries the same kind of note.

## 5. Other wording on the document

- "Start within 5 weeks of the visa being granted" → **"Candidate target: within approximately 5 weeks after work authorisation is granted, subject to Employer onboarding, travel and applicable requirements. This is a target, not a commitment."**
- "Expected timeline" → **Estimated processing** + **Basis** (or "Not established — route not confirmed").
- The remote-start sentence no longer says such work "needs no visa".
- Fair recruitment: the candidate asks that no recruitment or placement fee be charged to them. MadeVisa is described as what it is — software the candidate uses, not a recruiter, not a party — without calling the subscription anything in legal terms.
- New **Sources** section: the job ad link with dates, the official route page with the month we checked it, the salary-minimum source when one applies.
- **Footer on every PDF**: reference, version, created date, status, the link to the current version, and the important notice.
- The salary line "✓ Meets the minimum" now reads "At or above the general <route> minimum … other salary rules may apply".

## 6. The builder (`/brief/new`)

- "Check your details" has **9 lines** for a job from the board (was 6): added *Employment* (type · on site / hybrid / remote), *Salary* and *Sponsorship in the ad*. Each line shows its **source** ("Job ad (example.com)", "You", "Not stated", "Official source (…) · checked June 2026").
- New block under the ticks: **"3 things are still unknown"** — grouped as *Worth adding if you know it*, *The employer has to confirm*, *Professional review recommended*. It never blocks the download; each item is printed on the document as needing confirmation.
- The cost panel shows an **Employer only** line (can't be moved) and, for unchecked countries, an amber warning under every cost the candidate offers to pay.
- New control: **Repayment if you resign (optional)**.

## 7. Saved documents

- Every saved change gets a **version number** (v1.0, v1.1 …) shown next to the reference and in the footer.
- If the owner changes the salary or the company afterwards, that row stops being "checked against the job ad" and becomes "Provided by the candidate".

## 8. Wording elsewhere on the site

- "sponsorship agreement" → "sponsorship proposal" on the About / How it works pages; "one-page", "ready to sign", "they just say yes", "cheaper than they think", "the legal route" are gone from /offers, /pricing, the employer inbox, the plan card and the job-page tooltip.
- **Sponsorship Document Terms** rewritten to match (what the document is, sources and statuses, costs, repayment, versions, "accepted in principle", 30-day validity, two new FAQ entries). **Please read it under Legal before publishing.**
- An old FAQ line on the About page still said "the first one is free… Pro includes 10 a month". Corrected to the current plan.
- **/offers: the "2.3× higher chance to be hired and sponsored" figure was removed.** It was a fixed number in the code, not a measurement (the file's own comment said to replace it once there was tracking data). In its place the page shows the measured share of opened proposals that got a reply — from `brief_outcomes()`, only once there are enough documents — and nothing until then. To undo: restore `src/components/briefs/OfferOddsStat.tsx` from git.

---

## Not in this round (the brief's Phase 2 and 3)

Left out on purpose, so Phase 1 stays stable. Each needs new tables and screens:

- **Phase 2**: Mobility Deal Room, structured employer counterproposals (the employer still has the four one-click replies and a message), version history you can open and compare (only the version number is kept now), Employer Mobility Passport, Evidence Locker, Trust Center, employer verification beyond the work-email check, audit log.
- **Phase 3**: route compatibility engine, immigration readiness workflow, offer vs Visa Plan comparison, professional review workflow, candidate passport, employer dashboard.
- Also not done: per-country rules for which costs a worker may not pay. The site has checked data for the routes in `src/data/visa`; for every other country the document says "not checked" instead of guessing. Adding rules country by country is research work, not code.

## Checked

- Typecheck, lint (0 errors) and production build pass.
- In a browser: builder for a board job (Germany), a typed-in company (United States, no checked route), guest preview, Pro; saved document as reader, owner (edit → v1.1), accepted, expired, an old document without the new data; no sideways scrolling at 820 / 390 / 340 px.
- Printed to PDF: 4 pages A4, table headings stay with their rows.

## Files to copy (20)

New:

- `src/lib/proposal.ts`
- `src/pages/brief/OfferDocument.tsx`

Changed:

- `src/pages/brief/BriefPage.tsx`
- `src/lib/sponsorOffer.ts`
- `src/lib/briefs.ts`
- `src/lib/plans.ts`
- `src/index.css`
- `src/components/briefs/EmployerReply.tsx`
- `src/components/briefs/OfferDemo.tsx`
- `src/components/briefs/OfferBits.tsx`
- `src/components/briefs/OfferFlip.tsx`
- `src/components/briefs/OfferOddsStat.tsx`
- `src/components/briefs/MyBriefsSection.tsx`
- `src/components/cv/MatchBits.tsx`
- `src/data/legalContent.ts`
- `src/data/infoContent.ts`
- `src/pages/pricing/PricingPage.tsx`
- `src/pages/offers/OffersPage.tsx`
- `src/pages/employers/EmployerInboxPage.tsx`
- `src/pages/admin/OffersSection.tsx`
