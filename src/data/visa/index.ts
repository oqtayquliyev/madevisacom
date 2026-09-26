// Visa guide registry. Add a country: copy countries/_template.ts, fill it
// in, import it here and add it to `visaGuides`. See README.md.

import { germany } from './countries/germany';
import { netherlands } from './countries/netherlands';
import { france } from './countries/france';
import { spain } from './countries/spain';
import { portugal } from './countries/portugal';
import { unitedKingdom } from './countries/united-kingdom';
import { ireland } from './countries/ireland';
import { austria } from './countries/austria';
import { belgium } from './countries/belgium';
import { denmark } from './countries/denmark';
import { sweden } from './countries/sweden';
import { finland } from './countries/finland';
import { estonia } from './countries/estonia';
import { cyprus } from './countries/cyprus';
import { italy } from './countries/italy';
import { canada } from './countries/canada';
import { unitedStates } from './countries/united-states';
import { australia } from './countries/australia';
import { japan } from './countries/japan';
import { singapore } from './countries/singapore';
import { unitedArabEmirates } from './countries/united-arab-emirates';
import type { VisaGuide } from './types';
import { DEFAULT_APPLICATION_STEPS, DEFAULT_DOCUMENTS } from './shared';

export * from './types';
export * from './shared';

export const visaGuides: VisaGuide[] = [
  germany,
  netherlands,
  france,
  spain,
  portugal,
  unitedKingdom,
  ireland,
  austria,
  belgium,
  denmark,
  sweden,
  finland,
  estonia,
  cyprus,
  italy,
  canada,
  unitedStates,
  australia,
  japan,
  singapore,
  unitedArabEmirates,
];

export const visaGuideBySlug = new Map(visaGuides.map((g) => [g.slug, g]));
export const visaGuideByCode = new Map(visaGuides.map((g) => [g.code, g]));

export function destinationPath(g: Pick<VisaGuide, 'slug'>) {
  return `/destinations/${g.slug}`;
}

export const applicationStepsFor = (g: VisaGuide) => g.applicationSteps ?? DEFAULT_APPLICATION_STEPS;
export const documentsFor = (g: VisaGuide) => g.documents ?? DEFAULT_DOCUMENTS;

/** Routes with a checked employer side — the ones a Hiring Brief can use. */
export const briefRoutesFor = (g: VisaGuide) => g.routes.filter((r) => r.employer);

/** Countries where Hiring Briefs are available. */
export const briefCountries = new Set(visaGuides.filter((g) => briefRoutesFor(g).length > 0).map((g) => g.code));
