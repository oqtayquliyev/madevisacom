/*
  Lets an admin create a program_publishers row on behalf of a company
  that hasn't registered on MadeVisa itself — used for the ATS import
  tool, where an admin pulls real public job listings from a company's
  Greenhouse/Lever/etc. board and needs a publisher record to attach
  them to. owner_id stays NULL ("unclaimed") until/unless that company
  ever signs up and a real owner is linked.

  The previous policy only allowed a user to insert a publisher row
  for themselves (owner_id = auth.uid()), which correctly blocked
  everyone — including admins — from doing this.
*/

DROP POLICY IF EXISTS "program_publishers_insert_owner" ON public.program_publishers;
CREATE POLICY "program_publishers_insert_owner"
  ON public.program_publishers FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());
