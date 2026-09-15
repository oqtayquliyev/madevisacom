# Auto location detection + trip cost estimator

Only the files for this feature — drop them into your project at the
matching paths (everything under `src/`).

## Files

- `src/lib/geolocation.ts` — cookie helpers + free, keyless IP-based
  country detection (ipwho.is). No permission prompt; runs silently.
- `src/lib/originCountry.tsx` — React context that resolves the
  visitor's country once (cookie → IP lookup) and shares it + a manual
  override setter with any component via `useOriginCountry()`.
- `src/data/allCountries.ts` — full ISO 3166-1 country list (code +
  name) for the "all countries" flag switcher.
- `src/components/location/CountrySwitcher.tsx` — the banner: shows
  "Showing options for 🏳 Country" (circular flag, not emoji) with a
  searchable dropdown covering every country in `allCountries.ts`.
- `src/lib/costEstimates.ts` — the estimation engine: region-pair flight
  price bands, plus per-destination accommodation and visa fee data.
  Clearly documented as heuristic estimates, not live pricing.
- `src/components/estimator/TripCostEstimator.tsx` — the UI: pick a
  destination, nights, travelers → see an instant flight + hotel + visa
  cost breakdown, using whatever country `useOriginCountry()` resolved.

## Integration

Both new components read from `useOriginCountry()`, so wrap whatever
page renders them in the provider:

```tsx
import { OriginCountryProvider } from '@/lib/originCountry';
import { CountrySwitcher } from '@/components/location/CountrySwitcher';
import { TripCostEstimator } from '@/components/estimator/TripCostEstimator';

<OriginCountryProvider>
  <YourHeader />
  <CountrySwitcher />
  {/* ...rest of the page... */}
  <TripCostEstimator go={go} />
</OriginCountryProvider>
```

`LandingPage.CHANGED.tsx` is your existing landing page with exactly
that wiring already applied (provider wrap, `<CountrySwitcher />` under
the header, `<TripCostEstimator go={go} />` before the footer) — diff
it against your current `src/pages/landing/LandingPage.tsx` and merge,
or just replace the file if you haven't changed it elsewhere.

## Notes

- Uses `CircleFlag` (from an earlier delivery, `src/components/common/CircleFlag.tsx`)
  for all flag rendering — same circular, non-emoji style as the Jobs
  and Travel pages.
- Cost numbers in `costEstimates.ts` are static estimates you should
  tune with real data over time — the flight portion could later be
  swapped for the Aviasales Data API (see `OPPORTUNITIES.md` from the
  earlier delivery) without changing the component's interface.
- Verified: `npm run typecheck`, `npm run lint`, and `npm run build`
  all pass with these files added.
