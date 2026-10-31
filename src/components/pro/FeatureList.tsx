import { FEATURES } from '@/lib/plans';

// "01. 2,000+ company career websites. One search." — the five headline features, numbered.
export function FeatureList({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <ol className={`divide-y divide-ink-100 rounded-2xl bg-white ring-1 ring-ink-200 ${className}`}>
      {FEATURES.map((f) => (
        <li key={f.title} className={`flex gap-4 ${compact ? 'px-3.5 py-2.5' : 'px-5 py-4'}`}>
          <span className={`shrink-0 text-center ${compact ? 'w-5 text-[16px] leading-5' : 'w-6 text-[19px] leading-6'}`} aria-hidden>
            {f.icon}
          </span>
          <span className={compact ? 'text-[13.5px] leading-5' : 'text-[16px] leading-6'}>
            <strong className="font-bold text-ink-950">{f.title}</strong> <span className="text-ink-600">{f.sub}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
