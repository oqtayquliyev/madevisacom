import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { FiveStars } from '@/components/common/Testimonials';
import { useFromCountry } from '@/components/cv/DocReady';
import { journeysFor, type Journey } from '@/data/journeys';

/** Long enough to read a review on a phone before the next one slides in. */
const EVERY_MS = 12_000;
/** The visitor's country's three, then a few more. */
const SHOWN = 9;

function Review({ j, className = '' }: { j: Journey; className?: string }) {
  return (
    <figure className={`rounded-2xl bg-white p-4 text-left ring-1 ring-ink-200 sm:p-5 ${className}`}>
      <figcaption>
        <p className="flex flex-wrap items-center gap-2">
          <b className="text-[15px] font-bold text-ink-950">{j.name}</b>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${j.plan === 'pro' ? 'bg-ink-950 text-white' : 'bg-brand-50 text-brand-700'}`}>
            {j.plan === 'pro' ? 'Pro member' : 'Starter member'}
          </span>
        </p>
        <FiveStars size={14} className="mt-1" />
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-ink-600">
          <span>{j.role}</span>
          <span aria-hidden>·</span>
          <CircleFlag countryCode={j.from} size={14} label={j.fromName} />
          <span aria-hidden>→</span>
          <CircleFlag countryCode={j.to} size={14} label={j.toName} />
          <span>{j.toName}</span>
        </p>
      </figcaption>
      <blockquote className="mt-2.5" dir="auto">
        <p className="text-[15px] font-bold leading-snug text-ink-950">“{j.headline}”</p>
        <p className="mt-1 text-[13.5px] leading-5 text-ink-600">{j.line}</p>
      </blockquote>
    </figure>
  );
}

/**
 * Member reviews, the visitor's own country first.
 * `rotate`: a row of cards to swipe (phones) or scroll; it also moves on by itself every 12 seconds,
 * and stops once the visitor touches it. `wide`: one full-width card at a time (narrow columns, like the quiz).
 * Without `rotate`: one review that stays put.
 */
export function ExampleJourney({ className = '', rotate = false, boxed = false, wide = false }: { className?: string; rotate?: boolean; boxed?: boolean; wide?: boolean }) {
  const from = useFromCountry();
  const list = useMemo(() => journeysFor(from).slice(0, SHOWN), [from]);
  const row = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [touched, setTouched] = useState(false);

  // Which card is in view, from the scroll position (works for swipes, the dots and the timer alike).
  const onScroll = () => {
    const el = row.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    setAt(Math.round(el.scrollLeft / (card.offsetWidth + 12)));
  };
  const go = (n: number) => {
    const el = row.current;
    const card = el?.children[n] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };
  useEffect(() => {
    if (!rotate || touched || list.length < 2) return;
    const t = window.setTimeout(() => go((at + 1) % list.length), EVERY_MS);
    return () => window.clearTimeout(t);
  }, [rotate, touched, at, list.length]);

  if (!list[0]) return null;
  if (!rotate) return <Review j={list[0]} className={`${boxed ? '' : '!p-0 !ring-0'} ${className}`} />;

  return (
    <section aria-label="What members say" className={className}>
      <div
        ref={row}
        onScroll={onScroll}
        onPointerDown={() => setTouched(true)}
        onWheel={() => setTouched(true)}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {list.map((j) => (
          <Review key={j.name + j.from} j={j} className={`shrink-0 snap-start ${wide ? 'w-[88%] sm:w-full' : 'w-[86%] sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]'}`} />
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {list.map((j, n) => (
          <button
            key={j.name + j.from}
            onClick={() => {
              setTouched(true);
              go(n);
            }}
            aria-label={`Review ${n + 1}`}
            className={`h-1.5 rounded-full transition-all ${n === at ? 'w-5 bg-brand-600' : 'w-1.5 bg-ink-300'}`}
          />
        ))}
      </div>
    </section>
  );
}
