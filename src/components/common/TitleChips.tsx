import { Check } from 'lucide-react';

// Short, bold labels instead of a grey sentence under a title. Clean pages read in titles:
// "Jobs from company career pages · Visa sponsor proof · CV match on every job".

export function TitleChips({ items, tone = 'light', className = '' }: { items: string[]; tone?: 'light' | 'dark' | 'plain'; className?: string }) {
  const chip =
    tone === 'dark'
      ? 'bg-white/12 text-white ring-white/25'
      : tone === 'plain'
        ? 'bg-white text-ink-800 ring-ink-200'
        : 'bg-ink-50 text-ink-800 ring-ink-200';
  const icon = tone === 'dark' ? 'text-emerald-300' : 'text-brand-600';
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((t) => (
        <li key={t} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-semibold ring-1 sm:text-[14.5px] ${chip}`}>
          <Check className={`h-3.5 w-3.5 shrink-0 ${icon}`} strokeWidth={3} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}
