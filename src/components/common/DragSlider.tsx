import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/**
 * The MadeVisa drag bar (same look as "How well did you match?" in the
 * feedback dialog): drag the circle, a word bubble rides above it.
 *
 * - `stops`: snap to these values only (0–100), drawn as small ticks.
 * - `locked`: stops that can't be picked yet (skipped while dragging).
 * - `onCommit`: fires once when the drag ends or a key is pressed — use it
 *   to save, and `onChange` to update the screen live.
 * Keyboard: arrow keys move one stop (or `step`).
 */
export function DragSlider({
  value,
  onChange,
  onCommit,
  bubble,
  left,
  right,
  label,
  valueText,
  stops,
  locked = [],
  step = 5,
  size = 'md',
  tone = 'brand',
}: {
  value: number | null;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  bubble: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  label: string;
  valueText?: string;
  stops?: number[];
  locked?: number[];
  step?: number;
  size?: 'sm' | 'md';
  tone?: 'brand' | 'green' | 'grey';
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const last = useRef<number | null>(value);
  const v = value ?? 50;
  const open = stops?.filter((s) => !locked.includes(s));

  const snap = (raw: number) => {
    if (open?.length) return open.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), open[0]);
    return Math.round(raw / step) * step;
  };
  const setFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const next = snap(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100);
    last.current = next;
    if (next !== value) onChange(next);
  };
  const move = (dir: 1 | -1) => {
    let next: number;
    if (open?.length) {
      const sorted = [...open].sort((a, b) => a - b);
      const i = sorted.findIndex((s) => s === v);
      next = i === -1 ? snap(v) : sorted[Math.max(0, Math.min(sorted.length - 1, i + dir))];
    } else next = Math.max(0, Math.min(100, v + dir * step));
    if (next === value) return;
    onChange(next);
    onCommit?.(next);
  };
  const end = () => {
    if (!dragging) return;
    setDragging(false);
    if (last.current != null) onCommit?.(last.current);
  };

  const fill = value == null ? 'bg-transparent' : tone === 'green' ? 'bg-gradient-to-r from-emerald-500/30 to-emerald-500' : tone === 'grey' ? 'bg-gradient-to-r from-ink-300/40 to-ink-400' : 'bg-gradient-to-r from-[#1D4ED8]/30 to-[#1D4ED8]';
  const ring = value == null ? 'border-ink-300' : tone === 'green' ? 'border-emerald-500' : tone === 'grey' ? 'border-ink-400' : 'border-[#1D4ED8]';
  const pill = value == null ? 'bg-ink-100 text-ink-500' : tone === 'green' ? 'bg-emerald-600 text-white' : tone === 'grey' ? 'bg-ink-600 text-white' : 'bg-[#1D4ED8] text-white';
  const sm = size === 'sm';

  return (
    <div className={`select-none ${sm ? 'pt-8' : 'pt-10'}`}>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={valueText}
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
          setFrom(e.clientX);
        }}
        onPointerMove={(e) => dragging && setFrom(e.clientX)}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(1);
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(-1);
          }
        }}
        className={`relative cursor-pointer touch-none rounded-full bg-ink-100 outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 ${sm ? 'h-2' : 'h-3'}`}
      >
        <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${v}%` }} />
        {stops?.map((s) => (
          <span
            key={s}
            aria-hidden="true"
            className={`absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${locked.includes(s) ? 'bg-ink-300' : s <= v && value != null ? 'bg-white/80' : 'bg-ink-300'}`}
            style={{ left: `${s}%` }}
          />
        ))}
        <div className="pointer-events-none absolute -translate-x-1/2 transition-[left] duration-75" style={{ left: `${Math.max(8, Math.min(92, v))}%`, top: sm ? -30 : -36 }}>
          <span className={`block whitespace-nowrap rounded-full px-2.5 py-1 font-bold shadow-sm transition-transform duration-200 ${sm ? 'text-[11px]' : 'text-[12px]'} ${pill} ${dragging ? 'scale-110' : ''}`}>{bubble}</span>
        </div>
        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 bg-white shadow-md transition-transform ${ring} ${dragging ? 'scale-110' : 'hover:scale-105'} ${sm ? 'h-6 w-6' : 'h-7 w-7'}`}
          style={{ left: `${v}%` }}
        />
      </div>
      {(left || right) && (
        <div className="mt-2 flex justify-between gap-4 text-[11px] text-ink-500">
          <span>{left}</span>
          <span className="text-right">{right}</span>
        </div>
      )}
    </div>
  );
}
