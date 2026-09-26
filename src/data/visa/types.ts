// Types for the country visa guides (src/data/visa/countries/*.ts).
//
// Modelled on how good relocation guides are structured, one country per
// file: when you need a visa, the main routes (validity, fee, what each
// asks for), how to apply, common documents, and the path to permanent
// residence and citizenship. Plus MadeVisa's own layer: what the
// *employer* has to do for each route, which powers Hiring Briefs.
//
// See README.md in this folder for how to add or update a country.

/**
 * What a route asks of the applicant.
 * - Answerable: the visitor can say yes/no in their profile.
 * - Check-only: can't be judged from a short profile — a route whose
 *   answerable parts all pass shows as "Likely" while any remain.
 */
export type Requirement =
  | 'job-offer'
  | 'degree'
  | 'experience'
  | 'remote-income'
  | 'funds'
  | 'admission'
  | 'business'
  | 'salary-threshold'
  | 'points'
  | 'endorsement'
  | 'recent-graduate'
  | 'employer-transfer';

export type RouteKind = 'work' | 'talent' | 'job-search' | 'remote' | 'business' | 'study' | 'residence';

/**
 * Costs a candidate may legitimately take on themselves. Deliberately
 * excludes anything the law puts on the employer (e.g. UK sponsorship
 * fees) and never includes salary — visa salary floors exist to stop
 * undercutting.
 */
export type CandidateCover = 'visa-fee' | 'relocation' | 'translations' | 'recognition' | 'own-adviser';

export type EmployerStep = {
  text: string;
  /** Rough effort for the employer, e.g. "About 1 hour". */
  effort?: string;
  optional?: boolean;
};

/** The employer's side of a work route. Only filled where it's been checked. */
export type EmployerSide = {
  /** Does the employer need a licence/recognition before hiring on this route? */
  licenceNeeded: boolean;
  /** Plain-language note about the licence, shown when licenceNeeded. */
  licenceNote?: string;
  steps: EmployerStep[];
  /** What usually happens and how long, from the employer's view. */
  timeline: string;
  /** Costs the candidate may cover on this route. */
  candidateMayCover: CandidateCover[];
  /** Anything the employer must pay themselves, stated plainly. */
  employerCosts?: string;
};

export type VisaRoute = {
  id: string;
  name: string;
  kind: RouteKind;
  summary: string;
  validity: string;
  fee?: string;
  /** Counts toward permanent residence. */
  leadsToPR: boolean;
  requires: Requirement[];
  /** Short plain-language caveat shown under the route. */
  note?: string;
  url: string;
  /** Employer's side — present only on routes enabled for Hiring Briefs. */
  employer?: EmployerSide;
};

export type ApplicationStep = { title: string; detail: string };

export type VisaGuide = {
  code: string;
  name: string;
  slug: string;
  region: string;
  blurb: string;
  /** EU/EEA/Swiss citizens can live and work here without a visa. */
  freeMovement: boolean;
  schengen: boolean;
  currency: string;
  languages: string;
  /** Typical years before permanent residence (0 = some routes grant PR on arrival, null = no fixed period). */
  prYears: number | null;
  prNote: string;
  citizenshipYears: number | null;
  citizenshipNote: string;
  dualCitizenship: 'yes' | 'limited' | 'no';
  /** "When do you need a visa?" — short stays and who is exempt. */
  shortStay: string;
  routes: VisaRoute[];
  /** How to apply. Falls back to DEFAULT_APPLICATION_STEPS. */
  applicationSteps?: ApplicationStep[];
  /** Common documents. Falls back to DEFAULT_DOCUMENTS. */
  documents?: string[];
  officialLinks: { label: string; url: string }[];
  /** Year-month this guide was last checked against official sources, e.g. '2026-06'. */
  reviewed: string;
};
