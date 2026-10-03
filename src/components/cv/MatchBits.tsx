import { useEffect, useState } from 'react';
import { AlertCircle as CircleAlert, CheckCircle2, FileCheck2, FileSignature, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { nav } from '@/lib/pageLayout';
import { usePrices } from '@/lib/pricing';
import { briefPath, fetchMyBriefForJob, newOfferPath } from '@/lib/briefs';
import { allowanceLabel, canMakeDocument, useOfferCredits } from '@/lib/sponsorOffer';
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
        {locked ? <Lock className="ml-auto h-3.5 w-3.5 text-ink-400" aria-label="In Pro" /> : score == null ? 'not asked' : <strong className="text-[13px] text-ink-900">{score}%</strong>}
        {!locked && score != null && <span className="ml-1 text-ink-400">· {weight} pts</span>}
      </span>
    </div>
  );
}

type DocProps = {
  jobId: string;
  company: string;
  /** Country to start the builder with when the job's own isn't covered. */
  country?: string | null;
  /** The ad says sponsorship is offered: the document is a help, not a gap. */
  visaOffered: boolean;
  onAuth?: (p: 'login' | 'register') => void;
  /** Tighter layout for the sheet shown at Apply. */
  compact?: boolean;
};

/**
 * The sponsorship document as a line of the application: "Missing" until
 * one has been made for this job. Making it is part of MadeVisa Pro (people
 * with documents left from before can still use those).
 */
export function SponsorDocRow({ jobId, company, country, visaOffered, onAuth, compact = false }: DocProps) {
  const { session } = useAuth();
  const credits = useOfferCredits();
  const prices = usePrices();
  const [existing, setExisting] = useState<string | null | undefined>(session ? undefined : null);
  useEffect(() => {
    if (!session) return setExisting(null);
    let alive = true;
    fetchMyBriefForJob(jobId).then((b) => alive && setExisting(b?.share_id ?? null));
    return () => {
      alive = false;
    };
  }, [session, jobId]);

  const start = `${newOfferPath(jobId)}${country ? `&country=${country}` : ''}`;
  const can = canMakeDocument(credits);
  const go = (href: string) => () => nav(href);

  if (existing) {
    return (
      <Row
        ok
        compact={compact}
        title="Sponsorship document"
        status="Ready"
        text={`Attach the PDF next to your CV, or paste its link in your message to ${company}.`}
        action={
          <button onClick={go(briefPath(existing))} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
            <FileCheck2 className="h-4 w-4" /> Open it
          </button>
        }
      />
    );
  }

  const why = visaOffered
    ? `${company} offers sponsorship. This short proposal shows them the visa route that may apply, what it asks of them and who you suggest pays what — so HR has less to work out.`
    : `This ad doesn’t mention visa sponsorship. This short proposal shows ${company} the visa route that may apply, what it asks of them and which costs you offer to share.`;

  return (
    <Row
      ok={false}
      soft={visaOffered}
      compact={compact}
      title="Sponsorship document"
      status={visaOffered ? 'Not added' : 'Missing'}
      text={why}
      action={
        can && credits ? (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button onClick={go(start)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-700">
              <FileSignature className="h-4 w-4" /> Prepare it
            </button>
            <span className="text-[11px] text-ink-500">{allowanceLabel(credits)}</span>
          </span>
        ) : credits?.pro ? (
          <span className="text-right text-[12px] leading-4 text-ink-500">
            All 50 used this month.
            <br />
            They renew on the 1st.
          </span>
        ) : (
          <span className="flex flex-col items-stretch gap-1 sm:items-end">
            <button
              onClick={() => (session ? nav('/pricing#pro') : onAuth?.('register'))}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-brand-700"
            >
              <Lock className="h-3.5 w-3.5" /> Add it with Pro
            </button>
            <span className="text-[11px] text-ink-500">
              50 a month · {prices.pro.monthly.label}/month
            </span>
          </span>
        )
      }
    />
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

export function ProPrice({ className = '' }: { className?: string }) {
  const prices = usePrices();
  return (
    <span className={className}>
      {prices.pro.monthly.label} a month, or {prices.pro.yearly.label} a year
    </span>
  );
}
