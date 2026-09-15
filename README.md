# Sponsored programs: publishers, submission, browse page

Login/signup/Supabase were already built in your project (`src/lib/auth.tsx`,
`src/pages/auth/LoginPage.tsx`/`RegisterPage.tsx`, `supabase/migrations/`) —
nothing new needed there. This adds: a way for a signed-in profile to
become a **publisher** (government or company), submit programs for
review, and a public board to search/filter them.

## New files (in this zip)

- `supabase/migrations/20260915140000_add_sponsored_programs.sql` — two
  new tables, `program_publishers` and `programs`, with RLS mirroring
  your existing `agencies` pattern (public reads verified/published
  rows; owners manage their own; admin has full access via the
  existing `public.is_admin()`). Also seeds ~30 common countries since
  your `countries` table ships empty. Run it with `supabase db push`
  or paste into the SQL editor.
- `src/lib/programs.ts` — all Supabase queries: `fetchCountries`,
  `fetchSponsoredPrograms(filters)`, `fetchMyPublisherProfile`,
  `createPublisherProfile`, `submitSponsoredProgram`, plus
  `getApplicationWindowStatus()` (open / upcoming / closed / rolling,
  from each program's `applications_open_at`/`applications_close_at`)
  and `toEligibilityCriteria()` (bridges a program's stored eligibility
  columns into the same `EligibilityCriteria` shape your Jobs/Programs
  boards already use — reuses `computeEligibility` and
  `EligibilityBadge` you already have, no duplication).
- `src/pages/programs/SponsoredProgramsPage.tsx` — the public board:
  search, **country filter** and **government/company filter**, each
  card showing an eligibility badge (citizenship/age, via your existing
  personalization) *and* an application-window badge (open/upcoming/
  closed) computed from dates. Bottom section: "Publish your programme"
  CTA + a **pricing/publishing** panel with a `hello@madevisa.com`
  mailto link.
- `src/pages/programs/SubmitProgramPage.tsx` — auth-gated. Not signed
  in → prompts sign in/register (reuses your existing auth). Signed in,
  no publisher profile yet → short form to create one (Government or
  Company, name, website, country). Has a publisher profile → full
  program submission form (title, description, category, destination,
  citizenship rules, age range, application dates, funding, official
  URL). Submits as `status = 'pending'`; confirms it'll be reviewed via
  `hello@madevisa.com`.

All new/changed code passes `npm run typecheck`, `npm run lint`, and
`npm run build` — verified.

## Small edits to existing files (apply these by hand — not resending full files)

**`src/types.ts`** — add two values to the `View` union:
```diff
   | 'programs'
+  | 'sponsored-programs'
+  | 'submit-program'
   | 'travel'
```

**`src/App.tsx`** — three small additions:
1. Imports, next to your existing `ProgramsPage`/`TravelPage` imports:
   ```ts
   import { SponsoredProgramsPage } from '@/pages/programs/SponsoredProgramsPage';
   import { SubmitProgramPage } from '@/pages/programs/SubmitProgramPage';
   ```
2. In the initial `useState<View>(...)` pathname check, add two more
   branches (same pattern as your existing `/programs`/`/travel` ones)
   for `/sponsored-programs` → `'sponsored-programs'` and
   `/submit-program` → `'submit-program'`.
3. Add two more early-return blocks right next to your existing
   `if (view === 'programs' || ...)` block:
   ```tsx
   if (view === 'sponsored-programs' || window.location.pathname === '/sponsored-programs') {
     return <SponsoredProgramsPage go={go} onAuth={goToAuth} />;
   }
   if (view === 'submit-program' || window.location.pathname === '/submit-program') {
     return <SubmitProgramPage go={go} onAuth={goToAuth} />;
   }
   ```
   (And the same two `case` lines in the switch statement further down,
   mirroring your existing `case 'programs':` / `case 'travel':`.)

**`src/pages/landing/programs/ProgramsPage.tsx`** — one optional line
under the hero paragraph, linking your existing mock Programs board to
the new one:
```tsx
<button onClick={() => go('sponsored-programs')} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
  Browse government & company sponsored programs →
</button>
```

## On `hello@madevisa.com`

Used as: the default `contact_email` on both new tables, the mailto
link in the publishing/pricing panel on `SponsoredProgramsPage`, and
the "we'll reach out from…" copy on `SubmitProgramPage`. Your footer
currently links `partners@madevisa.com` elsewhere on the site — left
as-is since you only asked for this feature; say the word if you'd
rather unify to one address site-wide.
