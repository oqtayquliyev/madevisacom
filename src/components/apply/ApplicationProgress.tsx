import { ArrowRight, Check, Mail, Pause, Play, Square, Zap } from 'lucide-react';
import { tally } from '@/lib/apply/runner';
import { sendNow, useApplyState, type App, type ApplyStatus, type Phase, type QueueInfo } from '@/lib/apply/store';
import { SendingBar } from '@/components/apply/SendingBar';
import { nav } from '@/lib/pageLayout';
import { MatchRing } from '@/components/cv/MatchBits';
import { ApplicationQueue } from '@/components/apply/ApplicationQueue';
import { BTN } from '@/components/apply/ui';

const Spinner = ({ small = false }: { small?: boolean }) => <span className={`${small ? 'h-3.5 w-3.5' : 'h-4 w-4'} inline-block animate-spin rounded-full border-2 border-brand-100 border-t-brand-600 motion-reduce:animate-none`} aria-hidden />;

/** "Checking 16 applications…" — while every form is read, before anything is asked. */
export function ApplicationAnalyzing({ phase }: { phase: Extract<Phase, { kind: 'analyzing' }> }) {
  return (
    <section aria-live="polite" className="mt-6 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-ink-200 sm:p-6">
      <div className="flex items-center gap-3">
        <Spinner />
        <div>
          <h3 className="text-[17px] font-bold tracking-tight text-ink-950">
            Checking {phase.total} {phase.total === 1 ? 'application' : 'applications'}…
          </h3>
          <p className="text-[13px] text-ink-600">MadeVisa is reading each employer’s form to see what it already knows and what it needs from you.</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.read} aria-label="Forms read">
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.max(6, Math.round((100 * phase.read) / Math.max(1, phase.total)))}%` }} />
      </div>
    </section>
  );
}

const PAUSE_TEXT: Record<NonNullable<QueueInfo['reason']>, (s: ApplyStatus) => { title: string; text: string }> = {
  you: () => ({ title: 'Paused', text: 'Nothing is lost. What was submitted stays submitted; the rest wait until you continue.' }),
  offline: () => ({ title: 'Paused', text: 'The connection dropped. Nothing is lost — carry on when you’re back online.' }),
  daily_limit: (s) => ({ title: 'That’s today’s limit', text: `You set ${s.daily} applications a day. The rest carry on tomorrow by themselves.` }),
  allowance: (s) => ({ title: 'This month’s applications are used', text: s.pro ? `Pro includes ${s.monthly} a month. The rest wait until next month.` : `A free account includes ${s.monthly} a month; MadeVisa Pro includes ${s.proMonthly}. The rest wait.` }),
};

/** The four checks shown for the application being submitted. */
const CHECKS = ['CV tailored', 'Application completed', 'Answers verified', 'Submitted'] as const;
const reached = (progress: string | null | undefined): number => (progress === 'submitting' ? 3 : progress === 'filling' || progress === 'uploading' ? 1 : 1);

type Props = {
  apps: App[];
  queue: QueueInfo;
  status: ApplyStatus;
  phase: Phase;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOpen: (app: App) => void;
  onPrefs: () => void;
};

/** One screen for the whole batch while it runs: which job, how many are done, what needs the person. */
export function ApplicationProgress({ apps, queue, status, phase, error, onPause, onResume, onStop, onPrefs }: Props) {
  const t = tally(apps);
  const sending = useApplyState().sending;
  const submitted = t.sent + t.sentByYou;
  const done = t.total - t.pending;
  const current = apps.find((a) => a.status === 'submitting') ?? null;
  const pct = Math.round((100 * done) / Math.max(1, t.total));
  const running = queue.state === 'running';
  const paused = queue.state === 'paused' ? PAUSE_TEXT[queue.reason ?? 'you'](status) : null;
  const dailyWait = running && status.today >= status.daily && apps.some((a) => a.status === 'ready');
  const online = Boolean(status.worker?.online);
  const attention = apps.filter((a) => a.status === 'needs_attention' || a.status === 'blocked' || a.status === 'failed');
  const preparing = phase.kind === 'preparing';

  return (
    <section aria-labelledby="apply-progress-title" className="mt-6 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-wider text-brand-700">{paused ? paused.title : 'MadeVisa is applying for you'}</p>
            <h3 id="apply-progress-title" className="mt-0.5 text-[24px] font-bold tabular-nums tracking-tight text-ink-950" aria-live="polite">
              {Math.min(t.total, done)} of {t.total}
            </h3>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {running ? (
              <button onClick={onPause} className={BTN.small}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            ) : queue.reason === 'allowance' && status.left < 1 ? (
              !status.pro && (
                <button onClick={() => nav('/checkout?plan=pro&source=auto_apply_allowance')} className={BTN.small}>
                  See MadeVisa Pro <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )
            ) : (
              <button onClick={onResume} className={BTN.small}>
                <Play className="h-3.5 w-3.5" /> Continue
              </button>
            )}
            <button onClick={onStop} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50">
              <Square className="h-3 w-3" /> Stop
            </button>
          </div>
        </div>

        <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-600">
          <div className="flex items-baseline gap-1.5">
            <dd className="font-bold tabular-nums text-emerald-700">{submitted}</dd>
            <dt>submitted</dt>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dd className="font-bold tabular-nums text-ink-950">{t.pending}</dd>
            <dt>remaining</dt>
          </div>
          {t.attention > 0 && (
            <div className="flex items-baseline gap-1.5">
              <dd className="font-bold tabular-nums text-amber-700">{t.attention}</dd>
              <dt>{t.attention === 1 ? 'needs your attention' : 'need your attention'}</dt>
            </div>
          )}
        </dl>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={t.total} aria-valuenow={done} aria-label="Applications done">
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        {paused && <p className="mt-2 text-[13px] text-ink-600">{paused.text}</p>}
        {dailyWait && (
          <p className="mt-2 text-[13px] text-ink-600">
            That’s today’s {status.daily}. The rest carry on tomorrow by themselves —{' '}
            <button onClick={onPrefs} className="font-semibold text-brand-700 hover:underline">
              change my limit
            </button>
            .
          </p>
        )}
        {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>}
      </div>

      {current ? (
        <div className="mx-4 mt-4 rounded-2xl bg-ink-50 p-4 sm:mx-6">
          <p className="text-[12px] font-semibold text-ink-500">Current application</p>
          <div className="mt-1.5 flex items-center gap-3">
            <MatchRing score={current.score} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink-950">{current.title}</p>
              <p className="truncate text-[13px] text-ink-600">
                {current.company} · {current.score}% match
              </p>
            </div>
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {CHECKS.map((c, i) => {
              const at = reached(current.progress);
              const st = i < at || (i === 2 && at === 3) ? 'done' : i === at ? 'doing' : 'todo';
              return (
                <li key={c} className={`flex items-center gap-2 text-[13.5px] ${st === 'todo' ? 'text-ink-400' : st === 'doing' ? 'font-semibold text-ink-950' : 'text-ink-800'}`}>
                  {st === 'done' ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} /> : st === 'doing' ? <Spinner /> : <span className="h-4 w-4 rounded-full border-2 border-ink-200" aria-hidden />}
                  {c}
                </li>
              );
            })}
          </ul>
        </div>
      ) : preparing ? (
        <p className="mx-4 mt-4 flex items-center gap-2 rounded-2xl bg-ink-50 px-4 py-3 text-[13.5px] text-ink-700 sm:mx-6">
          <Spinner small /> Tailoring your CV for each job ({phase.done} of {phase.total})…
        </p>
      ) : sending || apps.some((a) => a.status === 'submitting') ? (
        <SendingBar className="mx-4 mt-4 sm:mx-6" />
      ) : running && apps.some((a) => a.status === 'ready') ? (
        <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink-50 px-4 py-3 sm:mx-6">
          <p className="text-[13.5px] font-semibold text-ink-800">Prepared and ready to send.</p>
          <button type="button" onClick={() => void sendNow(apps.filter((a) => a.status === 'ready').map((a) => a.id))} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-brand-700">
            <Zap className="h-4 w-4" /> Apply now
          </button>
        </div>
      ) : null}

      {running && online && t.pending > 0 && (
        <p className="mx-4 mt-3 text-[13px] leading-5 text-ink-600 sm:mx-6">
          <strong className="font-semibold text-ink-900">You can leave this page.</strong> MadeVisa will continue processing your applications.
          {!current && (status.worker?.waitMinutes ?? 0) > 0 && ` They start within ${status.worker!.waitMinutes} ${status.worker!.waitMinutes === 1 ? 'minute' : 'minutes'}.`}
        </p>
      )}

      {attention.length > 0 && (
        <p className="mx-4 mt-4 pb-5 sm:mx-6">
          <button
            type="button"
            onClick={() => document.getElementById('applications')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="text-[13.5px] font-bold text-amber-800 hover:underline"
          >
            {attention.length} {attention.length === 1 ? 'needs' : 'need'} you — see below ↓
          </button>
        </p>
      )}
      {attention.length === 0 && <div className="pb-5" />}
    </section>
  );
}

type DoneProps = {
  apps: App[];
  stopped: boolean;
  email: string | null;
  onOpen: (app: App) => void;
  onView: () => void;
  onMore: () => void;
  onDismiss: () => void;
};

/** "Your applications are out" — what was submitted, with which email, and what needs the person. */
export function ApplicationDone({ apps, stopped, email, onOpen, onView, onMore, onDismiss }: DoneProps) {
  const t = tally(apps);
  const submitted = t.sent + t.sentByYou;
  const attention = apps.filter((a) => a.status === 'needs_attention' || a.status === 'blocked' || a.status === 'failed');
  const emails = [...new Set(apps.filter((a) => a.status === 'submitted' && a.emailUsed).map((a) => a.emailUsed!))];
  const used = emails.length ? emails : email ? [email] : [];

  return (
    <section aria-labelledby="apply-done-title" className="mt-6 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="px-4 pt-6 text-center sm:px-8">
        <p className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-5 w-5" strokeWidth={3} />
        </p>
        <p className="mt-3 text-[12px] font-bold uppercase tracking-wider text-emerald-700">{stopped ? 'Stopped' : submitted > 0 ? 'Your applications are out' : 'Your applications need you'}</p>
        <h3 id="apply-done-title" className="mt-1 text-[26px] font-bold tracking-tight text-ink-950">
          {submitted} {submitted === 1 ? 'application' : 'applications'} submitted
        </h3>
        {submitted > 0 && used.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[14px] text-ink-600">
            <Mail className="h-4 w-4 text-brand-700" /> Using <strong className="break-all font-semibold text-ink-950">{used.join(' and ')}</strong>
          </p>
        )}
        {used.length > 1 && <p className="mt-1 text-[12.5px] text-ink-500">Different applications used different email addresses — each one is shown on its receipt.</p>}

        <dl className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 text-[13.5px] text-ink-600">
          {(
            [
              [submitted, 'submitted', 'text-emerald-700'],
              [t.attention, t.attention === 1 ? 'needs attention' : 'need attention', t.attention ? 'text-amber-700' : 'text-ink-950'],
              [t.skipped, 'skipped', 'text-ink-950'],
            ] as [number, string, string][]
          ).map(([n, label, tone]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dd className={`text-[20px] font-bold tabular-nums ${tone}`}>{n}</dd>
              <dt>{label}</dt>
            </div>
          ))}
        </dl>

        {submitted > 0 && (
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-6 text-ink-700">
            {t.sentByYou === submitted ? 'You submitted these on the employers’ sites. MadeVisa keeps track of them for you.' : 'MadeVisa tailored your applications and submitted them to the employer career sites.'} Confirmations from employers arrive in your inbox.
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={onView} className={BTN.primary}>
            View applications
          </button>
          <button onClick={onMore} className={BTN.secondary}>
            Find more jobs
          </button>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="mx-4 mt-6 sm:mx-8">
          <p className="mb-1.5 text-[13px] font-bold text-ink-950">Needs your attention</p>
          <ApplicationQueue apps={attention} onOpen={onOpen} />
        </div>
      )}

      <div className="mt-6 flex justify-end border-t border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-8">
        <button onClick={onDismiss} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-500 hover:text-ink-800">
          Close
        </button>
      </div>
    </section>
  );
}
