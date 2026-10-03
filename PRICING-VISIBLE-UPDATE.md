# Pro price visible on the public pricing page — what changed

Built 3 Oct 2026 (late), for the payment provider's review note: *"MadeVisa Pro is described as a monthly or yearly paid plan, but its price is not visible on the public Pricing page."*

## Why the reviewer saw no price

`/pricing` is served twice: first as plain HTML from `api/seo.ts` (what a reviewer, a search engine or anyone without scripts reads), then the app replaces it. The app did show a price, but only after scripts ran and an IP lookup answered. The plain HTML said only "priced for your country in your currency", with no number.

## What changed

- **The plain HTML of `/pricing` now prints the list price**: a heading "MadeVisa Pro: $19 a month or $149 a year", what the plan includes, one paragraph on regional pricing, and billing and cancellation. The page description and structured data carry the list price too.
- **In the app**, the Pro card says "List price $19 a month or $149 a year" under a regional price, and a new block **What MadeVisa Pro costs** shows two things: the list price, and "Your price in <country>" (local currency with the US-dollar amount).
- **No table of countries, and the lowest price is not printed anywhere.** A public list of the cheapest countries would tell people which VPN location to pick. Each visitor sees the list price and their own. The FAQ answer "Why is the price different in my country?" no longer names the lowest price either.
- Both the page and the app read the same price list (`src/lib/planPrice.ts`). No price was changed.

## Still open: stopping VPN discounts

Hiding the list does not stop someone who connects through a cheaper country: they simply see that country's price. The only real check is at payment — the price has to follow the country of the card or billing address, not the internet connection. Today plan requests are activated by hand, and the request shows the country it was priced for, so it can be compared with the payment. When a card checkout is connected, that comparison has to happen there.

Also worth deciding: a visitor whose country can't be read (the lookup is blocked) currently gets the middle price, $12 a month, not the list price.

## Putting it live

Site only: copy the 5 files, `npm run build`, push. No SQL, no function.

Check before asking for the re-review: open `https://madevisa.com/pricing` in a private window, then "View page source" and search for `$19 a month` — it must be there.

## Files (5)

- `src/lib/planPrice.ts` (new)
- `src/lib/pricing.ts`
- `src/components/pro/ProPlanCard.tsx`
- `src/pages/pricing/PricingPage.tsx`
- `api/seo.ts`
