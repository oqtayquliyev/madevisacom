import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { visaGuideByCode } from '@/data/visa';
import { briefCountries, type OfferCredits } from '@/lib/sponsorOffer';

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
          <span className="mt-3 block border-t border-ink-100 pt-2 text-[12px] leading-5 text-ink-500">Every account gets 5 free. Editing an offer later is free.</span>
        </span>
      )}
    </span>
  );
}

const Dot = () => <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D4ED8]" aria-hidden="true" />;

/** "3 of 5 left" with a dot per credit. */
export function CreditMeter({ credits, light = false }: { credits: OfferCredits; light?: boolean }) {
  if (credits.unlimited) return <span className={`text-[13px] font-semibold ${light ? 'text-white' : 'text-ink-700'}`}>Unlimited with Pro</span>;
  const dots = Math.min(credits.total, 10);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i < credits.left ? (light ? 'bg-white' : 'bg-[#1D4ED8]') : light ? 'bg-white/25' : 'bg-ink-200'}`} />
        ))}
      </span>
      <span className={`text-[13px] font-semibold tabular-nums ${light ? 'text-white' : 'text-ink-700'}`}>
        {credits.left} of {credits.total} left
      </span>
    </span>
  );
}

/** Overlapping flags of the countries an offer can be made for. */
export function OfferFlags({ size = 26, highlight }: { size?: number; highlight?: string | null }) {
  const codes = [...briefCountries].sort((a, b) => (a === highlight ? -1 : b === highlight ? 1 : 0));
  return (
    <span className="inline-flex items-center">
      {codes.map((c, i) => (
        <span key={c} className="rounded-full ring-2 ring-white" style={{ marginLeft: i ? -size * 0.28 : 0, zIndex: codes.length - i }} title={visaGuideByCode.get(c)?.name}>
          <CircleFlag countryCode={c} label={visaGuideByCode.get(c)?.name} size={size} />
        </span>
      ))}
    </span>
  );
}
