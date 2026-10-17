import { useEffect, useMemo, useState } from 'react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { FiveStars } from '@/components/common/Testimonials';
import { useFromCountry } from '@/components/cv/DocReady';
import { journeysFor, type Journey } from '@/data/journeys';

/** Long enough to read a headline and two sentences on a phone. */
const EVERY_MS = 12_000;

function Review({ j }: { j: Journey }) {
  return (
    <figure className="animate-fade-in motion-reduce:animate-none">
      <figcaption>
        <p className="flex items-center gap-2">
          <b className="text-[15px] font-bold text-ink-950">{j.name}</b>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${j.plan === 'pro' ? 'bg-ink-950 text-white' : 'bg-brand-50 text-brand-700'}`}>
            {j.plan === 'pro' ? 'Pro member' : 'Starter member'}
          </span>
        </p>
        <FiveStars size={14} className="mt-1" />
        <p className="mt-1 flex flex-nowrap items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink-600">
          <span className="truncate">{j.role}</span>
          <span aria-hidden>·</span>
          <CircleFlag countryCode={j.from} size={14} label={j.fromName} />
          <span>{j.fromName}</span>
          <span aria-hidden>→</span>
          <CircleFlag countryCode={j.to} size={14} label={j.toName} />
          <span>{j.toName}</span>
        </p>
      </figcaption>
      <blockquote className="mt-2.5">
        <p className="text-[15px] font-bold leading-snug text-ink-950">“{j.headline}”</p>
        <p className="mt-1 text-[13.5px] leading-5 text-ink-600">{j.line}</p>
      </blockquote>
    </figure>
  );
}

/**
 * Member reviews, the visitor's own country first (India first for India…).
 * `rotate`: changes every 12 seconds, with dots to move between them; otherwise one stays put.
 */
export function ExampleJourney({ className = '', rotate = false, boxed = false }: { className?: string; rotate?: boolean; boxed?: boolean }) {
  const from = useFromCountry();
  const list = useMemo(() => journeysFor(from), [from]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!rotate || paused || list.length < 2) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % list.length), EVERY_MS);
    return () => window.clearTimeout(t);
  }, [rotate, paused, i, list.length]);
  const j = list[i % Math.max(1, list.length)];
  if (!j) return null;
  return (
    <section
      aria-label="What members say"
      className={`${boxed ? 'rounded-3xl bg-white p-5 ring-1 ring-ink-200 sm:p-6' : ''} ${className}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <Review key={j.name + j.from} j={j} />
      {rotate && list.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {list.slice(0, 8).map((x, n) => (
            <button key={x.name + x.from} onClick={() => setI(n)} aria-label={`Review ${n + 1}`} className={`h-1.5 rounded-full transition-all ${n === i % list.length ? 'w-5 bg-brand-600' : 'w-1.5 bg-ink-200'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
