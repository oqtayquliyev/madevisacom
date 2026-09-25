import { useEffect, useId, useState } from 'react';
import { CircleFlag } from '@/components/common/CircleFlag';
import { fetchJobPageInsights, visibleInsights, type JobPageInsights } from '@/lib/jobInsights';

/**
 * Three graphics at the end of a job page, measured only on MadeVisa:
 *   1. Will they answer me?          → response rate (liquid gauge)
 *   2. Do they hire people from abroad? → interviews by nationality (bars)
 *   3. Is this job real?             → jobs checked live on the careers page (area)
 * Each shows only when there's enough data and the number is good; the
 * whole block is hidden when none qualifies.
 */
export function JobInsights({ publisherId, company }: { publisherId: string; company: string }) {
  const [data, setData] = useState<JobPageInsights | null>(null);
  useEffect(() => {
    let alive = true;
    fetchJobPageInsights(publisherId).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [publisherId]);

  const v = visibleInsights(data);
  if (!v.any) return null;
  const cards = [v.response, v.international, v.live].filter(Boolean).length;

  return (
    <section aria-label={`${company} on MadeVisa`} className="mt-4 overflow-hidden rounded-xl bg-[#0b1733] p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">How {company} hires</h2>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">Measured on MadeVisa</p>
      </div>
      <div className={`mt-4 grid gap-3 ${cards === 3 ? 'md:grid-cols-3' : cards === 2 ? 'md:grid-cols-2' : ''}`}>
        {v.response && <ResponseCard r={v.response} />}
        {v.international && <InternationalCard d={v.international} />}
        {v.live && <LiveCard l={v.live} />}
      </div>
    </section>
  );
}

function Card({ title, children, foot }: { title: string; children: React.ReactNode; foot: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-white/[0.06] p-4 ring-1 ring-white/10">
      <p className="text-sm font-bold text-white">{title}</p>
      <div className="flex-1">{children}</div>
      <p className="mt-3 text-[11px] leading-4 text-white/50">{foot}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Response rate — liquid gauge
// ---------------------------------------------------------------------------

function ResponseCard({ r }: { r: NonNullable<JobPageInsights['response']> }) {
  const id = useId().replace(/:/g, '');
  const rate = Math.max(0, Math.min(100, r.rate));
  const R = 70;
  const C = 2 * Math.PI * R;
  // Liquid surface height inside the circle (y grows downward).
  const level = 100 + R - (2 * R * rate) / 100;
  const wave = (dy: number) =>
    `M -60 ${level + dy} q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 V 200 H -60 Z`;

  return (
    <Card title="Will they answer you?" foot={`From ${r.tracked} applications people tracked on MadeVisa.`}>
      <div className="mt-3 flex flex-col items-center gap-2 text-center">
        <svg viewBox="0 0 200 200" className="h-36 w-36 shrink-0" role="img" aria-label={`${rate}% of applicants heard back`}>
          <defs>
            <clipPath id={`c${id}`}>
              <circle cx="100" cy="100" r={R - 8} />
            </clipPath>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#60a5fa" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id={`a${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#93c5fd" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r={R - 8} fill="rgba(255,255,255,0.04)" />
          <g clipPath={`url(#c${id})`}>
            <path d={wave(4)} fill="#1e40af" opacity="0.6" className="motion-safe:animate-[mvwave_7s_linear_infinite]" />
            <path d={wave(0)} fill={`url(#g${id})`} className="motion-safe:animate-[mvwave_4s_linear_infinite]" />
          </g>
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={`url(#a${id})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(C * rate) / 100} ${C}`}
            transform="rotate(-90 100 100)"
          />
          <text x="100" y="112" textAnchor="middle" className="fill-white font-slab" fontSize="40" fontWeight="700">
            {rate}%
          </text>
        </svg>
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">of applicants heard back</p>
          {r.avg_days != null && (
            <p className="mt-1 text-sm text-white/70">
              usually within <strong className="text-white">{Math.max(1, r.avg_days)} day{r.avg_days === 1 ? '' : 's'}</strong>
            </p>
          )}
        </div>
      </div>
      <style>{`@keyframes mvwave { from { transform: translateX(0) } to { transform: translateX(-60px) } }`}</style>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. International interviews — bars by country
// ---------------------------------------------------------------------------

function InternationalCard({ d }: { d: NonNullable<JobPageInsights['international']> }) {
  const rows = [...d.top.map((t) => ({ key: t.code, label: t.name, code: t.code, n: t.n })), ...(d.other > 0 ? [{ key: 'other', label: 'Other countries', code: '', n: d.other }] : [])];
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <Card title="Do they hire people from abroad?" foot="People who reported an interview or offer here, by nationality. Small numbers are grouped.">
      <p className="mt-2 text-sm text-white/70">
        <strong className="font-slab text-2xl font-bold text-white">{d.people}</strong> people from <strong className="text-white">{d.countries} countries</strong> got interviews
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-xs" title={`${r.label}: ${r.n} ${r.n === 1 ? 'person' : 'people'}`}>
            <span className="flex min-w-0 items-center gap-1.5 text-white/80">
              {r.code ? <CircleFlag countryCode={r.code} label={r.label} size={14} /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white/20" />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-300" style={{ width: `${Math.max(8, (r.n / max) * 100)}%` }} />
            </span>
            <span className="w-5 text-right font-semibold tabular-nums text-white/80">{r.n}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Live-checked jobs — area chart of new jobs per week
// ---------------------------------------------------------------------------

function LiveCard({ l }: { l: NonNullable<JobPageInsights['live']> }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const pct = Math.round((l.checked / l.open) * 100);
  const W = 300;
  const H = 110;
  const pad = 6;
  const max = Math.max(...l.weeks, 1);
  const pts = l.weeks.map((n, i) => [pad + (i * (W - 2 * pad)) / (l.weeks.length - 1), H - 8 - (n / max) * (H - 24)] as const);
  // Smooth line through the points.
  const line = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, '');
  const area = `${line} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`;
  const weekLabel = (i: number) => {
    const weeksAgo = l.weeks.length - 1 - i;
    return weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`;
  };

  return (
    <Card
      title="Is this job real?"
      foot={`MadeVisa checks every job against the company’s own careers page.${l.avg_open_days ? ` Their jobs usually stay open about ${l.avg_open_days} days.` : ''}`}
    >
      <p className="mt-2 text-sm text-white/70">
        <strong className="font-slab text-2xl font-bold text-white">{pct}%</strong> of {l.open.toLocaleString()} open jobs checked live in the last 48 h
      </p>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="New jobs per week over the last 8 weeks">
          <defs>
            <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b82f6" stopOpacity="0.55" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {pts.map(([x], i) =>
            i % 2 === 1 ? <line key={i} x1={x} x2={x} y1={4} y2={H} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null
          )}
          <path d={area} fill={`url(#f${id})`} />
          <path d={line} fill="none" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={H} stroke="rgba(255,255,255,0.5)" vectorEffect="non-scaling-stroke" />}
          {pts.map(([x], i) => (
            <rect
              key={`h${i}`}
              x={x - (W - 2 * pad) / (l.weeks.length - 1) / 2}
              y={0}
              width={(W - 2 * pad) / (l.weeks.length - 1)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-ink-900 shadow"
            style={{ left: `${(pts[hover][0] / W) * 100}%` }}
          >
            {weekLabel(hover)}: {l.weeks[hover]} new job{l.weeks[hover] === 1 ? '' : 's'}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-white/40">
          <span>8 weeks ago</span>
          <span>New jobs per week</span>
          <span>Now</span>
        </div>
      </div>
    </Card>
  );
}
