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

---

# Second round (3 Oct, evening): document button, weak scores, plan receipt

## Putting it live

Copy these five files, build, push:

```
src/components/cv/TopMatches.tsx
src/lib/cv/topMatches.ts
src/lib/cv/outcomes.ts            (new)
src/lib/cv/store.ts
src/pages/landing/components/LandingHeader.tsx
```

**Optional, one SQL paste** (Supabase → SQL Editor): `supabase/migrations/20261129090000_results_so_far.sql`. It adds the real "results so far" figures described at the bottom. The page works the same without it; the results line just never appears.

Saved results in visitors' browsers are searched again once (they don't hold missing skills yet).

## What changed

**Pro members' button.** A job abroad now says "**Your sponsorship document for South32 Limited is ready to review.** It is filled in with the visa route for United States, their steps and who pays what. Check it, download the PDF, and send it with your CV." The button is **Review & download PDF**. If they already made the document for that job it says "Your document for … is saved" with **Open your PDF**.

**Overlapping text, fixed.**
- The "N more jobs match your CV" box was taller than the blurred area behind it when few jobs were hidden (and on phones), so its edges were cut and "I already have one" ran into the line below. The box now sets the height.
- "1 job" in the headline ran together as "1job". Spacing fixed, and the number can't split from its word.
- "added M10 3" (browsers set to Azerbaijani) now reads "added 3 Oct".
- With a signed-in account at tablet width (768–1024 px) the header pushed the page sideways. Fixed.
- The blurred rows now show the hidden jobs' real scores instead of fixed sample scores.

**Weak score → how to raise it.** When the best match is **under 70%**, a block appears under the first job:
- "Your CV can score higher than 65%", with "65% now → up to 84%" for that job. The 84% is the same score engine run again as if the CV mentioned the skills the ad names. It is a match score, not a chance of being hired, and the page says "Add only what is true for you."
- **Skills these ads ask for that your CV doesn't mention**, with how many jobs ask for each. Three are named free; the rest are "named in the full report" (Pro members see up to 12).
- **Fixes to the CV itself**: missing contact details, too short, few numbers, no Skills section, no dates.
- Button: **Full report · AZN 20 a month** (Pro members: **Open the full report**).

Why 70%: 65–79% is "Good match". Under 70 the job is still worth applying to, but the CV is usually missing words it could truthfully contain, so advice helps most there. To change it, edit `WEAK_BELOW` in `TopMatches.tsx`.

**The plan block** is now a receipt: "What AZN 20 covers this month", then one line per thing with the visitor's own quantity —

```
18        full match reports
14        sponsorship documents           (the plan allows 50 a month)
11        things to add to your CV, named
No limit  on missing-skills checks        (without the plan: 3 jobs a day)
```

— and a dark footer: "To pay today · AZN 20 · for one month", **Get Pro**, cancel any time, full refund within 14 days if no document was used (both from your Terms), the yearly price, and the pay comparison when an ad shows pay.

## Hire-rate and ROI figures: real ones, switched on by data

"X% more likely to be hired" and "80% of job seekers find a job" are still not on the page, because there is no record behind them yet. What is built instead is the real version:

`brief_outcomes()` counts, from your own database, sponsorship documents made at least 7 days ago (staff accounts and withdrawn ones left out): how many were **opened by the employer**, how many **got a reply**, how many **led to an interview** or an **offer** (as marked by candidates and employers). Once there are **30 or more**, the plan block shows, by itself:

> How sponsorship documents have done so far — 62% opened by the employer · 27% got a reply · 21 led to an interview. Counted from all 212 documents made on MadeVisa at least a week ago.

(Those numbers are an example.) Below 30 it shows nothing. To see where you stand today, run in the SQL Editor:

```sql
select count(*) as made,
       count(*) filter (where unique_viewers > 0 or reply_count > 0) as opened,
       count(*) filter (where reply_count > 0 or status in ('replied','interview','offer','declined')) as replied,
       count(*) filter (where status in ('interview','offer')) as interview
from hiring_briefs where status <> 'withdrawn' and created_at < now() - interval '7 days';
```

These are figures you can put in ads, because you can show where they come from.
