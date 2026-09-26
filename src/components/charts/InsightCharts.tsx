import { useId, useState, type ReactNode } from 'react';
import { CircleFlag } from '@/components/common/CircleFlag';

/**
 * The MadeVisa insight graphics, shared by job pages and the profile:
 * a white panel, 5% blue cards, #1D4ED8 lines with soft
 * gradients, Inter numbers.
 */

export const BLUE = '#1D4ED8';

export function InsightPanel({ title, right, children, foot }: { title: ReactNode; right?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 text-ink-950 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {right}
      </div>
      {children}
      {foot && <div className="mt-3 text-[11px] leading-4 text-ink-600">{foot}</div>}
    </section>
  );
}

export function InsightGrid({ count, children }: { count: number; children: ReactNode }) {
  return <div className={`mt-4 grid grid-cols-1 gap-3 ${count >= 3 ? 'md:grid-cols-3' : count === 2 ? 'md:grid-cols-2' : ''}`}>{children}</div>;
}

export function InsightCard({ title, children, foot, muted, tag }: { title: string; children: ReactNode; foot?: ReactNode; muted?: boolean; tag?: ReactNode }) {
  return (
    <div className={`flex flex-col rounded-lg p-4 transition duration-300 ease-out hover:-translate-y-0.5 ${muted ? 'bg-[#1D4ED8]/[0.03]' : 'bg-[#1D4ED8]/5 hover:bg-[#1D4ED8]/[0.07]'}`}>
      <p className="text-sm font-bold text-ink-950">{title}</p>
      {tag && <div className="mt-1.5 flex">{tag}</div>}
      <div className="flex-1">{children}</div>
      {foot && <div className="mt-3 text-[11px] leading-4 text-ink-500">{foot}</div>}
    </div>
  );
}

/** Small pill for "Early data · 6 people" style labels. */
export function Tag({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' | 'grey' }) {
  const cls = tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'grey' ? 'bg-ink-100 text-ink-600' : 'bg-[#1D4ED8]/10 text-[#1D4ED8]';
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{children}</span>;
}

/** Liquid-fill circle gauge. */
export function Gauge({ value, label, placeholder = false, size = 144 }: { value: number; label?: string; placeholder?: boolean; size?: number }) {
  const id = useId().replace(/:/g, '');
  const v = Math.max(0, Math.min(100, value));
  const R = 70;
  const C = 2 * Math.PI * R;
  const level = 100 + R - (2 * R * v) / 100;
  const wave = (dy: number) => `M -60 ${level + dy} q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 V 200 H -60 Z`;
  return (
    <svg viewBox="0 0 200 200" style={{ width: size, height: size }} className="shrink-0" role="img" aria-label={placeholder ? 'No data yet' : `${label ?? `${v}%`}`}>
      <defs>
        <clipPath id={`c${id}`}>
          <circle cx="100" cy="100" r={R - 8} />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BLUE} stopOpacity={placeholder ? 0.18 : 0.55} />
          <stop offset="1" stopColor={BLUE} stopOpacity={placeholder ? 0.08 : 0.2} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r={R - 8} fill={BLUE} fillOpacity="0.05" />
      <g clipPath={`url(#c${id})`}>
        <path d={wave(4)} fill={BLUE} fillOpacity={placeholder ? 0.06 : 0.12} className="motion-safe:animate-[mvwave_7s_linear_infinite]" />
        <path d={wave(0)} fill={`url(#g${id})`} className="motion-safe:animate-[mvwave_4s_linear_infinite]" />
      </g>
      <circle cx="100" cy="100" r={R} fill="none" stroke={BLUE} strokeOpacity="0.15" strokeWidth="6" strokeDasharray={placeholder ? '4 7' : undefined} />
      {!placeholder && (
        <circle cx="100" cy="100" r={R} fill="none" stroke={BLUE} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(C * v) / 100} ${C}`} transform="rotate(-90 100 100)" />
      )}
      <text x="100" y="113" textAnchor="middle" fill={placeholder ? '#94a3b8' : '#0f172a'} fontSize={label && label.length > 4 ? 30 : 38} fontWeight="700" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">
        {placeholder ? '?' : label ?? `${v}%`}
      </text>
      <style>{`@keyframes mvwave { from { transform: translateX(0) } to { transform: translateX(-60px) } }`}</style>
    </svg>
  );
}

export type BarRow = { key: string; label: string; code?: string; n: number; dot?: string };

/** Horizontal bars with optional flags. */
export function Bars({ rows, placeholder = false, unit }: { rows: BarRow[]; placeholder?: boolean; unit?: [string, string] }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className="group/bar grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-xs"
          title={placeholder || !unit ? undefined : `${r.label}: ${r.n} ${r.n === 1 ? unit[0] : unit[1]}`}
        >
          <span className={`flex min-w-0 items-center gap-1.5 ${placeholder ? 'text-ink-400' : 'text-ink-700'}`}>
            {r.code ? (
              <CircleFlag countryCode={r.code} label={r.label} size={14} />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: r.dot ?? 'rgba(29,78,216,0.15)' }} />
            )}
            <span className="truncate">{r.label}</span>
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-[#1D4ED8]/10">
            <span
              className="block h-full origin-left rounded-full transition-transform duration-300 group-hover/bar:scale-y-125"
              style={{
                width: `${r.n ? Math.max(8, (r.n / max) * 100) : 0}%`,
                background: placeholder ? 'rgba(29,78,216,0.18)' : `linear-gradient(90deg, ${BLUE}, rgba(29,78,216,0.55))`,
              }}
            />
          </span>
          <span className={`w-5 text-right font-semibold tabular-nums ${placeholder ? 'text-ink-300' : 'text-ink-700'}`}>{placeholder ? '–' : r.n}</span>
        </li>
      ))}
    </ul>
  );
}

/** Soft area chart of weekly counts (oldest → newest) with hover. */
export function AreaTrend({ values, label, noun = ['item', 'items'] }: { values: number[]; label: string; noun?: [string, string] }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 110;
  const pad = 6;
  const max = Math.max(...values, 1);
  const step = (W - 2 * pad) / Math.max(values.length - 1, 1);
  const pts = values.map((n, i) => [pad + i * step, H - 8 - (n / max) * (H - 24)] as const);
  const line = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, '');
  const area = `${line} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`;
  const weekLabel = (i: number) => {
    const ago = values.length - 1 - i;
    return ago === 0 ? 'This week' : ago === 1 ? 'Last week' : `${ago} weeks ago`;
  };
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={BLUE} stopOpacity="0.28" />
            <stop offset="1" stopColor={BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {pts.map(([x], i) => (i % 2 === 1 ? <line key={i} x1={x} x2={x} y1={4} y2={H} stroke={BLUE} strokeOpacity="0.18" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null))}
        <path d={area} fill={`url(#f${id})`} />
        <path d={line} fill="none" stroke={BLUE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={H} stroke={BLUE} strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />}
        {pts.map(([x], i) => (
          <rect key={`h${i}`} x={x - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-950 px-2 py-1 text-[11px] font-semibold text-white shadow" style={{ left: `${(pts[hover][0] / W) * 100}%` }}>
          {weekLabel(hover)}: {values[hover]} {values[hover] === 1 ? noun[0] : noun[1]}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-ink-400">
        <span>{values.length} weeks ago</span>
        <span>{label}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

/** Thin progress meter. */
export function Meter({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#1D4ED8]/10">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: `linear-gradient(90deg, rgba(29,78,216,0.55), ${BLUE})` }} />
    </div>
  );
}
