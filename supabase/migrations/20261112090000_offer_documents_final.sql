/*
# Sponsorship documents are final once prepared
Run AFTER 20261111090000_offer_pricing_usd.sql. Safe to run more than once.

The candidate reviews and approves the terms before paying. After that the
document is a fixed record: only its status (sent, replied, …) can change.
Admins can still correct a document.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.hiring_briefs_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.split := OLD.split;
    NEW.terms := OLD.terms;
    NEW.terms_updated_at := OLD.terms_updated_at;
    NEW.covers := OLD.covers;
    NEW.remote_first := OLD.remote_first;
    NEW.company_name := OLD.company_name;
    NEW.publisher_id := OLD.publisher_id;
    NEW.job_title := OLD.job_title;
    NEW.job_city := OLD.job_city;
    NEW.job_function := OLD.job_function;
    NEW.candidate_name := OLD.candidate_name;
    NEW.candidate_headline := OLD.candidate_headline;
    NEW.candidate_linkedin := OLD.candidate_linkedin;
    NEW.candidate_username := OLD.candidate_username;
    NEW.note := OLD.note;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hiring_briefs_freeze ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_freeze
  BEFORE UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_freeze();
