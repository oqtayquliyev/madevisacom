import type React from 'react';
import { AlertCircle as CircleAlert, CheckCircle2, Lock } from 'lucide-react';
import { priceLabel } from '@/lib/plans';
import type { MatchResult } from '@/lib/cv/match';

const TONE = {
  strong: { ring: '#059669', text: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
  good: { ring: '#2563eb', text: 'text-brand-700', bg: 'bg-brand-50', bar: 'bg-brand-500' },
  partial: { ring: '#d97706', text: 'text-amber-700', bg: 'bg-amber-50', bar: 'bg-amber-500' },
  low: { ring: '#e11d48', text: 'text-rose-700', bg: 'bg-rose-50', bar: 'bg-rose-500' },
} as const;

export const toneFor = (score: number) => (score >= 80 ? TONE.strong : score >= 65 ? TONE.good : score >= 45 ? TONE.partial : TONE.low);

/** The score as a ring. `onDark` for the blue job header. */
export function MatchRing({ score, size = 112, onDark = false, pending = false }: { score: number | null; size?: number; onDark?: boolean; pending?: boolean }) {
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = score ?? 0;
  const color = onDark ? '#ffffff' : toneFor(shown).ring;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={score == null ? 'Match not checked yet' : `${score}% match`}>
      <svg width={size} height={size} className={`-rotate-90 ${pending ? 'animate-spin' : ''}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={onDark ? 'rgba(255,255,255,0.25)' : '#e2e8f0'} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={pending ? c * 0.72 : c * (1 - shown / 100)}
          style={{ transition: pending ? undefined : 'stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      {!pending && (
        <span className={`absolute font-bold tabular-nums leading-none ${onDark ? 'text-white' : 'text-ink-950'}`} style={{ fontSize: size * 0.3 }}>
          {score == null ? '?' : score}
          {score != null && <span style={{ fontSize: size * 0.15 }}>%</span>}
        </span>
      )}
    </span>
  );
}

/** One part of the score as a labelled bar. */
export function PartBar({ name, score, weight, locked = false }: { name: string; score: number | null; weight: number; locked?: boolean }) {
  const tone = toneFor(score ?? 0);
  return (
    <div className="flex items-center gap-3">
      <span className="w-[84px] shrink-0 text-[13px] font-medium text-ink-700 sm:w-[96px]">{name}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
        {locked ? (
          <span className="block h-full w-2/3 rounded-full bg-ink-300 blur-[3px]" />
        ) : score == null ? null : (
          <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(3, score)}%` }} />
        )}
      </span>
      <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-ink-500">
        {locked ? <Lock className="ml-auto h-3.5 w-3.5 text-ink-400" aria-label="Members only" /> : score == null ? 'not asked' : <strong className="text-[13px] text-ink-900">{score}%</strong>}
        {!locked && score != null && <span className="ml-1 text-ink-400">· {weight} pts</span>}
      </span>
    </div>
  );
}

/** One line of "Your application": a tick or a gap, what it is, and what to do. */
export function Row({ ok, soft = false, compact = false, title, status, text, action }: { ok: boolean; soft?: boolean; compact?: boolean; title: string; status: string; text: string; action?: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${compact ? 'py-2.5' : 'py-3.5'}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleAlert className={`mt-0.5 h-5 w-5 shrink-0 ${soft ? 'text-ink-400' : 'text-amber-600'}`} />}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-bold text-ink-950">
            {title}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : soft ? 'bg-ink-100 text-ink-600' : 'bg-amber-100 text-amber-800'}`}>{status}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-600">{text}</p>
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}

/** "Strong match" pill. */
export function MatchLabel({ result }: { result: MatchResult }) {
  const tone = toneFor(result.score);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-bold ${tone.bg} ${tone.text}`}>{result.label}</span>;
}

/** "Membership: $12.50 once" — the plan that includes the full report. */
export function ProPrice({ className = '' }: { className?: string }) {
  return <span className={className}>Membership: {priceLabel('starter')}</span>;
}
