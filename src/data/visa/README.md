# Visa guides

One file per country in `countries/`, registered in `index.ts`. The pages at
`/destinations` and `/destinations/<slug>`, the eligibility checker and
Hiring Briefs all read from here.

## Structure of a guide

| Part | Shown as |
| --- | --- |
| `shortStay` | "Visiting" — when you need a visa at all |
| `routes[]` | Visa route cards: validity, fee, what it asks for, official link |
| `routes[].requires` | Drives the eligibility check (see `shared.ts` for the vocabulary) |
| `routes[].employer` | The employer's side. Its presence enables Hiring Briefs for that route |
| `applicationSteps`, `documents` | "How to apply". Optional; defaults live in `shared.ts` |
| `prYears`, `citizenshipYears` + notes | Path-to-residence timeline and comparison |
| `reviewed` | "Reviewed <month year>" shown on the page |

## Rules

1. Official sources only. Link the official page for every route.
2. If unsure of a fee or threshold, leave it out; the page says "See official site".
3. Before adding `employer` to a route, check what the employer really has to do,
   ideally with an immigration lawyer. `candidateMayCover` must only list costs
   the law allows the candidate to pay.
4. Update `reviewed` whenever you re-check a country.

## Adding a country

Copy `countries/_template.ts`, fill it in, import it in `index.ts` and add it to
`visaGuides`. The destination page, sitemap entry (add it to `public/sitemap.xml`)
and eligibility check then work automatically.
