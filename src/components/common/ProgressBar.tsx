/**
 * Progress bar with percent for long-running admin tools (sync, imports,
 * backfills). Pass value = null for "working, amount unknown" — shows an
 * animated indeterminate bar instead of a fake percentage.
 */
export function ProgressBar({ value, label, detail }: { value: number | null; label?: string; detail?: string }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={label}>
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="min-w-0 truncate font-semibold text-ink-700">{label ?? 'Working…'}</span>
        <span className="shrink-0 font-bold tabular-nums text-brand-700">{pct == null ? '…' : `${pct}%`}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        {pct == null ? (
          <div className="h-full w-1/3 animate-[mvprogress_1.2s_ease-in-out_infinite] rounded-full bg-brand-500" />
        ) : (
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        )}
      </div>
      {detail && <p className="mt-1 truncate text-[11px] text-ink-500">{detail}</p>}
      <style>{'@keyframes mvprogress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  );
}
