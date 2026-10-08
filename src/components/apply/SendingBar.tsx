import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useApplyState } from '@/lib/apply/store';

const STEP: Record<string, string> = {
  opening: 'Opening the careers page',
  uploading: 'Attaching your CV',
  filling: 'Filling in the form',
  submitting: 'Pressing Submit',
};

/**
 * After "Apply now" / "Apply all": what is happening right now, in one line,
 * with a bar that moves — starting the service, then each application live.
 */
export function SendingBar({ className = '' }: { className?: string }) {
  const st = useApplyState();
  const [now, setNow] = useState(() => Date.now());
  const s = st.sending;
  const live = st.apps.filter((a) => a.status === 'submitting');
  useEffect(() => {
    if (!s && !live.length) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [s, live.length]);
  if (!s && !live.length) return null;

  const mine = (a: { id: string }) => !s?.ids || s.ids.includes(a.id);
  const left = st.apps.filter((a) => mine(a) && (a.status === 'ready' || a.status === 'submitting')).length;
  const done = Math.max(0, st.apps.filter((a) => a.status === 'submitted').length - (s?.submittedBefore ?? 0));
  const secs = s ? Math.round((now - s.at) / 1000) : 0;
  const cur = live[0];

  let text: string;
  let pct: number;
  if (cur) {
    text = `${STEP[cur.progress ?? 'opening'] ?? 'Applying'} · ${cur.company}`;
    pct = 35 + 15 * ['opening', 'uploading', 'filling', 'submitting'].indexOf(cur.progress ?? 'opening');
  } else if (s?.reason === 'not_set_up' || s?.reason === 'failed') {
    text = 'Queued. They go with MadeVisa’s next run — you’ll get an email for each one.';
    pct = 10;
  } else if (secs < 150) {
    text = secs < 20 ? 'Starting MadeVisa’s application service…' : 'Getting a browser ready… usually under 2 minutes';
    // Eases towards 30% while the service starts.
    pct = Math.round(30 * (1 - Math.exp(-secs / 45)));
  } else {
    text = 'Taking longer than usual. You can leave — you’ll get an email for each one.';
    pct = 30;
  }

  return (
    <div className={`rounded-2xl bg-brand-50 p-3.5 ring-1 ring-brand-100 ${className}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-[13.5px]">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-ink-950">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 motion-reduce:animate-none" aria-hidden />
          <span className="truncate">{text}</span>
        </span>
        <span className="shrink-0 tabular-nums text-ink-500">
          {done > 0 && (
            <span className="mr-2 inline-flex items-center gap-1 font-semibold text-emerald-700">
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> {done} sent
            </span>
          )}
          {left} to go
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}
