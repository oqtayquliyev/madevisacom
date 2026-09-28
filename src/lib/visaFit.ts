// "With a passport from Azerbaijan: EU Blue Card route" — which visa route
// a job's country offers someone with the visitor's passport.
//
// Passport = the personalization profile's citizenship (set by the
// visitor, or pre-filled from the country they browse from). Routes come
// from MadeVisa's visa guides (src/data/visa), the same data as
// /destinations. A job offer is assumed (it's a job), everything else a
// route asks for (degree, salary threshold…) is shown to confirm.

import { allCountries } from '@/data/allCountries';
import { destinationPath, REQUIREMENT_LABEL, visaGuideByCode, type VisaGuide, type VisaRoute } from '@/data/visa';
import { needsNoPermit } from '@/lib/destinationEligibility';

export type VisaFit =
  | { kind: 'no-passport'; label: string; href: string }
  | { kind: 'citizen' | 'free'; label: string; detail: string; href: string; guide: VisaGuide; passportName: string }
  | { kind: 'route'; label: string; detail: string; href: string; guide: VisaGuide; route: VisaRoute; more: number; passportName: string; asks: string[] }
  | { kind: 'no-guide'; label: string; detail: string; href: string; passportName: string; sponsored: boolean };

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
  const passportName = countryName(passport) ?? passport;
  const guide = visaGuideByCode.get(jobCountry);
  if (!guide) {
    if (passport === jobCountry) return { kind: 'no-guide', label: 'Your country — no visa needed', detail: '', href: '/destinations', passportName, sponsored: false };
    return {
      kind: 'no-guide',
      label: visaOffered ? 'Employer says it sponsors visas' : `Work permit needed · check ${countryName(jobCountry) ?? 'the country'}’s rules`,
      detail: `We don’t have a visa guide for ${countryName(jobCountry) ?? 'this country'} yet.`,
      href: '/destinations',
      passportName,
      sponsored: Boolean(visaOffered),
    };
  }
  const href = destinationPath(guide);
  const exempt = needsNoPermit(guide, passport);
  if (exempt) {
    return {
      kind: exempt,
      label: exempt === 'citizen' ? 'Your country — no visa needed' : 'No visa needed',
      detail: exempt === 'citizen' ? `You’re a citizen of ${guide.name}.` : `A passport from ${passportName} lets you live and work in ${guide.name} without a permit.`,
      href,
      guide,
      passportName,
    };
  }
  const routes = jobRoutes(guide);
  if (!routes.length) {
    return { kind: 'no-guide', label: `Work permit needed for ${guide.name}`, detail: guide.blurb, href, passportName, sponsored: Boolean(visaOffered) };
  }
  const route = routes[0];
  const asks = route.requires.filter((r) => r !== 'job-offer').map((r) => REQUIREMENT_LABEL[r] ?? r);
  const name = /\b(route|visa|permit|card|pass)\b/i.test(route.name) ? route.name : `${route.name} route`;
  return {
    kind: 'route',
    label: `${name}${routes.length > 1 ? ` +${routes.length - 1}` : ''}`,
    detail: route.summary,
    href,
    guide,
    route,
    more: routes.length - 1,
    passportName,
    asks,
  };
}
