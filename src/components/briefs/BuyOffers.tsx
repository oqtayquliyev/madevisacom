import { useState } from 'react';
import { Check, Crown, TrendingUp, Wallet } from 'lucide-react';
import { replyOdds } from '@/components/briefs/OfferOddsStat';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/visaFit';
import { DEFAULT_PACK, priceNote, PRO_MONTHLY_DOCS, usePrices, type Prices } from '@/lib/pricing';
import { docsLabel, useOfferCredits } from '@/lib/sponsorOffer';
import { PlanRequestDialog } from '@/components/pro/PlanRequestDialog';

/** What the admin sees on the request: "5 documents · AZN 35 ($20) · AZ/B". */
export function priceRequestLabel(p: Prices, what: string, local: { label: string; usdLabel: string; local: boolean }) {
  const price = local.local ? `${local.label} (${local.usdLabel})` : local.usdLabel;
  return `${what} · ${price}${p.country ? ` · ${p.country}/${p.tier}` : ''}`.slice(0, 60);
}

/**
 * Buy document credits (1 credit = 1 document) — three packs, priced for the
 * visitor's country in their currency — or Pro. Used on /offers and /pricing.
 */
export function BuyOffers({ onAuth, onPro }: { onAuth?: (p: 'login' | 'register') => void; onPro?: () => void }) {
  const { profile } = useAuth();
  const credits = useOfferCredits();
  const prices = usePrices();
  const [open, setOpen] = useState<number | null>(null);
  const pack = prices.packs.find((p) => p.docs === open);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {prices.packs.map((p) => {
          const featured = p.docs === DEFAULT_PACK;
          return (
            <div key={p.docs} className={`relative flex flex-col rounded-xl p-5 ${featured ? 'bg-[#1D4ED8] text-white shadow-soft-lg' : 'bg-white ring-1 ring-ink-200'}`}>
              {featured && <span className="absolute -top-2.5 left-5 rounded-full bg-emerald-400 px-2.5 py-0.5 text-[11px] font-bold text-ink-950">Most chosen</span>}
              <p className={`text-[13px] font-semibold ${featured ? 'text-white/80' : 'text-ink-500'}`}>{docsLabel(p.docs)}</p>
              <p className="mt-1 text-[30px] font-bold leading-tight tabular-nums">{p.price.label}</p>
              <p className={`text-[13px] ${featured ? 'text-white/80' : 'text-ink-600'}`}>
                {p.docs > 1 ? `${p.perDoc.label} each` : 'one document'}
                {p.saving > 0 && <span className={`ml-1.5 font-bold ${featured ? 'text-emerald-300' : 'text-emerald-600'}`}>−{p.saving}%</span>}
              </p>
              <HireLine featured={featured} apps={p.docs} />
              <button
                onClick={() => (profile ? setOpen(p.docs) : onAuth?.('register'))}
                className={`mt-4 w-full rounded-lg py-2.5 text-[14px] font-bold ${featured ? 'bg-white text-brand-700 hover:bg-brand-50' : 'border border-[#1D4ED8]/40 text-[#1D4ED8] hover:bg-[#1D4ED8]/5'}`}
              >
                {profile ? `Get ${p.docs === 1 ? '1 credit' : `${p.docs} credits`}` : 'Create free account'}
              </button>
            </div>
          );
        })}

        <div className="flex flex-col rounded-xl bg-white p-5 ring-1 ring-amber-200">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-500">
            <Crown className="h-4 w-4 text-amber-500" /> Pro
          </p>
          <p className="mt-1 text-[30px] font-bold leading-tight tabular-nums text-ink-950">
            {prices.pro.monthly.label}
            <span className="text-[14px] font-semibold text-ink-500"> / month</span>
          </p>
          <p className="text-[13px] text-ink-600">
            {PRO_MONTHLY_DOCS} documents a month · {prices.pro.perDoc.label} each
          </p>
          <HireLine apps={PRO_MONTHLY_DOCS} perMonth />
          <ul className="mt-2 space-y-1 text-[12px] text-ink-600">
            {['Instant job alerts', 'Full company reply data'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-amber-500" /> {t}
              </li>
            ))}
          </ul>
          <button onClick={onPro} className="mt-auto w-full rounded-lg bg-amber-400 py-2.5 text-[14px] font-bold text-ink-950 hover:bg-amber-300">
            {credits?.pro ? 'You’re on Pro' : 'See Pro'}
          </button>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        {credits && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-700">
            <Wallet className="h-3.5 w-3.5" /> You have {docsLabel(credits.left)} left
          </span>
        )}
        <span>1 credit = 1 sponsorship document. Your first one is free. Credits never expire.</span>
        <span>{priceNote(prices, countryName)}</span>
      </p>

      {open !== null && pack && (
        <PlanRequestDialog
          plan="brief_credits"
          billing="one_time"
          priceLabel={priceRequestLabel(prices, docsLabel(pack.docs), pack.price)}
          region={prices.tier}
          onClose={() => setOpen(null)}
          onAuth={onAuth}
        />
      )}
    </div>
  );
}

/**
 * "46% chance of at least one employer reply · vs 23% without" — grows with
 * the pack size, so bigger plans show bigger (and honest) numbers.
 */
function HireLine({ apps, featured = false, perMonth = false }: { apps: number; featured?: boolean; perMonth?: boolean }) {
  const withDoc = replyOdds(apps, true);
  const without = replyOdds(apps, false);
  return (
    <div className={`mt-2 rounded-md px-2 py-1.5 ${featured ? 'bg-emerald-400/15' : 'bg-emerald-50'}`}>
      <p className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${featured ? 'text-emerald-200' : 'text-emerald-700'}`}>
        <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
        <span>
          <strong className={`tabular-nums text-[15px] ${featured ? 'text-emerald-300' : 'text-emerald-600'}`}>{withDoc}%</strong> chance of an employer reply
          {perMonth ? ' every month' : ''}
        </span>
      </p>
      {/* Bar: without (faint) vs with documents (solid) */}
      <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${featured ? 'bg-white/15' : 'bg-emerald-100'}`} aria-hidden>
        <div className={`relative h-full rounded-full ${featured ? 'bg-emerald-300' : 'bg-emerald-500'}`} style={{ width: `${withDoc}%` }} />
      </div>
      <p className={`mt-0.5 text-[11px] ${featured ? 'text-white/70' : 'text-ink-500'}`}>
        across {apps} application{apps === 1 ? '' : 's'} · {without}% without a document
      </p>
    </div>
  );
}
