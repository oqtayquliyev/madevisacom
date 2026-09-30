import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { visaGuideByCode } from '@/data/visa';
import { briefCountries, DOC_PRICE, PRO_MONTHLY_DOCS, SIGNUP_CREDIT, usd, type OfferCredits } from '@/lib/sponsorOffer';

/** (i) button: what a sponsor offer does, in four lines. */
export function OfferInfo({ className = '', light = false }: { className?: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="How a sponsor offer helps"
        className={`grid h-6 w-6 place-items-center rounded-full ${light ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-ink-400 hover:bg-ink-100 hover:text-[#1D4ED8]'}`}
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span role="dialog" className="absolute left-1/2 top-8 z-50 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl bg-white p-4 text-left text-ink-700 shadow-xl ring-1 ring-ink-200">
          <span className="block text-[14px] font-bold text-ink-950">How it helps</span>
          <span className="mt-2 block text-[13px] leading-5">Most employers say no to sponsorship because they guess it’s slow, costly and risky. Your offer answers that on one page:</span>
          <span className="mt-2 block space-y-1.5 text-[13px] leading-5">
            <span className="flex gap-2"><Dot />The legal route and the few steps on their side</span>
            <span className="flex gap-2"><Dot />Which visa costs you’ll carry — you choose with the slider</span>
            <span className="flex gap-2"><Dot />Signature lines, so HR can file it with the contract</span>
          </span>
          <span className="mt-3 block border-t border-ink-100 pt-2 text-[12px] leading-5 text-ink-500">Each document is {usd(DOC_PRICE)}. New accounts get {usd(SIGNUP_CREDIT)} credit, so your first one is free. Editing later is free.</span>
        </span>
      )}
    </span>
  );
}

const Dot = () => <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D4ED8]" aria-hidden="true" />;

/** "$20 credit · 1 document" — plus the Pro allowance for members. */
export function CreditMeter({ credits, light = false }: { credits: OfferCredits; light?: boolean }) {
  const strong = light ? 'text-white' : 'text-ink-950';
  const soft = light ? 'text-white/75' : 'text-ink-500';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <span className={`text-[15px] font-bold tabular-nums ${strong}`}>{usd(credits.balance)}</span>
      <span className={soft}>credit</span>
      <span className={soft}>·</span>
      <span className={`font-semibold tabular-nums ${strong}`}>
        {credits.left} {credits.left === 1 ? 'document' : 'documents'}
      </span>
      {credits.pro && <span className={soft}>(Pro: {credits.proLeft} of {PRO_MONTHLY_DOCS} this month)</span>}
    </span>
  );
}

/** Overlapping flags of the countries an offer can be made for. */
export function OfferFlags({ size = 26, highlight }: { size?: number; highlight?: string | null }) {
  const codes = [...briefCountries].sort((a, b) => (a === highlight ? -1 : b === highlight ? 1 : 0));
  return (
    <span className="inline-flex items-center" aria-label={`Works in ${codes.map((c) => visaGuideByCode.get(c)?.name ?? c).join(', ')}`}>
      {codes.map((c, i) => (
        <span key={c} className="relative rounded-full bg-white ring-2 ring-white" style={{ marginLeft: i ? -size * 0.22 : 0, zIndex: codes.length - i }} title={visaGuideByCode.get(c)?.name}>
          <FlagDot code={c} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Flag image; if it can't load, the country code in a circle (never an empty ring). */
function FlagDot({ code, size }: { code: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="grid place-items-center rounded-full bg-ink-100 font-bold text-ink-700" style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {code}
      </span>
    );
  return (
    <img
      src={`https://hatscripts.github.io/circle-flags/flags/${code.toLowerCase()}.svg`}
      alt=""
      loading="eager"
      decoding="async"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="block rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
