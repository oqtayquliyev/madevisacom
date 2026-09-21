/*
  Same root cause as the program_publishers fix: the INSERT policies
  on `programs` and `sponsored_jobs` only allow a row when the
  publisher's owner_id matches the inserting user — which is exactly
  right for a real company's own account, but blocks admins entirely
  for imported/unclaimed publishers (owner_id NULL), since NULL never
  equals auth.uid(). This is what broke the ATS import tool.
*/

DROP POLICY IF EXISTS "sponsored_jobs_insert_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_insert_owner"
  ON public.sponsored_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = sponsored_jobs.publisher_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "programs_insert_owner" ON public.programs;
CREATE POLICY "programs_insert_owner"
  ON public.programs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = programs.publisher_id AND p.owner_id = auth.uid()
    )
  );
