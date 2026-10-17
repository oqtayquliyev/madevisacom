// The sponsorship document, said the same way everywhere (CV match, job page, the sheet at Apply):
//   "Your sponsorship document from 🇦🇿 to 🇵🇱 is ready"
//   "Visa route: EU Blue Card"  — Starter and Pro; locked on the free plan
//   "Recommended: send it to {company} with your CV …"
// The visa route is the one the destination's page (/destinations/…) gives for the visitor's passport.
import { ArrowUpRight, Lock } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { usePersonalization } from '@/lib/personalization';
import { priceLabel, useMyPlan } from '@/lib/plans';
import { checkoutHref, trackBilling } from '@/lib/billing';
import { nav } from '@/lib/pageLayout';
import { countryName, visaFitFor } from '@/lib/visaFit';

const up = (c: string | null | undefined) => (c ? c.toUpperCase() : null);

/** The visitor's country for "from 🇦🇿": where they live, else their passport. */
export function useFromCountry(): string | null {
  const { profile } = usePersonalization();
  return up(profile.currentLocation) ?? up(profile.citizenship);
}

/** The work route the destination offers this visitor's passport (their country when no passport is set), or null. */
export function useVisaRoute(dest: string | null | undefined): { label: string; href: string } | null {
  const { profile } = usePersonalization();
  const passport = up(profile.citizenship) ?? up(profile.currentLocation);
  const to = up(dest);
  if (!to || !passport || passport === to) return null;
  const fit = visaFitFor(to, passport);
  if (!fit || fit.kind !== 'permit') return null;
  return { label: fit.label, href: fit.href };
}

/** "Your sponsorship document from 🇦🇿 to 🇵🇱 is ready" — flags only where the country is known. */
export function DocReadyTitle({ from, to, className = '' }: { from: string | null; to: string | null; className?: string }) {
  const same = from && to && from === to;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}>
      Your sponsorship document
      {from && !same && (
        <>
          from <CircleFlag countryCode={from} size={16} label={countryName(from) ?? from} />
        </>
      )}
      {to && (
        <>
          to <CircleFlag countryCode={to} size={16} label={countryName(to) ?? to} />
        </>
      )}
      is ready
    </span>
  );
}

/**
 * "Visa route: EU Blue Card ↗" (links to the destination's page) for Starter and Pro.
 * Free plan: the route stays hidden — not even in the page's code — with a small Starter link.
 */
export function VisaRouteLine({ dest, source, className = '' }: { dest: string | null | undefined; source: string; className?: string }) {
  const route = useVisaRoute(dest);
  const { isPaid, loading } = useMyPlan();
  if (!route || loading) return null;
  if (isPaid) {
    return (
      <a
        href={route.href}
        onClick={(e) => {
          e.preventDefault();
          nav(route.href);
        }}
        className={`inline-flex flex-wrap items-center gap-1 text-[12.5px] text-ink-700 hover:text-brand-700 ${className}`}
      >
        Visa route: <b className="font-bold text-ink-950">{route.label}</b>
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    );
  }
  const href = checkoutHref('starter', source);
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-700 ${className}`}>
      Visa route:
      <span aria-hidden className="pointer-events-none select-none rounded bg-ink-100 px-1.5 font-bold text-ink-700 blur-[4px]">
        Work permit route
      </span>
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          trackBilling('plan_selected', { plan: 'starter', source });
          nav(href);
        }}
        className="inline-flex items-center gap-1 font-bold text-brand-700 hover:underline"
      >
        <Lock className="h-3 w-3" aria-hidden /> See it with Starter · {priceLabel('starter')}
      </a>
    </span>
  );
}

/** The small recommendation under the document. */
export function SendWithCvNote({ company, className = '' }: { company?: string | null; className?: string }) {
  return (
    <p className={`text-[11.5px] leading-4 text-ink-500 ${className}`}>
      <b className="font-semibold text-ink-600">Recommended:</b> send it to {company || 'the company'} together with your CV. Adjust the terms in it first, then mention those terms in your application.
    </p>
  );
}
