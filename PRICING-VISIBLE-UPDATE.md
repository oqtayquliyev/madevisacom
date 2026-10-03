# Pro price visible on the public pricing page — what changed

Built 3 Oct 2026 (late), for the payment provider's review note: *"MadeVisa Pro is described as a monthly or yearly paid plan, but its price is not visible on the public Pricing page."*

## Why the reviewer saw no price

`/pricing` is served twice: first as plain HTML from `api/seo.ts` (what a reviewer, a search engine or anyone without scripts reads), then the app replaces it. The app did show a price, but only after scripts ran and an IP lookup answered. The plain HTML said only "priced for your country in your currency", with no number.

## What changed

- **The plain HTML of `/pricing` now prints the price**: a heading "MadeVisa Pro: $19 a month or $149 a year", the range (down to $5 a month or $39 a year), billing and cancellation in one paragraph, and a table with the monthly and yearly price for every country. The page description and structured data carry the prices too.
- **In the app**, the Pro card adds the US-dollar amount under a local-currency price ("AZN 20 / month · $12 in US dollars") and one line with the range. A new section **What MadeVisa Pro costs** shows a table (your country first, marked "Your price", then 12 example countries) and a menu to see any other country.
- Both read the same price list (`src/lib/planPrice.ts`), so the numbers can't drift apart. No price was changed.

## Putting it live

Site only: copy the 5 files, `npm run build`, push. No SQL, no function.

Check before asking for the re-review: open `https://madevisa.com/pricing` in a private window, then "View page source" and search for `$19 a month` — it must be there.

## Files (5)

- `src/lib/planPrice.ts` (new)
- `src/lib/pricing.ts`
- `src/components/pro/ProPlanCard.tsx`
- `src/pages/pricing/PricingPage.tsx`
- `api/seo.ts`
