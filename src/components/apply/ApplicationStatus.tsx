import { AlertCircle, BadgeCheck, Check, CircleSlash, Clock, HelpCircle, Send } from 'lucide-react';
import { DECISION_LABEL, PRIORITY_LABEL, SPONSOR_LABEL } from '@/lib/apply/decision';
import { STATUS_TONE, statusText } from '@/lib/apply/machine';
import type { AppStatus, Application, Decision, Priority, SponsorState } from '@/lib/apply/types';

const TONE: Record<'ink' | 'brand' | 'amber' | 'emerald' | 'rose', string> = {
  ink: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-800',
  amber: 'bg-amber-50 text-amber-900',
  emerald: 'bg-emerald-50 text-emerald-800',
  rose: 'bg-rose-50 text-rose-800',
};
const CHIP = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold';

const ICON: Partial<Record<AppStatus, typeof Check>> = { submitted: Check, failed: AlertCircle, needs_answer: HelpCircle, review_required: Send, queued: Clock, skipped: CircleSlash, already_applied: CircleSlash, expired: CircleSlash };

/** One application's state, as a chip. */
export function ApplicationStatus({ app, className = '' }: { app: Pick<Application, 'status' | 'verified' | 'reasonCode'>; className?: string }) {
  const Icon = ICON[app.status];
  const busy = app.status === 'preparing' || app.status === 'submitting';
  return (
    <span className={`${CHIP} ${TONE[STATUS_TONE[app.status]]} ${className}`}>
      {busy ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-brand-200 border-t-brand-700 motion-reduce:animate-none" aria-hidden /> : Icon ? <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
      {statusText(app)}
    </span>
  );
}

/** "Verified submission" — only ever shown with a delivery confirmation behind it. */
export function VerifiedBadge({ app }: { app: Pick<Application, 'verified' | 'confirmation'> }) {
  if (!app.verified || !app.confirmation?.id) return null;
  return (
    <span className={`${CHIP} bg-emerald-50 text-emerald-800`} title={`Delivery confirmation ${app.confirmation.id}`}>
      <BadgeCheck className="h-3 w-3" aria-hidden /> Verified submission
    </span>
  );
}

const DECISION_TONE: Record<Decision, string> = { auto: TONE.emerald, review: TONE.amber, skip: TONE.ink };
export function DecisionChip({ decision }: { decision: Decision }) {
  return <span className={`${CHIP} uppercase tracking-wide ${DECISION_TONE[decision]}`}>{DECISION_LABEL[decision]}</span>;
}

const SPONSOR_TONE: Record<SponsorState, string> = { not_needed: TONE.emerald, likely: TONE.brand, unclear: TONE.ink, not_indicated: TONE.ink, not_compatible: TONE.rose };
/** Sponsorship as far as it is known — with the reason on hover. */
export function SponsorChip({ state, why }: { state: SponsorState; why?: string }) {
  return (
    <span className={`${CHIP} font-semibold ${SPONSOR_TONE[state]}`} title={why}>
      Sponsorship: {SPONSOR_LABEL[state].toLowerCase()}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  return <span className={`${CHIP} font-semibold ${priority === 'strong' ? TONE.emerald : priority === 'good' ? TONE.brand : TONE.ink}`}>Priority: {PRIORITY_LABEL[priority].toLowerCase()}</span>;
}
