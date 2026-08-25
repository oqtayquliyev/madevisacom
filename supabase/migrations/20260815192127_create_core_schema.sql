/*
# Create core madevisa.com schema

## Overview
Builds the production foundation for the two-sided travel platform connecting
travelers and travel agencies. All application data now lives in PostgreSQL
instead of hardcoded frontend data.

## New Tables (10)
1. `profiles` — application profile linked to Supabase Auth users.
2. `agencies` — travel agency information, owned by a profile.
3. `countries` — countries available throughout the platform.
4. `visa_requirements` — visa requirements between nationality and destination.
5. `visa_steps` — individual steps for a visa process.
6. `agency_services` — services offered by agencies.
7. `trips` — a customer's travel plan.
8. `trip_items` — individual requirements within a trip.
9. `documents` — customer trip documents (private, not public).
10. `agency_requests` — customer requests for agency assistance.

## Constraints
- Unique constraint on `visa_requirements` (nationality, destination).
- Unique constraint on `countries.iso_code`.
- Foreign keys with CASCADE delete on child tables.
- CHECK constraints on role/verification/status columns.

## Indexes
- Foreign key indexes on all FK columns for join performance.

## Triggers
- `set_updated_at()` function + per-table triggers to maintain `updated_at`.

## Security (Row Level Security)
- RLS enabled on every table.
- Public read for: countries, visa_requirements, visa_steps, verified agencies,
  active agency services.
- Owner-scoped for: profiles, trips, trip_items, documents, agency_requests.
- Agency owners manage their own agency, services, and assigned trips/requests.
- Admin access checked server-side via profiles.role, not frontend logic.
- Documents are never publicly readable.

## Ordering
Tables are created first (dependency order), then helper functions, then
triggers, indexes, and finally RLS policies.
*/

-- ===========================================================================
-- PART 1: TABLES (dependency order)
-- ===========================================================================

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'agency', 'admin')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. agencies
CREATE TABLE IF NOT EXISTS public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  website text,
  email text NOT NULL,
  phone text,
  country text,
  city text,
  address text,
  logo_url text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. countries
CREATE TABLE IF NOT EXISTS public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  iso_code text UNIQUE NOT NULL,
  flag_emoji text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. visa_requirements
CREATE TABLE IF NOT EXISTS public.visa_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nationality_country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  destination_country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  visa_required boolean NOT NULL DEFAULT true,
  visa_type text,
  summary text,
  official_website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visa_requirements_nationality_destination_unique
    UNIQUE (nationality_country_id, destination_country_id)
);

-- 5. visa_steps
CREATE TABLE IF NOT EXISTS public.visa_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visa_requirement_id uuid NOT NULL REFERENCES public.visa_requirements(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  title text NOT NULL,
  description text,
  official_url text,
  estimated_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. agency_services
CREATE TABLE IF NOT EXISTS public.agency_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  service_type text NOT NULL,
  price_from numeric,
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. trips
CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  title text NOT NULL,
  origin_country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
  destination_country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
  departure_date date,
  return_date date,
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'requested', 'active', 'completed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. trip_items
CREATE TABLE IF NOT EXISTS public.trip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'not_applicable')),
  due_date date,
  official_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. documents
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. agency_requests
CREATE TABLE IF NOT EXISTS public.agency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- PART 2: HELPER FUNCTIONS (after tables exist)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_agency_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.agencies WHERE owner_id = auth.uid();
$$;

-- ===========================================================================
-- PART 3: TRIGGERS
-- ===========================================================================

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agencies_set_updated_at ON public.agencies;
CREATE TRIGGER agencies_set_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS visa_requirements_set_updated_at ON public.visa_requirements;
CREATE TRIGGER visa_requirements_set_updated_at
  BEFORE UPDATE ON public.visa_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_services_set_updated_at ON public.agency_services;
CREATE TRIGGER agency_services_set_updated_at
  BEFORE UPDATE ON public.agency_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trips_set_updated_at ON public.trips;
CREATE TRIGGER trips_set_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trip_items_set_updated_at ON public.trip_items;
CREATE TRIGGER trip_items_set_updated_at
  BEFORE UPDATE ON public.trip_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS documents_set_updated_at ON public.documents;
CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_requests_set_updated_at ON public.agency_requests;
CREATE TRIGGER agency_requests_set_updated_at
  BEFORE UPDATE ON public.agency_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- PART 4: INDEXES
-- ===========================================================================

CREATE INDEX IF NOT EXISTS agencies_owner_id_idx ON public.agencies (owner_id);
CREATE INDEX IF NOT EXISTS agencies_verification_status_idx ON public.agencies (verification_status);

CREATE INDEX IF NOT EXISTS visa_requirements_nationality_idx ON public.visa_requirements (nationality_country_id);
CREATE INDEX IF NOT EXISTS visa_requirements_destination_idx ON public.visa_requirements (destination_country_id);

CREATE INDEX IF NOT EXISTS visa_steps_requirement_idx ON public.visa_steps (visa_requirement_id);

CREATE INDEX IF NOT EXISTS agency_services_agency_id_idx ON public.agency_services (agency_id);
CREATE INDEX IF NOT EXISTS agency_services_active_idx ON public.agency_services (active);

CREATE INDEX IF NOT EXISTS trips_customer_id_idx ON public.trips (customer_id);
CREATE INDEX IF NOT EXISTS trips_agency_id_idx ON public.trips (agency_id);
CREATE INDEX IF NOT EXISTS trips_status_idx ON public.trips (status);

CREATE INDEX IF NOT EXISTS trip_items_trip_id_idx ON public.trip_items (trip_id);
CREATE INDEX IF NOT EXISTS trip_items_status_idx ON public.trip_items (status);

CREATE INDEX IF NOT EXISTS documents_trip_id_idx ON public.documents (trip_id);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON public.documents (uploaded_by);

CREATE INDEX IF NOT EXISTS agency_requests_customer_id_idx ON public.agency_requests (customer_id);
CREATE INDEX IF NOT EXISTS agency_requests_agency_id_idx ON public.agency_requests (agency_id);
CREATE INDEX IF NOT EXISTS agency_requests_status_idx ON public.agency_requests (status);

-- ===========================================================================
-- PART 5: ROW LEVEL SECURITY + POLICIES
-- ===========================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_requests ENABLE ROW LEVEL SECURITY;

-- 1. profiles: owner can read/update own row; admin can read all
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. agencies: public read verified; owner full access to own
DROP POLICY IF EXISTS "agencies_select_public_or_owner" ON public.agencies;
CREATE POLICY "agencies_select_public_or_owner"
  ON public.agencies FOR SELECT
  TO anon, authenticated
  USING (verification_status = 'verified' OR owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "agencies_insert_owner" ON public.agencies;
CREATE POLICY "agencies_insert_owner"
  ON public.agencies FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "agencies_update_owner" ON public.agencies;
CREATE POLICY "agencies_update_owner"
  ON public.agencies FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 3. countries: public read; admin write
DROP POLICY IF EXISTS "countries_select_public" ON public.countries;
CREATE POLICY "countries_select_public"
  ON public.countries FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "countries_insert_admin" ON public.countries;
CREATE POLICY "countries_insert_admin"
  ON public.countries FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "countries_update_admin" ON public.countries;
CREATE POLICY "countries_update_admin"
  ON public.countries FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. visa_requirements: public read; admin write
DROP POLICY IF EXISTS "visa_requirements_select_public" ON public.visa_requirements;
CREATE POLICY "visa_requirements_select_public"
  ON public.visa_requirements FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "visa_requirements_insert_admin" ON public.visa_requirements;
CREATE POLICY "visa_requirements_insert_admin"
  ON public.visa_requirements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "visa_requirements_update_admin" ON public.visa_requirements;
CREATE POLICY "visa_requirements_update_admin"
  ON public.visa_requirements FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. visa_steps: public read; admin write
DROP POLICY IF EXISTS "visa_steps_select_public" ON public.visa_steps;
CREATE POLICY "visa_steps_select_public"
  ON public.visa_steps FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "visa_steps_insert_admin" ON public.visa_steps;
CREATE POLICY "visa_steps_insert_admin"
  ON public.visa_steps FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "visa_steps_update_admin" ON public.visa_steps;
CREATE POLICY "visa_steps_update_admin"
  ON public.visa_steps FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. agency_services: public read active; owner full access to own
DROP POLICY IF EXISTS "agency_services_select_public_or_owner" ON public.agency_services;
CREATE POLICY "agency_services_select_public_or_owner"
  ON public.agency_services FOR SELECT
  TO anon, authenticated
  USING (
    active = true
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "agency_services_insert_owner" ON public.agency_services;
CREATE POLICY "agency_services_insert_owner"
  ON public.agency_services FOR INSERT
  TO authenticated
  WITH CHECK (agency_id = public.current_user_agency_id());

DROP POLICY IF EXISTS "agency_services_update_owner" ON public.agency_services;
CREATE POLICY "agency_services_update_owner"
  ON public.agency_services FOR UPDATE
  TO authenticated
  USING (agency_id = public.current_user_agency_id())
  WITH CHECK (agency_id = public.current_user_agency_id());

DROP POLICY IF EXISTS "agency_services_delete_owner" ON public.agency_services;
CREATE POLICY "agency_services_delete_owner"
  ON public.agency_services FOR DELETE
  TO authenticated
  USING (agency_id = public.current_user_agency_id());

-- 7. trips: customer or managing agency owner
DROP POLICY IF EXISTS "trips_select_owner_or_agency" ON public.trips;
CREATE POLICY "trips_select_owner_or_agency"
  ON public.trips FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "trips_insert_owner_or_agency" ON public.trips;
CREATE POLICY "trips_insert_owner_or_agency"
  ON public.trips FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
  );

DROP POLICY IF EXISTS "trips_update_owner_or_agency" ON public.trips;
CREATE POLICY "trips_update_owner_or_agency"
  ON public.trips FOR UPDATE
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "trips_delete_owner_or_agency" ON public.trips;
CREATE POLICY "trips_delete_owner_or_agency"
  ON public.trips FOR DELETE
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );

-- 8. trip_items: access via trip ownership or managing agency
DROP POLICY IF EXISTS "trip_items_select_via_trip" ON public.trip_items;
CREATE POLICY "trip_items_select_via_trip"
  ON public.trip_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_items.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "trip_items_insert_via_trip" ON public.trip_items;
CREATE POLICY "trip_items_insert_via_trip"
  ON public.trip_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "trip_items_update_via_trip" ON public.trip_items;
CREATE POLICY "trip_items_update_via_trip"
  ON public.trip_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_items.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "trip_items_delete_via_trip" ON public.trip_items;
CREATE POLICY "trip_items_delete_via_trip"
  ON public.trip_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_items.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

-- 9. documents: PRIVATE — only trip owner or managing agency
DROP POLICY IF EXISTS "documents_select_via_trip" ON public.documents;
CREATE POLICY "documents_select_via_trip"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = documents.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "documents_insert_via_trip" ON public.documents;
CREATE POLICY "documents_insert_via_trip"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id())
    )
  );

DROP POLICY IF EXISTS "documents_update_via_trip" ON public.documents;
CREATE POLICY "documents_update_via_trip"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = documents.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = documents.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "documents_delete_via_trip" ON public.documents;
CREATE POLICY "documents_delete_via_trip"
  ON public.documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = documents.trip_id
      AND (t.customer_id = auth.uid() OR t.agency_id = public.current_user_agency_id() OR public.is_admin())
    )
  );

-- 10. agency_requests: customer or managing agency
DROP POLICY IF EXISTS "agency_requests_select_owner_or_agency" ON public.agency_requests;
CREATE POLICY "agency_requests_select_owner_or_agency"
  ON public.agency_requests FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "agency_requests_insert_customer" ON public.agency_requests;
CREATE POLICY "agency_requests_insert_customer"
  ON public.agency_requests FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "agency_requests_update_owner_or_agency" ON public.agency_requests;
CREATE POLICY "agency_requests_update_owner_or_agency"
  ON public.agency_requests FOR UPDATE
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "agency_requests_delete_owner_or_agency" ON public.agency_requests;
CREATE POLICY "agency_requests_delete_owner_or_agency"
  ON public.agency_requests FOR DELETE
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR agency_id = public.current_user_agency_id()
    OR public.is_admin()
  );
