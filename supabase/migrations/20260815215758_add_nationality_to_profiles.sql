/*
# Add nationality to profiles

## Changes
- Adds `nationality_country_id` column to `profiles` table, referencing `countries(id)`.
- This column stores the customer's nationality, collected during customer registration.
- Nullable since agency profiles don't need a nationality.
- ON DELETE SET NULL so deleting a country doesn't cascade to profiles.

## Security
- No RLS policy changes needed. The existing `profiles_insert_self` and
  `profiles_update_own` policies use `id = auth.uid()` which is row-level,
  not column-level. The new column is writable by the profile owner.
- No data is lost; the column is nullable with no default.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nationality_country_id uuid
  REFERENCES public.countries(id) ON DELETE SET NULL;
