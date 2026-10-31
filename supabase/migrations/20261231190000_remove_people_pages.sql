/*
# Hide "jobs" that are really people / team pages

Run any time. Safe to run more than once. Hides (doesn't delete) the rows.

Career sites like Teamtailor list their staff next to their jobs
(career.teamtailor.com/people/3892195-sarah-mian). The importer took some of those pages
for jobs — a person's name as the title, "Some of my colleagues" as the description.
The importer now skips them (import-ats-jobs: isPeoplePage); this hides the ones already in.
*/

UPDATE public.sponsored_jobs
SET status = 'expired',
    closed_reason = 'not_a_job',
    closed_at = now() - interval '2 days'   -- in the past: not shown greyed out as "Closed"
WHERE status = 'published'
  AND (
    coalesce(official_url, '') ~* '/(people|person|employees?|team-members?|our-people|meet-(the-)?team|departments?|colleagues?)(/|$)'
    OR coalesce(application_url, '') ~* '/(people|person|team-members?|our-people|meet-(the-)?team)(/|$)'
    OR (
      coalesce(description, '') ~* '(some of my colleagues|let.?s recruit together and find your next colleague)'
      AND title !~* '(manager|engineer|developer|analyst|specialist|assistant|associate|consultant|officer|director|lead|head|intern|designer|nurse|technician|coordinator|advisor|accountant|controller|lecturer|teacher|operator|driver|sales|marketing|recruiter|support|administrator|scientist|architect|worker|clerk|agent|representative|executive|trainee|apprentice|student)'
    )
  );
