import { useState } from 'react';
import { Crown, FileSignature, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePersonalization } from '@/lib/personalization';
import { priceRegionFor, PRO_PRICES } from '@/lib/plans';
import { DOC_PRICE, PRO_MONTHLY_DOCS, SIGNUP_CREDIT, TOP_UP_DOCS, usd, useOfferCredits } from '@/lib/sponsorOffer';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';
import { CreditMeter } from '@/components/briefs/OfferBits';

/** Your credit, top up by documents, or Pro. Used on /offers and /pricing. */
export function BuyOffers({ onAuth, onPro }: { onAuth?: (p: 'login' | 'register') => void; onPro?: () => void }) {
  const { profile } = useAuth();
  const { profile: personal } = usePersonalization();
  const credits = useOfferCredits();
  const region = priceRegionFor(personal.currentLocation ?? personal.citizenship ?? null);
  const pro = PRO_PRICES[region].monthly;
  const [docs, setDocs] = useState<number>(3);
  const [open, setOpen] = useState(false);
  const total = docs * DOC_PRICE;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="flex flex-col rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-500">
          <Wallet className="h-4 w-4" /> Your credit
        </p>
        <div className="mt-2">
          {credits ? (
            <CreditMeter credits={credits} />
          ) : (
            <p className="text-[15px] text-ink-700">
              <span className="text-[28px] font-bold text-ink-950">{usd(SIGNUP_CREDIT)}</span> free on sign-up
            </p>
          )}
        </div>
        <p className="mt-1 text-[12px] text-ink-500">Your first document is on us.</p>
        {!profile && (
          <button onClick={() => onAuth?.('register')} className="mt-auto w-full rounded-lg border border-ink-200 py-2.5 text-[14px] font-semibold text-ink-800 hover:bg-ink-50">
            Create free account
          </button>
        )}
      </div>

      <div className="flex flex-col rounded-xl bg-[#1D4ED8] p-5 text-white">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
          <FileSignature className="h-4 w-4" /> Pay per document
        </p>
        <p className="mt-1 text-[28px] font-bold leading-tight">
          {usd(DOC_PRICE)} <span className="text-[14px] font-semibold text-white/75">each</span>
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="How many documents">
          {TOP_UP_DOCS.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={docs === n}
              onClick={() => setDocs(n)}
              className={`rounded-lg py-2 text-[13px] font-bold ${docs === n ? 'bg-white text-brand-700' : 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button onClick={() => (profile ? setOpen(true) : onAuth?.('register'))} className="mt-3 w-full rounded-lg bg-white py-2.5 text-[14px] font-bold text-brand-700 hover:bg-brand-50">
          Add {usd(total)} · {docs} {docs === 1 ? 'document' : 'documents'}
        </button>
      </div>

      <div className="flex flex-col rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-500">
          <Crown className="h-4 w-4 text-amber-500" /> Pro
        </p>
        <p className="mt-1 text-[28px] font-bold leading-tight text-ink-950">
          {usd(pro)} <span className="text-[14px] font-semibold text-ink-500">/ month</span>
        </p>
        <p className="text-[13px] text-ink-700">
          {PRO_MONTHLY_DOCS} documents a month · {usd(Math.round((pro / PRO_MONTHLY_DOCS) * 100) / 100)} each
        </p>
        <p className="text-[12px] font-semibold text-emerald-700">Save {Math.round((1 - pro / (PRO_MONTHLY_DOCS * DOC_PRICE)) * 100)}% vs {usd(PRO_MONTHLY_DOCS * DOC_PRICE)}</p>
        <button onClick={onPro} className="mt-auto w-full rounded-lg border border-[#1D4ED8]/40 py-2.5 text-[14px] font-bold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
          {credits?.pro ? 'You’re on Pro' : 'See Pro'}
        </button>
      </div>

      {open && (
        <PlanRequestDialog plan="brief_credits" billing="one_time" priceLabel={`${usd(total)} for ${docs} ${docs === 1 ? 'document' : 'documents'}`} region={region} onClose={() => setOpen(false)} onAuth={onAuth} />
      )}
    </div>
  );
}
