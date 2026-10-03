import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, CheckCircle2, FileText, Loader2, Megaphone, Power, RefreshCw, ScanSearch, Send, Square, AlertTriangle as TriangleAlert, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Admin → Control room (the first tab).
//
//   The switch   one button starts or stops everything that runs by itself:
//                job sync, publishing, the company finder and social media.
//                Each part keeps its own settings (Import & sync, Social
//                media); the ticks here choose which parts the button drives.
//   The numbers  what happened in the last 24 hours: sign-ups, CVs, match
//                checks, jobs, companies, posts, plan requests — with the
//                latest sign-ups, the latest CVs and the run log.
//
// Server side: migration 20261127090000_control_room_cvs_media.sql
// (master_status / master_start / master_stop / master_set_parts, admin_overview).

type PartKey = 'sync' | 'publish' | 'finder' | 'social';
type Parts = Record<PartKey, boolean>;
type RunNote = { text?: string; ok?: boolean } | null;

type Status = {
  running: boolean;
  parts: Partial<Parts> | null;
  started_at: string | null;
  stopped_at: string | null;
  note: string | null;
  cron: boolean;
  publish: { on: boolean; released_today: number | null; today_limit: number | null; last_at: string | null; next_at: string | null };
  sync: { on: boolean; last_at: string | null; last: RunNote; companies_per_run: number | null; healthy: boolean };
  finder: { on: boolean; last_at: string | null; last: RunNote; every_min: number | null; next_at: string | null };
  social: { running: boolean; last_run_at: string | null; last_result: string | null; queued: number; networks: number; connected: number } | null;
};

type Totals = {
  signups: number;
  cvs: number;
  cv_updates: number;
  guest_cvs: number;
  checks: number;
  people_checking: number;
  hit_limit: number;
  plan_requests: number;
  pro_started: number;
  documents: number;
  applications: number;
  jobs_published: number;
  jobs_closed: number;
  companies_added: number;
  sources_checked: number;
  runs_ok: number;
  runs_failed: number;
};
type Overview = {
  hours: number;
  at: string;
  totals: Totals;
  previous: Partial<Record<keyof Totals, number>>;
  social: { published?: number; failed?: number; queued?: number; by_network?: Record<string, number> };
  series: { t: string; signups: number; cvs: number; checks: number; jobs: number }[];
  signups: { id: string; name: string | null; email: string | null; at: string; has_cv: boolean }[];
  cvs: { user_id: string; name: string | null; email: string | null; file_name: string | null; words: number | null; at: string; new: boolean }[];
  log: { at: string; kind: string; ok: boolean; summary: string }[];
  all_time: { accounts: number; cvs: number; pro: number; live_jobs: number; companies: number };
};

export type ControlTarget = 'imports' | 'images' | 'cvs' | 'plans' | 'inbox';

const PART_ORDER: PartKey[] = ['sync', 'publish', 'finder', 'social'];
const PART: Record<PartKey, { name: string; does: string; icon: typeof Power; where: ControlTarget; whereLabel: string }> = {
  sync: { name: 'Job sync', does: 'Re-reads every company’s careers page: new vacancies come in, closed ones come down.', icon: RefreshCw, where: 'imports', whereLabel: 'Import & sync' },
  publish: { name: 'Publishing', does: 'Releases the vacancies that are waiting, a few at a time through the day.', icon: Send, where: 'imports', whereLabel: 'Import & sync' },
  finder: { name: 'Company finder', does: 'Searches for more companies that hire from abroad and adds them with their jobs.', icon: ScanSearch, where: 'imports', whereLabel: 'Import & sync' },
  social: { name: 'Social media', does: 'Writes and posts on every network that is switched on, spaced apart from each other.', icon: Megaphone, where: 'images', whereLabel: 'Social media' },
};
const ALL_ON: Parts = { sync: true, publish: true, finder: true, social: true };
const partsOf = (p: Status['parts']): Parts => ({ sync: p?.sync ?? true, publish: p?.publish ?? true, finder: p?.finder ?? true, social: p?.social ?? true });

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}
function until(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  if (min <= 0) return 'due now';
  return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${min % 60} min`;
}
const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

/** What a part is doing right now, in one line. */
function partLine(key: PartKey, s: Status, now: number): { state: 'on' | 'off' | 'problem'; text: string } {
  if (key === 'sync') {
    if (!s.sync.on) return { state: 'off', text: `Off. Last run ${ago(s.sync.last_at, now)}.` };
    if (!s.sync.healthy) return { state: 'problem', text: `On, but nothing has run for 15 minutes (last ${ago(s.sync.last_at, now)}). Check that the pipeline function is deployed.` };
    return { state: s.sync.last?.ok === false ? 'problem' : 'on', text: `Last run ${ago(s.sync.last_at, now)}${s.sync.last?.text ? ` · ${s.sync.last.text}` : ''}` };
  }
  if (key === 'publish') {
    const count = s.publish.today_limit != null ? `${nf(s.publish.released_today)} of ${nf(s.publish.today_limit)} released today` : `${nf(s.publish.released_today)} released today`;
    if (!s.publish.on) return { state: 'off', text: `Off. ${count}.` };
    const next = until(s.publish.next_at, now);
    return { state: 'on', text: `${count}${next ? ` · next ${next}` : ''}` };
  }
  if (key === 'finder') {
    if (!s.finder.on) return { state: 'off', text: `Off. Last search ${ago(s.finder.last_at, now)}.` };
    const next = until(s.finder.next_at, now);
    return { state: s.finder.last?.ok === false ? 'problem' : 'on', text: `Last search ${ago(s.finder.last_at, now)}${s.finder.last?.text ? ` · ${s.finder.last.text}` : ''}${next ? ` · next ${next}` : ''}` };
  }
  if (!s.social) return { state: 'off', text: 'Not set up yet: run the social media migrations first.' };
  if (!s.social.running) return { state: 'off', text: `Off. ${s.social.networks ? `${s.social.networks} ${s.social.networks === 1 ? 'network is' : 'networks are'} switched on.` : 'No network is switched on yet.'}` };
  if (!s.social.networks) return { state: 'problem', text: 'On, but no network is switched on (Social media → Platforms).' };
  return {
    state: 'on',
    text: `${nf(s.social.queued)} posts in the queue · ${s.social.connected} of ${s.social.networks} networks connected${s.social.connected < s.social.networks ? ' (the others wait for you to post by hand)' : ''}`,
  };
}

const DOT: Record<'on' | 'off' | 'problem', string> = { on: 'bg-emerald-500', off: 'bg-ink-300', problem: 'bg-amber-500' };

function Tile({ icon: Icon, label, value, sub, prev, onClick }: { icon: typeof Power; label: string; value: number; sub?: string; prev?: number; onClick?: () => void }) {
  const diff = prev === undefined ? null : value - prev;
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="mt-1.5 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-ink-950">{nf(value)}</span>
        {diff !== null && diff !== 0 && (
          <span className={`inline-flex items-center text-xs font-semibold ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`} title={`${nf(prev)} in the period before`}>
            {diff > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {nf(Math.abs(diff))}
          </span>
        )}
      </span>
      {sub && <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{sub}</span>}
    </>
  );
  const cls = 'flex flex-col rounded-xl border border-ink-200 bg-white p-4 text-left';
  return onClick ? (
    <button onClick={onClick} className={`${cls} transition hover:border-brand-300 hover:bg-brand-50/40`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Hour by hour: sign-ups, CVs and match checks as stacked bars. */
function HourChart({ series }: { series: Overview['series'] }) {
  const max = Math.max(1, ...series.map((h) => h.signups + h.cvs + h.checks));
  const total = series.reduce((n, h) => n + h.signups + h.cvs + h.checks, 0);
  const label = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (!total) return <p className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">No sign-ups, CVs or match checks in this period yet.</p>;
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Sign-ups, CVs and match checks hour by hour">
        {series.map((h) => {
          const sum = h.signups + h.cvs + h.checks;
          return (
            <div key={h.t} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${label(h.t)} — ${h.signups} sign-ups · ${h.cvs} CVs · ${h.checks} match checks · ${h.jobs} jobs published`}>
              {sum === 0 ? (
                <div className="h-[2px] rounded-sm bg-ink-200" />
              ) : (
                <div className="flex flex-col overflow-hidden rounded-sm" style={{ height: `${Math.max(6, (100 * sum) / max)}%` }}>
                  <div className="bg-violet-500" style={{ flexGrow: h.checks }} />
                  <div className="bg-emerald-500" style={{ flexGrow: h.cvs }} />
                  <div className="bg-brand-600" style={{ flexGrow: h.signups }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-ink-400">
        <span>{label(series[0].t)}</span>
        <span>{label(series[Math.floor(series.length / 2)].t)}</span>
        <span>now</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-ink-600">
        {[
          ['bg-brand-600', 'Sign-ups'],
          ['bg-emerald-500', 'CVs'],
          ['bg-violet-500', 'Match checks'],
        ].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${c}`} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}

const KIND: Record<string, string> = { sync: 'Job sync', find: 'Finder', social: 'Social', master: 'Switch', media: 'Photos', sponsors: 'UK sponsors', articles: 'Articles', monthly: 'Monthly report', error: 'Error', release: 'Publishing' };

export function ControlRoom({ onOpen }: { onOpen: (tab: ControlTarget) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [draft, setDraft] = useState<Parts>(ALL_ON);
  const [busy, setBusy] = useState<'start' | 'stop' | 'apply' | 'load' | null>('load');
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const seeded = useRef(false);
  const load = useCallback(
    async () => {
      const [st, ov] = await Promise.all([supabase.rpc('master_status'), supabase.rpc('admin_overview', { p_hours: hours })]);
      setNow(Date.now());
      if (st.error) {
        if (/function|schema cache|does not exist/i.test(st.error.message)) setMissing(true);
        else setError(st.error.message);
        return setBusy((b) => (b === 'load' ? null : b));
      }
      setMissing(false);
      setError(ov.error ? ov.error.message : null);
      const s = st.data as Status;
      setStatus(s);
      // The ticks follow the server once; after that they are the admin's to change.
      if (!seeded.current) {
        seeded.current = true;
        setDraft(partsOf(s.parts));
      }
      if (!ov.error) setData(ov.data as Overview);
      setBusy((b) => (b === 'load' ? null : b));
    },
    [hours],
  );
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const saved = useMemo(() => partsOf(status?.parts ?? null), [status]);
  const changed = PART_ORDER.some((k) => draft[k] !== saved[k]);
  const ticked = PART_ORDER.filter((k) => draft[k]);

  const act = async (kind: 'start' | 'stop' | 'apply') => {
    setBusy(kind);
    setMsg(null);
    const { data: out, error: err } = kind === 'stop' ? await supabase.rpc('master_stop') : await supabase.rpc('master_start', { p_parts: draft });
    setBusy(null);
    if (err) return setMsg(err.message);
    const s = out as Status;
    setStatus(s);
    setDraft(partsOf(s.parts));
    setNow(Date.now());
    setMsg(kind === 'stop' ? 'Stopped. Nothing runs by itself now; what is already published stays.' : `${kind === 'apply' ? 'Updated' : 'Started'}. Each part runs once straight away — the numbers below update in a minute or two.${s.note ? ` ${s.note}` : ''}`);
    window.setTimeout(() => void load(), 45_000);
  };
  const tick = (k: PartKey, on: boolean) => {
    const next = { ...draft, [k]: on };
    setDraft(next);
    // Stopped: just remember the ticks. Running: they wait for "Apply".
    if (status && !status.running) void supabase.rpc('master_set_parts', { p_parts: next }).then(({ data: out }) => out && setStatus(out as Status));
  };

  if (missing) {
    return (
      <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        Run the migration <span className="font-mono text-[13px]">20261127090000_control_room_cvs_media.sql</span> in the Supabase SQL Editor to turn on the control room (after <span className="font-mono text-[13px]">20261126090000_cv_match_one_plan.sql</span>). Until then each part is switched on under Import &amp; sync and Social media, as before.
      </p>
    );
  }
  if (!status) {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-ink-500">
        {error ? <span className="text-rose-700">{error}</span> : <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>}
      </p>
    );
  }

  const t = data?.totals;
  const prev = data?.previous ?? {};
  const period = hours === 24 ? 'the last 24 hours' : `the last ${hours / 24} days`;
  const runningParts = PART_ORDER.filter((k) => saved[k]).map((k) => PART[k].name.toLowerCase());

  return (
    <div className="mt-6 space-y-6">
      {/* ---- The switch ---- */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className={`px-6 py-8 text-center text-white sm:px-10 sm:py-10 ${status.running ? 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500' : 'bg-gradient-to-br from-ink-950 via-brand-900 to-brand-700'}`}>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/25">
            {status.running ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-white/50" />
            )}
            {status.running ? 'Running' : 'Stopped'}
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">{status.running ? 'MadeVisa is running by itself' : 'Start everything with one button'}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-white/80">
            {status.running
              ? `Since ${when(status.started_at)}: ${runningParts.join(', ') || 'nothing ticked'}.`
              : `Syncs vacancies, publishes them, searches for new companies and posts on social media — each with the settings it already has.${status.stopped_at ? ` Stopped ${when(status.stopped_at)}.` : ''}`}
          </p>

          <button
            onClick={() => {
              if (status.running) {
                if (!window.confirm('Stop everything?\n\nJob sync, publishing, the company finder and social media all switch off. Posts that haven’t gone out are withdrawn. Published jobs and posts stay.')) return;
                void act('stop');
              } else void act('start');
            }}
            disabled={busy !== null || (!status.running && !ticked.length)}
            className={`mx-auto mt-7 flex w-full max-w-xl items-center justify-center gap-4 rounded-3xl px-8 py-7 text-2xl font-extrabold tracking-tight shadow-2xl ring-4 transition active:scale-[0.99] disabled:opacity-60 sm:py-9 sm:text-4xl ${
              status.running ? 'bg-white text-rose-700 ring-white/40 hover:bg-rose-50' : 'bg-white text-brand-800 ring-white/30 hover:bg-brand-50'
            }`}
          >
            {busy === 'start' || busy === 'stop' ? <Loader2 className="h-9 w-9 animate-spin sm:h-11 sm:w-11" /> : status.running ? <Square className="h-8 w-8 fill-current sm:h-10 sm:w-10" /> : <Power className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={2.75} />}
            {status.running ? 'Stop everything' : 'Start everything'}
          </button>
          {!status.running && !ticked.length && <p className="mt-3 text-xs text-white/80">Tick at least one part below.</p>}
          {msg && <p className="mx-auto mt-4 max-w-xl rounded-lg bg-white/15 px-3 py-2 text-xs font-medium leading-5 ring-1 ring-white/20">{msg}</p>}
        </div>

        {!status.cron && (
          <p className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            The server timer isn’t set up, so nothing repeats on its own — each part only runs when a button is pressed. Enable pg_cron in Supabase (Database → Extensions) and run the migration 20261031090000_auto_release_drip.sql again.
          </p>
        )}

        <div className="grid gap-px bg-ink-100 sm:grid-cols-2">
          {PART_ORDER.map((k) => {
            const line = partLine(k, status, now);
            const Icon = PART[k].icon;
            return (
              <div key={k} className="bg-white p-4">
                <div className="flex items-start gap-3">
                  <label className="mt-0.5 flex cursor-pointer items-center" title="Include this part when the button is pressed">
                    <input type="checkbox" className="h-4 w-4 rounded border-ink-300" checked={draft[k]} onChange={(e) => tick(k, e.target.checked)} aria-label={`Include ${PART[k].name}`} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-950">
                      <Icon className="h-4 w-4 text-ink-400" /> {PART[k].name}
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                        <span className={`h-1.5 w-1.5 rounded-full ${DOT[line.state]}`} /> {line.state === 'on' ? 'On' : line.state === 'off' ? 'Off' : 'Needs a look'}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-600">{PART[k].does}</p>
                    <p className={`mt-1 text-xs leading-5 ${line.state === 'problem' ? 'font-medium text-amber-800' : 'text-ink-500'}`}>{line.text}</p>
                    <button onClick={() => onOpen(PART[k].where)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      Settings in {PART[k].whereLabel} <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {status.running && changed && (
          <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50/70 px-5 py-3">
            <button onClick={() => void act('apply')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Apply to what’s running
            </button>
            <span className="text-xs text-ink-600">Ticked parts switch on, the others switch off.</span>
          </div>
        )}
        {status.note && <p className="border-t border-ink-100 px-5 py-2.5 text-xs text-amber-800">{status.note}</p>}
      </section>

      {/* ---- The numbers ---- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-950">What happened in {period}</h2>
            <p className="text-xs text-ink-500">{data ? `Updated ${when(data.at)} · refreshes every minute` : 'Loading…'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-semibold">
              {[24, 168].map((h) => (
                <button key={h} onClick={() => setHours(h)} className={`rounded-md px-3 py-1.5 ${hours === h ? 'bg-ink-950 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>
                  {h === 24 ? '24 hours' : '7 days'}
                </button>
              ))}
            </div>
            <button onClick={() => void load()} className="rounded-md p-2 text-ink-500 hover:bg-ink-100" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}

        {t && data && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile icon={UserPlus} label="Sign-ups" value={t.signups} prev={prev.signups} sub={`${nf(data.all_time.accounts)} accounts in total`} />
              <Tile icon={FileText} label="CVs added" value={t.cvs} prev={prev.cvs} sub={`${nf(t.cv_updates)} replaced · ${nf(t.guest_cvs)} by visitors without an account`} onClick={() => onOpen('cvs')} />
              <Tile icon={CheckCircle2} label="Match checks" value={t.checks} sub={`${nf(t.people_checking)} people · ${nf(t.hit_limit)} hit today’s free limit`} />
              <Tile icon={Send} label="Jobs published" value={t.jobs_published} prev={prev.jobs_published} sub={`${nf(t.jobs_closed)} closed · ${nf(data.all_time.live_jobs)} live now`} onClick={() => onOpen('imports')} />
              <Tile icon={Building2} label="Companies added" value={t.companies_added} prev={prev.companies_added} sub={`${nf(t.sources_checked)} careers pages re-read · ${nf(data.all_time.companies)} in total`} onClick={() => onOpen('imports')} />
              <Tile
                icon={Megaphone}
                label="Social posts"
                value={data.social.published ?? 0}
                sub={`${Object.entries(data.social.by_network ?? {}).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none went out'}${data.social.failed ? ` · ${data.social.failed} failed` : ''} · ${nf(data.social.queued)} queued`}
                onClick={() => onOpen('images')}
              />
              <Tile icon={Power} label="Plan requests" value={t.plan_requests} prev={prev.plan_requests} sub={`${nf(t.pro_started)} Pro started · ${nf(data.all_time.pro)} Pro members now`} onClick={() => onOpen('plans')} />
              <Tile icon={FileText} label="Sponsorship documents" value={t.documents} sub={`${nf(t.applications)} applications tracked`} />
            </div>

            <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
              <p className="mb-3 text-sm font-bold text-ink-950">Hour by hour{data.hours > 72 ? ' · last 72 hours' : ''}</p>
              <HourChart series={data.series} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-ink-200 bg-white p-4">
                <p className="text-sm font-bold text-ink-950">Latest sign-ups</p>
                {!data.signups.length ? (
                  <p className="mt-2 text-sm text-ink-500">Nobody signed up in {period}.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-ink-100">
                    {data.signups.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-900">{u.name || 'No name yet'}</span>
                          <span className="block truncate text-xs text-ink-500">{u.email ?? '—'}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.has_cv ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-600'}`}>{u.has_cv ? 'CV added' : 'No CV yet'}</span>
                        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-400">{ago(u.at, now)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-ink-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink-950">Latest CVs</p>
                  <button onClick={() => onOpen('cvs')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                    All {nf(data.all_time.cvs)} CVs <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                {!data.cvs.length ? (
                  <p className="mt-2 text-sm text-ink-500">No CV was added in {period}.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-ink-100">
                    {data.cvs.map((c) => (
                      <li key={c.user_id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-900">{c.name || c.email || 'No name yet'}</span>
                          <span className="block truncate text-xs text-ink-500">
                            {c.file_name ?? 'CV'}
                            {c.words ? ` · ${nf(c.words)} words` : ''}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.new ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-100 text-ink-600'}`}>{c.new ? 'New' : 'Replaced'}</span>
                        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-400">{ago(c.at, now)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-ink-950">What the server did</p>
                <p className="text-xs text-ink-500">
                  {nf(t.runs_ok)} runs finished{t.runs_failed ? <span className="font-semibold text-rose-700"> · {nf(t.runs_failed)} failed</span> : ''} in {period}
                </p>
              </div>
              {!data.log.length ? (
                <p className="mt-2 text-sm text-ink-500">Nothing has run yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {data.log.map((l, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-24 shrink-0 tabular-nums text-ink-400">{when(l.at)}</span>
                      <span className={`w-20 shrink-0 font-semibold ${l.ok ? 'text-ink-700' : 'text-rose-700'}`}>{KIND[l.kind] ?? l.kind}</span>
                      <span className={`min-w-0 flex-1 leading-5 ${l.ok ? 'text-ink-700' : 'text-rose-700'}`}>{l.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
