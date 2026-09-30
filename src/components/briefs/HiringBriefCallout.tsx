import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileSignature, Loader2, Paperclip } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { briefEligibility, briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { fetchOfferCredits, type OfferCredits } from '@/lib/sponsorOffer';
import { CreditMeter, OfferFlags, OfferInfo } from '@/components/briefs/OfferBits';
import { briefCountries, visaGuideByCode } from '@/data/visa';

const countryList = () => [...briefCountries].map((c) => visaGuideByCode.get(c)?.name ?? c).join(', ');

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


/**
 * "Prepare your sponsor offer" — on job pages in countries with checked
 * employer data. Opens the offer builder (/brief/new?job=…), which spends
 * one credit when the document is generated.
 */
export function HiringBriefCallout(props: Props) {
  const { session } = useAuth();
  const eligibility = useMemo(() => briefEligibility({ countryCode: props.countryCode, visa: props.visa, closed: props.closed }), [props.countryCode, props.visa, props.closed]);
  const [existing, setExisting] = useState<string | null | undefined>(undefined);
  const [credits, setCredits] = useState<OfferCredits | null>(null);

  useEffect(() => {
    if (!session || !eligibility.ok) {
      setExisting(null);
      return;
    }
    fetchMyBriefForJob(props.jobId).then((b) => setExisting(b?.share_id ?? null));
    fetchOfferCredits().then(setCredits);
  }, [session, props.jobId, eligibility.ok]);

  if (!eligibility.ok) return null;
  const { guide } = eligibility;
  const offered = props.visa === 'offered';
  const noCredits = credits && !credits.unlimited && credits.left === 0;

  const primary = 'inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-bold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    <section aria-labelledby="offer-cta" className="mt-4 overflow-hidden rounded-2xl bg-brand-700 text-white">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <OfferFlags size={24} highlight={guide.code} />
          <span className="text-[13px] font-semibold text-white/80">Works for jobs in {countryList()}</span>
        </div>

        <div className="mt-4 flex items-start gap-2">
          <h2 id="offer-cta" className="text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
            {existing ? 'Your sponsor offer is ready' : offered ? `Make ${props.companyName}'s visa decision easy` : 'Prepare your sponsor offer'}
          </h2>
          <OfferInfo light className="mt-1" />
        </div>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-white/85">
          {existing
            ? 'Save it as a PDF and attach it to your application, or send the link to the recruiter.'
            : offered
              ? `A signed-ready document showing the ${guide.name} route, the steps on their side, and which visa costs you'll carry.`
              : `This job doesn't mention sponsorship. Show ${props.companyName} exactly how hiring you in ${guide.name} works, and which costs you'll carry — one page they can sign.`}
        </p>

        <ol className="mt-5 grid gap-2 text-[13px] sm:grid-cols-3">
          {['Drag to decide who pays what', 'Save it as a PDF', 'Attach it when you apply'].map((t, i) => (
            <li key={t} className="flex items-center gap-2.5 rounded-lg bg-white/10 px-3 py-2.5 ring-1 ring-white/15">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[12px] font-bold text-brand-700">{i + 1}</span>
              <span className="font-semibold text-white">{t}</span>
              {i === 2 && <Paperclip className="ml-auto h-4 w-4 text-white/60" />}
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!session ? (
            <button onClick={() => props.onAuth?.('register')} className={primary}>
              <FileSignature className="h-4 w-4" /> Sign up — 5 offers free
            </button>
          ) : existing === undefined ? (
            <span className="inline-flex items-center gap-2 text-[14px] text-white/80">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : existing ? (
            <a href={briefPath(existing)} onClick={(e) => (e.preventDefault(), nav(briefPath(existing)))} className={primary}>
              Open your offer <ArrowRight className="h-4 w-4" />
            </a>
          ) : noCredits ? (
            <a href="/pricing#offers" onClick={(e) => (e.preventDefault(), nav('/pricing#offers'))} className={primary}>
              Get more offers <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <a href={newOfferPath(props.jobId)} onClick={(e) => (e.preventDefault(), nav(newOfferPath(props.jobId)))} className={primary}>
              <FileSignature className="h-4 w-4" /> Prepare your sponsor offer
            </a>
          )}
          {session && credits && !existing && <CreditMeter credits={credits} light />}
          {!session && <span className="text-[13px] text-white/75">Free account. Your email and phone are never shown.</span>}
        </div>
      </div>
    </section>
  );
}
