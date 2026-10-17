// The sponsorship document line of an application. Its own file: it brings the document builder's
// code with it, which the homepage's match example doesn't need.
import { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, FileSignature, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { priceLabel } from '@/lib/plans';
import { checkoutHref } from '@/lib/billing';
import { briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { allowanceLabel, canMakeDocument, useOfferCredits } from '@/lib/sponsorOffer';
import { DocReadyTitle, SendWithCvNote, useFromCountry, VisaRouteLine } from '@/components/cv/DocReady';

type DocProps = {
  jobId: string;
  company: string;
  /** Country to start the builder with when the job's own isn't covered. */
  country?: string | null;
  /** The job's own country (ISO code), when known: the "to 🇵🇱" flag and the visa route. */
  dest?: string | null;
  /** The ad says sponsorship is offered: the document is a help, not a gap. */
  visaOffered: boolean;
  onAuth?: (p: 'login' | 'register') => void;
  /** Tighter layout for the sheet shown at Apply. */
  compact?: boolean;
};

/**
 * The sponsorship document as a line of the application: "Your sponsorship document from 🇦🇿 to 🇵🇱 is ready",
 * the visa route (Starter and Pro), and a small note to send it with the CV. Making it is part of
 * Starter and Pro (people with documents left from before can still use those).
 */
export function SponsorDocRow({ jobId, company, country, dest = null, visaOffered, onAuth, compact = false }: DocProps) {
  const from = useFromCountry();
  const to = dest ? dest.toUpperCase() : null;
  const { session } = useAuth();
  const credits = useOfferCredits();
  const [existing, setExisting] = useState<string | null | undefined>(session ? undefined : null);
  useEffect(() => {
    if (!session) return setExisting(null);
    let alive = true;
    fetchMyBriefForJob(jobId).then((b) => alive && setExisting(b?.share_id ?? null));
    return () => {
      alive = false;
    };
  }, [session, jobId]);

  const start = `${newOfferPath(jobId)}${country ? `&country=${country}` : ''}`;
  const can = canMakeDocument(credits);
  const go = (href: string) => () => nav(href);

  const why = existing
    ? `Attach the PDF next to your CV, or paste its link in your message to ${company}.`
    : visaOffered
      ? `${company} offers sponsorship. This short proposal shows them the visa route, what it asks of them and who you suggest pays what — so HR has less to work out.`
      : `This ad doesn’t mention visa sponsorship. This short proposal shows ${company} the visa route, what it asks of them and which costs you offer to share.`;

  const action = existing ? (
    <button onClick={go(briefPath(existing))} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
      <FileCheck2 className="h-4 w-4" /> Open it
    </button>
  ) : can && credits ? (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button onClick={go(start)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-700">
              <FileSignature className="h-4 w-4" /> Prepare it
            </button>
            <span className="text-[11px] text-ink-500">{allowanceLabel(credits)}</span>
          </span>
        ) : credits?.pro ? (
          <span className="text-right text-[12px] leading-4 text-ink-500">
            All {credits.quota} used this month.
            <br />
            They renew on the 1st{credits.quota < 50 ? <> — or <button onClick={go(checkoutHref('pro', 'documents_limit'))} className="font-semibold text-brand-700 hover:underline">50 a month with Pro</button></> : null}.
          </span>
        ) : (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button
              onClick={() => (session ? nav(checkoutHref('starter', 'sponsor_document')) : onAuth?.('register'))}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-700"
            >
              <Lock className="h-3.5 w-3.5" /> Add it with Starter
            </button>
            <span className="text-[11px] text-ink-500">20 a month · {priceLabel('starter')}</span>
          </span>
        );

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${compact ? 'py-2.5' : 'py-3.5'}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-bold text-ink-950">
            <DocReadyTitle from={from} to={to} />
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{existing ? 'Saved' : 'Ready'}</span>
          </p>
          <div className="mt-1">
            <VisaRouteLine dest={to} source="job_visa_route" />
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-600">{why}</p>
          <SendWithCvNote company={company} className="mt-1" />
        </div>
      </div>
      <div className="shrink-0 pl-8 sm:pl-0">{action}</div>
    </div>
  );
}
