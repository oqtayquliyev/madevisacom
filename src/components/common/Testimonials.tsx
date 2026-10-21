import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, Quote, Star } from 'lucide-react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { TESTIMONIALS, type Testimonial } from '@/data/testimonials';

/** Shown under every set of member feedback. */
export const TESTIMONIAL_NOTE = 'Shared by MadeVisa members with their permission. Names shortened; results vary.';

/** Five filled stars. */
export function FiveStars({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label="Rated 5 out of 5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden style={{ width: size, height: size }} className="fill-amber-400 text-amber-400" />
      ))}
    </span>
  );
}

/** India → Germany, with circle flags. */
function Route({ t, size = 16 }: { t: Testimonial; size?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink-600">
      <CircleFlag countryCode={t.from.code} label={t.from.name} size={size} />
      {t.from.name}
      <ArrowRight className="h-3 w-3 text-ink-400" aria-hidden />
      <CircleFlag countryCode={t.to.code} label={t.to.name} size={size} />
      {t.to.name}
    </span>
  );
}

/** One member's feedback. No photo or avatar: members asked to stay anonymous. */
export function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="flex h-full flex-col rounded-2xl bg-white p-6 ring-1 ring-ink-200">
      <FiveStars />
      <blockquote className="mt-3 flex-1">
        <p className="text-[17px] font-bold leading-snug text-ink-950">“{t.headline}”</p>
        <p className="mt-2 text-[14px] leading-6 text-ink-600">{t.text}</p>
      </blockquote>
      <figcaption className="mt-5 border-t border-ink-100 pt-4">
        <span className="block text-[14px] font-bold text-ink-950">
          {t.name}
          {t.role && <span className="font-normal text-ink-500"> · {t.role}</span>}
        </span>
        <span className="mt-1.5 block">
          <Route t={t} />
        </span>
      </figcaption>
    </figure>
  );
}

type SectionProps = {
  items: Testimonial[];
  eyebrow?: string;
  title: string;
  sub?: string;
  /** Cards shown before "Show more". */
  initial?: number;
  id?: string;
  className?: string;
};

/** A grid of feedback cards, with "Show more" when there are many. */
export function TestimonialsSection({ items, eyebrow = 'From MadeVisa members', title, sub, initial = 6, id = 'feedback', className = '' }: SectionProps) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  return (
    <section aria-labelledby={`${id}-title`} className={className}>
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-brand-700">
        <Quote className="h-4 w-4" aria-hidden /> {eyebrow}
      </p>
      <h2 id={`${id}-title`} className="mt-2 max-w-2xl text-[28px] font-bold leading-[1.15] tracking-tight text-ink-950 sm:text-[36px]">
        {title}
      </h2>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-600">
        <FiveStars />
        <span>{sub ?? `${items.length} members, all 5 stars`}</span>
      </p>
      <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <li key={t.id}>
            <TestimonialCard t={t} />
          </li>
        ))}
      </ul>
      {items.length > initial && !all && (
        <p className="mt-6 text-center">
          <button onClick={() => setAll(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-ink-900 ring-1 ring-ink-200 hover:bg-ink-50">
            Show all {items.length} <ChevronDown className="h-4 w-4" />
          </button>
        </p>
      )}
      <p className="mt-5 text-center text-[12px] text-ink-500">{TESTIMONIAL_NOTE}</p>
    </section>
  );
}

/** Short quotes (the headlines) that change every few seconds — for the CV match waiting screen. */
export function TestimonialTicker({ every = 3200 }: { every?: number }) {
  const list = TESTIMONIALS;
  const [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % list.length), every);
    return () => window.clearInterval(t);
  }, [every, list.length]);
  const t = list[i];
  if (!t) return null;
  return (
    <figure key={t.id} className="animate-fade-up motion-reduce:animate-none">
      <FiveStars size={12} />
      <blockquote className="mt-1 text-[13.5px] font-semibold leading-5 text-ink-900">“{t.headline}”</blockquote>
      <figcaption className="mt-0.5 text-[12px] text-ink-500">
        {[t.name, t.role, `${t.from.name} → ${t.to.name}`].filter(Boolean).join(' · ')}
      </figcaption>
    </figure>
  );
}
