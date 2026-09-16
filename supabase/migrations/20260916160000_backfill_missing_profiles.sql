/*
# Backfill missing profiles rows

## Root cause
Accounts created before the `handle_new_user` trigger existed (or
before it was fixed) never got a corresponding `public.profiles` row.
Since the frontend always expects one, those accounts are stuck
signed-in-but-profile-never-loads.

## Fix
One-time backfill: for every `auth.users` row with no matching
`profiles` row, create one using the same field-mapping logic the
trigger uses (reading from `raw_user_meta_data`), so the account
becomes usable immediately without needing to re-register.

Safe to re-run: only inserts rows that don't already exist.
*/

insert into public.profiles (id, email, full_name, phone, role, avatar_url, country_id, nationality_country_id)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  u.raw_user_meta_data->>'phone',
  case
    when coalesce(u.raw_user_meta_data->>'role', 'customer') in ('customer', 'agency', 'admin')
    then coalesce(u.raw_user_meta_data->>'role', 'customer')
    else 'customer'
  end,
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  nullif(u.raw_user_meta_data->>'country_id', '')::uuid,
  coalesce(
    nullif(u.raw_user_meta_data->>'nationality_country_id', ''),
    nullif(u.raw_user_meta_data->>'country_id', '')
  )::uuid
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
