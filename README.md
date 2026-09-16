# Stuck-loading fix + registration redesign

## 1. Stuck-loading escape hatch
`src/App.tsx` — the global loading spinner now has a "Taking too long?
Sign out and try again" link, so nobody can get permanently trapped on
it regardless of cause. Combined with the auth.tsx hardening from
before (try/catch + 8s safety timeout), a hang should now be
self-recoverable either automatically or with one click.

**If it's still stuck on your end right now**: that's most likely the
previous auth.tsx fix not being deployed yet — Vercel only picks up
env var / code changes after a fresh deploy. As an immediate manual
unstick: DevTools → Application → Local Storage → delete the
`sb-...-auth-token` entry → hard refresh.

## 2. Registration no longer blocks on "check your email"
`src/pages/auth/RegisterPage.tsx` and the new
`src/pages/auth/PendingConfirmationPage.tsx` — signing up now takes
the person to a profile-styled page immediately, showing exactly what
they entered, with an "Account not confirmed yet" banner and a resend
button — instead of replacing the whole signup card with a dead-end
message.

`src/App.tsx` carries the small amount of state needed to pass the
just-entered info from the form to that page (it can't be fetched from
the database yet — there's no session until the email is confirmed).

## 3. Country + citizenship + phone prefix
`RegisterPage.tsx`'s traveler signup now asks:
- **Country** (where they currently are)
- A checkbox: *"My nationality is the same as my country"* (checked by
  default) — unchecking it reveals a separate **Nationality /
  citizenship** picker
- **Phone**, using your existing `PhoneInput` component
  (`src/components/common/PhoneInput.tsx`) and `callingCodes` data —
  the "+994" style prefix now follows whichever country is selected

**New migration**: `supabase/migrations/20260916100000_add_profile_country.sql`
adds a `country_id` column to `profiles` (separate from the existing
`nationality_country_id`), and updates the `handle_new_user` trigger to
read it from signup metadata. **Run this migration** — the app won't
work correctly without it, since `country_id` doesn't exist on your
profiles table yet.

## Not included (already correct in your project, untouched)
`ProfilePage.tsx`, `PhoneInput.tsx`, and `callingCodes.ts` already had
matching country/citizenship fields, phone prefix, and an
email-confirmation banner with resend — nothing to change there.
