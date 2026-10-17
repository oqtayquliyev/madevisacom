import { useMemo } from 'react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { useFromCountry } from '@/components/cv/DocReady';
import { journeysFor } from '@/data/journeys';
import { priceLabel } from '@/lib/plans';

/** One member review — from the visitor's own country when there is one (India first for India, …). */
export function ExampleJourney({ className = '', full = false }: { className?: string; full?: boolean }) {
  const from = useFromCountry();
  const j = useMemo(() => journeysFor(from)[0], [from]);
  if (!j) return null;
  return (
    <figure className={className}>
      <blockquote className="text-[15px] font-bold leading-snug text-ink-950">“{j.headline}”</blockquote>
      {full && <p className="mt-1 text-[13.5px] leading-5 text-ink-600">{j.line}</p>}
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-600">
        <b className="font-semibold text-ink-800">{j.name}</b> · {j.role} ·
        <CircleFlag countryCode={j.from} size={14} label={j.fromName} /> {j.fromName}
        <span aria-hidden>→</span>
        <CircleFlag countryCode={j.to} size={14} label={j.toName} /> {j.toName}
        <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
          {j.plan === 'pro' ? 'Pro' : 'Starter'} · {priceLabel(j.plan)}
        </span>
      </figcaption>
    </figure>
  );
}
