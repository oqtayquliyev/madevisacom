# Adding more opportunities (jobs, programs, travel, ads)

This app currently ships with mock data so the UI, filtering and
personalization can be reviewed end to end. Here's how to plug in real
data as you get access to sources/partners.

## 1. The data model

Everything (a job listing, a scholarship, a work & travel program) is a
single `Opportunity` type, defined in `src/data/opportunities.ts`:

```ts
type Opportunity = {
  id, kind: 'job' | 'program', title, organization,
  country, countryCode, city?, category, type,
  remote?, compensation?, duration?, published,
  source, url, verified,
  eligibility: {
    citizenship: string[] | 'any',
    excludedCitizenship?: string[],
    minAge?: number,
    maxAge?: number,
    currentLocation?: 'any' | 'destination-country' | string[],
  },
};
```

The `eligibility` block is what powers the "you likely qualify" /
"partial match" / "unlikely to qualify" badges on the Jobs and Programs
pages (`src/lib/personalization.ts` → `computeEligibility`). If a source
doesn't give you structured eligibility rules, start permissive
(`citizenship: 'any'`, `minAge: 18`) and refine as you learn more about
the program.

## 2. The adapter pattern

Every provider implements `OpportunitySource`:

```ts
type OpportunitySource = {
  id: string;
  label: string;
  kind: 'job' | 'program';
  fetchOpportunities: () => Promise<Opportunity[]>;
};
```

Pages call `loadOpportunities('job')` / `loadOpportunities('program')`,
which fans out to every registered source and merges + normalizes the
results. Pages never talk to a specific provider directly — this keeps
the UI stable as you add/remove/replace sources.

### Adding a new source, step by step

1. Create `src/data/sources/<provider>.ts`.
2. Fetch from the provider's API/feed and map each item onto the
   `Opportunity` shape. Example (Adzuna jobs API):

   ```ts
   // src/data/sources/adzuna.ts
   import type { Opportunity, OpportunitySource } from '@/data/opportunities';

   export const adzunaSource: OpportunitySource = {
     id: 'adzuna',
     label: 'Adzuna',
     kind: 'job',
     async fetchOpportunities() {
       const res = await fetch('/api/adzuna/jobs'); // proxy, see step 4
       const raw = await res.json();

       return raw.results.map((job: any): Opportunity => ({
         id: `adzuna-${job.id}`,
         kind: 'job',
         title: job.title,
         organization: job.company?.display_name ?? 'Unknown employer',
         country: job.location?.area?.[0] ?? '',
         countryCode: job.location?.area?.[0]?.slice(0, 2)?.toUpperCase() ?? '',
         city: job.location?.area?.[1],
         category: job.category?.label ?? 'General',
         type: job.contract_time ?? 'Full time',
         remote: /remote/i.test(job.title),
         compensation: job.salary_min
           ? `${job.salary_min.toLocaleString()} – ${job.salary_max?.toLocaleString()}`
           : undefined,
         published: job.created,
         source: 'Adzuna',
         url: job.redirect_url,
         verified: true,
         eligibility: { citizenship: 'any', minAge: 18, currentLocation: 'any' },
       }));
     },
   };
   ```

3. Register it in `src/data/opportunities.ts`:

   ```ts
   import { adzunaSource } from './sources/adzuna';
   export const sources = [mockJobSource, mockProgramSource, adzunaSource];
   ```

4. **Keep API keys server-side.** Don't call `api.adzuna.com` with a key
   straight from the browser. Add a small serverless/edge function (a
   Supabase Edge Function fits this project well, since Supabase is
   already wired up) that holds the key and proxies the request, e.g.
   `supabase/functions/adzuna-jobs/index.ts`, and have the adapter call
   that instead.
5. Once verified, remove `mockJobSource`/`mockProgramSource` or leave
   them as a fallback when live sources return nothing.

### Good sources to start with

- **Jobs:** Adzuna API, Jooble API, Reed API (UK), USAJobs API (public
  sector US), or a partner ATS feed (Greenhouse/Lever job boards expose
  public JSON).
- **Programs:** Erasmus+ project database, IAESTE, AIESEC, national
  immigration program pages (many publish structured eligibility you can
  transcribe once and refresh periodically), scholarship aggregators
  like Scholars4Dev.
- **Manual/curated:** a simple Supabase table (`opportunities`) your
  team edits directly is often the fastest way to get quality, accurate
  eligibility data for programs that don't have an API — write one
  `supabaseSource` adapter that `select()`s from it.

## 3. Advertising placements

Two components handle sponsored inventory:

- `src/components/ads/SponsoredCarousel.tsx` — a labeled horizontal rail
  of sponsored cards (used on the landing page and Travel page for
  "Travel packages" and partner promos).
- `src/components/ads/AdBanner.tsx` — a single inline banner meant to be
  interleaved between listing rows on the Jobs/Programs boards (e.g.
  every 6th card), styled like a classic "sponsored result."

Both currently take a hard-coded `listings`/`content` prop. To sell real
placements:

1. Model ad slots as data too — a `sponsored_listings` table (advertiser,
   title, description, image, url, target: 'landing' | 'jobs' | 'programs' | 'travel',
   starts_at, ends_at, weight).
2. Write a `loadSponsoredListings(target)` function analogous to
   `loadOpportunities`, and swap the hard-coded arrays in `LandingPage`,
   `JobsPage`, `ProgramsPage` and `TravelPage` for it.
3. Track impressions/clicks by wrapping the `<a>` `onClick` with a fetch
   to an analytics endpoint before navigating, if you want reporting for
   advertisers.

## 4. Stays & Flights (Travel page)

`src/pages/travel/TravelPage.tsx` is currently a booking.com-style shell
(destination/date/guests search UI + tabs for Stays/Flights) with mock
results. To make it live:

- **Stays:** connect a hotel affiliate API (Booking.com Affiliate
  Partner API, Expedia Rapid API, or a metasearch aggregator) behind a
  server proxy, same pattern as the jobs adapters.
- **Flights:** a flight-search API (Duffel, Amadeus Self-Service API, or
  Skyscanner's partner feed) — these typically require a backend proxy
  too because of rate limits and key security.
- Keep the search form's shape (`origin`, `destination`, `dates`,
  `guests`) stable and just swap the mock `useState` results for a
  fetch call once a provider is chosen.

## 5. Flights — real referral/affiliate revenue (implemented)

The Travel page's Flights tab is wired to a real affiliate program, not
a mock: **Travelpayouts** (the network behind Aviasales, WayAway, and
several others). This needed no backend and no paid API access.

### How it works

- `src/lib/affiliate.ts` builds a real Aviasales search-results URL
  from a route + dates + passenger count, following their documented
  encoding (`ORIGIN` + `DDMM` + `DESTINATION` + `[DDMM return]` +
  passenger digits), with your affiliate `marker` and currency attached
  as query params.
- The Flights search form (`src/pages/travel/TravelPage.tsx`) builds
  this URL from what the visitor picks and opens it in a new tab via
  `window.open(...)`. Each "popular route" card also links out with a
  route-specific deep link.
- If a visitor books through that link, Aviasales pays a commission —
  no cost to the traveler, and MadeVisa doesn't need to touch payments,
  inventory, or ticketing at all.

### Getting paid for real

1. Sign up free at [travelpayouts.com](https://www.travelpayouts.com/).
2. Join the **Aviasales** program from their marketplace (approval is
   usually instant/automatic).
3. Copy your **marker** (partner ID) from the dashboard.
4. Set it as an env var:
   ```
   VITE_TRAVELPAYOUTS_MARKER=your-marker-id
   VITE_TRAVELPAYOUTS_CURRENCY=usd
   ```
   (see `.env.example`). Until this is set, links use a demo marker and
   a small amber notice shows on the Flights tab reminding you to
   configure it — bookings won't be credited to anyone until you do.
5. That's it — no further code changes needed. Every flight search link
   site-wide will start carrying your real marker.

### Going further

- **Live prices inline** (instead of just linking out): Travelpayouts
  also offers a [Flight Search API](https://support.travelpayouts.com/hc/en-us/articles/30565016140434)
  that returns real fares you can render directly on your own results
  page before the visitor ever leaves MadeVisa. It needs your marker +
  a request signature and has a minimum monthly-active-user threshold
  for full access — the simpler [Data API](https://support.travelpayouts.com/hc/en-us/articles/203956163)
  (cheapest-fares-by-month type data, not live pricing) has none.
- **Stays**, similarly: Travelpayouts also runs **Hotellook** (hotel
  price comparison) and has a program for **Booking.com**'s own
  [Affiliate Partner Program](https://www.booking.com/affiliate-program/v2/index.html)
  (apply separately, official Booking.com commissions). Either can be
  wired into the Stays tab the same way — build a deep link with your
  partner ID and open it out, exactly like `buildFlightSearchUrl`.
- **Multiple partners / price comparison**: nothing stops you
  registering with more than one program (e.g. Aviasales + WayAway) and
  showing both as options — same pattern, different base URL and
  marker per partner.
