-- Companies the "Find new companies" search couldn't place yet (no career
-- page with jobs, website didn't load, or only a low-confidence guess).
-- Admin-only: they are NOT companies on the site until a career page is
-- added from the Import Center.
CREATE TABLE IF NOT EXISTS public.company_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qid text UNIQUE,
  name text NOT NULL,
  website text,
  domain text,
  country_code text,
  employees integer,
  industry text,
  icons jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL DEFAULT 'nopage' CHECK (reason IN ('nopage', 'blocked', 'error', 'lowconf', 'nojobs')),
  note text,
  candidate_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_leads_country_idx ON public.company_leads (country_code);

ALTER TABLE public.company_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage company leads" ON public.company_leads;
CREATE POLICY "Admins manage company leads" ON public.company_leads
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_leads TO authenticated;
