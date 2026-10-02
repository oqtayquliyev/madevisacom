// "Passport from Azerbaijan: EU Blue Card" — the visa route a job's country
// offers someone with the visitor's passport. Shown ONLY when a permit is
// needed; nothing is shown when the passport can work there freely.
//
// Whether a permit is needed comes from the rule table in
// src/data/visaRules.ts (country groups — easy to correct). For countries
// with a MadeVisa visa guide (src/data/visa) the exact route comes from the
// guide; otherwise from the rule.

import { allCountries } from '@/data/allCountries';
import { destinationPath, REQUIREMENT_LABEL, visaGuideByCode, type VisaGuide, type VisaRoute } from '@/data/visa';
import { REGIONS, RULES_REVIEWED, regionOf, workRule } from '@/data/visaRules';

export type VisaFit =
  | { kind: 'no-passport'; label: string; href: string }
  | {
      kind: 'permit';
      label: string;
      href: string;
      passport: string;
      passportName: string;
      passportRegion: string | null;
      destName: string;
      /** Which group rule matched, e.g. "Passports from outside the EU/EEA → EU countries". */
      applies: string;
      note: string;
      reviewed: string;
      guide?: VisaGuide;
      route?: VisaRoute;
      more: number;
      asks: string[];
      sponsored: boolean;
    };

export const countryName = (code: string | null | undefined) => (code ? allCountries.find((c) => c.code === code)?.name ?? code : null);

/** Work routes a job offer opens, most common first (guide order, work before talent). */
function jobRoutes(g: VisaGuide): VisaRoute[] {
  const offer = g.routes.filter((r) => r.requires.includes('job-offer'));
  const pool = offer.length ? offer : g.routes.filter((r) => r.kind === 'work' || r.kind === 'talent');
  return [...pool].sort((a, b) => (a.kind === 'work' ? 0 : 1) - (b.kind === 'work' ? 0 : 1));
}

export function visaFitFor(jobCountry: string | null | undefined, passport: string | null | undefined, visaOffered?: boolean | null): VisaFit | null {
  if (!jobCountry) return null;
  if (!passport) return { kind: 'no-passport', label: 'Add your passport to see your visa route', href: '/destinations' };

  const match = workRule(passport, jobCountry);
  if (!match.result.permit) return null; // can work there freely — show nothing

  const region = regionOf(passport);
  const base = {
    kind: 'permit' as const,
    passport,
    passportName: countryName(passport) ?? passport,
    passportRegion: region ? REGIONS[region].name : null,
    destName: countryName(jobCountry) ?? jobCountry,
    applies: match.rule.applies,
    note: match.result.note,
    reviewed: RULES_REVIEWED,
    sponsored: Boolean(visaOffered),
  };

  const guide = visaGuideByCode.get(jobCountry);
  const routes = guide ? jobRoutes(guide) : [];
  // A bloc rule (e.g. Mercosur) is more specific than the country's general guide.
  const blocRule = match.rule.id !== 'default' && !match.rule.id.startsWith('to-');
  if (guide && routes.length && !blocRule) {
    const route = routes[0];
    const name = /\b(route|visa|permit|card|pass)\b/i.test(route.name) ? route.name : `${route.name} route`;
    return {
      ...base,
      label: `${name}${routes.length > 1 ? ` +${routes.length - 1}` : ''}`,
      href: destinationPath(guide),
      guide,
      route,
      more: routes.length - 1,
      asks: route.requires.filter((r) => r !== 'job-offer').map((r) => REQUIREMENT_LABEL[r] ?? r),
      note: route.summary,
    };
  }
  return {
    ...base,
    label: match.result.route === 'Work permit needed' && visaOffered ? 'Work permit needed · employer sponsors' : match.result.route,
    href: guide ? destinationPath(guide) : '/destinations',
    guide,
    more: 0,
    asks: [],
  };
}

/**
 * The visitor doesn't need a visa for this job: it's in the country they
 * live in or hold a passport of, or their passport lets them work there
 * freely (e.g. an EU passport for a job in Germany). Visa Plans
 * aren't shown on those jobs.
 */
export function isLocalJobFor(jobCountry: string | null | undefined, visitor: { citizenship: string | null; currentLocation: string | null }): boolean {
  const job = (jobCountry ?? '').toUpperCase();
  if (!job) return false;
  if (visitor.currentLocation?.toUpperCase() === job || visitor.citizenship?.toUpperCase() === job) return true;
  if (!visitor.citizenship) return false;
  return !workRule(visitor.citizenship.toUpperCase(), job).result.permit;
}
