import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleFlag } from '@/components/common/CircleFlag';

/**
 * Soft infographic charts (company + profile pages).
 * One colour family only — MadeVisa blue #1D4ED8 at different strengths —
 * on white panels; inner cards use that blue at 5%.
 */

/** The header-band blue (brand-700) — every highlight, line and ring. */
export const MV_BLUE = '#1D4ED8';
/** Series strengths, strongest first. */
export const MV_SHADES = [MV_BLUE, 'rgba(29,78,216,0.62)', 'rgba(29,78,216,0.36)', 'rgba(29,78,216,0.2)'];

/** White panel that holds the graphics. */
export function SoftPanel({ title, sub, right, children, className = '', id }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-40 rounded-xl border border-ink-200 bg-white p-5 sm:p-6 ${className}`}>
      {(title || right) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-bold tracking-tight text-ink-950">{title}</h2>}
            {sub && <p className="mt-0.5 text-[13px] text-ink-600">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** 5% blue card inside a SoftPanel; lifts a touch on hover. */
export function SoftCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-[#1D4ED8]/5 p-4 transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#1D4ED8]/[0.07] ${className}`}>
      {children}
    </div>
  );
}

/**
 * Ring score — a thin circular progress ring with the value in the middle
 * (the "71 / 89" rings on Crunchbase, the white "98" discs on the template).
 */
export function RingScore({
  value,
  label,
  size = 56,
  stroke = 5,
  empty = false,
  disc = false,
}: {
  value: number;
  label?: string;
  size?: number;
  stroke?: number;
  empty?: boolean;
  /** Draw a white disc behind the ring (for use on blue panels). */
  disc?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2 - (disc ? 4 : 0);
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(v), 60);
    return () => window.clearTimeout(t);
  }, [v]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={empty ? 'No data yet' : label ?? `${v}%`}>
      {disc && <circle cx={size / 2} cy={size / 2} r={size / 2} fill="#fff" />}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={MV_BLUE} strokeOpacity={0.14} strokeWidth={stroke} strokeDasharray={empty ? '3 5' : undefined} />
      {!empty && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={MV_BLUE}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * shown) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      )}
      {label !== undefined && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill={empty ? '#94a3b8' : '#0f172a'}
          fontSize={size * (label.length > 3 ? 0.24 : 0.3)}
          fontWeight={700}
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        >
          {empty ? '–' : label}
        </text>
      )}
    </svg>
  );
}

/** Headline figure with an optional ring on its left, Crunchbase-summary style. */
export function ScoreStat({
  title,
  value,
  ring,
  delta,
  note,
  info,
}: {
  title: string;
  value: ReactNode;
  ring?: number | null;
  delta?: { text: string; up: boolean } | null;
  note?: string;
  info?: string;
}) {
  return (
    <div className="min-w-0" title={info}>
      <p className="text-[15px] font-medium text-ink-600">{title}</p>
      <div className="mt-2 flex items-center gap-3">
        {ring !== undefined && <RingScore value={ring ?? 0} empty={ring == null} size={30} stroke={3.5} />}
        <span className="text-[32px] font-bold leading-none tracking-tight text-ink-950 tabular-nums">{value}</span>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[13px] font-semibold ${delta.up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
            {delta.up ? '↑' : '↓'} {delta.text}
          </span>
        )}
      </div>
      {note && <p className="mt-1.5 text-[13px] text-ink-500">{note}</p>}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type TrendSeries = { name: string; values: number[]; dashed?: boolean; fill?: boolean; shade?: number };

/**
 * Performance chart with a Y axis, dated X labels, soft gradient areas,
 * dashed trend lines and a hover read-out.
 */
export function TrendChart({ series, labels, height = 260, unit = ['', ''] }: { series: TrendSeries[]; labels: string[]; height?: number; unit?: [string, string] }) {
  const id = useId().replace(/:/g, '');
  const [wrap, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 30;
  const H = height;
  const rawMax = Math.max(1, ...series.flatMap((s) => s.values));
  const stepY = niceStep(rawMax / 4);
  const max = Math.max(stepY * 4, stepY);
  const ticks = Array.from({ length: Math.round(max / stepY) + 1 }, (_, i) => i * stepY);
  const innerW = Math.max(10, W - padL - padR);
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (vals: number[]) =>
    vals.reduce((acc, v, i) => {
      if (i === 0) return `M ${x(0)} ${y(v)}`;
      const cx = (x(i - 1) + x(i)) / 2;
      return `${acc} C ${cx} ${y(vals[i - 1])}, ${cx} ${y(v)}, ${x(i)} ${y(v)}`;
    }, '');
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 90))));

  return (
    <div ref={wrap} className="relative w-full select-none">
      {W > 0 && (
        <svg width={W} height={H} className="block overflow-visible" role="img" aria-label={series.map((s) => s.name).join(' and ')}>
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`a${id}${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={MV_BLUE} stopOpacity={si === 0 ? 0.32 : 0.16} />
                <stop offset="1" stopColor={MV_BLUE} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={MV_BLUE} strokeOpacity={t === 0 ? 0.3 : 0.12} strokeDasharray={t === 0 ? undefined : '3 5'} />
              <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize="12" fill="#64748b">
                {t}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="12" fill="#64748b">
                {l}
              </text>
            ) : null,
          )}
          {series.map((s, si) =>
            s.fill !== false && !s.dashed ? <path key={`f${si}`} d={`${path(s.values)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#a${id}${si})`} /> : null,
          )}
          {series.map((s, si) => (
            <path
              key={`l${si}`}
              d={path(s.values)}
              fill="none"
              stroke={MV_SHADES[s.shade ?? si] ?? MV_BLUE}
              strokeWidth={s.dashed ? 2 : 2.5}
              strokeDasharray={s.dashed ? '2 5' : undefined}
              strokeLinecap="round"
            />
          ))}
          {series.map((s, si) =>
            s.dashed
              ? null
              : [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1].map((i) => (
                  <circle key={`d${si}${i}`} cx={x(i)} cy={y(s.values[i] ?? 0)} r={3.5} fill="#fff" stroke={MV_SHADES[s.shade ?? si]} strokeWidth={2} />
                )),
          )}
          {hover != null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke={MV_BLUE} strokeOpacity={0.45} />
              {series.map((s, si) => (
                <circle key={si} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={5} fill={MV_SHADES[s.shade ?? si]} stroke="#fff" strokeWidth={2} />
              ))}
            </>
          )}
          {labels.map((_, i) => (
            <rect
              key={`h${i}`}
              x={x(i) - innerW / Math.max(1, n - 1) / 2}
              y={0}
              width={innerW / Math.max(1, n - 1)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>
      )}
      {hover != null && W > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[9rem] -translate-x-1/2 rounded-lg bg-ink-950 px-3 py-2 text-[12px] text-white shadow-lg"
          style={{ left: Math.min(Math.max(x(hover), 80), W - 80) }}
        >
          <p className="font-semibold">{labels[hover]}</p>
          {series.map((s, si) => (
            <p key={si} className="mt-0.5 flex items-center justify-between gap-3 text-white/85">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: si === 0 ? '#93c5fd' : '#bfdbfe' }} />
                {s.name}
              </span>
              <span className="font-semibold tabular-nums text-white">
                {round1(s.values[hover] ?? 0)} {unit[(s.values[hover] ?? 0) === 1 ? 0 : 1]}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legend chips for TrendChart (solid vs dotted keys). */
export function TrendLegend({ items }: { items: { name: string; dashed?: boolean; shade?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-2 rounded-md bg-[#1D4ED8]/5 px-3 py-1.5 text-[13px] font-semibold text-ink-800">
          <svg width="18" height="4" aria-hidden="true">
            <line x1="1" x2="17" y1="2" y2="2" stroke={MV_SHADES[it.shade ?? 0]} strokeWidth="3" strokeLinecap="round" strokeDasharray={it.dashed ? '1 4' : undefined} />
          </svg>
          {it.name}
        </span>
      ))}
    </div>
  );
}

/** Segmented range switch (4W · 12W · 26W). */
export function RangeSwitch<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-[#1D4ED8]/5 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-[13px] font-bold transition-colors ${value === o.value ? 'bg-[#1D4ED8] text-white shadow-sm' : 'text-ink-500 hover:text-[#1D4ED8]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Concentric rings — one ring per item, share of the total. Hovering a ring or its row highlights both. */
export function ConcentricRings({ items, size = 150, active, onActive }: { items: { label: string; n: number }[]; size?: number; active?: number | null; onActive?: (i: number | null) => void }) {
  const top = items.slice(0, 4);
  const total = Math.max(1, items.reduce((a, b) => a + b.n, 0));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  const stroke = 9;
  const gap = 5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 overflow-visible" role="img" aria-label="Share by location">
      {top.map((it, i) => {
        const r = size / 2 - stroke / 2 - i * (stroke + gap);
        if (r <= 4) return null;
        const c = 2 * Math.PI * r;
        const pct = it.n / total;
        const dim = active != null && active !== i;
        return (
          <g key={it.label} onMouseEnter={() => onActive?.(i)} onMouseLeave={() => onActive?.(null)} className="cursor-default">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={MV_BLUE} strokeOpacity={0.08} strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={MV_SHADES[i]}
              strokeWidth={active === i ? stroke + 3 : stroke}
              strokeOpacity={dim ? 0.35 : 1}
              strokeLinecap="round"
              strokeDasharray={`${ready ? c * pct : 0} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: `stroke-dasharray 1000ms ${i * 120}ms cubic-bezier(0.16,1,0.3,1), stroke-width 200ms, stroke-opacity 200ms` }}
            />
          </g>
        );
      })}
      {active != null && top[active] && (
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">
          {Math.round((top[active].n / total) * 100)}%
        </text>
      )}
    </svg>
  );
}

/** Row list with a flag/dot, value, and a thin bar — pairs with ConcentricRings. */
export function ShareList({ items, active, onActive }: { items: { label: string; code?: string; n: number }[]; active?: number | null; onActive?: (i: number | null) => void }) {
  const total = Math.max(1, items.reduce((a, b) => a + b.n, 0));
  return (
    <ul className="min-w-0 flex-1 space-y-1">
      {items.slice(0, 4).map((it, i) => (
        <li
          key={it.label}
          onMouseEnter={() => onActive?.(i)}
          onMouseLeave={() => onActive?.(null)}
          className={`min-w-0 rounded-md px-2 py-1.5 transition-colors duration-200 ${active === i ? 'bg-[#1D4ED8]/5' : ''}`}
        >
          <div className="flex items-center justify-between gap-2 text-[14px]">
            <span className="flex min-w-0 items-center gap-2 text-ink-800">
              {it.code ? <CircleFlag countryCode={it.code} label={it.label} size={16} /> : <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: MV_SHADES[i] }} />}
              <span className="truncate font-medium">{it.label}</span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-ink-950">{it.n}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1D4ED8]/10">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(it.n / total) * 100}%`, background: MV_SHADES[i] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Rings + list wired together for hover. */
export function RingsWithList({ items }: { items: { label: string; code?: string; n: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="grid place-items-center rounded-full bg-[#1D4ED8]/5 p-3">
        <ConcentricRings items={items} size={156} active={active} onActive={setActive} />
      </div>
      <ShareList items={items} active={active} onActive={setActive} />
    </div>
  );
}

/** Connected step circles — e.g. applied → replied → interview → offer. */
export function StepFlow({ steps }: { steps: { label: string; value: string; strength: number; empty?: boolean }[] }) {
  return (
    <ol className="flex items-start justify-between gap-1">
      {steps.map((s, i) => (
        <li key={s.label} className="group/step flex min-w-0 flex-1 items-start">
          <div className="flex min-w-0 flex-1 flex-col items-center text-center">
            <span
              className="grid h-14 w-14 place-items-center rounded-full text-[15px] font-bold tabular-nums transition-transform duration-300 ease-out group-hover/step:scale-110 sm:h-16 sm:w-16 sm:text-[17px]"
              style={
                s.empty
                  ? { background: '#fff', color: '#94a3b8', boxShadow: 'inset 0 0 0 2px rgba(29,78,216,0.18)' }
                  : { background: `rgba(29,78,216,${0.2 + 0.8 * Math.max(0, Math.min(1, s.strength))})`, color: s.strength > 0.4 ? '#fff' : '#1e3a8a' }
              }
            >
              {s.empty ? '–' : s.value}
            </span>
            <span className="mt-2 text-[12px] font-semibold leading-tight text-ink-700 sm:text-[13px]">{s.label}</span>
          </div>
          {i < steps.length - 1 && <span className="mt-7 h-0.5 w-3 shrink-0 rounded bg-[#1D4ED8]/30 sm:mt-8 sm:w-6" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/** Tiny column sparkline; bars rise a little on hover. */
export function SparkBars({ values, height = 36 }: { values: number[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1.5 flex-1 origin-bottom rounded-sm transition-transform duration-200 hover:scale-y-110"
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            background: i === values.length - 1 ? MV_BLUE : `rgba(29,78,216,${0.2 + 0.4 * (v / max)})`,
          }}
        />
      ))}
    </div>
  );
}

export type RoadmapStage = { key: string; label: string; day: number | null; state: 'done' | 'current' | 'todo' | 'stopped' };

/**
 * The big roadmap for one application: a day axis (Applied → Day 7 → Day 21+)
 * with stage nodes placed on the day they happened, and "you are here".
 */
export function Roadmap({ stages, daysIn, horizon = 30 }: { stages: RoadmapStage[]; daysIn: number; horizon?: number }) {
  const [wrap, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  const end = Math.max(horizon, daysIn + 2, ...stages.map((s) => (s.day ?? 0) + 2));
  const H = 150;
  const pad = 28;
  const x = (d: number) => pad + (Math.min(d, end) / end) * (W - 2 * pad);
  const lineY = 72;
  const marks = [0, 7, 14, 21, end].filter((d, i, a) => d <= end && a.indexOf(d) === i && (d === end || end - d > 3));
  const reached = Math.min(daysIn, end);
  const placed = stages.filter((s) => s.day != null);
  return (
    <div ref={wrap} className="w-full select-none">
      {W > 0 && (
        <svg width={W} height={H} className="block overflow-visible" role="img" aria-label="Application roadmap">
          <defs>
            <linearGradient id="mvroad" x1="0" x2="1">
              <stop offset="0" stopColor={MV_BLUE} stopOpacity={0.35} />
              <stop offset="1" stopColor={MV_BLUE} />
            </linearGradient>
          </defs>
          {/* track */}
          <line x1={x(0)} x2={x(end)} y1={lineY} y2={lineY} stroke={MV_BLUE} strokeOpacity={0.1} strokeWidth={10} strokeLinecap="round" />
          <line
            x1={x(0)}
            x2={x(end)}
            y1={lineY}
            y2={lineY}
            stroke="url(#mvroad)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${ready ? Math.max(0.01, x(reached) - x(0)) : 0.01} 99999`}
            style={{ transition: 'stroke-dasharray 1100ms cubic-bezier(0.16,1,0.3,1)' }}
          />
          {/* day ticks */}
          {marks.map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={lineY + 14} y2={lineY + 22} stroke={MV_BLUE} strokeOpacity={0.3} strokeWidth={2} strokeLinecap="round" />
              <text x={x(d)} y={lineY + 40} textAnchor="middle" fontSize="12" fill="#64748b">
                {d === 0 ? 'Day 0' : `Day ${d}${d === end && daysIn > end ? '+' : ''}`}
              </text>
            </g>
          ))}
          {/* stage nodes */}
          {placed.map((s, i) => {
            const cx = x(s.day!);
            const on = hover === s.key;
            const above = i % 2 === 0;
            const fill = s.state === 'stopped' ? '#94a3b8' : s.state === 'todo' ? '#fff' : MV_BLUE;
            return (
              <g key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
                <circle cx={cx} cy={lineY} r={on ? 15 : 12} fill={fill} stroke="#fff" strokeWidth={3} style={{ transition: 'r 200ms' }} />
                {s.state === 'current' && <circle cx={cx} cy={lineY} r={20} fill="none" stroke={MV_BLUE} strokeOpacity={0.35} strokeWidth={2} className="motion-safe:animate-ping" style={{ transformOrigin: `${cx}px ${lineY}px` }} />}
                <text x={cx} y={above ? lineY - 24 : lineY - 44} textAnchor={cx < 60 ? 'start' : cx > W - 60 ? 'end' : 'middle'} fontSize={on ? 14 : 13} fontWeight={700} fill={s.state === 'stopped' ? '#64748b' : '#0f172a'} style={{ transition: 'font-size 200ms' }}>
                  {s.label}
                </text>
                {on && (
                  <text x={cx} y={lineY + 4} textAnchor="middle" fontSize="10" fontWeight={700} fill="#fff">
                    {s.day}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {/* upcoming stages without a date */}
      <div className="mt-1 flex flex-wrap gap-2">
        {stages
          .filter((s) => s.day == null)
          .map((s) => (
            <span
              key={s.key}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${s.state === 'stopped' ? 'bg-ink-100 text-ink-500 line-through' : 'bg-[#1D4ED8]/5 text-ink-600'}`}
            >
              {s.label}
            </span>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function niceStep(raw: number) {
  if (raw <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Weekly buckets (oldest → newest) of ISO dates over the last `weeks` weeks. */
export function weeklyCounts(dates: (string | null | undefined)[], weeks: number): number[] {
  const out = Array(weeks).fill(0) as number[];
  const now = Date.now();
  const WEEK = 7 * 86_400_000;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) continue;
    const ago = Math.floor((now - t) / WEEK);
    if (ago >= 0 && ago < weeks) out[weeks - 1 - ago] += 1;
  }
  return out;
}

/** Rolling average (window w) — the dotted "trend" line. */
export function rolling(values: number[], w = 4): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - w + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** "Jun 27"-style labels for the start of each weekly bucket. */
export function weekLabels(weeks: number): string[] {
  const now = Date.now();
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(now - (weeks - 1 - i) * 7 * 86_400_000);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
}

/**
 * Small area sparkline — the "hiring performance" line on directory cards.
 * Last point is marked; no axes.
 */
export function MiniArea({ values, width = 120, height = 40, className = '' }: { values: number[]; width?: number; height?: number; className?: string }) {
  const gid = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pad = 3;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={MV_BLUE} stopOpacity="0.22" />
          <stop offset="100%" stopColor={MV_BLUE} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={MV_BLUE} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.75" fill="#fff" stroke={MV_BLUE} strokeWidth="1.75" />
    </svg>
  );
}
