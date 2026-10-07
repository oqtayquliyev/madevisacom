import { ArrowRight, Check, Pause, Play, Send, Square } from 'lucide-react';
import { timeSaved } from '@/lib/apply/decision';
import { STEPS, STEP_TEXT, tally, type Step } from '@/lib/apply/runner';
import type { App, ApplyStatus, QueueInfo } from '@/lib/apply/store';
import { nav } from '@/lib/pageLayout';
import { TestimonialTicker } from '@/components/common/Testimonials';
import { MatchRing } from '@/components/cv/MatchBits';
import { ApplicationQueue } from '@/components/apply/ApplicationQueue';
import { BTN } from '@/components/apply/ui';

const remaining = (seconds: number) => (seconds < 50 ? 'under a minute' : seconds < 100 ? 'about a minute' : `about ${Math.round(seconds / 60)} minutes`);

const PAUSE_TEXT: Record<NonNullable<QueueInfo['reason']>, (s: ApplyStatus) => { title: string; text: string }> = {
  you: () => ({ title: 'Paused', text: 'Nothing is lost. What was submitted stays submitted, and the rest wait in the queue.' }),
  offline: () => ({ title: 'Paused', text: 'The connection dropped. Nothing is lost — carry on when you’re back online.' }),
  daily_limit: (s) => ({ title: 'That’s today’s limit', text: `You set ${s.daily} applications a day. The rest wait in the queue and carry on tomorrow — or raise the limit in your preferences.` }),
  allowance: (s) => ({ title: 'This month’s applications are used', text: s.pro ? `Pro includes ${s.monthly} a month. The rest wait in the queue until next month.` : `A free account includes ${s.monthly} a month; MadeVisa Pro includes ${s.proMonthly}. The rest wait in the queue.` }),
};

type Props = {
  apps: App[];
  queue: QueueInfo;
  status: ApplyStatus;
  running: boolean;
  halting: boolean;
  current: { id: string; step: Step } | null;
  pace: number;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOpen: (app: App) => void;
  onPrefs: () => void;
};

/** The batch as it runs: which application, which step, how many are done — and Pause, Continue, Stop. */
export function ApplicationProgress({ apps, queue, status, running, halting, current, pace, error, onPause, onResume, onStop, onOpen, onPrefs }: Props) {
  const t = tally(apps);
  const done = t.total - t.queued;
  const byUs = apps.some((a) => a.channel === 'madevisa');
  const now = current ? apps.find((a) => a.id === current.id) ?? null : null;
  const at = now ? STEPS.indexOf(current!.step) : -1;
  const pct = Math.round((100 * done) / Math.max(1, t.total));
  const paused = !running && queue.state !== 'running' ? PAUSE_TEXT[queue.reason ?? 'you'](status) : null;
  // The page was closed mid-batch: the batch is still "running" in the database, but nothing is happening here.
  const idle = !running && queue.state === 'running';
  const needYou = apps.filter((a) => a.status === 'needs_answer' || a.status === 'failed');
  // While nothing is running, the ones already prepared can be sent from here.
  const ready = running ? [] : apps.filter((a) => a.status === 'review_required');
  // For a job on the employer's own site, the last step is handing it over — nothing is submitted by MadeVisa.
  const steps = STEPS.filter((s) => s !== 'submit' || now?.channel === 'madevisa');

  return (
    <section aria-labelledby="apply-progress-title" aria-live="polite" className="mt-6 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="apply-progress-title" className="text-[19px] font-bold tracking-tight text-ink-950">
              {paused ? paused.title : idle ? 'Your applications are waiting' : byUs ? 'MadeVisa is applying for you' : 'MadeVisa is preparing your applications'}
            </h3>
            <p className="mt-0.5 text-[13.5px] text-ink-600">{paused ? paused.text : idle ? 'You left before this batch was finished. Nothing was lost.' : `Application ${Math.min(t.total, done + 1)} of ${t.total}`}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {running ? (
              <button onClick={onPause} disabled={halting} className={BTN.small}>
                <Pause className="h-3.5 w-3.5" /> {halting ? 'Pausing…' : 'Pause'}
              </button>
            ) : queue.reason === 'allowance' && status.left < 1 ? (
              !status.pro && (
                <button onClick={() => nav('/pricing#pro')} className={BTN.small}>
                  See MadeVisa Pro <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )
            ) : queue.reason === 'daily_limit' && status.today >= status.daily ? (
              <button onClick={onPrefs} className={BTN.small}>
                Change my limit
              </button>
            ) : (
              <button onClick={onResume} className={BTN.small}>
                <Play className="h-3.5 w-3.5" /> Continue
              </button>
            )}
            <button onClick={onStop} disabled={halting} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50 disabled:text-ink-300">
              <Square className="h-3 w-3" /> Stop
            </button>
          </div>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={t.total} aria-valuenow={done} aria-label="Applications done">
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-600">
          {(
            [
              [t.sent + t.sentByYou, 'submitted', t.sent + t.sentByYou > 0 || byUs],
              [t.ready, 'ready to send', t.ready > 0 || !byUs],
              [t.needsAnswer + t.failed, 'need you', t.needsAnswer + t.failed > 0],
              [t.queued, 'remaining', true],
            ] as [number, string, boolean][]
          )
            .filter(([, , show]) => show)
            .map(([n, label]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dd className="text-[16px] font-bold tabular-nums text-ink-950">{n}</dd>
                <dt>{label}</dt>
              </div>
            ))}
          {running && t.queued > 0 && <div className="text-ink-500">{remaining(t.queued * pace)} left</div>}
        </dl>
        {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>}
      </div>

      {now && (
        <div className="mx-4 mt-4 rounded-2xl bg-ink-50 p-4 sm:mx-6">
          <div className="flex items-center gap-3">
            <MatchRing score={now.score} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink-950">{now.title}</p>
              <p className="truncate text-[13px] text-ink-600">
                {now.company} · {now.score}% match
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => {
              const i = STEPS.indexOf(s);
              const state = i < at ? 'done' : i === at ? 'doing' : 'todo';
              return (
                <li key={s} className={`flex items-center justify-between gap-3 text-[13.5px] ${state === 'todo' ? 'text-ink-400' : state === 'doing' ? 'font-semibold text-ink-950' : 'text-ink-700'}`}>
                  <span className="flex items-center gap-2.5">
                    {state === 'done' ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} /> : state === 'doing' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600 motion-reduce:animate-none" aria-hidden /> : <span className="h-4 w-4 rounded-full border-2 border-ink-200" aria-hidden />}
                    {STEP_TEXT[s]}
                  </span>
                  <span className="text-[12px] font-normal text-ink-500">{state === 'done' ? 'Complete' : state === 'doing' ? 'In progress' : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {needYou.length > 0 && (
        <div className="mx-4 mt-4 sm:mx-6">
          <p className="mb-1.5 text-[13px] font-bold text-ink-950">
            {needYou.length} {needYou.length === 1 ? 'application needs' : 'applications need'} your attention
          </p>
          <ApplicationQueue apps={needYou} onOpen={onOpen} />
        </div>
      )}

      {ready.length > 0 && (
        <div className="mx-4 mt-4 sm:mx-6">
          <p className="mb-1.5 text-[13px] font-bold text-ink-950">
            {ready.length} ready for you to send
          </p>
          <ApplicationQueue apps={ready} onOpen={onOpen} />
        </div>
      )}

      <div className="mt-5 border-t border-ink-100 px-4 py-4 sm:px-6">
        <TestimonialTicker every={4200} />
      </div>
    </section>
  );
}

type DoneProps = {
  apps: App[];
  stopped: boolean;
  onOpen: (app: App) => void;
  onSendNext: () => void;
  onTracker: () => void;
  onMore: () => void;
  onImprove: (() => void) | null;
  onDismiss: () => void;
};

/** When the batch is through: what was submitted, what is ready, what it saved — and what to do next. */
export function ApplicationDone({ apps, stopped, onOpen, onSendNext, onTracker, onMore, onImprove, onDismiss }: DoneProps) {
  const t = tally(apps);
  const submitted = t.sent + t.sentByYou;
  const worked = apps.filter((a) => a.status === 'submitted' || a.status === 'review_required');
  const strong = worked.filter((a) => a.score >= 80).length;
  const saved = timeSaved(t.sent, t.sentByYou + t.ready);
  const needYou = apps.filter((a) => a.status === 'needs_answer' || a.status === 'failed');
  const attention = t.needsAnswer + t.failed;
  const head = t.ready > 0 && submitted === 0 ? `${t.ready} ${t.ready === 1 ? 'application is' : 'applications are'} ready to send` : `${submitted} ${submitted === 1 ? 'application' : 'applications'} submitted`;

  return (
    <section aria-labelledby="apply-done-title" className="mt-6 overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-ink-200">
      <div className="px-4 pt-6 text-center sm:px-8">
        <p className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-5 w-5" strokeWidth={3} />
        </p>
        <h3 id="apply-done-title" className="mt-3 text-[24px] font-bold tracking-tight text-ink-950">
          {stopped ? 'Stopped.' : t.ready > 0 ? 'Almost there.' : 'You’re done.'}
        </h3>
        <p className="mt-1 text-[18px] font-bold text-ink-950">{worked.length > 0 ? head : 'Nothing was submitted in this batch'}</p>
        {worked.length > 0 && (
          <p className="mt-0.5 text-[14px] text-ink-600">
            {saved.text.replace(/^about/, 'About')} saved <span className="text-ink-400">(an estimate)</span>
          </p>
        )}
        <dl className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-ink-600">
          {(
            [
              [strong, strong === 1 ? 'strong match' : 'strong matches'],
              [worked.length - strong, worked.length - strong === 1 ? 'good match' : 'good matches'],
              [t.sent > 0 && t.ready > 0 ? t.ready : 0, 'ready to send'],
              [attention, attention === 1 ? 'needs your attention' : 'need your attention'],
              [t.skipped, 'skipped'],
            ] as [number, string][]
          )
            .filter(([n]) => n > 0)
            .map(([n, label]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dd className="text-[18px] font-bold tabular-nums text-ink-950">{n}</dd>
                <dt>{label}</dt>
              </div>
            ))}
        </dl>

        {t.ready > 0 && (
          <div className="mx-auto mt-5 max-w-md rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-200">
            <p className="text-[13.5px] leading-5 text-ink-800">
              {t.ready === 1 ? 'It is' : 'They are'} prepared — tailored CV, answers, and a letter where one helps. Each takes one visit to the employer’s form.
            </p>
            <button onClick={onSendNext} className={`${BTN.primary} mt-3 w-full`}>
              <Send className="h-4 w-4" /> Send the {t.ready === 1 ? 'application' : 'first one'}
            </button>
          </div>
        )}

        {submitted > 0 && (
          <p className="mx-auto mt-5 max-w-md text-[14px] leading-6 text-ink-700">
            <strong className="font-semibold text-ink-950">Your job search is now running.</strong> MadeVisa will keep tracking these applications for you.
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={onTracker} className={t.ready > 0 ? BTN.secondary : BTN.primary}>
            View application tracker
          </button>
          <button onClick={onMore} className={BTN.secondary}>
            Find more matches
          </button>
        </div>
      </div>

      {needYou.length > 0 && (
        <div className="mx-4 mt-5 sm:mx-8">
          <p className="mb-1.5 text-[13px] font-bold text-ink-950">Needs your attention</p>
          <ApplicationQueue apps={needYou} onOpen={onOpen} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-4 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-ink-950">Improve your chances</p>
          <p className="text-[13px] text-ink-600">{onImprove ? 'Your current CV match can potentially improve.' : 'New jobs arrive every day. Search again tomorrow for fresh matches.'}</p>
        </div>
        <div className="flex gap-2">
          {onImprove && (
            <button onClick={onImprove} className={BTN.small}>
              Improve my CV
            </button>
          )}
          <button onClick={onDismiss} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-500 hover:text-ink-800">
            Close
          </button>
        </div>
      </div>
    </section>
  );
}
