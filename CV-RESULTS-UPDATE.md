# CV match results and monthly price — what changed

Built 3 Oct 2026, on top of `TOP-MATCHES-UPDATE.md`. **Site files only — no SQL to run, no function to deploy.**

## Putting it live

Copy these six files over the ones you have, run `npm run build`, push:

```
src/components/cv/TopMatches.tsx
src/lib/cv/topMatches.ts
src/pages/cv/CvMatchPage.tsx
src/lib/pricing.ts
src/components/pro/ProPlanCard.tsx
src/pages/pricing/PricingPage.tsx
```

Results saved in a visitor's browser before this update are searched again once (they don't carry pay, visa and date yet).

## Monthly price first

- The pricing page and every Pro card now open on **Monthly** — the smallest amount to pay today is the price people see. Yearly is one tap away ("Yearly · save N%").
- The result page says the price as "AZN 20 a month" (the visitor's own currency and country price), with "Or AZN 13 a month, billed yearly" in small type under the button.

## /cv-match results

**Numbers at the top.** Up to four tiles, each counted from the visitor's own matches:

| Tile | Where it comes from |
| --- | --- |
| jobs you match at 80% or more | the scores |
| % of the skills these ads name that are already in your CV | skills asked for vs. found, over all matches at 65%+ |
| in your country, or open to you without a visa | job country vs. the visitor's country and passport |
| ads that say the company sponsors visas | the ad's own visa line |

When one doesn't apply, another takes its place (countries the matches are in; ads posted in the last 7 days).

**"Start with this one."** One job is put first with a blue frame: a top score, posted in the last two weeks, in the visitor's own country when there is one.

**Bigger job cards**, like the jobs page: company logo, company, title, flag and city, pay when the ad shows it, the score ring, and chips —

- **In your country** / **No visa needed for you** / **Abroad: a work visa for Germany**
- **The ad says it sponsors visas** / **The ad says no visa sponsorship**
- how new the ad is
- "11 of 14 skills in your CV" with a small bar

**The visa line.** A job abroad gets a strip under the card: "You'd need a work visa here. Send Nordbank your sponsorship document with your CV: the visa route, their few steps, and who pays what." Pro members get **Prepare it** (opens the document for that job); everyone else sees **In Pro · AZN 20 a month**. It isn't shown when the ad says it doesn't sponsor, or when the visitor needs no visa.

**Filters** (accounts): All · No visa needed · Sponsors visas.

**The plan block** under the list, in the visitor's own numbers: "AZN 20 today covers a month of applying, with everything attached" — the job to start with today, the full report on all N matches, how many matches need a visa and the document for each, missing skills with no daily limit. When an ad among the matches shows pay: "the lowest pay shown among your matches is EUR 5,200–6,100/month (Nordbank). One month of Pro is less than 1% of one month of that pay."

Guests still see two jobs (the starting one and one more) and the rest behind "Create free account".

## What is deliberately not on the page

No "X% more likely to be hired", no "90% land a job", no "more than any other platform", no ROI multiple. MadeVisa has no record yet of who got hired, so any such figure would be made up — and a job-seeker would be paying on the strength of it. Meta and Google ad policies and consumer-protection rules don't allow outcome claims that can't be proven, so such lines would also put the ad account at risk.

Every number on the page is one the visitor can check against their own CV and the ads. When you have real outcomes (for example: of people who sent a sponsorship document, how many got a reply), those can go on this page — the tiles are built to take them.
