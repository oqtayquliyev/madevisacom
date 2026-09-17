/*
# Unified Profile foundation

## 1. Personal profile fields
Adds the optional personal-profile fields the unified Profile page
needs (languages, occupation, education, specialization, experience,
preferred destination). All nullable — nothing existing breaks.

## 2. Organizations / organization_members (future multi-user orgs)
Per the plan: a user and an organization must not be the same thing,
and a user should eventually belong to multiple organizations. This
is prepared as a genuinely separate, additive foundation — nothing
existing is renamed or migrated onto it yet.

Note: `program_publishers` already IS your partner-profile record
(name, org_type, verification_status, logo_url, contact info) — it is
being treated as the `partner_profiles` table the plan asks for,
rather than creating a second, duplicate table. A nullable
`organization_id` is added to `program_publishers` so a publisher can
optionally be linked to a multi-member organization later, without
forcing every existing single-owner publisher to change today.

## 3. Account deletion support
`profiles.id` already cascades from `auth.users` (deleting the auth
user deletes the profile row automatically). `agencies.owner_id` and
`program_publishers.owner_id` are ON DELETE SET NULL — published
content and partner listings intentionally survive account deletion
(orphaned, not deleted), matching how the rest of the schema already
treats ownership. This migration doesn't change that; it just confirms
it's already safe for the delete-account Edge Function to rely on.
*/

-- 1. Personal profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages text[],
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS education text,
  ADD COLUMN IF NOT EXISTS specialization text,
  ADD COLUMN IF NOT EXISTS experience text,
  ADD COLUMN IF NOT EXISTS preferred_destination_country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL;

-- 2. Organizations (foundation only — not wired into any UI yet)
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_type text NOT NULL CHECK (org_type IN ('government', 'company', 'agency', 'expert')),
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  logo_url text,
  website text,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Organization members (foundation only)
-- Created before any RLS policy references it — a policy on
-- `organizations` below needs this table to already exist.
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('owner', 'admin', 'editor', 'recruiter', 'program_manager', 'analyst', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Now that both tables exist, enable RLS and add policies for both.

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_member_or_admin" ON public.organizations;
CREATE POLICY "organizations_select_member_or_admin"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR owner_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = organizations.id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "organizations_insert_owner" ON public.organizations;
CREATE POLICY "organizations_insert_owner"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (owner_profile_id = auth.uid());

DROP POLICY IF EXISTS "organizations_update_owner_or_admin" ON public.organizations;
CREATE POLICY "organizations_update_owner_or_admin"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR owner_profile_id = auth.uid())
  WITH CHECK (public.is_admin() OR owner_profile_id = auth.uid());

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_members_select_own_org" ON public.organization_members;
CREATE POLICY "organization_members_select_own_org"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_members.organization_id AND o.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "organization_members_manage_owner" ON public.organization_members;
CREATE POLICY "organization_members_manage_owner"
  ON public.organization_members FOR ALL
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_members.organization_id AND o.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_members.organization_id AND o.owner_profile_id = auth.uid()
    )
  );

-- 4. Optional link from an existing publisher record to a future organization
ALTER TABLE public.program_publishers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
