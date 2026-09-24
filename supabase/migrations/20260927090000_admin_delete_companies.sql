/*
# Let admins delete company (publisher) accounts

Until now nothing allowed deleting a row from program_publishers, so a
duplicate or wrong company couldn't be removed from the admin panel.

Deleting a company also removes — automatically, via existing
ON DELETE CASCADE foreign keys — its jobs, programs, import sources and
company-manager access. The admin panel deletes the jobs first in small
batches (with a progress bar) so large companies don't hit a timeout.

Safe to run any time: only adds a policy, touches no data.
*/

DROP POLICY IF EXISTS "program_publishers_delete_admin" ON public.program_publishers;
CREATE POLICY "program_publishers_delete_admin"
  ON public.program_publishers FOR DELETE
  TO authenticated
  USING (public.is_admin());
