-- Careers-site pages that were imported as jobs: "Working at Swiss Re in the Americas"
-- (careers.swissre.com/go/Americas/2743601/ — a SuccessFactors category page that redirects
-- to the careers home), "Life at …", "Our locations", "Americas Careers". The importer now
-- skips them (import-ats-jobs: LANDING_TITLE_RES / LANDING_PATH_RE / CAREERS_MENU_RES);
-- this closes the ones already listed. Titles that name a role are left alone.

WITH landing AS (
  SELECT id FROM public.sponsored_jobs j
  WHERE j.status = 'published'
    AND j.title !~* '(assistant|associate|manager|engineer|developer|analyst|specialist|coordinator|administrator|officer|director|intern|trainee|apprentice|graduate|consultant|advis[eo]r|architect|designer|scientist|accountant|nurse|technician|operator|driver|sales|recruiter|lead|head of|support|programmer|tester|teacher|therap|mechanic|electrician|mitarbeiter|ingenieur|leiter|praktik|werkstudent|stagiaire|position|vacancy|role|job|\(m/w/d\)|\(w/m/d\)|\(m/f/d\)|\(f/m/d\))'
    AND (
      j.title ~* '^(working|work|careers?|life|jobs?|opportunities|internships?) (at|with|@) '
      OR j.title ~* '^(join (us|our team|the team)|why (join|work)|our (locations?|opportunities|culture|values|benefits|story|people|teams?)|employee stories|search our jobs|all jobs|current (openings|opportunities|vacancies)|talent (community|network|pool)|meet the team|how we hire|hiring process|welcome to |discover |explore )'
      OR j.title ~* '^[[:alpha:] &.,''-]{2,40} careers?( site| page| portal| home)?$'
      OR coalesce(j.official_url, j.application_url, '') ~* '^https?://[^/]+(/[a-z]{2}([-_][a-z]{2})?)?/(go|content|category|categories|talentcommunity|talent-community)/[^/]+/?([0-9]+/?)?([?#].*)?$'
    )
)
UPDATE public.sponsored_jobs j
SET status = 'expired',
    closed_reason = 'not_a_job',
    closed_at = now() - interval '2 days'
FROM landing
WHERE j.id = landing.id;
