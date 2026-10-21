import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { visaGuideByCode } from '@/data/visa';
import { briefCountries } from '@/lib/sponsorOffer';

/** (i) button: what a sponsorship document does. Opens above or below, always fully on screen. */
export function OfferInfo({ className = '', light = false }: { className?: string; light?: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const W = 304;
  const H = 280;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom > H + 12;
    const top = below ? r.bottom + 8 : Math.max(8, r.top - H - 8);
    const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2));
    setPos({ top, left });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setPos(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    const off = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', off, true);
    window.addEventListener('resize', off);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', off, true);
      window.removeEventListener('resize', off);
    };
  }, [pos]);

  return (
    <span className={`inline-flex ${className}`}>
      <button
        ref={btn}
        type="button"
        onClick={() => (pos ? setPos(null) : place())}
        aria-expanded={Boolean(pos)}
        aria-label="How a sponsorship document helps"
        className={`grid h-6 w-6 place-items-center rounded-full ${light ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-ink-400 hover:bg-ink-100 hover:text-[#1D4ED8]'}`}
      >
        <Info className="h-4 w-4" />
      </button>
      {pos && (
        <span
          ref={pop}
          role="dialog"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: W, zIndex: 90 }}
          className="block max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl bg-white p-4 text-left text-ink-700 shadow-xl ring-1 ring-ink-200"
        >
          <span className="block text-[14px] font-bold text-ink-950">How it helps</span>
          <span className="mt-2 block text-[13px] leading-5">An employer who has never sponsored often doesn’t know what it involves. Your proposal lays it out, and says what is known and what still needs confirming:</span>
          <span className="mt-2 block space-y-1.5 text-[13px] leading-5">
            <span className="flex gap-2"><Dot />The route that may apply, with its official source, and what it asks of them</span>
            <span className="flex gap-2"><Dot />Who you suggest pays each cost — you choose</span>
            <span className="flex gap-2"><Dot />One-click replies, and terms they can carry into the contract</span>
          </span>
          <span className="mt-3 block border-t border-ink-100 pt-2 text-[12px] leading-5 text-ink-500">
            Part of the MadeVisa Membership (20 documents a month). You review everything first, and can correct it until the company accepts.
          </span>
        </span>
      )}
    </span>
  );
}

const Dot = () => <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D4ED8]" aria-hidden="true" />;

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
