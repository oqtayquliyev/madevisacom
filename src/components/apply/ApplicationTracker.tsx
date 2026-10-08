import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { nav } from '@/lib/pageLayout';
import { STAGE_LABEL, fetchOutcomes, type App } from '@/lib/apply/store';
import { ApplicationQueue } from '@/components/apply/ApplicationQueue';

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
  const list = filter === 'todo' ? todo : filter === 'submitted' ? submitted : apps;
  const shown = all ? list : list.slice(0, 8);

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
        {shown.length ? <ApplicationQueue apps={shown} onOpen={onOpen} /> : <p className="rounded-2xl bg-white px-4 py-6 text-center text-[13px] text-ink-500 ring-1 ring-ink-200">Nothing here.</p>}
        {list.length > shown.length && (
          <p className="mt-3 text-center">
            <button onClick={() => setAll(true)} className="rounded-full px-4 py-2 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
              Show all {list.length}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
