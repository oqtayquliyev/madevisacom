import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { FileCheck2, FileSignature, Loader2, PlayCircle, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { briefEligibility, briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { creditsBadge, useOfferCredits } from '@/lib/sponsorOffer';
import { OfferFlags, OfferInfo } from '@/components/briefs/OfferBits';
import { OfferDemo, OfferSteps } from '@/components/briefs/OfferDemo';

type Props = {
  jobId: string;
  publisherId: string | null;
  jobTitle: string;
  companyName: string;
  jobFunction: string | null;
  jobCity: string | null;
  countryCode: string | null;
  visa: 'offered' | 'not_offered' | null | undefined;
  closed: boolean;
  onAuth?: (page: 'login' | 'register') => void;
};

/** Default country for jobs whose own country isn't covered yet. */
const FALLBACK = 'DE';

/**
 * "Get sponsored for this job" — on every open job page. Prepare the offer
 * PDF (or open it: "Your document is ready"), or see a demo filled in with
 * this job first.
 */
export function HiringBriefCallout(props: Props) {
  const { session } = useAuth();
  const credits = useOfferCredits();
  const el = useMemo(
    () => briefEligibility({ countryCode: props.countryCode, visa: props.visa, closed: props.closed, override: FALLBACK }),
    [props.countryCode, props.visa, props.closed],
  );
  const [existing, setExisting] = useState<string | null | undefined>(undefined);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    if (!session) return setExisting(null);
    fetchMyBriefForJob(props.jobId).then((b) => setExisting(b?.share_id ?? null));
  }, [session, props.jobId]);

  if (!el.ok) return null;
  const out = credits && !credits.unlimited && credits.left === 0;
  const start = el.picked ? `${newOfferPath(props.jobId)}&country=${el.code}` : newOfferPath(props.jobId);

  const primary =
    'inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
  const go = (href: string) => (e: MouseEvent) => {
    e.preventDefault();
    if (!session) return props.onAuth?.('register');
    nav(href);
  };

  return (
    <section aria-labelledby="offer-cta" className="mt-4 overflow-hidden rounded-2xl bg-brand-700 text-white">
      <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_200px] md:items-center">
        <div className="min-w-0">
          <OfferFlags size={24} highlight={el.code} />
          <div className="mt-4 flex items-start gap-2">
            <h2 id="offer-cta" className="text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">
              {existing ? 'Your document is ready' : 'Get sponsored for this job'}
            </h2>
            <OfferInfo light className="mt-1" />
          </div>
          <p className="mt-2 text-[15px] leading-6 text-white/85">
            {existing ? 'Attach the PDF to your application.' : `Attach a sponsorship offer to your application. ${props.companyName} sees exactly how to hire you.`}
          </p>
          <div className="mt-5">
            <OfferSteps light active={existing ? 3 : 0} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {session && existing === undefined ? (
              <span className="inline-flex items-center gap-2 text-[14px] text-white/80">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking…
              </span>
            ) : existing ? (
              <a href={briefPath(existing)} onClick={go(briefPath(existing))} className={primary}>
                <FileCheck2 className="h-4 w-4" /> Open my document
              </a>
            ) : out ? (
              <a href="/pricing#offers" onClick={go('/pricing#offers')} className={primary}>
                Get more offers
              </a>
            ) : (
              <a href={start} onClick={go(start)} className={primary}>
                <FileSignature className="h-4 w-4" /> Prepare my offer PDF
                <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-bold text-white">{creditsBadge(credits)}</span>
              </a>
            )}
            <button onClick={() => setDemo(true)} className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-bold text-white ring-1 ring-white/40 hover:bg-white/10">
              <PlayCircle className="h-4 w-4" /> See demo for this job
            </button>
          </div>
        </div>

        {/* A small "paper" so it's obvious what you get. */}
        <button onClick={() => setDemo(true)} aria-label="See demo for this job" className="hidden rotate-2 rounded-sm bg-white p-4 text-left text-ink-900 shadow-2xl transition hover:rotate-0 md:block">
          <p className="border-b-2 border-ink-900 pb-1 text-[10px] font-extrabold">
            made<span className="text-[#1D4ED8]">visa</span>
          </p>
          <p className="mt-2 font-serif text-[13px] font-semibold leading-tight">Sponsorship cost-sharing offer</p>
          <p className="mt-1 line-clamp-2 text-[10px] text-ink-500">
            {props.jobTitle} · {props.companyName}
          </p>
          {['Visa fee', 'Relocation', 'Translations'].map((r, i) => (
            <div key={r} className="mt-1.5 flex items-center justify-between text-[9px]">
              <span className="text-ink-600">{r}</span>
              <span className={`rounded px-1 font-semibold ${i === 1 ? 'bg-[#1D4ED8]/15 text-[#1D4ED8]' : i ? 'bg-ink-100' : 'bg-[#1D4ED8] text-white'}`}>{i === 1 ? 'Shared' : i ? 'Candidate' : 'Employer'}</span>
            </div>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2 text-[8px] text-ink-400">
            <span className="border-t border-ink-400 pt-0.5">Candidate</span>
            <span className="border-t border-ink-400 pt-0.5">Employer</span>
          </div>
        </button>
      </div>

      {demo && (
        <div role="dialog" aria-modal="true" aria-label="Offer demo" className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/60 p-3" onClick={() => setDemo(false)}>
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[#e9edf3] p-4 text-ink-900 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <OfferSteps active={1} />
              <button onClick={() => setDemo(false)} aria-label="Close demo" className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink-600 hover:text-ink-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <OfferDemo job={{ title: props.jobTitle, company: props.companyName, code: el.code }} />
            <div className="mt-5 flex justify-end">
              {existing ? (
                <a href={briefPath(existing)} onClick={go(briefPath(existing))} className="inline-flex items-center gap-2 rounded-full bg-[#1D4ED8] px-6 py-3 text-[15px] font-bold text-white hover:bg-brand-800">
                  <FileCheck2 className="h-4 w-4" /> Open my document
                </a>
              ) : (
                <a href={start} onClick={go(start)} className="inline-flex items-center gap-2 rounded-full bg-[#1D4ED8] px-6 py-3 text-[15px] font-bold text-white hover:bg-brand-800">
                  <FileSignature className="h-4 w-4" /> Make mine for this job
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
