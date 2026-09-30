import { useState } from 'react';
import { FileSignature, Infinity as InfinityIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePersonalization } from '@/lib/personalization';
import { OFFER_PACK_PRICE, priceRegionFor, PRO_PRICES } from '@/lib/plans';
import { CREDIT_PACK_SIZE, FREE_OFFER_CREDITS, useOfferCredits } from '@/lib/sponsorOffer';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';
import { CreditMeter } from '@/components/briefs/OfferBits';

/** Credits left + one-tap buy. Used on /offers and /pricing. */
export function BuyOffers({ onAuth, onPro }: { onAuth?: (p: 'login' | 'register') => void; onPro?: () => void }) {
  const { profile } = useAuth();
  const { profile: personal } = usePersonalization();
  const credits = useOfferCredits();
  const region = priceRegionFor(personal.currentLocation ?? personal.citizenship ?? null);
  const pack = OFFER_PACK_PRICE[region];
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
      <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <p className="text-[13px] font-semibold text-ink-500">You have</p>
        <div className="mt-2">{credits ? <CreditMeter credits={credits} /> : <span className="text-[15px] font-bold text-ink-900">{FREE_OFFER_CREDITS} free with an account</span>}</div>
        {!profile && (
          <button onClick={() => onAuth?.('register')} className="mt-4 w-full rounded-lg border border-ink-200 py-2.5 text-[14px] font-semibold text-ink-800 hover:bg-ink-50">
            Create free account
          </button>
        )}
      </div>

      <div className="flex flex-col rounded-xl bg-[#1D4ED8] p-5 text-white">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
          <FileSignature className="h-4 w-4" /> {CREDIT_PACK_SIZE} offers
        </p>
        <p className="mt-1 text-[28px] font-bold leading-tight">${pack}</p>
        <p className="text-[12px] text-white/75">One-time · ${(pack / CREDIT_PACK_SIZE).toFixed(2)} each</p>
        <button
          onClick={() => (profile ? setOpen(true) : onAuth?.('register'))}
          disabled={Boolean(credits?.unlimited)}
          className="mt-4 w-full rounded-lg bg-white py-2.5 text-[14px] font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
        >
          {credits?.unlimited ? 'You have unlimited' : `Buy ${CREDIT_PACK_SIZE} offers`}
        </button>
      </div>

      <div className="flex flex-col rounded-xl bg-white p-5 ring-1 ring-ink-200">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-500">
          <InfinityIcon className="h-4 w-4" /> Unlimited
        </p>
        <p className="mt-1 text-[28px] font-bold leading-tight text-ink-950">${PRO_PRICES[region].monthly}</p>
        <p className="text-[12px] text-ink-500">a month with Pro</p>
        <button onClick={onPro} className="mt-4 w-full rounded-lg border border-[#1D4ED8]/40 py-2.5 text-[14px] font-bold text-[#1D4ED8] hover:bg-[#1D4ED8]/5">
          See Pro
        </button>
      </div>

      {open && (
        <PlanRequestDialog plan="brief_credits" billing="one_time" priceLabel={`$${pack} for ${CREDIT_PACK_SIZE} offers`} region={region} onClose={() => setOpen(false)} onAuth={onAuth} />
      )}
    </div>
  );
}
