import { Check, ChevronRight, Zap } from 'lucide-react';
import { useApplyState, type App } from '@/lib/apply/store';
import { MatchRing } from '@/components/cv/MatchBits';
import { ApplicationStatus, VerifiedBadge } from '@/components/apply/ApplicationStatus';

const ACTION: Partial<Record<App['status'], string>> = { needs_attention: 'Review application', blocked: 'Review application', failed: 'See why' };

/** The applications of a batch, one line each: where it stands, and what it needs from the person. */
export function ApplicationQueue({ apps, onOpen, onSend, currentId, max }: { apps: App[]; onOpen: (app: App) => void; onSend?: (app: App) => void; currentId?: string | null; max?: number }) {
  const shown = max ? apps.slice(0, max) : apps;
  const sending = useApplyState().sending;
  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
      {shown.map((a) => {
        const action = ACTION[a.status];
        // Every application opens: the ones still in progress show where they are.
        const open = true;
        return (
          <li key={a.id} className={`flex items-center ${currentId === a.id ? 'bg-brand-50/50' : ''}`}>
            <button type="button" disabled={!open} onClick={() => onOpen(a)} className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left sm:px-4 ${open ? 'hover:bg-ink-50' : ''}`}>
              <MatchRing score={a.score} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink-950">{a.title}</span>
                <span className="block truncate text-[12px] text-ink-500">{a.company}</span>
                {/* On a phone the state sits under the job, so the title keeps its room. */}
                <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                  <ApplicationStatus app={a} />
                  <VerifiedBadge app={a} />
                </span>
              </span>
              {!(onSend && a.status === 'ready') && (
                <span className="hidden shrink-0 items-center gap-1 sm:flex">
                  <VerifiedBadge app={a} />
                  <ApplicationStatus app={a} />
                </span>
              )}
              {action ? <span className="hidden shrink-0 text-[12.5px] font-bold text-brand-700 sm:inline">{action}</span> : null}
              {open && !(onSend && a.status === 'ready') && <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />}
            </button>
            {onSend && a.status === 'ready' && (
              <span className="shrink-0 pr-3 sm:pr-4">
                {sending && (!sending.ids || sending.ids.includes(a.id)) ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12.5px] font-bold text-emerald-800">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} /> Sending
                  </span>
                ) : (
                  <button type="button" onClick={() => onSend(a)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-brand-700">
                    <Zap className="h-3.5 w-3.5" /> Apply now
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
