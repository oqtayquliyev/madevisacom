// GET /api/social/content → the facts the social program writes posts from,
// as JSON: every visa guide (routes, fees, validity, the employer's side,
// years to residence and citizenship) and the visa salary thresholds.
//
// One source of truth: this reads the same files the website shows
// (src/data/visa/*), so a post can never say something the site doesn't.
// The auto-pipeline (supabase/functions/auto-pipeline/program.ts) fetches it
// once per run. Nothing here is private — it is all on /destinations.

import { visaGuides, documentsFor, DEFAULT_DOCUMENTS, REQUIREMENT_LABEL, ROUTE_KIND_LABEL } from '../../src/data/visa';
import { SALARY_THRESHOLDS } from '../../src/data/visa/salaryThresholds';

export const config = { runtime: 'edge' };

export default function handler(): Response {
  const body = {
    v: 1,
    countries: visaGuides.map((g) => ({
      code: g.code,
      name: g.name,
      slug: g.slug,
      region: g.region,
      blurb: g.blurb,
      freeMovement: g.freeMovement,
      languages: g.languages,
      currency: g.currency,
      prYears: g.prYears,
      prNote: g.prNote,
      citizenshipYears: g.citizenshipYears,
      citizenshipNote: g.citizenshipNote,
      dual: g.dualCitizenship,
      reviewed: g.reviewed,
      documents: documentsFor(g),
      routes: g.routes.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        summary: r.summary,
        validity: r.validity,
        fee: r.fee ?? null,
        leadsToPR: r.leadsToPR,
        requires: r.requires,
        note: r.note ?? null,
        url: r.url,
        employer: r.employer
          ? {
              licenceNeeded: r.employer.licenceNeeded,
              licenceNote: r.employer.licenceNote ?? null,
              steps: r.employer.steps.map((s) => ({ text: s.text, effort: s.effort ?? null, optional: Boolean(s.optional) })),
              timeline: r.employer.timeline,
              candidateMayCover: r.employer.candidateMayCover,
              employerCosts: r.employer.employerCosts ?? null,
            }
          : null,
      })),
    })),
    thresholds: Object.values(SALARY_THRESHOLDS).map((t) => ({ code: t.code, currency: t.currency, route: t.route, standard: t.standard, lower: t.lower, caveat: t.caveat, source: t.source, checkedOn: t.checkedOn })),
    documents: DEFAULT_DOCUMENTS,
    requirement: REQUIREMENT_LABEL,
    routeKind: ROUTE_KIND_LABEL,
  };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' } });
}
