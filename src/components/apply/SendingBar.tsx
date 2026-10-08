import { useEffect, useState } from 'react';
import { Check, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useApplyState } from '@/lib/apply/store';

const STEP: Record<string, string> = {
  opening: 'Opening the careers page',
  uploading: 'Attaching the CV',
  filling: 'Filling in the form',
  submitting: 'Pressing Submit',
};

/**
 * After "Apply now" / "Apply all".
 * Everyone: it's done on their side — MadeVisa sends them in the background
 * and emails each one; no waiting on this page.
 * Admins: also the live detail (service start, the step on each employer's site).
 */
export function SendingBar({ className = '' }: { className?: string }) {
  const st = useApplyState();
  const { profile } = useAuth();
  const admin = profile?.role === 'admin';
  const [now, setNow] = useState(() => Date.now());
  const s = st.sending;
  const live = st.apps.filter((a) => a.status === 'submitting');
  const ticking = admin && (Boolean(s) || live.length > 0);
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ticking]);
  if (!s && !live.length) return null;

  const mine = (a: { id: string }) => !s?.ids || s.ids.includes(a.id);
  const left = st.apps.filter((a) => mine(a) && (a.status === 'ready' || a.status === 'submitting')).length;
  const done = Math.max(0, st.apps.filter((a) => a.status === 'submitted').length - (s?.submittedBefore ?? 0));
  const total = left + done;
  const email = st.queue?.email || st.accountEmail;
  const cur = live[0];

  // Admin detail: what the service is doing right now.
  let detail = '';
  if (admin) {
    const secs = s ? Math.round((now - s.at) / 1000) : 0;
    detail = cur
      ? `${STEP[cur.progress ?? 'opening'] ?? 'Applying'} · ${cur.company}`
      : s?.reason === 'not_set_up'
        ? 'Admin: GITHUB_DISPATCH_TOKEN / GITHUB_REPO not set on the apply function — waiting for the hourly run.'
        : s?.reason === 'failed'
          ? 'Admin: GitHub didn’t accept the start request — check the token. Waiting for the hourly run.'
          : `Admin: GitHub run starting (${secs}s) — Actions → Apply worker`;
  }

  return (
    <div className={`rounded-2xl bg-emerald-50 p-3.5 ring-1 ring-emerald-200 ${className}`} role="status" aria-live="polite">
      <p className="flex items-start gap-2 text-[14px] font-semibold leading-5 text-emerald-950">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
        <span>
          {left === 0 ? `Done — ${done} ${done === 1 ? 'application' : 'applications'} sent.` : `Sent to MadeVisa. ${total === 1 ? 'It goes' : 'They go'} out in the next few minutes.`}
        </span>
      </p>
      {left > 0 && (
        <p className="mt-1 flex items-start gap-2 pl-6 text-[12.5px] leading-5 text-emerald-900">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" /> You’ll get an email{email ? ` at ${email}` : ''} for each one. You can close this page.
        </p>
      )}
      {total > 1 && (
        <div className="mt-2.5 flex items-center gap-2 pl-6">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
          <span className="shrink-0 text-[12px] tabular-nums text-emerald-900">
            {done} of {total} sent
          </span>
        </div>
      )}
      {admin && left > 0 && <p className="mt-2 pl-6 font-mono text-[11.5px] text-ink-500">{detail}</p>}
    </div>
  );
}
