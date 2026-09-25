/** Small grey "Soon" tag for sections that aren't open yet (Programs, Study). */
export function SoonChip({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded bg-ink-100 px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide text-ink-500 ${className}`}>
      Soon
    </span>
  );
}

/** Views that are shown greyed out with a "Soon" tag everywhere they're linked. */
export const SOON_VIEWS = new Set<string>(['programs', 'study']);
