import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { STAGE_LABEL, fetchOutcomes, sendNow, useApplyState, type App } from '@/lib/apply/store';
import { SendingBar } from '@/components/apply/SendingBar';
import { Zap } from 'lucide-react';
import { ApplicationQueue } from '@/components/apply/ApplicationQueue';

/** Needs the person on the employer's own site: a login, or a form with many questions only they can answer. */
const yourself = (a: App) => a.status === 'blocked' || (a.status === 'needs_attention' && a.needs.length >= 3);
/** What to look at first: a quick answer, then what is moving, then what is done. */
const ORDER: Partial<Record<App['status'], number>> = { needs_attention: 0, submitting: 1, ready: 2, preparing: 3, analyzing: 3, queued: 3, submitted: 4, failed: 5 };
const RANK = (a: App) => ORDER[a.status] ?? 6;

const FUNNEL = ['applied', 'viewed', 'response', 'interview', 'assessment', 'final_round', 'offer'] as const;
type Filter = 'all' | 'todo' | 'submitted';

/**
 * Every application made through Auto Apply — the person's history, and the
 * funnel it adds up to. Outcomes are whatever the person has recorded (here
 * or in the dashboard's response report); nothing is assumed.
 */
export function ApplicationTracker({ apps, onOpen, refreshKey }: { apps: App[]; onOpen: (app: App) => void; refreshKey: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [all, setAll] = useState(false);
  const [openLater, setOpenLater] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const st = useApplyState();
  const sending = st.sending;
  // The batch card above already shows the live bar for its own applications.
  const inCard = Boolean(st.queue && st.queue.state === 'running' && !st.queue.plan?.auto && apps.every((a) => a.status !== 'ready' && a.status !== 'submitting' ? true : a.queueId === st.queue!.id));
  const send = async (ids?: string[]) => {
    setSendError(null);
    const r = await sendNow(ids);
    if (!r.ok) setSendError(r.error ?? 'That didn’t start.');
  };
  const [outcomes, setOutcomes] = useState<{ application_id: string; stage: string }[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchOutcomes().then((o) => alive && setOutcomes(o));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const submitted = apps.filter((a) => a.status === 'submitted');
  const todo = apps.filter((a) => ['needs_attention', 'blocked', 'failed'].includes(a.status));
  const counts = useMemo(() => {
    const ids = new Set(submitted.map((a) => a.id));
    // How far each application got. Reaching a stage means the ones before it were passed too
    // (an interview is also a reply, and a reply means it was read); a rejection is a reply.
    const far = new Map<string, number>();
    for (const o of outcomes) {
      if (!ids.has(o.application_id)) continue;
      const at = o.stage === 'rejected' ? FUNNEL.indexOf('response') : FUNNEL.indexOf(o.stage as (typeof FUNNEL)[number]);
      if (at > (far.get(o.application_id) ?? 0)) far.set(o.application_id, at);
    }
    return FUNNEL.map((s, i) => [s, i === 0 ? submitted.length : [...far.values()].filter((n) => n >= i).length] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes, submitted.length]);

  if (!apps.length) return null;
  const list = (filter === 'todo' ? todo : filter === 'submitted' ? submitted : apps).slice().sort((a, b) => RANK(a) - RANK(b));
  // MadeVisa's own work first; the ones that need the person on the employer's own site (a login, a long form) after.
  const main = list.filter((a) => !yourself(a));
  const later = list.filter(yourself);
  const shown = all ? main : main.slice(0, 8);
  const ready = apps.filter((a) => a.status === 'ready');

  return (
    <section id="applications" aria-labelledby="tracker-title" className="mx-auto max-w-3xl scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="tracker-title" className="text-[20px] font-bold tracking-tight text-ink-950">
            Your applications
          </h2>
          <p className="text-[13px] text-ink-600">Everything MadeVisa submitted for you, with exactly what was used.</p>
        </div>
        <a
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            nav('/dashboard');
          }}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
        >
          Response report in your dashboard <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {submitted.length > 0 && (
        <ol className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-ink-200 ring-1 ring-ink-200 sm:grid-cols-7" aria-label="Your job search funnel">
          {counts.map(([stage, n]) => (
            <li key={stage} className="bg-white px-2 py-3 text-center">
              <p className={`text-[20px] font-bold leading-none tabular-nums ${n > 0 ? 'text-ink-950' : 'text-ink-300'}`}>{n}</p>
              <p className="mt-1 text-[11.5px] leading-tight text-ink-600">{STAGE_LABEL[stage]}</p>
            </li>
          ))}
        </ol>
      )}

      {ready.length > 0 && !sending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-ink-200">
          <p className="text-[14px] font-semibold text-ink-900">
            <span className="tabular-nums">{ready.length}</span> {ready.length === 1 ? 'application is' : 'applications are'} ready to send
          </p>
          <button type="button" onClick={() => void send()} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-brand-700">
            <Zap className="h-4 w-4" /> {ready.length === 1 ? 'Apply now' : `Apply to all ${ready.length}`}
          </button>
        </div>
      )}
      {sendError && <p className="mt-2 text-[13px] text-rose-700">{sendError}</p>}
      {!inCard && <SendingBar className="mt-3" />}

      <div className="mt-4 flex flex-wrap gap-1 rounded-full bg-ink-100 p-1 text-[12.5px] font-semibold sm:w-fit" role="tablist" aria-label="Show">
        {(
          [
            ['all', 'All', apps.length],
            ['todo', 'Need you', todo.length],
            ['submitted', 'Submitted', submitted.length],
          ] as [Filter, string, number][]
        ).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-full px-3 py-1 ${filter === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600'}`}>
            {label} <span className="tabular-nums text-ink-400">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        {shown.length ? <ApplicationQueue apps={shown} onOpen={onOpen} onSend={(a) => void send([a.id])} /> : !later.length && <p className="rounded-2xl bg-white px-4 py-6 text-center text-[13px] text-ink-500 ring-1 ring-ink-200">Nothing here.</p>}
        {main.length > shown.length && (
          <p className="mt-3 text-center">
            <button onClick={() => setAll(true)} className="rounded-full px-4 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
              Show all {main.length}
            </button>
          </p>
        )}
      </div>

      {later.length > 0 && (
        <div className="mt-5">
          <button type="button" onClick={() => setOpenLater(!openLater)} aria-expanded={openLater} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-ink-50 px-4 py-3 text-left">
            <span>
              <span className="block text-[14px] font-bold text-ink-900">
                Apply on their site yourself <span className="tabular-nums text-ink-400">{later.length}</span>
              </span>
              <span className="block text-[12.5px] text-ink-500">These need your own login or a long form. Your CV and answers are ready to paste.</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-ink-500 transition ${openLater ? 'rotate-180' : ''}`} />
          </button>
          {openLater && (
            <div className="mt-2 opacity-90">
              <ApplicationQueue apps={later} onOpen={onOpen} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
