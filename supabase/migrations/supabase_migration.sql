-- MadeVisa: government accounts + approval workflow
-- Review before running. Assumes a `profiles` table keyed by `id` (uuid,
-- references auth.users) with a `role` text column, and RLS enabled.

begin;

-- 1. Allow 'government' as a role. If `role` is backed by a CHECK
--    constraint (most common with Supabase starter schemas), replace it.
--    If it's a Postgres ENUM type instead, use the commented block below.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('customer', 'agency', 'government', 'admin'));

-- If `role` is an enum type instead of text, comment out the two lines
-- above and uncomment this:
-- alter type profile_role add value if not exists 'government';

-- 2. New columns: approval + visibility + expert + role-switch requests
alter table profiles
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists is_public boolean not null default true,
  add column if not exists rejection_reason text,
  add column if not exists institution_name text,
  add column if not exists institution_type text,
  add column if not exists website text,
  add column if not exists is_expert boolean not null default false,
  add column if not exists expert_approval_status text
    check (expert_approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists expert_rejection_reason text,
  add column if not exists requested_role text
    check (requested_role in ('agency', 'government')),
  add column if not exists requested_role_status text
    check (requested_role_status in ('pending', 'approved', 'rejected')),
  add column if not exists requested_role_org_name text,
  add column if not exists requested_role_website text,
  add column if not exists requested_role_rejection_reason text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references profiles(id);

-- 3. New signups: agency/government must start pending + private.
--    Adjust this if you already have a `handle_new_user()` trigger that
--    builds the profile row from raw_user_meta_data — merge this logic
--    into it instead of adding a second trigger on the same event.
create or replace function set_default_org_approval()
returns trigger
language plpgsql
as $$
begin
  if new.role in ('agency', 'government') then
    new.approval_status := coalesce(new.approval_status, 'pending');
    new.is_public := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_default_org_approval on profiles;
create trigger trg_set_default_org_approval
before insert on profiles
for each row execute function set_default_org_approval();

-- 4. Admin access. A SECURITY DEFINER helper avoids the RLS-recursion
--    issue you'd hit checking `role = 'admin'` directly inside a policy
--    on the same table.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
  on profiles for select
  using (auth.uid() = id or is_admin());

drop policy if exists "Admins can update all profiles" on profiles;
create policy "Admins can update all profiles"
  on profiles for update
  using (auth.uid() = id or is_admin())
  with check (auth.uid() = id or is_admin());

commit;

-- 5. One-time: make your own account the admin.
-- update profiles set role = 'admin' where email = 'oqtayquliyev4@gmail.com';

-- 6. Wherever job/program listings are queried for public display
--    (e.g. sponsored jobs, programs pages), filter posting profiles by
--    `is_public = true` so unapproved agencies/institutions can't show
--    content publicly even if they create it while pending, e.g.:
--    select * from jobs j join profiles p on p.id = j.posted_by
--    where p.is_public = true;
