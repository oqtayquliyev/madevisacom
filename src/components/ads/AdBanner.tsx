import { ArrowRight } from 'lucide-react';

export type AdBannerContent = {
  advertiser: string;
  title: string;
  description: string;
  cta: string;
  url: string;
  image: string;
};

/**
 * Full-width promo banner meant to be interleaved between listing rows
 * (e.g. every 6th job/program card) — the classic "sponsored result"
 * placement. Keep it visually distinct but on-brand.
 */
export function AdBanner({ content }: { content: AdBannerContent }) {
  return (
    <a
      href={content.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group flex flex-col gap-4 overflow-hidden border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/30 p-4 transition hover:border-amber-300 dark:hover:border-amber-800 sm:flex-row sm:items-center lg:col-span-2"
    >
      <div className="h-28 w-full shrink-0 overflow-hidden sm:h-20 sm:w-32">
        <img src={content.image} alt="" className="h-full w-full object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <span className="inline-block rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Sponsored
        </span>
        <h3 className="mt-1.5 text-sm font-bold text-ink-900 dark:text-ink-50">{content.title}</h3>
        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{content.description}</p>
        <p className="mt-1 text-[11px] font-medium text-ink-400">By {content.advertiser}</p>
      </div>

      <span className="flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-ink-900 px-4 py-2.5 text-xs font-semibold text-white transition group-hover:bg-ink-800 sm:self-center">
        {content.cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}
