import { Send } from 'lucide-react';
import type { Plan, Planned } from '@/lib/apply/decision';
import { MatchRing } from '@/components/cv/MatchBits';
import { DecisionChip, PriorityChip, SponsorChip } from '@/components/apply/ApplicationStatus';
import { Sheet } from '@/components/apply/Sheet';
import { BTN } from '@/components/apply/ui';

/** Skipped for a reason no tick can change: already applied, the same role, closed, or not a match at all. */
const FIXED = new Set(['already_applied', 'same_role', 'duplicate_listing', 'closed', 'too_low']);
const canPick = (p: Planned) => !p.a.codes.some((c) => FIXED.has(c));

function Row({ p, checked, onToggle }: { p: Planned; checked: boolean; onToggle: () => void }) {
  const pickable = canPick(p);
  return (
    <li>
      <label className={`flex items-start gap-3 rounded-2xl p-3 ring-1 transition ${checked ? 'bg-brand-50/50 ring-brand-200' : 'bg-white ring-ink-200'} ${pickable ? 'cursor-pointer hover:ring-brand-300' : 'opacity-70'}`}>
        <input type="checkbox" checked={checked} disabled={!pickable} onChange={onToggle} className="mt-3 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-200" aria-label={`Apply to ${p.job.title} at ${p.job.company}`} />
        <MatchRing score={p.job.score} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-[14px] font-bold leading-snug text-ink-950 [overflow-wrap:anywhere]">{p.job.title}</span>
            <DecisionChip decision={p.a.decision} />
          </span>
          <span className="block truncate text-[12.5px] text-ink-500">
            {p.job.company}
            {p.job.country ? ` · ${p.job.country}` : ''}
          </span>
          <span className="mt-1 block text-[12.5px] leading-5 text-ink-700">{p.a.reason}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <SponsorChip state={p.a.sponsorship.state} why={p.a.sponsorship.why} />
            {p.a.decision !== 'skip' && <PriorityChip priority={p.a.priority} />}
          </span>
        </span>
      </label>
    </li>
  );
}

/** "Review matches": every job with its recommendation and the reason — tick what should be applied to. */
export function ApplicationReview({ plan, picked, setPicked, onClose, onApply }: { plan: Plan; picked: Set<string>; setPicked: (s: Set<string>) => void; onClose: () => void; onApply: () => void }) {
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const groups: [string, string, Planned[]][] = [
    ['Recommended', 'At or above your minimum, with nothing that needs a look.', plan.auto],
    ['Worth reviewing', 'Close, or with something you should check first.', plan.review],
    ['Skipped', 'Left out — and why.', plan.skip],
  ];
  const n = picked.size;
  return (
    <Sheet
      id="apply-review"
      title="Review matches"
      sub="MadeVisa’s recommendation for each job. Tick or untick anything."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-600">
            <strong className="font-bold tabular-nums text-ink-950">{n}</strong> selected
          </p>
          <button onClick={onApply} disabled={n === 0} className={BTN.primary}>
            <Send className="h-4 w-4" /> Apply to {n} {n === 1 ? 'job' : 'jobs'}
          </button>
        </div>
      }
    >
      {groups
        .filter(([, , list]) => list.length > 0)
        .map(([title, sub, list]) => (
          <section key={title} className="mt-4 first:mt-1">
            <h3 className="text-[14px] font-bold text-ink-950">
              {title} <span className="tabular-nums text-ink-400">{list.length}</span>
            </h3>
            <p className="text-[12.5px] text-ink-500">{sub}</p>
            <ul className="mt-2 space-y-2">
              {list.map((p) => (
                <Row key={p.job.id} p={p} checked={picked.has(p.job.id)} onToggle={() => toggle(p.job.id)} />
              ))}
            </ul>
          </section>
        ))}
    </Sheet>
  );
}
