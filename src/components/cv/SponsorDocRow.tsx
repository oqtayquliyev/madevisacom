// The sponsorship document line of an application. Its own file: it brings the document builder's
// code with it, which the homepage's match example doesn't need.
import { useEffect, useState } from 'react';
import { FileCheck2, FileSignature, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { usePrices } from '@/lib/pricing';
import { briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { allowanceLabel, canMakeDocument, useOfferCredits } from '@/lib/sponsorOffer';
import { Row } from '@/components/cv/MatchBits';

type DocProps = {
  jobId: string;
  company: string;
  /** Country to start the builder with when the job's own isn't covered. */
  country?: string | null;
  /** The ad says sponsorship is offered: the document is a help, not a gap. */
  visaOffered: boolean;
  onAuth?: (p: 'login' | 'register') => void;
  /** Tighter layout for the sheet shown at Apply. */
  compact?: boolean;
};

/**
 * The sponsorship document as a line of the application: "Missing" until
 * one has been made for this job. Making it is part of MadeVisa Pro (people
 * with documents left from before can still use those).
 */
export function SponsorDocRow({ jobId, company, country, visaOffered, onAuth, compact = false }: DocProps) {
  const { session } = useAuth();
  const credits = useOfferCredits();
  const prices = usePrices();
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

  if (existing) {
    return (
      <Row
        ok
        compact={compact}
        title="Sponsorship document"
        status="Ready"
        text={`Attach the PDF next to your CV, or paste its link in your message to ${company}.`}
        action={
          <button onClick={go(briefPath(existing))} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
            <FileCheck2 className="h-4 w-4" /> Open it
          </button>
        }
      />
    );
  }

  const why = visaOffered
    ? `${company} offers sponsorship. This short proposal shows them the visa route that may apply, what it asks of them and who you suggest pays what — so HR has less to work out.`
    : `This ad doesn’t mention visa sponsorship. This short proposal shows ${company} the visa route that may apply, what it asks of them and which costs you offer to share.`;

  return (
    <Row
      ok={false}
      soft={visaOffered}
      compact={compact}
      title="Sponsorship document"
      status={visaOffered ? 'Not added' : 'Missing'}
      text={why}
      action={
        can && credits ? (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button onClick={go(start)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-700">
              <FileSignature className="h-4 w-4" /> Prepare it
            </button>
            <span className="text-[11px] text-ink-500">{allowanceLabel(credits)}</span>
          </span>
        ) : credits?.pro ? (
          <span className="text-right text-[12px] leading-4 text-ink-500">
            All 50 used this month.
            <br />
            They renew on the 1st.
          </span>
        ) : (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button
              onClick={() => (session ? nav('/pricing#pro') : onAuth?.('register'))}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-700"
            >
              <Lock className="h-3.5 w-3.5" /> Add it with Pro
            </button>
            <span className="text-[11px] text-ink-500">
              50 a month · {prices.pro.monthly.label}/month
            </span>
          </span>
        )
      }
    />
  );
}
